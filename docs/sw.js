// v2025-11-30b — limpia caché y se desregistra
self.addEventListener('install', e => { self.skipWaiting(); });
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => caches.delete(k)));
    await self.registration.unregister();
    const clientsArr = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    clientsArr.forEach(c => c.navigate(c.url));
  })());
});
self.addEventListener('fetch', e => {});
