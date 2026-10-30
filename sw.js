// Offline cache: the app has no network calls, so everything is cached after first load.
const CACHE = 'pixelnote-v2';
const FILES = ['./', 'index.html', 'app.js', 'style.css', 'fx-ui.js', 'animation.html', 'animation.css', 'animation.js', 'fx-core.js', 'fx-fire.js', 'fx-nature.js', 'fx-sound.js', 'manifest.webmanifest', 'icon.svg'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || fetch(e.request)));
});
