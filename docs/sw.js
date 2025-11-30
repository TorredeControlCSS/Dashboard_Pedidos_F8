// v2025-11-30a — SW de transición para limpiar caché y desregistrar
self.addEventListener('install', e => { self.skipWaiting(); });
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => caches.delete(k)));
    const regs = await self.registration.unregister();
    const clientsArr = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    clientsArr.forEach(c => c.navigate(c.url)); // recarga
  })());
});
self.addEventListener('fetch', e => {
  // no interceptar => siempre red de GitHub Pages
});
