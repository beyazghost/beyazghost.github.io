const CACHE = "zorro-writing-desk-v1";
const ASSETS = [
  "/dashboard/writer.html",
  "/dashboard/writer.js",
  "/dashboard/writer.webmanifest",
  "/style.css",
  "/fonts/newsreader-normal.woff2",
  "/fonts/newsreader-italic.woff2",
  "/writing/author-avatar.svg"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith("zorro-writing-desk-") && key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
    if (response.ok && new URL(event.request.url).origin === self.location.origin) {
      const copy = response.clone();
      caches.open(CACHE).then((cache) => cache.put(event.request, copy));
    }
    return response;
  }).catch(() => event.request.mode === "navigate" ? caches.match("/dashboard/writer.html") : Response.error())));
});
