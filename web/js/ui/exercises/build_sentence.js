// build_sentence: tap word tiles to assemble a Polish sentence; tap a placed tile to put it back.

import { h, icon } from "../dom.js";
import { t } from "../i18n.js";
import { prepare, bankWords } from "../../engine/exercises.js";
import { audioButton } from "../audio.js";
import { mountAutoExercise, whyNote } from "./frame.js";

export function renderBuildSentence(ex, ctx) {
  const words = bankWords(ex);
  const { order } = prepare(ex, ctx.seed);
  let picked = []; // indices into words
  let onChange = () => {};
  let locked = false;
  let marks = null; // per placed tile: true/false after a check

  const answerBox = h("div.tiles__answer", { role: "group", aria: { label: t("tiles.answer") } });
  const bank = h("div.tiles__bank", { role: "group", aria: { label: t("tiles.bank") } });
  const live = h("p.sr-only", { aria: { live: "polite" } });
  const result = h("div.tiles__result");

  function paint() {
    answerBox.replaceChildren(
      ...picked.map((wi, pos) => {
        const mark = marks ? (marks[pos] ? ".tile--ok" : ".tile--bad") : "";
        return h(
          `button.tile${mark}`,
          { type: "button", lang: "pl", disabled: locked, aria: { label: t("tiles.remove", { text: words[wi] }) }, onclick: () => remove(pos) },
          words[wi],
        );
      }),
    );
    answerBox.classList.toggle("is-empty", picked.length === 0);
    if (!picked.length) answerBox.append(h("span.tiles__placeholder", t("tiles.empty")));
    bank.replaceChildren(
      ...order.map((wi) => {
        const used = picked.includes(wi);
        return h(
          `button.tile${used ? ".is-used" : ""}`,
          { type: "button", lang: "pl", disabled: locked || used, aria: { label: used ? t("tiles.used", { text: words[wi] }) : t("tiles.add", { text: words[wi] }) }, onclick: () => add(wi) },
          words[wi],
        );
      }),
    );
  }
  function add(wi) {
    if (locked || picked.includes(wi)) return;
    picked.push(wi);
    paint();
    live.textContent = t("tiles.added", { text: words[wi] });
    bank.querySelector("button:not([disabled])")?.focus();
    onChange();
  }
  function remove(pos) {
    if (locked) return;
    const [wi] = picked.splice(pos, 1);
    paint();
    live.textContent = t("tiles.removed", { text: words[wi] });
    onChange();
  }
  paint();

  const el = h(
    "div.tiles",
    h("p.tiles__translation", ex.translation ?? ""),
    answerBox,
    bank,
    live,
    result,
  );

  return mountAutoExercise(ex, ctx, {
    el,
    answer: () => picked.map((wi) => words[wi]),
    onChange: (cb) => (onChange = cb),
    reset() {
      locked = false;
      marks = null;
      picked = [];
      result.replaceChildren();
      paint();
      onChange();
    },
    showResult(r, { reveal }) {
      locked = true;
      marks = r.items.map((it) => it.correct);
      paint();
      const parts = [];
      if (r.correct || reveal) {
        const sentence = r.correct ? picked.map((wi) => words[wi]).join(" ") : r.expected;
        parts.push(
          h(
            "p.tiles__expected",
            icon("check"),
            h("span.sr-only", t(r.correct ? "tiles.your_answer" : "tiles.correct_answer")),
            h("span", { lang: "pl" }, sentence),
            audioButton(sentence),
          ),
        );
        parts.push(whyNote(ex.why, r.correct ? "ok" : "info"));
      }
      result.replaceChildren(...parts);
    },
  });
}
