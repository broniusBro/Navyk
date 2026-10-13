// match_pairs: tap a left item, then a right item to connect them. Tapping a matched item unlinks it.

import { h, icon } from "../dom.js";
import { t } from "../i18n.js";
import { prepare } from "../../engine/exercises.js";
import { mountAutoExercise, whyNote } from "./frame.js";

export function renderMatch(ex, ctx) {
  const { leftOrder, rightOrder } = prepare(ex, ctx.seed);
  const links = {}; // leftIndex -> rightIndex
  let active = null; // leftIndex awaiting a right pick
  let onChange = () => {};
  const tagOf = (li) => String(leftOrder.indexOf(li) + 1);

  const lefts = leftOrder.map((i) =>
    h("button.pair.pair--left", { type: "button", data: { index: i }, aria: { pressed: "false" } }, h("span.pair__tag", tagOf(i)), h("span.pair__text", ex.pairs[i].left)),
  );
  const rights = rightOrder.map((i) =>
    h("button.pair.pair--right", { type: "button", data: { index: i } }, h("span.pair__tag"), h("span.pair__text", ex.pairs[i].right)),
  );
  const status = h("p.ex__counter", { aria: { live: "polite" } });

  function paint() {
    for (const b of lefts) {
      const li = Number(b.dataset.index);
      b.setAttribute("aria-pressed", String(active === li));
      b.classList.toggle("pair--active", active === li);
      b.classList.toggle("pair--linked", links[li] != null);
    }
    const byRight = Object.fromEntries(Object.entries(links).map(([l, r]) => [r, Number(l)]));
    for (const b of rights) {
      const ri = Number(b.dataset.index);
      const l = byRight[ri];
      b.classList.toggle("pair--linked", l != null);
      b.querySelector(".pair__tag").textContent = l != null ? tagOf(l) : "";
      b.setAttribute("aria-label", l != null ? t("exercise.match_linked", { text: ex.pairs[ri].right, n: tagOf(l) }) : ex.pairs[ri].right);
    }
    status.textContent = t("exercise.matched", { count: Object.keys(links).length, total: ex.pairs.length });
  }

  lefts.forEach((b) =>
    b.addEventListener("click", () => {
      if (b.disabled) return;
      const li = Number(b.dataset.index);
      if (links[li] != null && active !== li) delete links[li];
      active = active === li ? null : li;
      paint();
      onChange();
    }),
  );
  rights.forEach((b) =>
    b.addEventListener("click", () => {
      if (b.disabled) return;
      const ri = Number(b.dataset.index);
      const owner = Object.keys(links).find((l) => links[l] === ri);
      if (active == null) {
        if (owner != null) delete links[owner];
        else {
          status.textContent = t("exercise.match_pick_left");
          return;
        }
      } else {
        if (owner != null) delete links[owner];
        links[active] = ri;
        const nextFree = leftOrder.find((l) => links[l] == null);
        active = nextFree ?? null;
      }
      paint();
      onChange();
    }),
  );
  active = leftOrder[0];
  paint();

  const notes = h("ul.match-notes");
  return mountAutoExercise(ex, ctx, {
    el: h(
      "div",
      h("p.ex__instruction", t("exercise.match_instruction")),
      h("div.match", h("div.match__col", { role: "group", aria: { label: t("exercise.match_left") } }, lefts), h("div.match__col", { role: "group", aria: { label: t("exercise.match_right") } }, rights)),
      status,
      notes,
    ),
    answer: () => ({ ...links }),
    onChange: (cb) => (onChange = cb),
    reset() {
      for (const k of Object.keys(links)) delete links[k];
      active = leftOrder[0];
      notes.replaceChildren();
      for (const b of [...lefts, ...rights]) {
        b.disabled = false;
        b.classList.remove("pair--ok", "pair--bad");
      }
      paint();
      onChange();
    },
    showResult(result, { reveal }) {
      notes.replaceChildren();
      active = null;
      paint();
      for (const b of [...lefts, ...rights]) b.disabled = true;
      for (const li of leftOrder) {
        const it = result.items[li];
        lefts.find((b) => Number(b.dataset.index) === li).classList.add(it.correct ? "pair--ok" : "pair--bad");
        const rb = rights.find((b) => Number(b.dataset.index) === it.chosenRight);
        rb?.classList.add(it.correct ? "pair--ok" : "pair--bad");
        if (!it.correct && !reveal) continue;
        notes.append(
          h(
            `li.match-note.match-note--${it.correct ? "ok" : "bad"}`,
            h("p.match-note__pair", icon(it.correct ? "check" : "cross"), h("span", ex.pairs[li].left), h("span.match-note__arrow", { aria: { hidden: "true" } }, " = "), h("span", ex.pairs[li].right)),
            h("span.sr-only", t(it.correct ? "exercise.state_ok" : "exercise.state_bad")),
            whyNote(it.why, it.correct ? "ok" : "info"),
          ),
        );
      }
      if (!reveal && result.items.some((x) => !x.correct)) notes.append(h("li.match-note", h("p.why", t("exercise.match_some_wrong"))));
    },
  });
}
