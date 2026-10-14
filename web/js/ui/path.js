// Home: levels -> modules -> lessons as a winding path joined by one continuous "road".
// Module headers stand on the road like signposts. The road is an SVG overlay computed from the
// real positions of the circles (engine/road.js), recomputed on resize and font load.

import { h, icon } from "./dom.js";
import { t, getLang } from "./i18n.js";
import { langPicker, statChips, footer, wordmark, accountButton } from "./chrome.js";
import { popIn, drawStroke, reduced } from "./motion.js";
import { localized, pathStatus } from "../engine/course.js";
import { canOpenLesson } from "../engine/auth.js";
import { roadPoints, splitRoad, travelledIndex, waveOffset } from "../engine/road.js";

const SVG = "http://www.w3.org/2000/svg";

/**
 * renderPath({ course, available: Set|null, progress, streak, activeToday, due, user, animate,
 *              onOpen(lesson), onReview(), onAccount() })
 * available === null means "still checking". animate: play the entrance (nodes pop in, road draws).
 */
export function renderPath(p) {
  const lang = getLang();
  const completed = new Set(Object.keys(p.progress.lessons));
  const status = p.course ? pathStatus(p.course, p.available ?? new Set(), completed) : {};
  const signedIn = Boolean(p.user);

  const top = h("header.topbar", wordmark(), statChips({ xp: p.progress.xp, streak: p.streak, activeToday: p.activeToday }), langPicker(), accountButton(p.user, p.onAccount));

  const main = h("main.path", { id: "main" });
  main.append(h("h1.path__title.sr-only", { tabindex: "-1" }, t("path.title")));
  main.append(dayCards(p));
  if (!signedIn && completed.size > 0) main.append(saveBanner(p));

  if (!p.course) {
    main.append(h("p.alert.alert--info", { role: "status" }, t(p.loading ? "path.loading" : "path.offline")));
  } else {
    if (p.available === null) main.append(h("p.path__checking", { role: "status" }, t("path.checking")));
    const road = h("div.road");
    for (const level of p.course.levels ?? []) {
      const levelTitle = localized(level.title, lang);
      const levelEl = h("section.level", h("h2.level__title.sr-only", levelTitle));
      const mods = level.modules ?? [];
      mods.forEach((mod, mi) => {
        const items = mod.lessons.map((lesson, li) => {
          const st = status[lesson.id] ?? "soon";
          const gated = st !== "soon" && st !== "done" && !canOpenLesson(lesson, signedIn);
          return lessonNode(lesson, st, waveOffset(li, mi), lang, gated, p.onOpen);
        });
        const doneCount = mod.lessons.filter((l) => completed.has(l.id)).length;
        const count = t("path.module_count", { done: doneCount, total: mod.lessons.length });
        const allDone = doneCount === mod.lessons.length && doneCount > 0;
        levelEl.append(
          h(
            "section.module",
            h(
              `header.module__head${allDone ? ".is-done" : ""}`,
              { data: { road: "sign" } },
              h("p.module__kicker", t("path.module_kicker", { level: levelTitle, n: mi + 1, total: mods.length })),
              h("h3.module__title", localized(mod.title, lang)),
              h(
                "p.segments",
                { role: "img", aria: { label: count } },
                mod.lessons.map((l) => h(`span.segments__item${completed.has(l.id) ? ".is-done" : ""}`)),
              ),
            ),
            h("ol.nodes", items),
          ),
        );
      });
      road.append(levelEl);
    }
    mountRoad(road, { animate: p.animate });
    main.append(road);
  }
  return h("div.screen.screen--path", top, main, footer());
}

function dayCards(p) {
  const goal = h(
    `div.daycard.daycard--goal${p.activeToday ? ".is-done" : ""}`,
    h("p.daycard__title", t("path.goal_title")),
    h("p.daycard__text", p.activeToday ? t("path.goal_done") : t("path.goal_todo")),
  );
  const repeatInner = [h("span.daycard__title", icon("repeat"), h("span", t("path.due_start"))), h("span.daycard__text", p.due > 0 ? t("path.repeat_count", { count: p.due }) : t("path.repeat_none"))];
  const repeat =
    p.due > 0
      ? h("button.daycard.daycard--repeat", { type: "button", onclick: p.onReview, aria: { label: `${t("path.due_start")}: ${t("path.due", { count: p.due })}` } }, repeatInner)
      : h("div.daycard.daycard--repeat.is-empty", repeatInner);
  return h("div.daycards", goal, repeat);
}

/** Logged out with some progress: gentle reminder that it lives only on this device. */
function saveBanner(p) {
  return h(
    "div.save-banner",
    icon("cloud", "icon save-banner__icon"),
    h("p.save-banner__text", t("path.save_progress")),
    h("a.btn.btn--small.btn--ghost.save-banner__btn", { href: "#/register" }, t("path.save_progress_cta")),
  );
}

