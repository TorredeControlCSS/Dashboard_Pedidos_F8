// sw.js — Service Worker básico para PWA del Dashboard F8
// Cachea recursos estáticos (HTML, CSS, JS, imágenes) para carga rápida y modo offline básico.
// IMPORTANTE: Incrementar la versión del cache al hacer cambios en JS/CSS para forzar actualización

const CACHE_NAME = 'f8-dashboard-v2.9';

const URLS_TO_CACHE = [
  './',
  './index.html',
  './flow-dashboard.html',
  './flow-styles.css',
  './flow-app.js',
  './app.js',
  './manifest.json',
  './assets/logo.png'
];

self.addEventListener('install', event => {
  console.log('[SW] Installing version:', CACHE_NAME);
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] Caching resources');
        return cache.addAll(URLS_TO_CACHE);
      })
      .then(() => {
        console.log('[SW] Cache complete, skip waiting');
        return self.skipWaiting();
      })
      .catch(err => {
        console.error('[SW] Cache failed:', err);
      })
  );
});

self.addEventListener('activate', event => {
  console.log('[SW] Activating version:', CACHE_NAME);
  event.waitUntil(
    caches.keys().then(keys => {
      console.log('[SW] Clearing old caches:', keys.filter(k => k !== CACHE_NAME));
      return Promise.all(
        keys
          .filter(k => k !== CACHE_NAME)
          .map(k => caches.delete(k))
      );
    })
  );
  return self.clients.claim();
});

self.addEventListener('fetch', event => {
  const req = event.request;

  // Solo cacheamos peticiones GET de nuestro propio origen
  // Esto automáticamente excluye script.google.com, accounts.google.com, etc.
  if (req.method !== 'GET' || !req.url.startsWith(self.location.origin)) {
    return;
  }

  event.respondWith(
    caches.match(req).then(cached => {
      // Network-first para JS y CSS para obtener siempre la última versión
      if (req.url.endsWith('.js') || req.url.endsWith('.css')) {
        return fetch(req).then(res => {
          const resClone = res.clone();
          // Cache asíncrono - no bloqueamos la respuesta
          caches.open(CACHE_NAME).then(cache => cache.put(req, resClone)).catch(err => {
            console.warn('[SW] Cache put failed:', err);
          });
          return res;
        }).catch(() => cached);
      }

      // Cache-first para otros recursos
      if (cached) return cached;

      return fetch(req).then(res => {
        const resClone = res.clone();
        // Cache asíncrono - no bloqueamos la respuesta
        caches.open(CACHE_NAME).then(cache => cache.put(req, resClone)).catch(err => {
          console.warn('[SW] Cache put failed:', err);
        });
        return res;
      }).catch(() => cached);
    })
  );
});

