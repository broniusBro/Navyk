// «Разговор» tab (#/talk): free conversation with the AI partner and role-play scenarios by level.
// #/talk/<id> opens the chat for one scenario (ui/chat.js does the conversation itself).

import { h, icon } from "./dom.js";
import { t, getLang } from "./i18n.js";
import { getJson } from "../platform/http.js";
import { rise } from "./motion.js";
import { localized } from "../engine/course.js";
import { tabTop } from "./shell.js";

let cache = null;
export async function loadScenarios() {
  if (cache) return cache;
  const r = await getJson("/api/talk/scenarios");
  const list = r.status === 200 ? r.body?.scenarios : null;
  if (Array.isArray(list)) cache = list;
  return cache ?? [];
}

export const LEVEL_ORDER = ["a1", "a2", "b1"];

/** Learner's level for the AI partner: highest level with at least one finished lesson, else onboarding choice. */
export function learnerLevel(progress, startLevel = "a1") {
  const done = Object.keys(progress?.lessons ?? {});
  let best = LEVEL_ORDER.indexOf(startLevel);
  for (const id of done) best = Math.max(best, LEVEL_ORDER.indexOf(id.slice(0, 2)));
  return LEVEL_ORDER[Math.max(0, best)];
}

/** renderTalk({ scenarios, level, aiAvailable, onOpen(id) }) */
export function renderTalk({ scenarios, level, aiAvailable }) {
  const lang = getLang();
  const free = scenarios.find((s) => s.id === "free");
  const others = scenarios.filter((s) => s.id !== "free");
  const groups = LEVEL_ORDER.map((lv) => [lv, others.filter((s) => s.level === lv)]).filter(([, l]) => l.length);

  const hero = h(
    "a.talk__hero",
    { href: "#/talk/free" },
    h("span.ai-avatar.ai-avatar--partner.ai-avatar--big", { aria: { hidden: "true" } }),
    h("span.talk__hero-text", h("strong", t("talk.free_title")), h("span", free ? t("talk.free_text") : "")),
    h("span.talk__hero-go", { aria: { hidden: "true" } }, icon("mic")),
  );

  const cards = [];
  const sections = groups.map(([lv, list]) =>
    h(
      "section.talk__group",
      h("h2.talk__heading", t(`talk.level.${lv}`), lv === level ? h("span.badge.badge--accent", t("talk.your_level")) : null),
      h(
        "div.scenario-grid",
        list.map((s) => {
          const card = h(
            `a.scenario-card${LEVEL_ORDER.indexOf(s.level) > LEVEL_ORDER.indexOf(level) ? ".is-stretch" : ""}`,
            { href: `#/talk/${encodeURIComponent(s.id)}` },
            h("span.scenario-card__emoji", { aria: { hidden: "true" } }, s.emoji),
            h("strong.scenario-card__title", localized(s.title, lang)),
            h("span.scenario-card__text", s.setting),
            h("span.badge", s.level.toUpperCase()),
          );
          cards.push(card);
          return card;
        }),
      ),
    ),
  );
  queueMicrotask(() => rise([hero, ...cards]));

  return h(
    "div.screen.screen--talk",
    tabTop(t("talk.title")),
    h(
      "main.talk",
      { id: "main" },
      h("p.talk__lead", t("talk.lead")),
      aiAvailable === false ? h("p.alert.alert--info", { role: "status" }, icon("sparkle"), h("span", t("talk.offline"))) : null,
      hero,
      sections,
    ),
  );
}
