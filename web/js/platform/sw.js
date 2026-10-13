// Service worker registration wrapper (no-op where unsupported; Expo uses its own update channel).

export function registerServiceWorker(url = "./sw.js") {
  const n = globalThis.navigator;
  if (!n?.serviceWorker || globalThis.location?.protocol === "file:") return;
  globalThis.addEventListener("load", () => {
    n.serviceWorker.register(url).catch(() => {
      /* offline support is optional */
    });
  });
}
