// Navyk service worker: cache-first for the app shell, network-first for /api (lessons work offline
// once opened), stale-while-revalidate for Google Fonts. /api/review is never cached.

const VERSION = "navyk-v1";
const SHELL = `${VERSION}-shell`;
const DATA = `${VERSION}-data`;
const FONTS = `${VERSION}-fonts`;

const SHELL_FILES = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./css/app.css",
  "./icons/icon.svg",
  "./icons/icon-maskable.svg",
  "./i18n/ru.json",
  "./i18n/uk.json",
  "./i18n/en.json",
  "./js/app.js",
  "./js/engine/course.js",
  "./js/engine/dates.js",
  "./js/engine/exercises.js",
  "./js/engine/i18n.js",
  "./js/engine/markdown.js",
  "./js/engine/progress.js",
  "./js/engine/review.js",
  "./js/engine/rng.js",
  "./js/engine/session.js",
  "./js/platform/api.js",
  "./js/platform/clipboard.js",
  "./js/platform/device.js",
  "./js/platform/http.js",
  "./js/platform/storage.js",
  "./js/platform/sw.js",
  "./js/ui/chrome.js",
  "./js/ui/complete.js",
  "./js/ui/dom.js",
  "./js/ui/i18n.js",
  "./js/ui/lesson.js",
  "./js/ui/path.js",
  "./js/ui/store.js",
  "./js/ui/exercises/choice.js",
  "./js/ui/exercises/fill_gap.js",
  "./js/ui/exercises/find_error.js",
  "./js/ui/exercises/frame.js",
  "./js/ui/exercises/index.js",
  "./js/ui/exercises/match_pairs.js",
  "./js/ui/exercises/order.js",
  "./js/ui/exercises/practice.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((c) => c.addAll(SHELL_FILES))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function networkFirst(req) {
  const cache = await caches.open(DATA);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    const hit = await cache.match(req);
    return hit ?? new Response(JSON.stringify({ error: "offline" }), { status: 503, headers: { "Content-Type": "application/json" } });
  }
}

async function cacheFirst(req) {
  const hit = await caches.match(req, { ignoreSearch: true });
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) (await caches.open(SHELL)).put(req, res.clone());
  return res;
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(FONTS);
  const hit = await cache.match(req);
  const update = fetch(req)
    .then((res) => {
      if (res.ok || res.type === "opaque") cache.put(req, res.clone());
      return res;
    })
    .catch(() => hit ?? new Response("", { status: 504 }));
  return hit ?? update;
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return; // POST /api/review goes straight to the network
  const url = new URL(req.url);
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    event.respondWith(staleWhileRevalidate(req));
    return;
  }
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(networkFirst(req));
    return;
  }
  if (req.mode === "navigate") {
    event.respondWith(fetch(req).catch(() => caches.match("./index.html")));
    return;
  }
  event.respondWith(cacheFirst(req));
});
