// «Словарь» tab (#/words): every word from finished lessons (lesson meta.vocab), with audio,
// search and a flashcard drill (#/words/cards). Words are collected from the lesson files, so the
// dictionary also fills up after progress arrives from another device.

import { h, icon } from "./dom.js";
import { t, formatNumber } from "./i18n.js";
import { fetchLesson } from "../platform/api.js";
import { rise, burst } from "./motion.js";
import { tabTop } from "./shell.js";

const cache = new Map(); // lessonId -> vocab[]

/** Collect vocab of the given lessons (in course order), de-duplicated by the Polish form. */
export async function collectWords(lang, lessonIds) {
  await Promise.all(
    lessonIds
      .filter((id) => !cache.has(id))
      .map(async (id) => {
        const lesson = await fetchLesson(lang, id);
        if (lesson) cache.set(id, (lesson.meta?.vocab ?? []).filter((v) => v?.pl && v?.ru));
      }),
  );
  const seen = new Set();
  const out = [];
  for (const id of lessonIds) {
    for (const v of cache.get(id) ?? []) {
      const key = v.pl.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ pl: v.pl, ru: v.ru, lessonId: id, level: id.slice(0, 2) });
    }
  }
  return out;
}

// audio.js is loaded lazily so the list renders even if speech is unavailable
let audioButtonFn = null;
import("./audio.js")
  .then((m) => (audioButtonFn = m.audioButton))
  .catch(() => {});
const audioBtn = (text) => (audioButtonFn ? audioButtonFn(text) : null);

/** renderWords({ words, loading, onTrain }) */
export function renderWords({ words, loading }) {
  const list = h("ul.word-list");
  const input = h("input.field__input.words__search", { type: "search", placeholder: t("words.search"), aria: { label: t("words.search") }, autocomplete: "off" });
  const draw = () => {
    const q = input.value.trim().toLowerCase();
    const shown = q ? words.filter((w) => w.pl.toLowerCase().includes(q) || w.ru.toLowerCase().includes(q)) : words;
    list.replaceChildren(
      ...shown.map((w) => h("li.word", audioBtn(w.pl), h("span.word__text", h("span.word__pl", { lang: "pl" }, w.pl), h("span.word__ru", w.ru)), h("span.word__lvl", w.level.toUpperCase()))),
    );
    if (!shown.length && words.length) list.append(h("li.word.word--empty", t("words.nothing_found")));
  };
  input.addEventListener("input", draw);
  draw();
  queueMicrotask(() => rise([...list.children].slice(0, 12)));

  const empty = !loading && !words.length;
  return h(
    "div.screen.screen--words",
    tabTop(t("words.title")),
    h(
      "main.words",
      { id: "main" },
      h(
        "div.words__stats",
        h("div.stat", h("strong", formatNumber(words.length)), h("span", t("words.count", { count: words.length }))),
        words.length >= 4 ? h("a.btn.btn--primary.words__train", { href: "#/words/cards" }, icon("cards"), h("span", t("words.train"))) : null,
      ),
      loading ? h("p.path__checking", { role: "status" }, t("words.loading")) : null,
      empty
        ? h("div.empty", h("span.empty__emoji", { aria: { hidden: "true" } }, "📖"), h("p", t("words.empty")), h("a.btn.btn--primary", { href: "#/" }, t("words.empty_cta")))
        : h("div.words__body", input, list),
    ),
  );
}

/** Flashcard drill: Polish → tap to flip → «знаю» / «ещё раз». Unknown cards come back at the end. */
export function renderCards({ words, onDone }) {
  const deck = [...words].sort(() => Math.random() - 0.5).slice(0, 15);
  let known = 0;
  const total = deck.length;
  const counter = h("p.cards__count");
  const bar = h("span.progress__fill");
  const holder = h("div.cards__holder");
  const actions = h("div.cards__actions");

  function show() {
    const w = deck[0];
    counter.textContent = t("words.cards_progress", { done: known, total });
    bar.style.width = `${Math.round((known / total) * 100)}%`;
    if (!w) {
      holder.replaceChildren(h("div.cards__done", h("span.empty__emoji", { aria: { hidden: "true" } }, "🎉"), h("h2", t("words.cards_done")), h("p", t("words.cards_done_text", { count: total }))));
      actions.replaceChildren(h("a.btn.btn--primary.btn--wide", { href: "#/words", onclick: onDone }, t("common.done")));
      burst(holder, { count: 24 });
      return;
    }
    const card = h(
      "button.flashcard",
      { type: "button", aria: { label: t("words.flip") } },
      h("span.flashcard__front", h("span.flashcard__word", { lang: "pl" }, w.pl), h("span.flashcard__hint", t("words.tap_to_flip"))),
      h("span.flashcard__back", h("span.flashcard__word", w.ru), h("span.flashcard__hint", { lang: "pl" }, w.pl)),
    );
    card.addEventListener("click", () => card.classList.toggle("is-flipped"));
    holder.replaceChildren(card, audioBtn(w.pl));
    const again = h("button.btn.btn--ghost", { type: "button" }, t("words.again"));
    const know = h("button.btn.btn--primary", { type: "button" }, t("words.know"));
    again.addEventListener("click", () => {
      deck.push(deck.shift());
      show();
    });
    know.addEventListener("click", () => {
      deck.shift();
      known++;
      show();
    });
    actions.replaceChildren(again, know);
  }
  show();

  return h(
    "div.screen.screen--cards",
    h(
      "header.lesson__top",
      h("a.btn.btn--icon", { href: "#/words", aria: { label: t("common.close") } }, icon("close")),
      h("div.progress", { aria: { hidden: "true" } }, bar),
    ),
    h("main.cards", { id: "main" }, h("h1.sr-only", { tabindex: "-1" }, t("words.cards_title")), counter, holder, actions),
  );
}
