// Lesson complete screen: XP breakdown, streak, next review date, sources.

import { h, icon, markdown, focusFirst } from "./dom.js";
import { t, formatNumber, formatDate } from "./i18n.js";
import { footer } from "./chrome.js";

/**
 * renderComplete({ title, earned, awarded, streakBefore, streakAfter, nextReview, sources, isReview, onBack })
 */
export function renderComplete(p) {
  const rows = [];
  if (!p.isReview) {
    rows.push(row(t("complete.xp_lesson"), p.earned.base));
    if (p.earned.firstTry) rows.push(row(t("complete.xp_first_try"), p.earned.firstTry));
    if (p.earned.ai) rows.push(row(t("complete.xp_ai"), p.earned.ai));
  }
  const replay = !p.isReview && p.awarded < p.earned.total;
  const streakUp = p.streakAfter > p.streakBefore;

  const main = h(
    "main.complete",
    { id: "main" },
    h("div.complete__mark", { aria: { hidden: "true" } }, icon("check", "icon complete__icon")),
    h("h1.complete__title", { tabindex: "-1" }, t(p.isReview ? "complete.review_title" : "complete.title")),
    p.title ? h("p.complete__lesson", p.title) : null,
    h(
      "div.complete__stats",
      h("p.big-stat", h("span.big-stat__value", `+${formatNumber(p.awarded)}`), h("span.big-stat__label", t("stats.xp_unit"))),
      h(
        `p.big-stat.big-stat--streak${streakUp ? ".is-up" : ""}`,
        h("span.big-stat__value", icon("flame"), formatNumber(p.streakAfter)),
        h("span.big-stat__label", t("complete.streak_days", { count: p.streakAfter })),
      ),
    ),
    rows.length ? h("dl.xp-rows", rows) : null,
    replay ? h("p.complete__note", t("complete.replay_note")) : null,
    streakUp ? h("p.complete__note", t(p.streakAfter === 1 ? "complete.streak_started" : "complete.streak_up", { count: p.streakAfter })) : null,
    p.nextReview ? h("p.complete__note", icon("repeat"), h("span", t("complete.next_review", { date: formatDate(p.nextReview) }))) : null,
    p.sources ? h("details.sources", h("summary", t("complete.sources")), p.verifiedAt ? h("p.sources__date", t("complete.verified_at", { date: formatDate(p.verifiedAt) })) : null, markdown(p.sources)) : null,
  );
  const back = h("button.btn.btn--primary.btn--wide", { type: "button", onclick: p.onBack }, t("complete.back"));
  const el = h("div.screen.screen--complete", main, h("div.complete__actions", back), footer());
  queueMicrotask(() => focusFirst(el));
  return el;
}

function row(label, value) {
  return [h("dt", label), h("dd", `+${formatNumber(value)}`)];
}
