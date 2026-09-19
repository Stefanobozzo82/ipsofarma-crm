// Service worker di Fungiaro: rende l'app installabile e apribile anche
// offline (schermata base), ma NON mette in cache le chiamate meteo/mappa,
// che devono restare sempre dati live da rete.
const CACHE_NAME = 'fungiaro-shell-v1';
const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Solo richieste GET dello stesso dominio (l'app shell): network-first,
  // con fallback alla cache se offline. Tutto il resto (meteo, mappa,
  // Overpass, librerie da CDN) passa dritto in rete, senza intercettazioni:
  // deve sempre essere aggiornato in tempo reale.
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(req)
      .then((resp) => {
        const copy = resp.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
        return resp;
      })
      .catch(() => caches.match(req).then((cached) => cached || caches.match('/index.html')))
  );
});
