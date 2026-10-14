// Levels screen: one notebook card per level (pastel tone, small badge, progress and the next step).
// Levels never block each other; the first unfinished level gets a "recommended" sticker.

import { h, icon } from "./dom.js";
import { t, formatNumber } from "./i18n.js";
import { rise } from "./motion.js";
import { localized, levelSummary, recommendedLevel } from "../engine/course.js";

/** Visual identity of a level by its position: pastel tone (CSS modifier) and badge icon. */
const LOOKS = [
  { tone: "mint", glyph: "chat" },
  { tone: "sky", glyph: "docs" },
  { tone: "lilac", glyph: "terminal" },
];
export const levelLook = (index) => LOOKS[index % LOOKS.length];

/**
 * levelCards({ course, available: Set|null, completed: Set, lang, animate })
 * available === null: still checking, so the cards show progress but no action yet.
 */
export function levelCards({ course, available, completed, lang, animate }) {
  const levels = course.levels ?? [];
  const summaries = levels.map((l) => levelSummary(l, available ?? new Set(), completed));
  const recommended = available ? recommendedLevel(summaries) : null;
  const cards = levels.map((level, i) => levelCard(level, i, summaries[i], { lang, checking: !available, recommended: level.id === recommended }));
  const list = h("ol.levels__list", cards.map((c) => h("li.levels__item", c)));
  if (animate) queueMicrotask(() => rise(cards));
  return h(
    "section.levels",
    { aria: { labelledby: "levels-heading" } },
    h("h2.levels__heading", { id: "levels-heading" }, h("span.hl", t("levels.heading"))),
    h("p.levels__lead", t("levels.lead")),
    list,
  );
}

function levelCard(level, index, s, { lang, checking, recommended }) {
  const look = levelLook(index);
  const title = localized(level.title, lang);
  const kicker = t("levels.kicker", { n: index + 1 });
  const descKey = `levels.desc.${level.id}`;
  const desc = t(descKey) === descKey ? "" : t(descKey);
  const stats = t("levels.stats", { modules: t("levels.modules", { count: s.modules }), lessons: t("levels.lessons", { count: s.total }) });
  const progressLabel = t("levels.progress_label", { done: s.done, total: s.total, count: s.total });

  let action = null;
  let actionText = "";
  if (!checking) {
    if (s.complete) {
      actionText = t("levels.completed");
      action = h("span.lvl__action.lvl__action--done", icon("check"), h("span", actionText));
    } else if (s.current) {
      actionText = s.done > 0 ? t("levels.continue", { title: localized(s.current.title, lang) }) : t("levels.start");
      action = h(`span.lvl__action${recommended ? ".lvl__action--main" : ""}`, h("span.lvl__action-text", actionText), icon("arrow"));
    } else {
      actionText = t("levels.soon");
      action = h("span.lvl__action.lvl__action--soon", icon("lock"), h("span", actionText));
    }
  }

  const label = [`${kicker}: ${title}`, recommended ? t("levels.recommended") : null, desc, stats, progressLabel, actionText || null].filter(Boolean).join(". ");
  const fill = h("span.lvl__fill");
  fill.style.width = `${s.total ? Math.round((s.done / s.total) * 100) : 0}%`;

  return h(
    `a.lvl.lvl--${look.tone}${recommended ? ".is-recommended" : ""}`,
    { href: `#/level/${encodeURIComponent(level.id)}`, aria: { label }, data: { level: level.id } },
    recommended ? h("span.sticker.lvl__sticker", { aria: { hidden: "true" } }, t("levels.recommended")) : null,
    h(
      "span.lvl__head",
      { aria: { hidden: "true" } },
      h("span.lvl__badge", icon(look.glyph, "icon lvl__glyph")),
      h("span.lvl__heading", h("span.lvl__kicker", kicker), h("span.lvl__title", title)),
    ),
    desc ? h("span.lvl__desc", { aria: { hidden: "true" } }, desc) : null,
    h(
      "span.lvl__meta",
      { aria: { hidden: "true" } },
      h("span.lvl__stats", stats),
      h("span.lvl__count", t("levels.progress", { done: formatNumber(s.done), total: formatNumber(s.total) })),
    ),
    h("span.lvl__bar", { aria: { hidden: "true" } }, fill),
    action ? h("span.lvl__foot", { aria: { hidden: "true" } }, action) : null,
  );
}
