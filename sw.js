/* EMESE: offline support. Pages and code: network first (always fresh), cached copy when offline.
 * Product images: cache first (they only change when re-rendered; bump VERSION then).
 * Order data (Supabase) is never cached. */
const VERSION = 'emese-v3';
const CORE = [
  './', 'index.html', 'track.html', 'sizes.html', 'admin.html', 'bulk.html', 'manifest.webmanifest',
  'css/style.css', 'css/pages.css', 'assets/favicon.svg', 'assets/logo.png', 'assets/icons/icon-192.png',
  'js/main.js', 'js/i18n.js', 'js/catalog.js', 'js/everything.js', 'js/hero.js', 'js/studio.js', 'js/mockup.js',
  'js/brand.js', 'js/order.js', 'js/logo.js', 'js/api.js', 'js/config.js', 'js/pricing.js', 'js/page.js',
  'js/track.js', 'js/sizes.js', 'js/admin.js', 'js/bulk.js', 'js/zip.js', 'assets/mockups/manifest.json'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === location.origin;
  const fonts = /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);
  if (!sameOrigin && !fonts) return;                    // the order database and anything else: straight to the network

  const images = sameOrigin && url.pathname.includes('/assets/');
  if (images || fonts) {
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
      if (res.ok || res.type === 'opaque') caches.open(VERSION).then(c => c.put(req, res.clone()));
      return res;
    })));
    return;
  }
  e.respondWith(fetch(req).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
    return res;
  }).catch(() => caches.match(req, { ignoreSearch: req.mode === 'navigate' }).then(hit => hit || caches.match('index.html'))));
});
