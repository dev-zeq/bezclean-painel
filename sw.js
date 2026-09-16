const CACHE_NAME = "bezclean-painel-v2";
const APP_SHELL = [
  "/",
  "/index.html",
  "/clientes.html",
  "/orcamentos.html",
  "/mensagens.html",
  "/manifest.webmanifest",
  "/pwa.js",
  "/assets/css/styles.css?v=20260916b",
  "/assets/js/app.js?v=20260914f"
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

  // Dados operacionais nunca são armazenados em cache: Supabase e WhatsApp seguem online.
  if (url.origin !== self.location.origin) return;

  // Rede primeiro: HTML e CSS atualizam juntos, sem guardar respostas do Supabase.
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
