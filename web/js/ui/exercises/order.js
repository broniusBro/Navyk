// order_steps (reorder with up/down buttons) and build_prompt (tap blocks to assemble a prompt).

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

export function renderBuild(ex, ctx) {
  const { order } = prepare(ex, ctx.seed);
  const byId = new Map(ex.blocks.map((b) => [b.id, b]));
  let picked = [];
  let onChange = () => {};
  let locked = false;
  const pool = h("div.pool", { role: "group", aria: { label: t("exercise.build_pool") } });
  const assembled = h("ol.assembled", { aria: { label: t("exercise.build_assembled") } });
  const empty = h("p.assembled__empty", t("exercise.build_empty"));
  const notes = h("ul.build-notes");

  function paint() {
    pool.replaceChildren(
      ...order
        .map((i) => ex.blocks[i])
        .filter((b) => !picked.includes(b.id))
        .map((b) => h("button.chip.chip--block", { type: "button", disabled: locked, onclick: () => add(b.id) }, b.text)),
    );
    assembled.replaceChildren(
      ...picked.map((id, pos) =>
        h(
          "li.assembled__item",
          h("button.chip.chip--placed", { type: "button", disabled: locked, aria: { label: t("exercise.build_remove", { text: byId.get(id).text }) }, onclick: () => remove(id) }, h("span.chip__num", { aria: { hidden: "true" } }, String(pos + 1)), byId.get(id).text),
        ),
      ),
    );
    empty.hidden = picked.length > 0;
  }
  const add = (id) => {
    picked.push(id);
    paint();
    onChange();
    pool.querySelector("button")?.focus();
  };
  const remove = (id) => {
    picked = picked.filter((x) => x !== id);
    paint();
    onChange();
  };
  paint();

  return mountAutoExercise(ex, ctx, {
    el: h("div", h("p.ex__instruction", t("exercise.build_instruction")), h("div.bubble.bubble--user.bubble--build", empty, assembled), pool, notes),
    answer: () => picked.slice(),
    onChange: (cb) => (onChange = cb),
    reset() {
      locked = false;
      picked = [];
      notes.replaceChildren();
      paint();
      onChange();
    },
    showResult(result, { reveal }) {
      locked = true;
      paint();
      notes.replaceChildren();
      for (const it of result.items) {
        const b = byId.get(it.id);
        const ok = it.status === "ok" || it.status === "noise_skipped";
        if (!reveal && !ok) continue;
        if (it.status === "noise_skipped" && !reveal) continue;
        notes.append(
          h(
            `li.build-note.build-note--${ok ? "ok" : "bad"}`,
            h("p.build-note__head", icon(ok ? "check" : "cross"), h("span", b.text), h("span.tag", t(`roles.${b.role}`))),
            h("p.build-note__status", t(`exercise.build_${it.status}`)),
            whyNote(it.why, ok ? "ok" : "info"),
          ),
        );
      }
      if (reveal && !result.correct) {
        notes.append(h("li.solution", h("h3.solution__title", t("exercise.correct_order")), h("p", ex.target_order.map((id) => byId.get(id)?.text).join(" "))));
      }
    },
  });
}
