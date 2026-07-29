const CACHE_NAME = "pokemon-shinydex-v11";
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./i18n.js",
  "./gender-differences.js",
  "./app.js",
  "./firebase-sync.js",
  "./data/pokedex-data.js",
  "./data/shiny-availability.js",
  "./data/distributions.js",
  "./manifest.webmanifest",
  "./assets/shiny-pokeball.svg",
  "./assets/shiny-pokeball-192.png",
  "./assets/shiny-pokeball-512.png",
  "./assets/flags/fr.svg",
  "./assets/flags/en.svg",
  "./assets/flags/es.svg",
  "./assets/flags/de.svg",
  "./assets/flags/it.svg",
  "./assets/flags/ja.svg"
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)));
  self.skipWaiting();
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

  const networkFirst = request.mode === "navigate"
    || ["script", "style", "manifest"].includes(request.destination);

  if (networkFirst) {
    event.respondWith(
      fetch(request)
        .then(response => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
          return response;
        })
        .catch(async () => (await caches.match(request)) || caches.match("./index.html"))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(cached => {
      const refreshed = fetch(request)
        .then(response => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
          return response;
        })
        .catch(() => cached);
      return cached || refreshed;
    })
  );
});
