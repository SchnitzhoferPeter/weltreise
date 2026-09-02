/* Kleiner Service Worker: die Seite startet auch bei schlechtem Schiffs-WLAN.
   Wetter- und Positionsdaten werden bewusst nicht gecacht – die kommen aus dem Netz
   oder aus dem localStorage-Cache der Seite selbst. */
const CACHE = "weltreise-v2";
const SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css",
  "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"
];

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => Promise.allSettled(SHELL.map(u => c.add(new Request(u, {mode:"no-cors"})))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if(req.method !== "GET") return;
  const url = new URL(req.url);
  if(url.hostname.includes("open-meteo.com") || url.pathname.endsWith("position.json")) return;

  e.respondWith(
    fetch(req)
      .then(res => {
        if(res && (res.ok || res.type === "opaque")){
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(req, {ignoreSearch:true})
        .then(hit => hit || (req.mode === "navigate" ? caches.match("./index.html") : Response.error())))
  );
});
