// Budget app service worker. Pages always come from the network so they are
// never stale; the last good copy of /budget/ is kept so the app still opens
// (and shows its own "can't connect" state) when there is no signal.
const CACHE = 'vf-budget-v1';

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.add('/budget/')).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  if (e.request.mode !== 'navigate') return;   // data and scripts go straight to the network
  e.respondWith(
    fetch(e.request)
      .then(res => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put('/budget/', copy)); }
        return res;
      })
      .catch(() => caches.match('/budget/'))
  );
});
