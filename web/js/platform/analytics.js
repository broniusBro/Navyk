// Google Analytics 4 behind the visitor's consent. Nothing is loaded and nothing is sent until the
// visitor allows analytics (EU/GDPR). Only on the production host. Expo: swap for a native analytics SDK
// with the same API (analyticsChoice / setAnalyticsChoice / trackPage).
import { getItem, setItem } from "./storage.js";

export const GA_ID = "G-F974J4HTSF";
const KEY = "analytics";
const PROD_HOSTS = new Set(["navyk.app"]);
let loaded = false;

/** "granted" | "denied" | null (not asked yet). */
export function analyticsChoice() {
  const v = getItem(KEY, null);
  return v === "granted" || v === "denied" ? v : null;
}

export function setAnalyticsChoice(value) {
  setItem(KEY, value);
  if (value === "granted") loadAnalytics();
}

/** Production only; true when the tag is (being) loaded. */
export function loadAnalytics() {
  if (loaded) return true;
  if (analyticsChoice() !== "granted" || !PROD_HOSTS.has(globalThis.location?.hostname)) return false;
  loaded = true;
  const w = globalThis;
  w.dataLayer = w.dataLayer || [];
  w.gtag = function gtag() {
    w.dataLayer.push(arguments);
  };
  w.gtag("js", new Date());
  // Page views are sent by trackPage on every in-app screen change (hash routes).
  w.gtag("config", GA_ID, { send_page_view: false });
  const s = document.createElement("script");
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`;
  document.head.append(s);
  return true;
}

/**
 * Screen path for analytics from a hash route. One-time tokens (email confirmation, password reset)
 * must never leave the site, so any segment that is not a short plain word becomes ":token".
 */
export function analyticsPath(hash) {
  const route = String(hash || "").replace(/^#\/?/, "").split("?")[0];
  const parts = route.split("/").filter(Boolean);
  if (parts[0] === "confirm" || parts[0] === "reset") return `/${parts[0]}/:token`;
  return "/" + parts.map((p) => (/^[a-z0-9][a-z0-9.-]{0,23}$/i.test(p) ? p : ":token")).join("/");
}

export function trackPage(hash, title) {
  if (!loaded || typeof globalThis.gtag !== "function") return;
  const path = analyticsPath(hash);
  globalThis.gtag("event", "page_view", { page_location: globalThis.location.origin + path, page_path: path, page_title: title });
}
