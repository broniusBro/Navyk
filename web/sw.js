// brolingvo service worker: network-first for the app shell and /api, so a deploy is visible on the next
// load without bumping VERSION; the cache is only the offline fallback. Stale-while-revalidate for
// Google Fonts. /api/review, /api/auth/* and /api/progress
// are never cached (private, per account).

const VERSION = "brolingvo-v1";
const SHELL = `${VERSION}-shell`;
const DATA = `${VERSION}-data`;
const FONTS = `${VERSION}-fonts`;

const SHELL_FILES = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./css/app.css",
  "./icons/icon-maskable.svg",
  "./icons/icon.svg",
  "./i18n/ru.json",
  "./js/app.js",
  "./js/engine/auth.js",
  "./js/engine/course.js",
  "./js/engine/dates.js",
  "./js/engine/exercises.js",
  "./js/engine/i18n.js",
  "./js/engine/markdown.js",
  "./js/engine/polish.js",
  "./js/engine/progress.js",
  "./js/engine/review.js",
  "./js/engine/rng.js",
  "./js/engine/road.js",
  "./js/engine/session.js",
  "./js/engine/sync.js",
  "./js/platform/analytics.js",
  "./js/platform/api.js",
  "./js/platform/clipboard.js",
  "./js/platform/device.js",
  "./js/platform/http.js",
  "./js/platform/keyboard.js",
  "./js/platform/speech.js",
  "./js/platform/storage.js",
  "./js/platform/sw.js",
  "./js/ui/account.js",
  "./js/ui/audio.js",
  "./js/ui/auth.js",
  "./js/ui/chat.js",
  "./js/ui/chrome.js",
  "./js/ui/complete.js",
  "./js/ui/consent.js",
  "./js/ui/dom.js",
  "./js/ui/exercises/build_sentence.js",
  "./js/ui/exercises/choice.js",
  "./js/ui/exercises/dialog.js",
  "./js/ui/exercises/fill_gap.js",
  "./js/ui/exercises/frame.js",
  "./js/ui/exercises/index.js",
  "./js/ui/exercises/match_pairs.js",
  "./js/ui/exercises/order.js",
  "./js/ui/exercises/pl_keys.js",
  "./js/ui/exercises/speak.js",
  "./js/ui/exercises/translate.js",
  "./js/ui/exercises/type_answer.js",
  "./js/ui/helper.js",
  "./js/ui/i18n.js",
  "./js/ui/lesson.js",
  "./js/ui/levels.js",
  "./js/ui/motion.js",
  "./js/ui/onboard.js",
  "./js/ui/path.js",
  "./js/ui/prefs.js",
  "./js/ui/profile.js",
  "./js/ui/sheet.js",
  "./js/ui/shell.js",
  "./js/ui/store.js",
  "./js/ui/talk-chat.js",
  "./js/ui/talk.js",
  "./js/ui/words.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((c) => c.addAll(SHELL_FILES.map((u) => new Request(u, { cache: "reload" }))))
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

// A weak signal (train, metro) can keep a request hanging for a minute. For /api data (course, lessons) with a
// cached copy, wait for the network only this long, then answer from the cache (the fresh copy still lands in
// the cache later). Not for the JS/CSS shell: mixing old and new modules right after a deploy could break imports.
const SLOW_MS = 4000;

/** fetch(req), but resolve with the cached copy if the network is slower than SLOW_MS. */
async function raceCache(req, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req);
  const net = fetch(req).then((res) => {
    if (res.ok) cache.put(req, res.clone());
    return res;
  });
  if (!hit) return net;
  let timer;
  const slow = new Promise((resolve) => (timer = setTimeout(() => resolve(hit), SLOW_MS)));
  net.catch(() => {}); // a late failure after the cache answered is not an error
  try {
    return await Promise.race([net, slow]);
  } catch {
    return hit;
  } finally {
    clearTimeout(timer);
  }
}

async function networkFirst(req) {
  const cache = await caches.open(DATA);
  try {
    return await raceCache(req, DATA);
  } catch {
    const hit = await cache.match(req);
    return hit ?? new Response(JSON.stringify({ error: "offline" }), { status: 503, headers: { "Content-Type": "application/json" } });
  }
}

async function shellNetworkFirst(req) {
  try {
    const res = await fetch(req);
    if (res.ok) (await caches.open(SHELL)).put(req, res.clone());
    return res;
  } catch {
    const hit = await caches.match(req, { ignoreSearch: true });
    return hit ?? new Response("", { status: 504 });
  }
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
  if (req.method !== "GET") return; // POST /api/review and /api/ai/* go straight to the network
  const url = new URL(req.url);
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    event.respondWith(staleWhileRevalidate(req));
    return;
  }
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/auth/") || url.pathname === "/api/progress") return; // never cache account data
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(networkFirst(req));
    return;
  }
  if (req.mode === "navigate") {
    event.respondWith(fetch(req).catch(() => caches.match("./index.html")));
    return;
  }
  event.respondWith(shellNetworkFirst(req));
});