function lessonNode(lesson, st, wave, lang, gated, onOpen) {
  const title = localized(lesson.title, lang);
  const playable = st !== "soon";
  const glyph = st === "done" ? icon("check", "icon node__icon") : st === "soon" ? icon("lock", "icon node__icon") : icon("play", "icon node__icon");
  const statusText = t(`path.status_${st}`);
  const label = h("span.node__label", h("span.node__title", title), gated ? h("span.node__meta", icon("user"), h("span", t("path.needs_account"))) : null);
  const sticker = st === "current" ? h("span.sticker.node__sticker", { aria: { hidden: "true" } }, t("path.you_are_here")) : null;
  const badge = gated ? h("span.node__badge", { aria: { hidden: "true" } }, icon("user")) : null;
  const inner = [sticker, h("span.node__dot", { data: { road: st } }, glyph, badge), label];
  const aria = `${title}. ${statusText}${gated ? `. ${t("path.needs_account")}` : ""}`;
  const el = playable
    ? h(`button.node.node--${st}${gated ? ".node--gated" : ""}`, { type: "button", onclick: () => onOpen(lesson), aria: { label: aria } }, inner)
    : h(`div.node.node--${st}`, { aria: { disabled: "true", label: `${title}. ${t("path.status_soon")}` }, role: "group" }, inner);
  // --wave in [-1, 1]: how far the lesson sits from the centre line; CSS turns it into a shift.
  el.style.setProperty("--wave", String(wave));
  return h(`li.nodes__item${lesson.checkpoint ? ".nodes__item--checkpoint" : ""}`, el);
}

// ---- the road ---------------------------------------------------------------------------------

function svgEl(tag, attrs) {
  const el = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

/**
 * Draw the road behind the content of `road` once it is in the document, and keep it in sync with
 * layout changes. The first draw can animate (pop-in + travelled part draws itself).
 */
function mountRoad(road, { animate }) {
  const svg = svgEl("svg", { class: "road__svg", "aria-hidden": "true", focusable: "false" });
  const maskId = `road-mask-${Math.random().toString(36).slice(2, 8)}`;
  // the road passes behind the lesson titles: a mask cuts it out under each title
  const mask = svgEl("mask", { id: maskId, maskUnits: "userSpaceOnUse" });
  const defs = svgEl("defs", {});
  defs.append(mask);
  const group = svgEl("g", { mask: `url(#${maskId})` });
  const todo = svgEl("path", { class: "road__todo" });
  const doneEdge = svgEl("path", { class: "road__done-edge" });
  const done = svgEl("path", { class: "road__done" });
  group.append(todo, doneEdge, done);
  svg.append(defs, group);
  road.prepend(svg);

  let first = true;
  let lastKey = "";
  const draw = () => {
    if (!road.isConnected) return false;
    const box = road.getBoundingClientRect();
    if (!box.width) return true;
    const stops = [...road.querySelectorAll("[data-road]")];
    const stopsGeo = stops.map((el) => {
      const r = el.getBoundingClientRect();
      const geo = { kind: el.dataset.road === "sign" ? "sign" : "node", x: r.left + r.width / 2 - box.left, y: r.top + r.height / 2 - box.top };
      const label = geo.kind === "node" ? el.closest(".node")?.querySelector(".node__label") : null;
      if (label) {
        const l = label.getBoundingClientRect();
        geo.label = { top: l.top - box.top, bottom: l.bottom - box.top, half: l.width / 2 };
      }
      return geo;
    });
    const { points, at } = roadPoints(stopsGeo, box.width);
    const holes = [...road.querySelectorAll(".node__label")].map((el) => {
      const r = el.getBoundingClientRect();
      return { x: r.left - box.left - 6, y: r.top - box.top - 4, w: r.width + 12, h: r.height + 8 };
    });
    const kinds = stops.map((el) => el.dataset.road);
    const key = `${Math.round(box.width)}x${Math.round(box.height)}:${points.map((q) => `${Math.round(q.x)},${Math.round(q.y)}`).join(";")}:${holes.map((q) => Math.round(q.h)).join(",")}`;
    if (key === lastKey) return true;
    lastKey = key;
    svg.setAttribute("viewBox", `0 0 ${box.width} ${box.height}`);
    svg.setAttribute("width", String(box.width));
    svg.setAttribute("height", String(box.height));
    mask.replaceChildren(
      svgEl("rect", { x: -50, y: -50, width: box.width + 100, height: box.height + 100, fill: "#fff" }),
      ...holes.map((q) => svgEl("rect", { x: q.x, y: q.y, width: q.w, height: q.h, rx: 12, fill: "#000" })),
    );
    const ti = travelledIndex(kinds);
    const parts = splitRoad(points, ti < 0 ? -1 : at[ti]);
    todo.setAttribute("d", parts.todo);
    done.setAttribute("d", parts.done);
    doneEdge.setAttribute("d", parts.done);
    if (first) {
      first = false;
      if (animate && !reduced()) {
        popIn([...road.querySelectorAll(".node__dot, .module__head")]);
        drawStroke(done, { duration: 1100, delay: 250 });
        drawStroke(doneEdge, { duration: 1100, delay: 250 });
        road.classList.add("is-entering");
      }
    }
    return true;
  };

  if (typeof ResizeObserver === "function") {
    const ro = new ResizeObserver(() => {
      if (draw() === false) ro.disconnect();
    });
    ro.observe(road);
  } else {
    requestAnimationFrame(draw);
    globalThis.addEventListener?.("resize", draw);
  }
  document.fonts?.ready?.then(() => road.isConnected && draw());
}
