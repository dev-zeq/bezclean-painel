// Ao publicar uma versão nova, altere somente esta constante e use o mesmo valor nos links dos HTML.
const APP_VERSION = "20260918a";
const CACHE_NAME = `bezclean-painel-${APP_VERSION}`;
const asset = path => `${path}?v=${APP_VERSION}`;
const APP_SHELL = [
  "/",
  asset("/index.html"),
  asset("/clientes.html"),
  asset("/orcamentos.html"),
  asset("/mensagens.html"),
  asset("/manifest.webmanifest"),
  asset("/pwa.js"),
  asset("/assets/css/base.css"),
  asset("/assets/css/styles.css"),
  asset("/assets/js/dialogs.js"),
  asset("/assets/js/app.js")
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
  )));
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  const shell = new Set(APP_SHELL.map(path => new URL(path, self.location.origin).pathname));
  event.respondWith(fetch(event.request).then(response => {
    if (response.ok && shell.has(url.pathname)) {
      const copy = response.clone();
      event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy)));
    }
    return response;
  }).catch(() => caches.match(event.request).then(cached => cached || (
    event.request.mode === "navigate" ? caches.match("/") : Response.error()
  ))));
});
