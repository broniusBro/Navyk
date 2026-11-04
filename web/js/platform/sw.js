// Service worker registration wrapper (no-op where unsupported; Expo uses its own update channel).

export function registerServiceWorker(url = "./sw.js") {
  const n = globalThis.navigator;
  if (!n?.serviceWorker || globalThis.location?.protocol === "file:") return;
  // A page opened under an old worker reloads once when the new one takes over, so a deploy
  // shows up without clearing the browser cache.
  const hadController = Boolean(n.serviceWorker.controller);
  let reloaded = false;
  n.serviceWorker.addEventListener?.("controllerchange", () => {
    if (!hadController || reloaded) return;
    reloaded = true;
    globalThis.location.reload();
  });
  const register = () =>
    n.serviceWorker.register(url, { updateViaCache: "none" }).catch(() => {
      /* offline support is optional */
    });
  // main() may run after "load" has already fired; then register right away.
  if (globalThis.document?.readyState === "complete") register();
  else globalThis.addEventListener("load", register, { once: true });
}
