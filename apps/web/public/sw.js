/* NEXBILL service worker.
 * Scope is deliberately narrow: it makes the app shell and static assets available offline so the
 * POS can open without a connection. It never caches or replays API calls: bills captured offline
 * are queued by the app itself with idempotency keys and sent when the network returns. */
const CACHE = 'nexbill-shell-v1';
const SHELL = ['/pos', '/manifest.webmanifest', '/icon.svg'];

self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => undefined)); self.skipWaiting(); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  if (url.pathname.startsWith('/_next/static/') || url.pathname === '/icon.svg') {
    // immutable, content-hashed assets: cache first
    e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); return res; })));
    return;
  }
  if (e.request.mode === 'navigate') {
    // pages: network first, fall back to the last copy, then to the POS shell
    e.respondWith(fetch(e.request).then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); return res; })
      .catch(() => caches.match(e.request).then((hit) => hit || caches.match('/pos'))));
  }
});
