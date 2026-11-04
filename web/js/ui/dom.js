// Tiny DOM helpers. Text always goes through textContent; the only HTML sink is setSafeHtml,
// which accepts output of the engine's escaping Markdown renderer.

import { renderMarkdownToHtml } from "../engine/markdown.js";

/**
 * h("button.btn.btn--primary", { onclick, type: "button", aria: { label } }, "text", childEl)
 * Strings are text nodes (never parsed as HTML).
 */
export function h(tagSpec, attrs, ...children) {
  const [tag, ...classes] = tagSpec.split(".");
  const el = document.createElement(tag || "div");
  if (classes.length) el.className = classes.join(" ");
  if (attrs && (typeof attrs !== "object" || attrs instanceof Node || Array.isArray(attrs))) {
    children.unshift(attrs);
    attrs = null;
  }
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v == null || v === false) continue;
    if (k === "class") el.className += (el.className ? " " : "") + v;
    else if (k === "aria") for (const [a, av] of Object.entries(v)) av != null && el.setAttribute(`aria-${a}`, String(av));
    else if (k === "data") for (const [d, dv] of Object.entries(v)) el.dataset[d] = String(dv);
    else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
    else if (k === "text") el.textContent = v;
    else if (v === true) el.setAttribute(k, "");
    else el.setAttribute(k, String(v));
  }
  append(el, children);
  return el;
}

export function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function clear(el) {
  while (el.firstChild) el.firstChild.remove();
  return el;
}

/** Render lesson Markdown safely (the renderer escapes all text and allows only https links). */
export function markdown(md, opts) {
  const el = h("div.md");
  setSafeHtml(el, renderMarkdownToHtml(md, opts));
  return el;
}

function setSafeHtml(el, escapedHtml) {
  // escapedHtml comes only from engine/markdown.js toHtml(), which escapes every text node.
  el.innerHTML = escapedHtml;
}

export function focusFirst(root, selector = "h1, h2, [data-autofocus]") {
  const el = root.querySelector(selector);
  if (!el) return;
  if (!el.hasAttribute("tabindex")) el.setAttribute("tabindex", "-1");
  el.focus({ preventScroll: false });
}

/** Decorative confetti dots for success screens (static; only the pop-in animation respects reduced motion in CSS). */
export function confetti() {
  return h("span.confetti", { aria: { hidden: "true" } }, h("i"), h("i"), h("i"), h("i"), h("i"));
}

