// WCAG 2.x contrast check for the colour pairs the web client actually uses.
// Reads design/tokens.json (single source of truth) (light theme only).
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

// Colours the CSS derives from tokens (keep in sync with css/app.css, section "derived").
// mix(a, b, p) = color-mix(in srgb, a p%, b).
const mix = (a, b, p) => {
  const [x, y] = [hex(a), hex(b)];
  return "#" + x.map((v, i) => Math.round((v * p + y[i] * (1 - p)) * 255).toString(16).padStart(2, "0")).join("");
};
const derive = (c, theme) => ({
  ...c,
  // the ring has outline-offset: 3px, so it always sits on paper/surface, never directly on the orange button
  focus_ring: c.focus,
  locked_border: c.border_soft,
});

// [foreground, background, kind, where]
const TEXT = 4.5;
const UI = 3;
const PAIRS = [
  ["ink", "paper", TEXT, "body text"],
  ["ink", "surface", TEXT, "cards, options"],
  ["ink_muted", "paper", TEXT, "secondary text, footer"],
  ["ink_muted", "surface", TEXT, "secondary text on cards"],
  ["ink_soft", "paper", TEXT, "node meta, counters"],
  ["ink_soft", "surface", TEXT, "locked node icon / meta"],
  ["ink_muted", "frame", TEXT, "disabled primary button, readonly textarea"],
  ["ink", "frame", TEXT, "weak prompt bubble, gap slot"],
  ["on_action", "action", TEXT, "primary button"],
  ["ink", "success", TEXT, "correct option, ok feedback"],
  ["ink", "wrong", TEXT, "wrong option, bad feedback"],
  ["ink", "highlight", TEXT, "XP chip, highlighter, review hero"],
  ["ink_muted", "highlight", TEXT, "review hero subline"],
  ["ink", "streak", TEXT, "streak chip"],
  ["ink", "improve", TEXT, "'what to add' highlighter, partial criterion"],
  ["ink", "info", TEXT, "daily goal card, info alert"],
  ["ink_muted", "info", TEXT, "daily goal card text"],
  ["ink", "repeat", TEXT, "exercise tag, repeat card"],
  ["ink_muted", "repeat", TEXT, "repeat card text"],
  ["ink_muted", "success", TEXT, "criterion comment on good chip"],
  ["ink_muted", "improve", TEXT, "criterion comment on partial chip"],
  ["paper", "ink", TEXT, "user chat bubble, improved prompt"],
  ["on_action", "success_strong", TEXT, "done node check (also icon)"],
  ["success", "ink", UI, "check icon in ink badge"],
  ["border", "paper", UI, "2px borders on paper"],
  ["border", "surface", UI, "2px borders on cards"],
  ["locked_border", "surface", UI, "locked node dashed border"],
  ["focus_ring", "paper", UI, "focus ring on paper"],
  ["focus_ring", "surface", UI, "focus ring on cards"],
];

let failed = 0;
for (const theme of ["light"]) {
  const c = derive(tokens.color[theme], theme);
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
