// Device-level facts: anonymous id, preferred languages, clock. Wrapped for portability to Expo.

import { getItem, setItem } from "./storage.js";

function uuid() {
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID();
  const b = new Uint8Array(16);
  if (c?.getRandomValues) c.getRandomValues(b);
  else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** Random id created once per install. Not linked to any personal data. */
export function deviceId() {
  let id = getItem("deviceId");
  if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id)) {
    id = uuid();
    setItem("deviceId", id);
  }
  return id;
}

export function preferredLanguages() {
  const n = globalThis.navigator;
  if (!n) return [];
  return n.languages?.length ? [...n.languages] : [n.language].filter(Boolean);
}

export const now = () => new Date();

export const isOnline = () => globalThis.navigator?.onLine !== false;

export function onConnectivityChange(cb) {
  globalThis.addEventListener?.("online", () => cb(true));
  globalThis.addEventListener?.("offline", () => cb(false));
}

/** User asked the OS for less motion. Expo: AccessibilityInfo.isReduceMotionEnabled(). */
export function prefersReducedMotion() {
  try {
    return Boolean(globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
  } catch {
    return false;
  }
}

/** Is the app on screen? Expo: AppState.currentState === "active". */
export const isForeground = () => globalThis.document?.visibilityState !== "hidden";

/** cb(foreground) when the app goes to/from the background. Expo: AppState.addEventListener("change"). */
export function onForegroundChange(cb) {
  globalThis.document?.addEventListener?.("visibilitychange", () => cb(isForeground()));
}
