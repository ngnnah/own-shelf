// Offline shell for Upwind. Book data is offline through Firestore's own cache, not this.
//   same-origin files:  network first (4 s), cache fallback
//   CDN scripts, fonts: stale-while-revalidate
//   everything else (Firestore, Google sign-in, the link Worker): not touched
const CACHE = 'upwind-v1';
const SHELL = ['./', 'index.html', 'styles.css', 'parse.js', 'store.js', 'config.js', 'app.js', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png'];
const CDN = /^https:\/\/(cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|www\.gstatic\.com|fonts\.googleapis\.com|fonts\.gstatic\.com)\//;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET') return;
  if (new URL(r.url).origin === location.origin) e.respondWith(networkFirst(r));
  else if (CDN.test(r.url)) e.respondWith(staleWhileRevalidate(r));
});

const keep = res => res && (res.ok || res.type === 'opaque');
async function networkFirst(r) {
  const cache = await caches.open(CACHE);
  // stored without the query, so ?add=… deep links don't pile up copies of the page
  const net = fetch(r).then(res => { if (res.ok) cache.put(r.url.split('?')[0], res.clone()); return res; });
  try {
    return await Promise.race([net, new Promise((_, rej) => setTimeout(() => rej(new Error('slow')), 4000))]);
  } catch (e) {
    const hit = await cache.match(r, { ignoreSearch: true }) || (r.mode === 'navigate' && await cache.match('./'));
    if (hit) { net.catch(() => {}); return hit; }
    return net; // nothing cached yet: keep waiting for the network
  }
}
async function staleWhileRevalidate(r) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(r);
  const net = fetch(r).then(res => { if (keep(res)) cache.put(r, res.clone()); return res; });
  if (hit) { net.catch(() => {}); return hit; }
  return net;
}
