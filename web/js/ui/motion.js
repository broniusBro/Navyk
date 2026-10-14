// Micro-interactions on the Web Animations API. Every helper is a no-op (or jumps to the end state)
// when the user asked for reduced motion. Only transform and opacity are animated: no layout work.

import { prefersReducedMotion } from "../platform/device.js";

export const reduced = () => prefersReducedMotion();

const canAnimate = (el) => Boolean(el && typeof el.animate === "function" && !reduced());

const COLORS = ["var(--brand-dot)", "var(--info)", "var(--success-strong)", "var(--repeat)", "var(--action)", "var(--confetti-4)"];

/**
 * Confetti burst from the centre of an element. Particles live in a fixed, pointer-transparent
 * layer attached to <body> and remove themselves.
 */
export function burst(from, { count = 16, spread = 1 } = {}) {
  if (!from || reduced() || typeof document === "undefined") return;
  const r = from.getBoundingClientRect();
  if (!r.width && !r.height) return;
  const layer = document.createElement("div");
  layer.className = "burst";
  layer.setAttribute("aria-hidden", "true");
  layer.style.left = `${r.left + r.width / 2}px`;
  layer.style.top = `${r.top + r.height / 2}px`;
  document.body.append(layer);
  const runs = [];
  for (let i = 0; i < count; i++) {
    const p = document.createElement("i");
    p.style.background = COLORS[i % COLORS.length];
    if (i % 3 === 0) p.style.borderRadius = "50%";
    layer.append(p);
    // fan upwards, a bit to both sides; deterministic spread with a little jitter
    const angle = (-90 + (i / (count - 1) - 0.5) * 150 + (Math.random() - 0.5) * 18) * (Math.PI / 180);
    const dist = (70 + Math.random() * 70) * spread;
    const x = Math.cos(angle) * dist;
    const y = Math.sin(angle) * dist;
    const rot = (Math.random() - 0.5) * 540;
    runs.push(
      p.animate(
        [
          { transform: "translate(-50%, -50%) scale(0.4)", opacity: 1 },
          { transform: `translate(calc(${x}px - 50%), calc(${y}px - 50%)) rotate(${rot / 2}deg) scale(1)`, opacity: 1, offset: 0.6 },
          { transform: `translate(calc(${x * 1.1}px - 50%), calc(${y + 40}px - 50%)) rotate(${rot}deg) scale(0.9)`, opacity: 0 },
        ],
        { duration: 750 + Math.random() * 250, easing: "cubic-bezier(0.2, 0.7, 0.3, 1)", fill: "forwards" },
      ).finished,
    );
  }
  Promise.allSettled(runs).then(() => layer.remove());
}

/** Count a number up inside el (visible text only; the accessible label holds the final value). */
export function countUp(el, to, { from = 0, duration = 900, format = String } = {}) {
  if (!el) return;
  if (reduced() || to <= from || typeof requestAnimationFrame !== "function") {
    el.textContent = format(to);
    return;
  }
  const start = performance.now();
  el.textContent = format(from);
  const tick = (now) => {
    const k = Math.min(1, (now - start) / duration);
    const eased = 1 - (1 - k) ** 3;
    el.textContent = format(Math.round(from + (to - from) * eased));
    if (k < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/** Staggered pop-in for a list of elements (path nodes on first paint). */
export function popIn(elements, { stagger = 35, maxDelay = 520, duration = 380 } = {}) {
  elements.forEach((el, i) => {
    if (!canAnimate(el)) return;
    el.animate(
      [
        { transform: "scale(0.55)", opacity: 0 },
        { transform: "scale(1.06)", opacity: 1, offset: 0.7 },
        { transform: "scale(1)", opacity: 1 },
      ],
      { duration, delay: Math.min(i * stagger, maxDelay), easing: "cubic-bezier(0.2, 0.9, 0.3, 1.2)", fill: "backwards" },
    );
  });
}

/** Draw an SVG stroke from its start (stroke-dashoffset). */
export function drawStroke(path, { duration = 900, delay = 150 } = {}) {
  if (!canAnimate(path) || typeof path.getTotalLength !== "function") return;
  const len = path.getTotalLength();
  if (!len) return;
  path.style.strokeDasharray = `${len} ${len}`;
  const a = path.animate([{ strokeDashoffset: len }, { strokeDashoffset: 0 }], { duration, delay, easing: "cubic-bezier(0.4, 0, 0.2, 1)", fill: "backwards" });
  a.finished.then(() => (path.style.strokeDasharray = ""), () => {});
}

/** Short horizontal shake (wrong answer). */
export function shake(el) {
  if (!canAnimate(el)) return;
  el.animate(
    [{ transform: "translateX(0)" }, { transform: "translateX(-7px)" }, { transform: "translateX(6px)" }, { transform: "translateX(-4px)" }, { transform: "translateX(2px)" }, { transform: "translateX(0)" }],
    { duration: 380, easing: "ease-out" },
  );
}

/** Slide the new content in (step to step, screen to screen). dir: 1 forward, -1 back, 0 fade only. */
export function enter(el, dir = 1) {
  if (!canAnimate(el)) return;
  el.animate([{ transform: `translateX(${dir * 28}px)`, opacity: 0 }, { transform: "none", opacity: 1 }], { duration: 260, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" });
}

/** Soft staggered rise for cards (levels screen): a short lift and fade, nothing bouncy. */
export function rise(elements, { stagger = 70, duration = 420, distance = 14 } = {}) {
  elements.forEach((el, i) => {
    if (!canAnimate(el)) return;
    el.animate([{ transform: `translateY(${distance}px)`, opacity: 0 }, { transform: "none", opacity: 1 }], {
      duration,
      delay: i * stagger,
      easing: "cubic-bezier(0.2, 0.8, 0.2, 1)",
      fill: "backwards",
    });
  });
}