/** Simple inline SVG icon by name (decorative, aria-hidden). */
const ICONS = {
  close: "M6 6l12 12M18 6L6 18",
  check: "M5 12.5l4.5 4.5L19 7.5",
  cross: "M7 7l10 10M17 7L7 17",
  up: "M12 18V6M6 11l6-6 6 6",
  down: "M12 6v12M6 13l6 6 6-6",
  lock: "M7 11V8a5 5 0 0 1 10 0v3M5 11h14v9H5z",
  bulb: "M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.5 1 2.5h6c0-1 .3-1.8 1-2.5A6 6 0 0 0 12 3z",
  copy: "M9 9h10v11H9zM5 15V4h11",
  flame: "M12 3c1 4 5 5.5 5 10a5 5 0 0 1-10 0c0-2.5 1.5-3.8 2.5-5 .3 1.6 1 2.5 2 3 0-3-.5-5.5.5-8z",
  star: "M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.8 6.8 19.6l1-5.8-4.3-4.1 5.9-.8z",
  play: "M8 5l11 7-11 7z",
  repeat: "M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3M18 3v4h-4M6 21v-4h4",
  shield: "M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z M12 8v5M12 16v.5",
  back: "M15 5l-7 7 7 7",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4.5 20.5c.6-3.6 3.7-6 7.5-6s6.9 2.4 7.5 6",
  eye: "M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  eyeOff: "M4 4l16 16M10.2 5.7A9.7 9.7 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a16 16 0 0 1-2.9 3.7M6.7 7.1C4 8.9 2.5 12 2.5 12S6 18.5 12 18.5c1.6 0 3-.4 4.3-1.1M9.9 9.9a3 3 0 0 0 4.2 4.2",
  mail: "M3.5 6.5h17v11h-17zM4 7.5l8 6 8-6",
  key: "M14.5 9.5a4 4 0 1 0-1.2 2.9L20 19M17 16l2-2M15 14l1.5-1.5",
  cloud: "M7 18h10a4 4 0 0 0 .6-8 6 6 0 0 0-11.5 1.5A3.3 3.3 0 0 0 7 18z",
  logout: "M14 4h5v16h-5M10 8l-4 4 4 4M6 12h10",
  arrow: "M5 12h14M13 6l6 6-6 6",
  // level badges on the levels screen
  chat: "M4.5 5.5h15v10h-9l-4.5 3.5v-3.5h-1.5zM8.5 9.5h7M8.5 12.5h4",
  docs: "M7 3.5h7.5l4 4v13H7zM14 3.5V8h4.5M10 12h5.5M10 15.5h5.5M4.5 7v14.5H15",
  terminal: "M3.5 5h17v14h-17zM7.5 10l3 2.5-3 2.5M12.5 15.5h4",

  // brolingvo · polski — tab bar, voice, AI, profile (24×24 grid, 2px stroke, round caps)
  book: "M12 6.5C10 5 7.5 4.5 4 4.5v13c3.5 0 6 .5 8 2 2-1.5 4.5-2 8-2v-13c-3.5 0-6 .5-8 2zM12 6.5v13",
  cards: "M8 3.5h11a1.5 1.5 0 0 1 1.5 1.5v11M5 7.5h10.5A1.5 1.5 0 0 1 17 9v10a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 19V9A1.5 1.5 0 0 1 5 7.5zM7 14h6",
  mic: "M12 3.5a3 3 0 0 1 3 3v5a3 3 0 0 1-6 0v-5a3 3 0 0 1 3-3zM5.5 11a6.5 6.5 0 0 0 13 0M12 17.5v3M9 20.5h6",
  speaker: "M4 9.5h3.5L12 5.5v13l-4.5-4H4zM15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11",
  turtle: "M5 15a7 7 0 0 1 14 0zM5 15h-1.5M19 15c1.5 0 2.5-1 2.5-2.5S20.5 10 19.3 11M7 15l-1 3M17 15l1 3M9.5 9.5L12 12l2.5-2.5M12 12v3",
  send: "M4 12l16-7.5-6 16-2.5-6.5zM11.5 14l3.5-4.5",
  sparkle: "M12 3c.6 4.5 2.5 6.4 7 7-4.5.6-6.4 2.5-7 7-.6-4.5-2.5-6.4-7-7 4.5-.6 6.4-2.5 7-7zM18.5 16c.3 1.6.9 2.2 2.5 2.5-1.6.3-2.2.9-2.5 2.5-.3-1.6-.9-2.2-2.5-2.5 1.6-.3 2.2-.9 2.5-2.5z",
  settings: "M4 7h9M17 7h3M4 17h3M11 17h9M15 4.5v5M9 14.5v5",
  moon: "M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10z",
  sun: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4",
  target: "M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17zM12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 11.5v1",
  trophy: "M7.5 4h9v5a4.5 4.5 0 0 1-9 0zM7.5 6H4.5a3 3 0 0 0 3 4M16.5 6h3a3 3 0 0 1-3 4M12 13.5V17M8.5 20.5h7M9.5 17h5v3.5h-5z",
  globe: "M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17zM3.5 12h17M12 3.5c2.3 2.3 3.5 5.2 3.5 8.5s-1.2 6.2-3.5 8.5c-2.3-2.3-3.5-5.2-3.5-8.5s1.2-6.2 3.5-8.5z",
  plus: "M12 5v14M5 12h14",
  trash: "M4.5 6.5h15M9.5 6.5V4.5h5v2M6.5 6.5l1 13.5h9l1-13.5M10 10.5v6M14 10.5v6",
  edit: "M4.5 19.5l1-4.5L15.5 5a2.1 2.1 0 0 1 3 3l-10 10zM13.5 7l3 3M4.5 19.5h15",
  heart: "M12 19.5s-7.5-4.6-7.5-10A4.2 4.2 0 0 1 12 7a4.2 4.2 0 0 1 7.5 2.5c0 5.4-7.5 10-7.5 10z",
  compass: "M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17zM15.5 8.5l-2 5-5 2 2-5z",
  coffee: "M5 9.5h11v5a4.5 4.5 0 0 1-4.5 4.5h-2A4.5 4.5 0 0 1 5 14.5zM16 11h1.5a2.5 2.5 0 0 1 0 5H16M8 3.5c-.8 1 .8 2 0 3M11.5 3.5c-.8 1 .8 2 0 3M4 21h13",
  // three growth stages for A1 / A2 / B1
  sprout: "M12 20.5V12M12 12c0-3.5-2.5-5.5-6.5-5.5 0 3.5 2.5 5.5 6.5 5.5zM12 14.5c0-3 2-5 5.5-5 0 3-2 5-5.5 5zM7.5 20.5h9",
  leaf: "M5 19C5 10 10 4.5 19.5 4.5 19.5 14 14 19 5 19zM5 19l8.5-8.5M9 15h4M11 12.5v-3",
  tree: "M12 21v-6M12 15l-3-2.5M12 13l3-2.5M12 3.5a5 5 0 0 0-4.8 6.3A4.2 4.2 0 0 0 8.5 18h7a4.2 4.2 0 0 0 1.3-8.2A5 5 0 0 0 12 3.5zM8.5 21h7",
  // extras for streak/goal/chat
  bolt: "M13 3L5.5 13.5H12L11 21l7.5-10.5H12z",
  clock: "M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17zM12 7.5V12l3 2",
  keyboard: "M3.5 6.5h17v11h-17zM7 10h.01M10 10h.01M13 10h.01M16 10h.01M7 13.5h.01M16 13.5h.01M10 13.5h4",
  refresh: "M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4.5v4h-4",
  info: "M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17zM12 11v5.5M12 7.5v.5",
  chevron: "M9 5.5l6.5 6.5L9 18.5",
};

export function icon(name, cls = "icon") {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("class", cls);
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  const path = document.createElementNS(ns, "path");
  path.setAttribute("d", ICONS[name] ?? "");
  svg.append(path);
  return svg;
}
