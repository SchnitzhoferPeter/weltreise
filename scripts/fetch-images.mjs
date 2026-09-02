/* Holt je Hafen ein Bild von Wikipedia/Wikimedia Commons und legt es im Repository ab.
   Läuft als GitHub Action (bilder.yml). Ergebnis: img/<slug>.<ext> und data/bilder.json
   mit Urheber, Lizenz und Quelle je Bild. Titel lassen sich in data/bilder-titel.json überschreiben. */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";

const html = readFileSync("index.html", "utf8");
const m = /const CALLS = (\[[\s\S]*?\n\]);/.exec(html);
if(!m){ console.error("CALLS nicht gefunden"); process.exit(1); }
const CALLS = new Function("return " + m[1])();
const overrides = existsSync("data/bilder-titel.json") ? JSON.parse(readFileSync("data/bilder-titel.json", "utf8")) : {};
const existing = existsSync("data/bilder.json") ? JSON.parse(readFileSync("data/bilder.json", "utf8")) : {};
mkdirSync("img", { recursive: true });

const slugify = s => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const WIDTH = 1024;
const UA = "WeltreiseApp/1.0 (github.com/SchnitzhoferPeter/weltreise)";
const get = async (url, type = "json") => {
  const r = await fetch(url, { headers: { "User-Agent": UA, "Accept": type === "json" ? "application/json" : "*/*" } });
  if(!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
  return type === "json" ? r.json() : Buffer.from(await r.arrayBuffer());
};

async function summary(title){
  for(const lang of ["de", "en"]){
    try{
      const d = await get(`https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`);
      if(d && d.originalimage && d.originalimage.source) return { d, lang };
    }catch(e){}
  }
  return null;
}
async function license(fileTitle){
  try{
    const q = await get(`https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo&iiprop=extmetadata|url&titles=${encodeURIComponent("File:" + fileTitle)}`);
    const page = Object.values(q.query.pages)[0];
    const md = page && page.imageinfo && page.imageinfo[0] && page.imageinfo[0].extmetadata || {};
    const strip = s => String(s || "").replace(/<[^>]+>/g, "").trim();
    return {
      author: strip(md.Artist && md.Artist.value),
      license: strip(md.LicenseShortName && md.LicenseShortName.value),
      licenseUrl: strip(md.LicenseUrl && md.LicenseUrl.value),
      page: page && page.imageinfo && page.imageinfo[0] && page.imageinfo[0].descriptionurl || `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(fileTitle)}`
    };
  }catch(e){ return { author: "", license: "", licenseUrl: "", page: `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(fileTitle)}` }; }
}

const targets = new Map();
CALLS.forEach(c => targets.set(c.w, overrides[c.n] || overrides[c.w] || c.w));
targets.set("Costa Deliziosa", overrides["Costa Deliziosa"] || "Costa Deliziosa");

const out = {}, misses = [];
for(const [key, title] of targets){
  const slug = slugify(key);
  const s = await summary(title);
  if(!s){ misses.push(`${key} (gesucht: ${title})`); if(existing[slug]) out[slug] = existing[slug]; continue; }
  const orig = s.d.originalimage.source;
  const fileTitle = decodeURIComponent(orig.split("/").pop());
  const ext = (fileTitle.match(/\.(jpe?g|png|gif|webp)$/i) || [".jpg"])[0].toLowerCase().replace(".jpeg", ".jpg");
  /* Vorschaubild in Zielbreite: aus dem Originalpfad /commons/a/ab/Datei → /commons/thumb/a/ab/Datei/1024px-Datei */
  const thumbBase = s.d.thumbnail && s.d.thumbnail.source ? s.d.thumbnail.source.replace(/\/\d+px-/, `/${WIDTH}px-`) : orig;
  let buf;
  try{ buf = await get(thumbBase, "bin"); }catch(e){ try{ buf = await get(orig, "bin"); }catch(e2){ misses.push(`${key}: Download fehlgeschlagen`); continue; } }
  const outExt = /\.svg$/i.test(fileTitle) ? ".png" : ext;
  const file = `img/${slug}${outExt}`;
  writeFileSync(file, buf);
  const lic = await license(fileTitle);
  out[slug] = { file, title: s.d.title, wiki: s.d.content_urls && s.d.content_urls.desktop.page, lang: s.lang, ...lic, bytes: buf.length };
  console.log(`${key} → ${file} (${Math.round(buf.length / 1024)} KB, ${lic.license || "Lizenz unbekannt"})`);
}
writeFileSync("data/bilder.json", JSON.stringify(out, null, 2) + "\n");
console.log(`\n${Object.keys(out).length} Bilder, ${misses.length} ohne Bild${misses.length ? ":\n  " + misses.join("\n  ") : ""}`);
