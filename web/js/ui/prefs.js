// Learner preferences on this device: onboarding answers, daily goal, voice and theme settings.
// Stored through platform/storage (works in private mode too — falls back to memory).

import { getItem, setItem } from "../platform/storage.js";

const KEY = "brolingvo.prefs";

export const GOALS = ["travel", "work", "life", "exam", "fun"];
export const MINUTES = [5, 10, 15, 20];
export const THEMES = ["system", "light", "dark"];

const DEFAULTS = Object.freeze({
  onboarded: false,
  goal: null, // why the learner studies Polish (GOALS)
  start: "a1", // level chosen in onboarding
  minutes: 10, // daily goal in minutes
  theme: "system",
  ttsRate: "normal", // normal | slow
  autoplay: true, // read AI replies aloud
});

function read() {
  try {
    const raw = getItem(KEY);
    const v = typeof raw === "string" ? JSON.parse(raw) : raw;
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}

export function getPrefs() {
  const v = { ...DEFAULTS, ...read() };
  if (!GOALS.includes(v.goal)) v.goal = null;
  if (!["a1", "a2", "b1"].includes(v.start)) v.start = "a1";
  if (!MINUTES.includes(Number(v.minutes))) v.minutes = 10;
  if (!THEMES.includes(v.theme)) v.theme = "system";
  if (v.ttsRate !== "slow") v.ttsRate = "normal";
  v.autoplay = v.autoplay !== false;
  v.onboarded = v.onboarded === true;
  return v;
}

export function setPrefs(patch) {
  const next = { ...getPrefs(), ...patch };
  setItem(KEY, JSON.stringify(next));
  // keys read directly by platform/speech.js and ui/chat.js
  try {
    globalThis.localStorage?.setItem("brolingvo.ttsRate", next.ttsRate === "slow" ? "0.6" : "0.95");
    globalThis.localStorage?.setItem("brolingvo.autoplay", next.autoplay ? "1" : "0");
  } catch {
    /* storage blocked: defaults are used */
  }
  applyTheme(next.theme);
  return next;
}

export function applyTheme(theme = getPrefs().theme) {
  const root = document.documentElement;
  if (theme === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", theme);
  const dark = theme === "dark" || (theme === "system" && globalThis.matchMedia?.("(prefers-color-scheme: dark)").matches);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#121019" : "#FBF8F3");
}
