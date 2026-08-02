const CACHE_NAME = "pokemon-shinydex-experimental-v20";
const GAME_COVER_IDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 37, 38, 39, 40, 41, 44, 45, 46, 47];
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./i18n.js",
  "./gender-differences.js",
  "./app.js",
  "./firebase-sync.js",
  "./data/pokedex-data.js",
  "./data/pokemon-details.js",
  "./data/technical-effects.js",
  "./data/shiny-availability.js",
  "./data/distribution-source-locales.js",
  "./data/distributions.js",
  "./manifest.webmanifest",
  "./assets/shiny-pokeball.svg",
  "./assets/shiny-pokeball-192.png",
  "./assets/shiny-pokeball-512.png",
  "./assets/ditto-2d.webp",
  "./assets/ditto-3d.webp",
  "./assets/move-categories/physical.png",
  "./assets/move-categories/special.png",
  "./assets/move-categories/status.png",
  "./assets/flags/fr.svg",
  "./assets/flags/en.svg",
  "./assets/flags/es.svg",
  "./assets/flags/de.svg",
  "./assets/flags/it.svg",
  "./assets/flags/ja.svg",
  ...GAME_COVER_IDS.map(id => `./assets/game-covers/${id}.webp`)
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
