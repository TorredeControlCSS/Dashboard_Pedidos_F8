// ===== sw.js (PWA básico para GitHub Pages) =====
const CACHE_VERSION = 'v1.0.0';
const CACHE_NAME = `f8-cache-${CACHE_VERSION}`;
const APP_SHELL = [
  '/Dashboard_Pedidos_F8/',
  '/Dashboard_Pedidos_F8/index.html',
  '/Dashboard_Pedidos_F8/styles.css',
  '/Dashboard_Pedidos_F8/app.js',
  '/Dashboard_Pedidos_F8/metrics.js',
  '/Dashboard_Pedidos_F8/edit.html',
  '/Dashboard_Pedidos_F8/icons/favicon.ico',
  '/Dashboard_Pedidos_F8/icons/favicon-32.png',
  '/Dashboard_Pedidos_F8/icons/favicon-16.png',
  '/Dashboard_Pedidos_F8/assets/logo.png'
];

// Instala: precache app shell
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE_NAME).then((c) => c.addAll(APP_SHELL)));
  self.skipWaiting();
});

// Activa: limpia caches viejos
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter(k => k.startsWith('f8-cache-') && k !== CACHE_NAME)
        .map(k => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// Fetch: cache-first para estáticos; network para APIs/JSONP
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // Nunca cachear Apps Script ni JSONP (para no servir datos viejos)
  const isAppsScript = url.hostname.endsWith('google.com') || url.hostname.endsWith('googleusercontent.com');
  const isJsonp = url.searchParams.has('callback');

  if (isAppsScript || isJsonp) {
    return; // deja que el navegador gestione (network-first)
  }

  // Cache-first para el app shell
  e.respondWith(
    caches.match(e.request).then((cached) => {
      return cached || fetch(e.request).then((resp) => {
        // Cachea solo GET y del mismo origen
        if (e.request.method === 'GET' && url.origin === location.origin) {
          const clone = resp.clone();
          caches.open(CACHE_NAME).then((c) => c.put(e.request, clone));
        }
        return resp;
      });
    })
  );
});
