// single_choice, multi_choice and compare_answers (cards + single-choice options).

import { h, icon } from "../dom.js";
import { t } from "../i18n.js";
import { prepare } from "../../engine/exercises.js";
import { mountAutoExercise, whyNote } from "./frame.js";

function optionList(ex, ctx, multi) {
  const { order } = prepare(ex, ctx.seed);
  let selected = multi ? new Set() : null;
  let onChange = () => {};
  const buttons = [];

  const list = h("div.options", { role: "group", aria: { label: t(multi ? "exercise.choose_many" : "exercise.choose_one") } });
  for (const i of order) {
    const btn = h(
      "button.option",
      { type: "button", aria: { pressed: "false" }, data: { index: i } },
      h("span.option__mark", { aria: { hidden: "true" } }, multi ? h("span.option__box") : h("span.option__dot")),
      h("span.option__text", ex.options[i].text),
    );
    btn.addEventListener("click", () => {
      if (btn.disabled) return;
      if (multi) {
        selected.has(i) ? selected.delete(i) : selected.add(i);
      } else selected = i;
      for (const b of buttons) {
        const idx = Number(b.dataset.index);
        b.setAttribute("aria-pressed", String(multi ? selected.has(idx) : selected === idx));
      }
      onChange();
    });
    const wrap = h("div.option-wrap", btn);
    buttons.push(btn);
    list.append(wrap);
  }

  const hintLine = h("p.ex__instruction", t(multi ? "exercise.choose_many" : "exercise.choose_one"));

  return {
    el: h("div", hintLine, list),
    answer: () => (multi ? [...selected] : selected),
    onChange: (cb) => (onChange = cb),
    reset() {
      selected = multi ? new Set() : null;
      for (const b of buttons) {
        b.disabled = false;
        b.setAttribute("aria-pressed", "false");
        b.className = "option";
        b.parentElement.querySelector(".why")?.remove();
        b.querySelector(".option__state")?.remove();
      }
      onChange();
    },
    showResult(result, { reveal }) {
      for (const b of buttons) {
        const idx = Number(b.dataset.index);
        const item = result.items[idx];
        b.disabled = true;
        const chosen = item.chosen;
        const visible = reveal ? item.show : chosen;
        if (!visible) {
          b.classList.add("option--dim");
          continue;
        }
        const good = item.correct;
        let state;
        if (chosen) state = good ? "ok" : "bad";
        else state = "missed";
        b.classList.add(`option--${state}`);
        const label = t(`exercise.state_${state}`);
        b.append(h("span.option__state", icon(state === "bad" ? "cross" : "check"), h("span.sr-only", label)));
        b.parentElement.append(whyNote(item.why, good ? "ok" : "bad"));
      }
    },
  };
}

export function renderSingle(ex, ctx) {
  return mountAutoExercise(ex, ctx, optionList(ex, ctx, false));
}

export function renderMulti(ex, ctx) {
  return mountAutoExercise(ex, ctx, optionList(ex, ctx, true));
}

function card(c, variant) {
  const parts = [];
  if (c.prompt && variant !== "which_prompt") {
    parts.push(h("div.bubble.bubble--user", h("p.bubble__text", c.prompt)));
  }
  if (c.answer) {
    parts.push(h("div.bubble.bubble--assistant", h("span.bubble__label", t("chat.claude")), h("p.bubble__text", c.answer.trim())));
  }
  return h("article.card", h("h3.card__label", h("span.card__id", c.id), c.label ? ` ${c.label}` : ""), ...parts);
}

export function renderCompare(ex, ctx) {
  const impl = optionList(ex, ctx, false);
  const cards = h("div.cards", { data: { count: ex.cards?.length ?? 0 } }, (ex.cards ?? []).map((c) => card(c, ex.variant)));
  impl.el.prepend(cards);
  return mountAutoExercise(ex, ctx, impl);
}
