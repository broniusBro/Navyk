// order_steps: reorder dialogue lines or steps with up/down buttons.

import { h, icon } from "../dom.js";
import { t } from "../i18n.js";
import { prepare } from "../../engine/exercises.js";
import { mountAutoExercise, whyNote } from "./frame.js";

const itemText = (it) => (typeof it === "string" ? it : it?.text ?? "");

export function renderOrder(ex, ctx) {
  const initial = prepare(ex, ctx.seed).order;
  let order = initial.slice();
  let onChange = () => {};
  let locked = false;
  const list = h("ol.steps", { aria: { label: t("exercise.order_list") } });
  const live = h("p.sr-only", { aria: { live: "polite" } });

  function move(pos, delta, focusDir) {
    const to = pos + delta;
    if (to < 0 || to >= order.length) return;
    [order[pos], order[to]] = [order[to], order[pos]];
    paint();
    live.textContent = t("exercise.moved_to", { n: to + 1 });
    const btn = list.children[to]?.querySelector(focusDir < 0 ? ".ostep__up" : ".ostep__down");
    (btn && !btn.disabled ? btn : list.children[to]?.querySelector("button:not([disabled])"))?.focus();
    onChange();
  }

  function paint(result, reveal) {
    list.replaceChildren(
      ...order.map((src, pos) => {
        const text = itemText(ex.items[src]);
        const r = result?.items[pos];
        const cls = r ? (r.correct ? ".ostep--ok" : ".ostep--bad") : "";
        return h(
          `li.ostep${cls}`,
          h("span.ostep__num", { aria: { hidden: "true" } }, String(pos + 1)),
          h("span.ostep__text", text),
          locked
            ? h("span.ostep__state", icon(r?.correct ? "check" : "cross"), h("span.sr-only", t(r?.correct ? "exercise.state_ok" : "exercise.state_bad")))
            : h(
                "span.ostep__ctrl",
                h("button.icon-btn.ostep__up", { type: "button", disabled: pos === 0, aria: { label: t("exercise.move_up", { text }) }, onclick: () => move(pos, -1, -1) }, icon("up")),
                h("button.icon-btn.ostep__down", { type: "button", disabled: pos === order.length - 1, aria: { label: t("exercise.move_down", { text }) }, onclick: () => move(pos, 1, 1) }, icon("down")),
              ),
          r && (reveal || r.correct) ? whyNote(r.why, r.correct ? "ok" : "info") : null,
        );
      }),
    );
  }
  paint();

  const solution = h("div.solution", { hidden: true });
  return mountAutoExercise(ex, ctx, {
    el: h("div", h("p.ex__instruction", t("exercise.order_instruction")), list, live, solution),
    answer: () => order.slice(),
    onChange: (cb) => (onChange = cb),
    reset() {
      locked = false;
      solution.hidden = true;
      paint();
      onChange();
    },
    showResult(result, { reveal }) {
      locked = true;
      paint(result, reveal);
      if (reveal && !result.correct) {
        solution.hidden = false;
        solution.replaceChildren(
          h("h3.solution__title", t("exercise.correct_order")),
          h("ol.solution__list", ex.items.map((it) => h("li", itemText(it)))),
        );
      }
    },
  });
}
