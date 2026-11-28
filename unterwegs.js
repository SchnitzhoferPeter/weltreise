/* Wegmarken unterwegs: gemeinsame Logik für die Seite (index.html) und den Push-Job
   (scripts/notify-highlights.mjs). Reine Rechenfunktionen ohne DOM und ohne Netz.

   build(calls, data)        → Liste aller Wegmarken mit geplanter Passagezeit und Weg je Etappe
   along(plan, legIdx, f)    → geschätzte Position auf dem Weg einer Etappe (statt Großkreis über Land)
   state(item, pos, now)     → vor | nah | querab | vorbei, Distanz, Seite, Zeitpunkt
   text(item, st, kind)      → Titel und Text der Benachrichtigung
   dark(lat, lon, t)         → steht die Sonne dort unter dem Horizont? */
(function(root){
  "use strict";
  const R_NM = 3440.065;
  const rad = x => x * Math.PI / 180, deg = x => x * 180 / Math.PI;
  const short = n => String(n).split(" | ")[0];
  const lonDiff = (a, b) => ((a - b + 540) % 360) - 180;          /* a − b, über die Datumsgrenze hinweg */

  function distNm(aLat, aLon, bLat, bLon){
    const dLat = rad(bLat - aLat), dLon = rad(bLon - aLon);
    const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLon / 2) ** 2;
    return 2 * R_NM * Math.asin(Math.min(1, Math.sqrt(s)));
  }
  function bearingDeg(aLat, aLon, bLat, bLon){
    const p1 = rad(aLat), p2 = rad(bLat), dl = rad(bLon - aLon);
    const y = Math.sin(dl) * Math.cos(p2);
    const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
    return (deg(Math.atan2(y, x)) + 360) % 360;
  }
  function gcPoint(aLat, aLon, bLat, bLon, f){
    const p1 = rad(aLat), l1 = rad(aLon), p2 = rad(bLat), l2 = rad(bLon);
    const d = distNm(aLat, aLon, bLat, bLon) / R_NM;
    if(d < 1e-9) return [aLat, aLon];
    const A = Math.sin((1 - f) * d) / Math.sin(d), B = Math.sin(f * d) / Math.sin(d);
    const x = A * Math.cos(p1) * Math.cos(l1) + B * Math.cos(p2) * Math.cos(l2);
    const y = A * Math.cos(p1) * Math.sin(l1) + B * Math.cos(p2) * Math.sin(l2);
    const z = A * Math.sin(p1) + B * Math.sin(p2);
    return [deg(Math.atan2(z, Math.hypot(x, y))), deg(Math.atan2(y, x))];
  }
  const slug = s => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  /* Weg einer Etappe: Abfahrtshafen → Wegmarken in Fahrtrichtung → Zielhafen */
  function makePath(pts){
    const cum = [0];
    for(let i = 1; i < pts.length; i++) cum[i] = cum[i - 1] + distNm(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]);
    return {pts, cum, total: cum[cum.length - 1]};
  }
  function pathAt(path, f){
    const d = Math.max(0, Math.min(1, f)) * path.total;
    let i = 1;
    while(i < path.cum.length - 1 && path.cum[i] < d) i++;
    const a = path.pts[i - 1], b = path.pts[i], seg = path.cum[i] - path.cum[i - 1];
    const g = seg > 1e-6 ? (d - path.cum[i - 1]) / seg : 0;
    const p = gcPoint(a[0], a[1], b[0], b[1], g);
    return {lat: p[0], lon: p[1], cog: seg > 1e-6 ? bearingDeg(p[0], p[1], b[0], b[1]) : 0};
  }
  /* Anteil des Wegs, an dem er einem Punkt am nächsten kommt (Abtastung) */
  function nearestF(path, lat, lon){
    let best = {f: 0, d: Infinity};
    const N = Math.max(60, Math.min(600, Math.round(path.total / 4)));
    for(let k = 0; k <= N; k++){
      const p = pathAt(path, k / N), d = distNm(p.lat, p.lon, lat, lon);
      if(d < best.d) best = {f: k / N, d};
    }
    return best;
  }

  function build(calls, data){
    const items = [], paths = {};
    const names = calls.map(c => short(c.n));
    (data && data.legs || []).forEach(leg => {
      const parts = String(leg.leg).split(">");
      let from = -1, to = -1, inCall = -1;
      if(parts.length === 2){
        for(let i = 0; i < calls.length - 1; i++) if(names[i] === parts[0] && names[i + 1] === parts[1]){ from = i; to = i + 1; break; }
        if(from < 0) return;
      } else {
        inCall = names.indexOf(parts[0]);
        if(inCall < 0) return;
      }
      const a = from >= 0 ? calls[from] : null, b = to >= 0 ? calls[to] : null;
      let path = null;
      if(a && b){
        const way = [[a.lat, a.lon]];
        leg.pts.forEach(p => { if(!p.live && !p.ab) way.push([p.lat, p.lon]); });
        way.push([b.lat, b.lon]);
        path = makePath(way);
        paths[from] = path;
      }
      let k = 0;
      leg.pts.forEach((p, n) => {
        const it = Object.assign({}, p, {id: slug(leg.leg + "-" + p.n), leg: leg.leg, from, to, inCall, order: n, r: p.r || 20, tPlan: null, kn: null});
        if(inCall >= 0){
          const c = calls[inCall];
          if(c.arrUtc && c.depUtc) it.tPlan = c.arrUtc + (p.f || 0) * (c.depUtc - c.arrUtc);
          it.t0 = c.arrUtc; it.t1 = c.depUtc; it.kn = 6;
        } else if(a.depUtc && b.arrUtc){
          let f;
          if(p.live || p.ab) f = nearestF(path, p.lat, p.lon).f;
          else { k++; f = path.total > 0 ? path.cum[k] / path.total : 0; }
          it.pf = f;
          Object.defineProperty(it, "path", {value: path, enumerable: false});
          it.tPlan = a.depUtc + f * (b.arrUtc - a.depUtc);
          it.t0 = a.depUtc; it.t1 = b.arrUtc;
          it.kn = path.total / ((b.arrUtc - a.depUtc) / 3600000);
        }
        items.push(it);
      });
    });
    items.sort((x, y) => (x.tPlan || 0) - (y.tPlan || 0));
    return {items, paths};
  }
  function along(plan, legIdx, f){
    const path = plan && plan.paths[legIdx];
    return path ? pathAt(path, f) : null;
  }

  /* Anteil des Wegs einer Etappe, den das Schiff an dieser Position zurückgelegt hat (0 … 1) */
  function progressOf(plan, legIdx, lat, lon){
    const path = plan && plan.paths[legIdx];
    return path ? nearestF(path, lat, lon).f : 0;
  }

  /* Abstand zu einer Linie (Äquator, Wendekreis, Meridian) in sm und ob sie schon überschritten ist */
  function lineState(it, pos, startLat, startLon){
    if(it.achse === "lat"){
      return {dist: Math.abs(pos.lat - it.wert) * 60, over: (pos.lat >= it.wert) !== (startLat >= it.wert)};
    }
    const d = lonDiff(pos.lon, it.wert), d0 = lonDiff(startLon, it.wert);
    return {dist: Math.abs(d) * 60 * Math.cos(rad(pos.lat)), over: (d >= 0) !== (d0 >= 0)};
  }

  /* Wie weit ist das Schiff auf dem Weg der Etappe? Je Position nur einmal gerechnet. */
  let progCache = {key: "", f: 0};
  function progress(path, pos){
    const key = path.total.toFixed(2) + "|" + pos.lat + "|" + pos.lon;
    if(progCache.key !== key) progCache = {key, f: nearestF(path, pos.lat, pos.lon).f};
    return progCache.f;
  }

  const LIVE_MAX_AGE = 45 * 60000;          /* so alt darf eine echte Meldung für die Abstandsrechnung sein */
  /* pos: {lat, lon, cog, sog, t, live} oder null. calls nur für Linien (Seite des Abfahrtshafens). */
  function state(it, pos, now, calls){
    const kn = pos && pos.live && isFinite(pos.sog) && pos.sog > 3 ? pos.sog : (it.kn && it.kn > 3 ? it.kn : 12);
    const reach = Math.max(it.r, kn * 0.5);                                  /* mindestens eine halbe Stunde Vorlauf */
    const inLeg = it.t0 && now >= it.t0 - 30 * 60000 && now <= it.t1 + 30 * 60000;
    const live = !!(pos && pos.live && isFinite(pos.t) && now - pos.t <= LIVE_MAX_AGE && inLeg);
    const out = {phase: "vor", basis: live ? "live" : "plan", dist: null, eta: it.tPlan, side: it.s || null, kn, reach};
    if(live){
      if(it.k === "linie"){
        const start = calls && it.from >= 0 ? calls[it.from] : null;
        const ls = lineState(it, pos, start ? start.lat : pos.lat, start ? start.lon : pos.lon);
        out.dist = ls.dist;
        out.phase = ls.over ? (ls.dist <= reach ? "querab" : "vorbei") : (ls.dist <= reach ? "nah" : "vor");
        out.eta = ls.over ? now : now + ls.dist / kn * 3600000;
        return out;
      }
      const dist = distNm(pos.lat, pos.lon, it.lat, it.lon);
      out.dist = dist;
      const hasCog = isFinite(pos.cog) && isFinite(pos.sog) && pos.sog > 1;
      const rel = hasCog ? ((bearingDeg(pos.lat, pos.lon, it.lat, it.lon) - pos.cog + 540) % 360) - 180 : 0;   /* −180…180, + = Steuerbord */
      /* Seite aus dem echten Kurs, aber erst in der Nähe – weit voraus sagt der Kurs noch nichts */
      if(hasCog && it.s !== "beide" && dist > 0.3 && dist <= 1.5 * reach) out.side = rel >= 0 ? "stb" : "bb";
      /* Fortschritt auf dem Weg der Etappe: entscheidet, ob eine entfernte Wegmarke noch kommt oder schon vorbei ist –
         auch wenn das Schiff dem Fahrplan voraus oder hinterher ist */
      const sf = it.path ? progress(it.path, pos) : null;
      const ahead = sf !== null ? (it.pf - sf) * it.path.total : null;          /* sm bis zur Wegmarke, entlang des Wegs */
      if(dist <= reach && ahead !== null && ahead < -Math.max(3, reach * 0.5)) out.phase = "vorbei";          /* noch nah, aber längst dahinter */
      else if(dist <= reach) out.phase = hasCog ? (Math.abs(rel) >= 75 ? "querab" : "nah") : (ahead !== null && ahead <= 0 ? "querab" : "nah");
      else if(ahead !== null) out.phase = ahead <= 0 ? "vorbei" : "vor";
      else if(hasCog && Math.abs(rel) > 90 && dist <= 4 * reach) out.phase = "vorbei";
      else out.phase = it.tPlan && now > it.tPlan + 3600000 ? "vorbei" : "vor";
      if(out.phase === "nah") out.eta = now + Math.max(0, dist * Math.cos(rad(Math.min(89, Math.abs(rel))))) / kn * 3600000;
      else if(out.phase === "vor") out.eta = now + Math.max(dist, ahead || 0) / kn * 3600000;
      else out.eta = now;
      return out;
    }
    /* Fahrplan: nur für Wegmarken, die sicher auf der Route liegen */
    if(!it.tPlan) return out;
    const lead = reach / kn * 3600000;
    out.dist = Math.abs(it.tPlan - now) / 3600000 * kn;
    if(now >= it.tPlan + 20 * 60000) out.phase = "vorbei";
    else if(it.live) out.phase = "vor";
    else if(now >= it.tPlan) out.phase = "querab";
    else if(now >= it.tPlan - lead) out.phase = "nah";
    return out;
  }

  /* Sonnenstand: unter −4° gilt als dunkel (bürgerliche Dämmerung fast vorbei) */
  function dark(lat, lon, t){
    const d = new Date(t);
    const day = (Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - Date.UTC(d.getUTCFullYear(), 0, 0)) / 86400000;
    const decl = rad(-23.44) * Math.cos(2 * Math.PI * (day + 10) / 365);
    const hours = d.getUTCHours() + d.getUTCMinutes() / 60 + lon / 15;
    const ha = rad(15 * (hours - 12));
    const alt = Math.asin(Math.sin(rad(lat)) * Math.sin(decl) + Math.cos(rad(lat)) * Math.cos(decl) * Math.cos(ha));
    return deg(alt) < -4;
  }

  const SIDE = {bb: "an Backbord (links)", stb: "an Steuerbord (rechts)", beide: "zu beiden Seiten"};
  const KIND = {kap: "Kap", insel: "Insel", meerenge: "Meerenge", bauwerk: "Bauwerk", vulkan: "Vulkan", berg: "Berg", stadt: "Stadt",
    leuchtturm: "Leuchtturm", natur: "Natur", linie: "Linie", geschichte: "Geschichte"};
  function fmtMin(ms){
    const m = Math.max(1, Math.round(ms / 60000));
    if(m < 55) return `${Math.round(m / 5) * 5 || 5} Min.`;
    const h = m / 60;
    return h < 1.25 ? "1 Std." : `${String(Math.round(h * 2) / 2).replace(".", ",")} Std.`;
  }
  const fmtNm = d => d < 10 ? String(Math.round(d * 2) / 2).replace(".", ",") : String(Math.round(d));
  /* kind: "near" oder "pass" */
  function text(it, st, kind, now){
    const side = st.side && it.k !== "linie" ? SIDE[st.side] : "";
    const plan = st.basis === "plan";
    const night = it.k !== "linie" && it.k !== "geschichte" && dark(it.lat, it.lon, kind === "near" ? st.eta || now : now);
    let title, lead;
    if(kind === "near"){
      title = `Bald zu sehen: ${it.n}`;
      const bits = [`${plan ? "Laut Fahrplan in" : "In"} etwa ${fmtMin((st.eta || now) - now)}`];
      if(side) bits.push(side);
      if(!plan && st.dist !== null && it.k !== "linie") bits.push(`noch ${fmtNm(st.dist)} sm`);
      lead = bits.join(", ").replace(/\.$/, "") + ".";
      if(it.k === "linie") title = `Gleich: ${it.n}`;
    } else {
      title = it.k === "linie" ? `Jetzt: ${it.n}` : `Jetzt querab: ${it.n}`;
      const bits = [];
      if(side) bits.push(side.charAt(0).toUpperCase() + side.slice(1));
      if(!plan && st.dist !== null && it.k !== "linie" && st.dist >= 0.5) bits.push(`${bits.length ? "rund" : "Rund"} ${fmtNm(st.dist)} sm entfernt`);
      if(plan) bits.push(bits.length ? "laut Fahrplan" : "Laut Fahrplan");
      lead = bits.length ? bits.join(", ") + "." : "";
    }
    const tail = night ? " Dort ist es dunkel – auf Lichter und Leuchtfeuer achten." : "";
    return {title, body: [lead, it.t].filter(Boolean).join(" ") + tail};
  }

  const api = {build, along, progressOf, state, text, dark, distNm, bearingDeg, slug, short, SIDE, KIND, fmtMin, fmtNm, LIVE_MAX_AGE};
  if(typeof module !== "undefined" && module.exports) module.exports = api;
  root.Unterwegs = api;
})(typeof self !== "undefined" ? self : globalThis);
