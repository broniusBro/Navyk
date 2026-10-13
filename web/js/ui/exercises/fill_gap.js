// fill_gap: text with gaps; tap a gap, then pick one of its options below.

import { h, icon } from "../dom.js";
import { t } from "../i18n.js";
import { prepare, splitGaps } from "../../engine/exercises.js";
import { mountAutoExercise, whyNote } from "./frame.js";

export function renderFillGap(ex, ctx) {
  const { gapOrders } = prepare(ex, ctx.seed);
  const answer = ex.gaps.map(() => null);
  let active = 0;
  let onChange = () => {};
  let locked = false;
  const gapBtns = [];
  const parts = splitGaps(ex.text).map((p) => {
    if (typeof p === "string") return p;
    const b = h("button.gap", { type: "button", data: { gap: p.gap } });
    b.addEventListener("click", () => {
      if (locked) return;
      active = p.gap;
      paint();
      choices.querySelector("button")?.focus();
    });
    gapBtns[p.gap] = b;
    return b;
  });
  const text = h("p.gap-text", parts);
  const choices = h("div.options.options--compact", { role: "group" });
  const notes = h("ul.gap-notes");

  function paint() {
    gapBtns.forEach((b, gi) => {
      const a = answer[gi];
      b.textContent = a != null ? ex.gaps[gi].options[a].text : "…";
      b.classList.toggle("gap--filled", a != null);
      b.classList.toggle("gap--active", gi === active && !locked);
      b.setAttribute("aria-label", t("exercise.gap_label", { n: gi + 1, value: a != null ? ex.gaps[gi].options[a].text : t("exercise.gap_empty") }));
      b.disabled = locked;
    });
    choices.setAttribute("aria-label", t("exercise.gap_options", { n: active + 1 }));
    choices.replaceChildren(
      ...(locked
        ? []
        : gapOrders[active].map((oi) =>
            h(
              "button.option.option--chip",
              { type: "button", aria: { pressed: String(answer[active] === oi) }, onclick: () => pick(oi) },
              h("span.option__text", ex.gaps[active].options[oi].text),
            ),
          )),
    );
  }
  function pick(oi) {
    answer[active] = oi;
    const nextEmpty = answer.findIndex((a) => a == null);
    if (nextEmpty >= 0) active = nextEmpty;
    paint();
    onChange();
  }
  paint();

  return mountAutoExercise(ex, ctx, {
    el: h("div", h("p.ex__instruction", t(ex.gaps.length > 1 ? "exercise.fill_instruction_many" : "exercise.fill_instruction")), text, choices, notes),
    answer: () => answer.slice(),
    onChange: (cb) => (onChange = cb),
    reset() {
      locked = false;
      answer.fill(null);
      active = 0;
      notes.replaceChildren();
      gapBtns.forEach((b) => b.classList.remove("gap--ok", "gap--bad"));
      paint();
      onChange();
    },
    showResult(result, { reveal }) {
      locked = true;
      paint();
      notes.replaceChildren();
      for (const g of result.items) {
        gapBtns[g.gap].classList.add(g.correct ? "gap--ok" : "gap--bad");
        const opts = ex.gaps[g.gap].options;
        const n = ex.gaps.length > 1 ? `${g.gap + 1}. ` : "";
        const li = h(`li.gap-note.gap-note--${g.correct ? "ok" : "bad"}`);
        li.append(h("p.gap-note__head", icon(g.correct ? "check" : "cross"), h("span", n + opts[g.chosen].text)), whyNote(g.chosenWhy, g.correct ? "ok" : "bad"));
        if (!g.correct && reveal) {
          li.append(h("p.gap-note__head", icon("check"), h("span", t("exercise.gap_correct", { text: opts[g.correctIndex].text }))), whyNote(g.correctWhy, "ok"));
        }
        notes.append(li);
      }
    },
  });
}
