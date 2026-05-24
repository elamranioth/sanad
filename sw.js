const CACHE_NAME = "sanad-pwa-v7";
const APP_ASSETS = [
  "./",
  "./index.html",
  "./sanad.html",
  "./assets/styles.css",
  "./assets/app.js",
  "./data/judgments.js",
  "./data/laws.js",
  "./data/legal-forms.js",
  "./content/laws/qanoon_al_ijraat_al_madaniya_uae_42_2022.md",
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

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then(response => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put("./sanad.html", copy));
          return response;
        })
        .catch(() => caches.match("./sanad.html"))
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
