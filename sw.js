// ACK Rivals VR service worker: keeps a copy of the game so it opens fast,
// then refreshes that copy in the background for the next launch.
const CACHE = 'ack-rivals-v1';
const CORE = ['/', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin || url.pathname.startsWith('/.well-known/') || url.pathname === '/sw.js') return;
  const key = req.mode === 'navigate' ? '/' : req;
  e.respondWith(caches.open(CACHE).then(async c => {
    const hit = await c.match(key);
    const fresh = fetch(req).then(r => { if (r && r.ok && r.type === 'basic') c.put(key, r.clone()); return r; }).catch(() => null);
    if (hit) { e.waitUntil(fresh); return hit; }
    const r = await fresh;
    return r || new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } });
  }));
});
