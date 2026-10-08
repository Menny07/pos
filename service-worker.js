const CACHE = 'pos-shell-v3';
const SHELL = ['./', 'index.html', 'js/localdb.js', 'js/auth.js', 'js/admin.js', 'manifest.json'];
self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL))));
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(k => Promise.all(k.filter(x => x !== CACHE).map(x => caches.delete(x)))).then(() => self.clients.claim())));
self.addEventListener('message', e => { if (e.data === 'SKIP_WAITING') self.skipWaiting(); }); // actualizacion controlada
self.addEventListener('fetch', e => {
  const req = e.request; const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return; // nunca cachear la API ni datos
  e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(r => {
    if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(req, copy)); } return r;
  }).catch(() => caches.match('index.html'))));
});