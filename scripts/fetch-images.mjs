/* Holt je Hafen ein Bild von Wikipedia/Wikimedia Commons und legt es im Repository ab.
   Läuft als GitHub Action (bilder.yml). Ergebnis: img/<slug>.<ext> und data/bilder.json
   mit Urheber, Lizenz und Quelle je Bild. Titel lassen sich in data/bilder-titel.json überschreiben.
   Zugriff bewusst langsam (eine Anfrage pro Sekunde, Wiederholung bei Fehlern), damit Wikimedia nicht drosselt. */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, unlinkSync } from "node:fs";

const html = readFileSync("index.html", "utf8");
const m = /const CALLS = (\[[\s\S]*?\n\]);/.exec(html);
if(!m){ console.error("CALLS nicht gefunden"); process.exit(1); }
const CALLS = new Function("return " + m[1])();
const overrides = existsSync("data/bilder-titel.json") ? JSON.parse(readFileSync("data/bilder-titel.json", "utf8")) : {};
mkdirSync("img", { recursive: true });

const slugify = s => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const WIDTH = Number(process.env.IMG_WIDTH || 1024);
const UA = "WeltreiseApp/1.1 (https://github.com/SchnitzhoferPeter/weltreise; peter@reqpool.com)";
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function get(url, type = "json", tries = 3){
  for(let i = 0; i < tries; i++){
    try{
      const r = await fetch(url, { headers: { "User-Agent": UA, "Api-User-Agent": UA, "Accept": type === "json" ? "application/json" : "image/*,*/*" } });
      if(r.status === 429 || r.status >= 500){ throw new Error(`HTTP ${r.status}`); }
      if(!r.ok) return { error: `HTTP ${r.status}` };
      return type === "json" ? r.json() : Buffer.from(await r.arrayBuffer());
    }catch(e){
      if(i === tries - 1) return { error: e.message };
      await sleep(2000 * (i + 1));
    }
  }
}

/* Artikelbild über die Action-API: liefert direkt ein Vorschaubild in Zielbreite */
async function pageImage(lang, title, width){
  const url = `https://${lang}.wikipedia.org/w/api.php?action=query&format=json&formatversion=2&redirects=1`
    + `&prop=pageimages|info&piprop=thumbnail|name&pithumbsize=${width}&inprop=url&titles=${encodeURIComponent(title)}`;
  const d = await get(url);
  await sleep(1000);
  if(!d || d.error) return { error: d ? d.error : "keine Antwort" };
  const p = d.query && d.query.pages && d.query.pages[0];
  if(!p || p.missing || !p.thumbnail) return { error: p && p.missing ? "Artikel fehlt" : "kein Artikelbild" };
  return { src: p.thumbnail.source, file: p.pageimage, page: p.fullurl, title: p.title, lang };
}
async function license(fileTitle){
  const q = await get(`https://commons.wikimedia.org/w/api.php?action=query&format=json&formatversion=2&prop=imageinfo&iiprop=extmetadata|url&titles=${encodeURIComponent("File:" + fileTitle)}`);
  await sleep(1000);
  const page = q && !q.error && q.query && q.query.pages && q.query.pages[0];
  const md = page && page.imageinfo && page.imageinfo[0] && page.imageinfo[0].extmetadata || {};
  const strip = s => String(s || "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
  return {
    author: strip(md.Artist && md.Artist.value).slice(0, 80),
    license: strip(md.LicenseShortName && md.LicenseShortName.value),
    licenseUrl: strip(md.LicenseUrl && md.LicenseUrl.value),
    page: page && page.imageinfo && page.imageinfo[0] && page.imageinfo[0].descriptionurl || `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(fileTitle)}`
  };
}

/* Kandidaten je Hafen: Zeichenkette oder Liste; „en:Titel“ erzwingt die englische Wikipedia.
   Karten, Wappen und Grafiken (svg/gif) werden übersprungen, damit ein Foto herauskommt. */
const targets = new Map();
CALLS.forEach(c => targets.set(c.w, overrides[c.n] || overrides[c.w] || c.w));
targets.set("Costa Deliziosa", overrides["Costa Deliziosa"] || "Costa Deliziosa");
const isPhoto = src => /\.(jpe?g|png|webp)(\?|$)/i.test(String(src)) && !/\.svg\.png(\?|$)/i.test(String(src));

const out = {}, misses = [];
for(const [key, spec] of targets){
  const slug = slugify(key);
  const candidates = Array.isArray(spec) ? spec : [spec];
  let info = null, lastErr = "", usedTitle = "";
  for(const cand of candidates){
    const forced = /^en:/.test(cand), title = cand.replace(/^en:/, "");
    for(const lang of forced ? ["en"] : ["de", "en"]){
      const r = await pageImage(lang, title, WIDTH);
      if(r.error){ lastErr = `${lang}: ${r.error}`; continue; }
      if(!isPhoto(r.src)){ lastErr = `${lang}: Artikelbild ist Grafik (${r.file})`; continue; }
      info = r; usedTitle = title; break;
    }
    if(info) break;
  }
  const title = usedTitle || candidates[candidates.length - 1];
  if(!info){ misses.push(`${key} (gesucht: ${candidates.join(" | ")}) – ${lastErr}`); continue; }

  let buf = await get(info.src, "bin");
  await sleep(1000);
  if(!buf || buf.error || buf.length < 20000){
    /* kleinere Stufe versuchen */
    const r2 = await pageImage(info.lang, title, 800);
    buf = r2.error ? null : await get(r2.src, "bin");
    await sleep(1000);
    if(!buf || buf.error || buf.length < 20000){ misses.push(`${key}: Download fehlgeschlagen (${buf && buf.error ? buf.error : "zu klein"})`); continue; }
  }
  const ext = (String(info.src).match(/\.(jpe?g|png|gif|webp)(\?|$)/i) || [".jpg"])[0].toLowerCase().replace(/\?$/, "").replace(".jpeg", ".jpg");
  const file = `img/${slug}${ext}`;
  writeFileSync(file, buf);
  const lic = await license(info.file);
  out[slug] = { file, title: info.title, wiki: info.page, lang: info.lang, ...lic, bytes: buf.length };
  console.log(`${key} → ${file} (${Math.round(buf.length / 1024)} KB, ${lic.license || "Lizenz unbekannt"})`);
}
/* verwaiste Dateien entfernen (z. B. nach Wechsel der Dateiendung) */
const keep = new Set(Object.values(out).map(o => o.file.replace(/^img\//, "")));
for(const f of readdirSync("img")) if(!keep.has(f)) unlinkSync(`img/${f}`);
writeFileSync("data/bilder.json", JSON.stringify(out, null, 2) + "\n");
console.log(`\n${Object.keys(out).length} Bilder, ${misses.length} ohne Bild${misses.length ? ":\n  " + misses.join("\n  ") : ""}`);
