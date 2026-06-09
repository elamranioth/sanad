const CACHE_NAME = "sanad-pwa-v38";
const APP_ASSETS = [
  "./assets/styles.css",
  "./assets/app.js",
  "./assets/search-worker.js",
  "./assets/el-amrani-logo.png",
  "./assets/vendor/tabler/tabler-icons.min.css",
  "./assets/vendor/tabler/fonts/tabler-icons.woff2",
  "./assets/vendor/tabler/fonts/tabler-icons.woff",
  "./assets/vendor/tabler/fonts/tabler-icons.ttf",
  "./manifest.json",
  "./icons/favicon.svg",
  "./icons/apple-touch-icon.png",
  "./icons/sanad-icon-192.png",
  "./icons/sanad-icon-512.png",
  "./icons/sanad-maskable-512.png"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

function isProtectedRequest(request, url) {
  return request.mode === "navigate" ||
    url.pathname === "/" ||
    url.pathname.endsWith(".html") ||
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/data/") ||
    url.pathname.startsWith("/content/");
}

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (isProtectedRequest(request, url)) {
    event.respondWith(
      fetch(request).catch(() => new Response("SANAD needs an active connection for protected content.", {
        status: 503,
        headers: { "Content-Type": "text/plain; charset=UTF-8" }
      }))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(cached => cached || fetch(request).then(response => {
      const copy = response.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
      return response;
    }))
  );
});

self.addEventListener("message", event => {
  if (event.data?.type !== "SANAD_CLEAR_CACHE") return;
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith("sanad-pwa-")).map(key => caches.delete(key))))
  );
});
