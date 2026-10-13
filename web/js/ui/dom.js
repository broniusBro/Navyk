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

/** Simple inline SVG icon by name (decorative, aria-hidden). */
const ICONS = {
  close: "M6 6l12 12M18 6L6 18",
  check: "M5 12.5l4.5 4.5L19 7",
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
