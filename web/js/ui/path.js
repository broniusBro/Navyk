// Home: levels -> modules -> lessons as a zigzag path, with daily goal and repeat cards.

import { h, icon } from "./dom.js";
import { t, getLang } from "./i18n.js";
import { langPicker, statChips, footer, wordmark } from "./chrome.js";
import { localized, pathStatus } from "../engine/course.js";

/**
 * renderPath({ course, available: Set|null, progress, streak, activeToday, due, onOpen(lessonId), onReview() })
 * available === null means "still checking".
 */
export function renderPath(p) {
  const lang = getLang();
  const completed = new Set(Object.keys(p.progress.lessons));
  const status = p.course ? pathStatus(p.course, p.available ?? new Set(), completed) : {};

  const top = h("header.topbar", wordmark(), statChips({ xp: p.progress.xp, streak: p.streak, activeToday: p.activeToday }), langPicker());

  const main = h("main.path", { id: "main" });
  main.append(h("h1.path__title.sr-only", { tabindex: "-1" }, t("path.title")));
  main.append(dayCards(p));

  if (!p.course) {
    main.append(h("p.alert.alert--info", { role: "status" }, t(p.loading ? "path.loading" : "path.offline")));
  } else {
    if (p.available === null) main.append(h("p.path__checking", { role: "status" }, t("path.checking")));
    let side = 0;
    for (const level of p.course.levels ?? []) {
      const levelTitle = localized(level.title, lang);
      const levelEl = h("section.level", h("h2.level__title.sr-only", levelTitle));
      const mods = level.modules ?? [];
      mods.forEach((mod, mi) => {
        const items = mod.lessons.map((lesson) => {
          const st = status[lesson.id] ?? "soon";
          const pos = st === "current" ? "c" : side++ % 2 ? "r" : "l";
          return lessonNode(lesson, st, pos, lang, p.onOpen);
        });
        const doneCount = mod.lessons.filter((l) => completed.has(l.id)).length;
        const count = t("path.module_count", { done: doneCount, total: mod.lessons.length });
        levelEl.append(
          h(
            "section.module",
            h(
              "header.module__head",
              h("p.module__kicker", t("path.module_kicker", { level: levelTitle, n: mi + 1, total: mods.length })),
              h("h3.module__title", h("span.hl.hl--ok", localized(mod.title, lang))),
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
      main.append(levelEl);
    }
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

function lessonNode(lesson, st, pos, lang, onOpen) {
  const title = localized(lesson.title, lang);
  const playable = st !== "soon";
  const glyph = st === "done" ? icon("check", "icon node__icon") : st === "soon" ? icon("lock", "icon node__icon") : icon("play", "icon node__icon");
  const label = h("span.node__label", h("span.node__title", title), h("span.node__meta.sr-only", t(`path.status_${st}`)));
  const sticker = st === "current" ? h("span.sticker", { aria: { hidden: "true" } }, t("path.you_are_here")) : null;
  const inner = [sticker, h("span.node__dot", glyph), label];
  const el = playable
    ? h(`button.node.node--${st}`, { type: "button", onclick: () => onOpen(lesson.id), aria: { label: `${title}. ${t(`path.status_${st}`)}` } }, inner)
    : h(`div.node.node--${st}`, { aria: { disabled: "true", label: `${title}. ${t("path.status_soon")}` }, role: "group" }, inner);
  return h(`li.nodes__item.nodes__item--${pos}${lesson.checkpoint ? ".nodes__item--checkpoint" : ""}`, el);
}
