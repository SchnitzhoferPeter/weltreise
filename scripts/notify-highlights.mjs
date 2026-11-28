/* Schickt Push-Nachrichten, sobald sich das Schiff einer Wegmarke nähert und wenn es sie passiert.
   Läuft im Positions-Job (alle 10 Min.) direkt nach scripts/fetch-position.mjs.

   Position: frische AIS-Meldung aus out/position.json (höchstens 45 Min. alt), sonst der Fahrplan.
   Empfänger: Geräte, die in der App „Benachrichtigungen“ eingeschaltet haben (Firebase, Bereich push).
   Merkzettel: out/unterwegs-state.json – was schon gemeldet wurde; wandert mit auf den Branch position-data.

   Umgebung: VAPID_PRIVATE_KEY (Repository-Secret). Fehlt er, rechnet das Skript nur und sendet nichts.
   Zum Testen: DRY_RUN=1 (nichts senden), NOW=2026-11-28T16:00:00Z, PLAN=1 (Liste aller Wegmarken ausgeben). */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const U = require(join(ROOT, "unterwegs.js"));
const OUT = process.env.OUT_DIR || "out";
const DRY = process.env.DRY_RUN === "1";
const NOW = process.env.NOW ? Date.parse(process.env.NOW) : Date.now();
const SITE = "https://schnitzhoferpeter.github.io/weltreise/";
const KEEP_MS = 3 * 3600000;                 /* „passiert“ wird höchstens so lange nach „nähert sich“ nachgereicht */
const MAX_PER_RUN = 4;

