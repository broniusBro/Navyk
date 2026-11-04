// WCAG 2.x contrast check for the colour pairs the web client actually uses.
// Reads design/tokens.json (single source of truth), light and dark themes.
//   node web/tools/contrast.mjs        -> table; exit code 1 if any pair fails
// Text pairs need 4.5:1 (AA, normal text). Non-text pairs (borders, focus ring, icons) need 3:1.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const tokens = JSON.parse(readFileSync(fileURLToPath(new URL("../../design/tokens.json", import.meta.url)), "utf8"));

const hex = (c) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(c);
  if (!m) throw new Error(`bad colour ${c}`);
  return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255);
};
const lin = (v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const lum = (c) => {
  const [r, g, b] = hex(c).map(lin);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
export const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

// mix(a, b, p) = color-mix(in srgb, a p%, b) — kept for derived colours.
const mix = (a, b, p) => {
  const [x, y] = [hex(a), hex(b)];
  return "#" + x.map((v, i) => Math.round((v * p + y[i] * (1 - p)) * 255).toString(16).padStart(2, "0")).join("");
};
const WHITE = "#FFFFFF";
const derive = (c) => ({ ...c, white: WHITE, on_hero_2: "#BDBBC0" });

// [foreground, background, kind, where] — style «Bursztyn & Karmin» (docs/design/direction.md §3)
const TEXT = 4.5;
const UI = 3;
const PAIRS = [
  ["ink", "bg", TEXT, "body text"],
  ["ink", "surface", TEXT, "cards, options"],
  ["ink", "surface_2", TEXT, "chips, segments"],
  ["ink_muted", "bg", TEXT, "secondary text"],
  ["ink_muted", "surface", TEXT, "secondary text on cards"],
  ["ink_soft", "bg", TEXT, "meta, placeholders"],
  ["ink_soft", "surface", TEXT, "meta on cards"],
  ["on_accent", "accent", TEXT, "primary button"],
  ["accent_text", "bg", TEXT, "links, today label"],
  ["accent_text", "surface", TEXT, "links on cards"],
  ["accent_ink", "accent_soft", TEXT, "wrong answer, selected onboarding option"],
  ["ink", "accent_soft", TEXT, "danger alert"],
  ["amber_ink", "amber_soft", TEXT, "XP, hint, speak tip"],
  ["ink", "amber_soft", TEXT, "hint text"],
  ["ok_ink", "ok_soft", TEXT, "correct answer, done goal"],
  ["on_ok", "ok", TEXT, "«Дальше» after correct, done node"],
  ["sky_ink", "sky_soft", TEXT, "audio button, goal card"],
  ["violet_ink", "violet_soft", TEXT, "AI fix, repeat card"],
  ["on_hero", "hero", TEXT, "hero cards"],
  ["on_hero_2", "hero", TEXT, "hero card secondary text"],
  ["line_strong", "bg", UI, "input borders, unchecked radio"],
  ["line_strong", "surface", UI, "input borders on cards"],
  ["focus", "bg", UI, "focus ring"],
  ["focus", "surface", UI, "focus ring on cards"],
  ["accent", "bg", UI, "current node, mic, road"],
  ["ok", "surface", UI, "correct option border"],
  ["sky", "surface", UI, "selected option border"],
];

let failed = 0;
for (const theme of ["light", "dark"]) {
  const c = derive(tokens.color[theme]);
  console.log(`\n${theme}`);
  for (const [fg, bg, need, where] of PAIRS) {
    const r = ratio(c[fg], c[bg]);
    const ok = r >= need;
    if (!ok) failed++;
    console.log(`${ok ? "ok  " : "FAIL"} ${r.toFixed(2).padStart(5)}:1 (need ${need})  ${fg} ${c[fg]} on ${bg} ${c[bg]}  - ${where}`);
  }
}
console.log(failed ? `\n${failed} pair(s) below WCAG AA` : "\nAll pairs pass WCAG AA");
process.exitCode = failed ? 1 : 0;
