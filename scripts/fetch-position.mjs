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
  console.log(`${seen.size} verschiedene Schiffe im Suchfenster empfangen.`);
  if(DIAG){
    const costa = [...seen.entries()].filter(([, n]) => /COSTA/i.test(n));
    console.log("Davon Costa-Schiffe:", costa.length ? costa.map(([id, n]) => `${n} (${id})`).join(", ") : "keine");
  }
  try{ ws.close(); }catch(e){}
  setTimeout(() => process.exit(0), 200);
}

/* Suchfenster: um die letzte bekannte Position, mit dem Alter wachsend (rund 8° je Tag, Schiff macht bis 450 sm/Tag);
   ohne bekannte Position das Mittelmeer (Heimatrevier vor der Weltreise). Der MMSI-Filter von aisstream lieferte im
   Test nichts, das Fenster ohne Filter dagegen binnen 90 s – deshalb wird die MMSI hier selbst verglichen. */
function searchBox(){
  const MED = [[30, -6], [46, 37]];
  if(!previous || !Number.isFinite(previous.lat) || !Number.isFinite(previous.lon)) return MED;
  const ageDays = Math.max(0, (Date.now() - Date.parse(previous.timestamp || 0)) / 86400000);
  if(!Number.isFinite(ageDays) || ageDays > 6) return [[-90, -180], [90, 180]];
  const r = Math.min(40, 6 + 8 * ageDays);
  const lat0 = Math.max(-85, previous.lat - r), lat1 = Math.min(85, previous.lat + r);
  let lon0 = previous.lon - r, lon1 = previous.lon + r;
  if(lon0 < -180 || lon1 > 180) return [[lat0, -180], [lat1, 180]];   /* Datumsgrenze: ganzer Breitengürtel */
  return [[lat0, lon0], [lat1, lon1]];
}
const seen = new Map();                                          /* Diagnose: MMSI → Name */
const ws = new WebSocket("wss://stream.aisstream.io/v0/stream");
ws.addEventListener("open", () => {
  const box = DIAG ? [[30, -6], [46, 37]] : searchBox();
  ws.send(JSON.stringify({ APIKey: KEY, BoundingBoxes: [box], FilterMessageTypes: ["PositionReport"] }));
  console.log(DIAG ? "Diagnose: alle Positionsmeldungen im Mittelmeer"
    : `Verbunden, Suchfenster ${box[0][0].toFixed(1)}..${box[1][0].toFixed(1)} N / ${box[0][1].toFixed(1)}..${box[1][1].toFixed(1)} O, warte auf MMSI ${MMSI}`);
});
ws.addEventListener("message", async ev => {
  let m;
  try{ m = JSON.parse(await toText(ev.data)); }catch(e){ return; }
  if(m && (m.error || m.Error)){ error = String(m.error || m.Error); console.error("aisstream:", error); return finish(); }
  const pr = m && m.Message && m.Message.PositionReport;
  const meta = (m && m.MetaData) || {};
  if(!pr) return;
  const id = String(meta.MMSI ?? pr.UserID ?? "");
  if(!seen.has(id)) seen.set(id, (meta.ShipName || "").trim());
  if(id !== String(MMSI)) return;
  console.log("Zielschiff gesehen:", meta.ShipName, pr.Latitude, pr.Longitude, pr.Sog, "kn");
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
