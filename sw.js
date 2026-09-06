const CACHE_NAME = "sanad-pwa-v40";
const CORE_ASSETS = [
  "./",
  "./sanad.html",
  "./assets/styles.css",
  "./assets/app.js",
  "./assets/search-worker.js",
  "./assets/el-amrani-logo.png",
  "./assets/vendor/tabler/tabler-icons.min.css",
  "./assets/vendor/tabler/fonts/tabler-icons.woff2",
  "./assets/vendor/tabler/fonts/tabler-icons.woff",
  "./assets/vendor/tabler/fonts/tabler-icons.ttf",
  "./manifest.json",
  "./data/offline-assets.js",
  "./icons/favicon.svg",
  "./icons/apple-touch-icon.png",
  "./icons/sanad-icon-192.png",
  "./icons/sanad-icon-512.png",
  "./icons/sanad-maskable-512.png"
];

try {
  importScripts("./data/offline-assets.js");
} catch (_) {
  self.SANAD_OFFLINE_ASSETS = [];
}

const OFFLINE_ASSETS = Array.isArray(self.SANAD_OFFLINE_ASSETS) ? self.SANAD_OFFLINE_ASSETS : [];
const ALL_ASSETS = [...new Set([...CORE_ASSETS, ...OFFLINE_ASSETS])];

function normalizedRequest(input) {
  const url = new URL(typeof input === "string" ? input : input.url, self.location.href);
  url.search = "";
  return new Request(url.href, { credentials: "same-origin" });
}

function localPath(url) {
  const scopePath = new URL(self.registration.scope).pathname;
  const path = url.pathname.startsWith(scopePath) ? url.pathname.slice(scopePath.length) : url.pathname;
  return path.replace(/^\/+/, "");
}

function isNavigation(request, url) {
  const path = localPath(url);
  return request.mode === "navigate" || path === "" || path.endsWith(".html");
}

function isCacheableLocalAsset(url) {
  const path = localPath(url);
  return path.startsWith("assets/") ||
    path.startsWith("data/") ||
    path.startsWith("content/") ||
    path.startsWith("icons/") ||
    path === "manifest.json" ||
    path === "sw.js";
}

async function notifyClients(type, payload = {}) {
  const clients = await self.clients.matchAll({ includeUncontrolled: true, type: "window" });
  clients.forEach(client => client.postMessage({ type, ...payload }));
}

async function cacheOne(cache, url) {
  try {
    const request = normalizedRequest(url);
    const response = await fetch(request, { cache: "reload" });
    if (!response || (!response.ok && response.type !== "opaque")) return false;
    await cache.put(request, response.clone());
    return true;
  } catch (_) {
    return false;
  }
}

async function cacheUrls(urls, notify = false) {
  const cache = await caches.open(CACHE_NAME);
  let cached = 0;
  const total = urls.length;
  for (let index = 0; index < urls.length; index += 8) {
    const batch = urls.slice(index, index + 8);
    const results = await Promise.allSettled(batch.map(url => cacheOne(cache, url)));
    cached += results.filter(result => result.status === "fulfilled" && result.value).length;
    if (notify) {
      await notifyClients("SANAD_OFFLINE_PROGRESS", {
        cached,
        total,
        percent: total ? Math.round((cached / total) * 100) : 100
      });
    }
  }
  return { cached, total };
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const key = normalizedRequest(request);
  const cached = await cache.match(key, { ignoreSearch: true });
  const network = fetch(request).then(response => {
    if (response && (response.ok || response.type === "opaque")) {
      cache.put(key, response.clone()).catch(() => {});
    }
    return response;
  }).catch(() => null);
  if (cached) {
    network.catch(() => {});
    return cached;
  }
  const response = await network;
  return response || new Response("SANAD content is not cached on this device yet.", {
    status: 503,
    headers: { "Content-Type": "text/plain; charset=UTF-8" }
  });
}

async function navigationResponse(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      await cache.put(normalizedRequest("./sanad.html"), response.clone());
    }
    return response;
  } catch (_) {
    return await cache.match(normalizedRequest("./sanad.html"), { ignoreSearch: true }) ||
      await cache.match(normalizedRequest("./"), { ignoreSearch: true }) ||
      new Response("SANAD is offline and the app shell is not cached yet.", {
        status: 503,
        headers: { "Content-Type": "text/plain; charset=UTF-8" }
      });
  }
}

self.addEventListener("install", event => {
  event.waitUntil(
    cacheUrls(ALL_ASSETS)
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key.startsWith("sanad-pwa-") && key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
      .then(() => cacheUrls(ALL_ASSETS, true))
      .then(result => notifyClients("SANAD_OFFLINE_READY", result))
  );
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (isNavigation(request, url)) {
    event.respondWith(navigationResponse(request));
    return;
  }

  if (isCacheableLocalAsset(url)) {
    event.respondWith(cacheFirst(request));
  }
});

self.addEventListener("message", event => {
  const type = event.data?.type;
  if (type === "SANAD_CLEAR_CACHE") {
    event.waitUntil(
      caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith("sanad-pwa-")).map(key => caches.delete(key))))
    );
    return;
  }
  if (type === "SANAD_CACHE_ALL") {
    event.waitUntil(
      cacheUrls(ALL_ASSETS, true).then(result => notifyClients("SANAD_OFFLINE_READY", result))
    );
  }
});
