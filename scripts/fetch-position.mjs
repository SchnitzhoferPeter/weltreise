/* Holt die aktuelle AIS-Position der Costa Deliziosa über aisstream.io.
   Läuft serverseitig (GitHub Action), weil aisstream keine Browser-Verbindungen erlaubt.
   Ergebnis: out/position.json (nur bei empfangener Meldung) und out/status.json (immer). */
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";

const KEY = process.env.AISSTREAM_KEY;
const MMSI = process.env.SHIP_MMSI || "247282900";
const LISTEN_MS = Number(process.env.LISTEN_MS || 240000);   /* 4 Minuten lauschen */
const DIAG = process.env.DIAG === "1";                          /* Diagnose: alle Schiffe im Mittelmeer zählen */
const OUT = process.env.OUT_DIR || "out";

if(!KEY){ console.error("AISSTREAM_KEY fehlt (Repository-Secret)."); process.exit(1); }
mkdirSync(OUT, { recursive: true });

let previous = null;
try{
  const raw = existsSync(`${OUT}/position.json`) ? readFileSync(`${OUT}/position.json`, "utf8").trim() : "";
  previous = raw ? JSON.parse(raw) : null;
}catch(e){ previous = null; }

let fix = null, error = "", finished = false;
const started = Date.now();

async function toText(data){
  if(typeof data === "string") return data;
  if(data instanceof ArrayBuffer) return Buffer.from(data).toString("utf8");
  if(Buffer.isBuffer(data)) return data.toString("utf8");
  if(data && typeof data.text === "function") return data.text();
  return String(data);
}

function finish(){
  if(finished) return;
  finished = true;
  const status = {
    checked: new Date().toISOString(),
    received: !!fix,
    listenedSeconds: Math.round((Date.now() - started) / 1000),
    error: error || null,
    mmsi: MMSI
  };
  writeFileSync(`${OUT}/status.json`, JSON.stringify(status, null, 2) + "\n");
  if(fix){
    writeFileSync(`${OUT}/position.json`, JSON.stringify(fix, null, 2) + "\n");
    console.log("Position gespeichert:", fix);
  } else {
    console.log("Keine Meldung in", status.listenedSeconds, "s.", error ? "Fehler: " + error : "Schiff vermutlich außer Reichweite der Landstationen.");
    if(previous) console.log("Letzte bekannte Position bleibt:", previous.timestamp);
  }
  if(DIAG){
    console.log(`Diagnose: ${seen.size} verschiedene Schiffe im Mittelmeer empfangen.`);
    const costa = [...seen.entries()].filter(([, n]) => /COSTA/i.test(n));
    console.log("Davon Costa-Schiffe:", costa.length ? costa.map(([id, n]) => `${n} (${id})`).join(", ") : "keine");
  }
  try{ ws.close(); }catch(e){}
  setTimeout(() => process.exit(0), 200);
}

const seen = new Map();                                          /* Diagnose: MMSI → Name */
const ws = new WebSocket("wss://stream.aisstream.io/v0/stream");
ws.addEventListener("open", () => {
  const sub = DIAG
    ? { APIKey: KEY, BoundingBoxes: [[[30, -6], [46, 37]]], FilterMessageTypes: ["PositionReport"] }
    : { APIKey: KEY, BoundingBoxes: [[[-90, -180], [90, 180]]], FiltersShipMMSI: [String(MMSI)], FilterMessageTypes: ["PositionReport"] };
  ws.send(JSON.stringify(sub));
  console.log(DIAG ? "Diagnose: alle Positionsmeldungen im Mittelmeer" : "Verbunden, warte auf PositionReport von MMSI " + MMSI);
});
ws.addEventListener("message", async ev => {
  let m;
  try{ m = JSON.parse(await toText(ev.data)); }catch(e){ return; }
  if(m && (m.error || m.Error)){ error = String(m.error || m.Error); console.error("aisstream:", error); return finish(); }
  const pr = m && m.Message && m.Message.PositionReport;
  const meta = (m && m.MetaData) || {};
  if(!pr) return;
  if(DIAG){
    const id = String(meta.MMSI ?? pr.UserID ?? "");
    if(!seen.has(id)) seen.set(id, (meta.ShipName || "").trim());
    if(id !== String(MMSI)) return;
    console.log("Zielschiff gesehen:", meta.ShipName, pr.Latitude, pr.Longitude, pr.Sog, "kn");
  }
  const lat = pr.Latitude ?? meta.latitude, lon = pr.Longitude ?? meta.longitude;
  if(!Number.isFinite(lat) || !Number.isFinite(lon)) return;
  const t = Date.parse(String(meta.time_utc || "").replace(" +0000 UTC", "Z").replace(" ", "T"));
  fix = {
    lat: +lat.toFixed(5), lon: +lon.toFixed(5),
    sog: Number.isFinite(pr.Sog) ? +pr.Sog.toFixed(1) : null,
    cog: Number.isFinite(pr.Cog) ? Math.round(pr.Cog) : null,
    heading: Number.isFinite(pr.TrueHeading) && pr.TrueHeading < 360 ? pr.TrueHeading : null,
    navStatus: pr.NavigationalStatus ?? null,
    shipName: (meta.ShipName || "").trim() || null,
    timestamp: new Date(Number.isFinite(t) ? t : Date.now()).toISOString(),
    source: "aisstream.io, terrestrisches AIS, über GitHub Action"
  };
  finish();
});
ws.addEventListener("error", ev => { error = ev && ev.message ? ev.message : "WebSocket-Fehler"; console.error("WebSocket:", error); });
ws.addEventListener("close", ev => { if(!fix && !error && ev && ev.code !== 1000) error = `Verbindung geschlossen (Code ${ev.code}${ev.reason ? ", " + ev.reason : ""})`; finish(); });
setTimeout(finish, LISTEN_MS);