/* ---------- Fahrplan aus index.html lesen (dort wird er gepflegt) ---------- */
function loadCalls(){
  const html = readFileSync(join(ROOT, "index.html"), "utf8");
  const m = /const CALLS = \[([\s\S]*?)\n\];/.exec(html);
  const s = /const START = Date\.UTC\((\d+),\s*(\d+),\s*(\d+)\)/.exec(html);
  if(!m || !s) throw new Error("CALLS oder START in index.html nicht gefunden");
  const calls = new Function("return [" + m[1] + "]")();
  const start = Date.UTC(+s[1], +s[2], +s[3]);
  const offset = (ms, tz) => {
    const p = {};
    new Intl.DateTimeFormat("en-US", {timeZone: tz, hour12: false, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit"}).formatToParts(new Date(ms)).forEach(x => p[x.type] = x.value);
    return Math.round((Date.UTC(+p.year, +p.month - 1, +p.day, p.hour === "24" ? 0 : +p.hour, +p.minute, +p.second) - ms) / 60000);
  };
  const zoned = (day, hhmm, tz) => {
    if(!hhmm) return null;
    const naive = start + (day - 1) * 86400000 + (+hhmm.slice(0, 2)) * 3600000 + (+hhmm.slice(3)) * 60000;
    const ms = naive - offset(naive, tz) * 60000;
    return naive - offset(ms, tz) * 60000;
  };
  calls.forEach(c => { c.arrUtc = zoned(c.d1, c.arr, c.tz); c.depUtc = zoned(c.d2, c.dep, c.tz); });
  return calls;
}
const readJson = (file, fallback) => { try{ return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : fallback; }catch(e){ return fallback; } };

const calls = loadCalls();
const plan = U.build(calls, readJson(join(ROOT, "data/unterwegs.json"), {legs: []}));

if(process.env.PLAN === "1"){
  const fmt = t => t ? new Date(t).toISOString().slice(0, 16).replace("T", " ") : "—";
  let leg = "";
  plan.items.slice().sort((a, b) => (a.from >= 0 ? a.from : a.inCall - 0.5) - (b.from >= 0 ? b.from : b.inCall - 0.5) || a.order - b.order).forEach(it => {
    if(it.leg !== leg){
      leg = it.leg;
      const p = plan.paths[it.from], gc = it.from >= 0 ? U.distNm(calls[it.from].lat, calls[it.from].lon, calls[it.to].lat, calls[it.to].lon) : 0;
      console.log(`\n${leg}${p ? `  · Weg ${Math.round(p.total)} sm (Großkreis ${Math.round(gc)} sm), ${it.kn.toFixed(1)} kn` : ""}`);
    }
    console.log(`  ${fmt(it.tPlan)} UTC  ${U.dark(it.lat, it.lon, it.tPlan) ? "☾" : "☀"}  ${it.top ? "★" : " "} ${it.live ? "(live) " : ""}${it.n}`);
  });
  console.log(`\n${plan.items.length} Wegmarken auf ${new Set(plan.items.map(i => i.leg)).size} Abschnitten.`);
  process.exit(0);
}

/* ---------- Position ---------- */
let pos = null;
const fix = readJson(`${OUT}/position.json`, null);
if(fix && Number.isFinite(fix.lat) && Number.isFinite(fix.lon)){
  const t = Date.parse(fix.timestamp || "");
  if(Number.isFinite(t) && NOW - t <= U.LIVE_MAX_AGE && NOW - t > -5 * 60000) pos = {lat: fix.lat, lon: fix.lon, sog: fix.sog, cog: fix.cog, t, live: true};
}
console.log(pos ? `Position: AIS ${pos.lat}, ${pos.lon}, ${pos.sog} kn, Kurs ${pos.cog}°` : "Position: keine frische AIS-Meldung, es gilt der Fahrplan");

/* ---------- Was ist zu melden? ---------- */
const stateFile = `${OUT}/unterwegs-state.json`;
const mem = readJson(stateFile, {sent: {}});
if(!mem.sent) mem.sent = {};
const due = [];
for(const it of plan.items){
  if(!it.tPlan || NOW < it.t0 - 3600000 || NOW > it.t1 + 3600000) continue;        /* nur die laufende Etappe */
  const st = U.state(it, pos, NOW, calls);
  const done = mem.sent[it.id] || {};
  if(st.phase === "nah" && !done.near && !done.pass) due.push({it, st, kind: "near"});
  else if(st.phase === "querab" && !done.pass) due.push({it, st, kind: "pass"});
  else if(st.phase === "vorbei" && done.near && !done.pass && NOW - done.near < KEEP_MS) due.push({it, st, kind: "pass"});
}
due.sort((a, b) => (b.it.top ? 1 : 0) - (a.it.top ? 1 : 0) || (a.st.eta || 0) - (b.st.eta || 0));
const batch = due.slice(0, MAX_PER_RUN);
if(!batch.length) console.log("Nichts zu melden.");

const messages = batch.map(({it, st, kind}) => {
  const m = U.text(it, st, kind, NOW);
  console.log(`${kind === "near" ? "Nähert sich" : "Passiert"} (${st.basis}): ${m.title} — ${m.body}`);
  return {it, kind, payload: JSON.stringify({title: m.title, body: m.body, tag: `${it.id}-${kind}`, url: SITE + "#unterwegs"})};
});

/* ---------- Senden ---------- */
const sync = readJson(join(ROOT, "data/sync.json"), {});
const PRIV = (process.env.VAPID_PRIVATE_KEY || "").trim();
const canSend = !DRY && PRIV && sync.vapidKey && sync.url && sync.apiKey;
if(messages.length && !canSend){
  console.log(DRY ? "Probelauf: nichts gesendet, nichts gemerkt." : "Push nicht eingerichtet (VAPID_PRIVATE_KEY oder vapidKey in data/sync.json fehlt) – nichts gesendet.");
}
if(messages.length && canSend){
  const base = sync.url.replace(/\/+$/, "");
  const login = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${encodeURIComponent(sync.apiKey)}`,
    {method: "POST", headers: {"Content-Type": "application/json", Referer: SITE}, body: JSON.stringify({returnSecureToken: true})}).then(r => r.json());
  if(!login.idToken) throw new Error("Anmeldung bei Firebase abgelehnt: " + JSON.stringify(login.error || login).slice(0, 200));
  const auth = "?auth=" + encodeURIComponent(login.idToken);
  const res = await fetch(`${base}/push.json${auth}`);
  if(!res.ok) throw new Error(`Empfänger nicht lesbar (HTTP ${res.status}) – Regeln aus database.rules.json eingespielt?`);
  const subs = Object.entries(await res.json() || {}).filter(([, s]) => s && s.endpoint && !s.off);
  console.log(`${subs.length} Gerät(e) angemeldet.`);
  const webpush = require("web-push");
  webpush.setVapidDetails(SITE, sync.vapidKey, PRIV);
  const hourIn = tz => { try{ return +new Intl.DateTimeFormat("en-US", {timeZone: tz, hour: "2-digit", hour12: false}).format(new Date(NOW)) % 24; }catch(e){ return 12; } };
  let ok = 0, quiet = 0, gone = 0, failed = 0;
  for(const {it, kind, payload} of messages){
    for(const [id, s] of subs){
      if(s.off || (s.nur === "top" && !it.top)) continue;
      if(s.ruhe){ const h = hourIn(s.tz || "Europe/Vienna"); if(h >= 22 || h < 7){ quiet++; continue; } }
      try{
        await webpush.sendNotification({endpoint: s.endpoint, keys: {p256dh: s.p256dh, auth: s.auth}}, payload, {TTL: 3600, urgency: "normal", topic: `${it.id}-${kind}`.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32)});
        ok++;
      }catch(e){
        if(e.statusCode === 404 || e.statusCode === 410){
          gone++; s.off = true;
          await fetch(`${base}/push/${id}.json${auth}`, {method: "PUT", headers: {"Content-Type": "application/json"}, body: JSON.stringify({...s, at: NOW})}).catch(() => {});
        } else { failed++; console.error(`Push an ${id} fehlgeschlagen:`, e.statusCode || e.message); }
      }
    }
    (mem.sent[it.id] = mem.sent[it.id] || {})[kind] = NOW;
  }
  console.log(`Gesendet: ${ok}, wegen Nachtruhe ausgelassen: ${quiet}, abgemeldet: ${gone}, fehlgeschlagen: ${failed}.`);
}

/* Alte Einträge nach zwei Wochen vergessen */
for(const [id, v] of Object.entries(mem.sent)) if(NOW - Math.max(v.near || 0, v.pass || 0) > 14 * 86400000) delete mem.sent[id];
if(!DRY){
  mkdirSync(OUT, {recursive: true});
  mem.checked = new Date(NOW).toISOString();
  mem.basis = pos ? "ais" : "fahrplan";
  writeFileSync(stateFile, JSON.stringify(mem, null, 1) + "\n");
}
