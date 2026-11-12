// Telão — service worker (deixa o app instalável e abrindo rápido)
const CACHE = 'telao-v63';
const SHELL = ['/', '/index.html', '/style.css', '/app.js', '/rtc.js', '/icons.js', '/camfx.js', '/emoji.js', '/config.js', '/manifest.webmanifest',
               '/icons/icon-192.png', '/icons/icon-512.png', '/icons/icon.svg', '/icons/favicon.svg'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// Rede primeiro (sempre a versão mais nova); cache só se estiver offline
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if(e.request.method !== 'GET' || url.origin !== location.origin || url.pathname === '/version.json') return;
  e.respondWith(
    fetch(e.request).then(res => {
      if(res.ok){ const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
      return res;
    }).catch(() => caches.match(e.request).then(r => r || caches.match('/index.html')))
  );
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type:'window' }).then(list => list.length ? list[0].focus() : self.clients.openWindow('/')));
});
