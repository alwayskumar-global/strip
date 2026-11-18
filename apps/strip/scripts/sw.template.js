// Strip service worker (generated into dist/app/sw.js by scripts/build-sw.mjs). Hand-written, no library.
// Precache everything the app needs (code, wasm, fonts, notices, manifest, icons) so it works offline after one visit.
// A new version never activates early: it waits until every tab closes, so a running page never changes assets under itself (R14.9).
const CACHE = "__CACHE__";
const PRECACHE = __PRECACHE__;
const ROUTES = ["/", "/send", "/send/screen", "/send/paper", "/receive", "/about"];
self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)));
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("strip-") && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});
self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  const path = url.pathname.length > 1 && url.pathname.endsWith("/") ? url.pathname.slice(0, -1) : url.pathname;
  // A navigation to a route of the app gets the app shell; other navigations (the notices file) get their own file.
  if (request.mode === "navigate" && ROUTES.includes(path)) {
    event.respondWith(caches.match("/index.html").then((hit) => hit || fetch(request)));
    return;
  }
  event.respondWith(caches.match(request, { ignoreSearch: true }).then((hit) => hit || fetch(request)));
});
