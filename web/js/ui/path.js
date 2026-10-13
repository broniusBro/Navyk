// Home: levels -> modules -> lessons as a vertical path.

import { h, icon } from "./dom.js";
import { t, getLang } from "./i18n.js";
import { langPicker, statChips, footer } from "./chrome.js";
import { localized, pathStatus } from "../engine/course.js";

/**
 * renderPath({ course, available: Set|null, progress, streak, activeToday, due, onOpen(lessonId), onReview() })
 * available === null means "still checking".
 */
export function renderPath(p) {
  const lang = getLang();
  const completed = new Set(Object.keys(p.progress.lessons));
  const status = p.course ? pathStatus(p.course, p.available ?? new Set(), completed) : {};

  const top = h(
    "header.topbar",
    h("p.wordmark", { aria: { label: "Navyk" } }, "navyk"),
    statChips({ xp: p.progress.xp, streak: p.streak, activeToday: p.activeToday }),
    langPicker(),
  );

  const main = h("main.path", { id: "main" });
  main.append(h("h1.path__title", { tabindex: "-1" }, t("path.title")));

  if (p.due > 0) {
    main.append(
      h(
        "div.due",
        h("p.due__text", icon("repeat"), h("span", t("path.due", { count: p.due }))),
        h("button.btn.btn--accent.btn--small", { type: "button", onclick: p.onReview }, t("path.due_start")),
      ),
    );
  }

  if (!p.course) {
    main.append(h("p.alert.alert--info", { role: "status" }, t(p.loading ? "path.loading" : "path.offline")));
  } else {
    if (p.available === null) main.append(h("p.path__checking", { role: "status" }, t("path.checking")));
    let n = 0;
    for (const level of p.course.levels ?? []) {
      const levelEl = h("section.level", h("h2.level__title", localized(level.title, lang)));
      for (const mod of level.modules ?? []) {
        const items = mod.lessons.map((lesson) => {
          const st = status[lesson.id] ?? "soon";
          const side = ["c", "r", "c", "l"][n++ % 4];
          return lessonNode(lesson, st, side, lang, p.onOpen);
        });
        const doneCount = mod.lessons.filter((l) => completed.has(l.id)).length;
        levelEl.append(
          h(
            "section.module",
            h("header.module__head", h("h3.module__title", localized(mod.title, lang)), h("p.module__count", t("path.module_count", { done: doneCount, total: mod.lessons.length }))),
            h("ol.nodes", items),
          ),
        );
      }
      main.append(levelEl);
    }
  }
  return h("div.screen.screen--path", top, main, footer());
}

function lessonNode(lesson, st, side, lang, onOpen) {
  const title = localized(lesson.title, lang);
  const playable = st !== "soon";
  const glyph = st === "done" ? icon("check", "icon node__icon") : st === "soon" ? icon("lock", "icon node__icon") : icon("play", "icon node__icon");
  const label = h("span.node__label", h("span.node__title", title), h("span.node__meta", t(`path.status_${st}`)));
  const inner = [h("span.node__dot", glyph), label];
  const el = playable
    ? h(`button.node.node--${st}`, { type: "button", onclick: () => onOpen(lesson.id), aria: { label: `${title}. ${t(`path.status_${st}`)}` } }, inner)
    : h(`div.node.node--${st}`, { aria: { disabled: "true", label: `${title}. ${t("path.status_soon")}` }, role: "group" }, inner);
  return h(`li.nodes__item.nodes__item--${side}${lesson.checkpoint ? ".nodes__item--checkpoint" : ""}`, el);
}
