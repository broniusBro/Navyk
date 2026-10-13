// find_error: the prompt is shown as tappable segments; the learner marks every weak one.

import { h, icon } from "../dom.js";
import { t } from "../i18n.js";
import { mountAutoExercise, whyNote } from "./frame.js";

export function renderFindError(ex, ctx) {
  const selected = new Set();
  let onChange = () => {};
  const segs = ex.segments.map((s, i) => {
    const b = h("button.seg", { type: "button", aria: { pressed: "false" }, data: { index: i } }, s.text);
    b.addEventListener("click", () => {
      if (b.disabled) return;
      selected.has(i) ? selected.delete(i) : selected.add(i);
      b.setAttribute("aria-pressed", String(selected.has(i)));
      counter.textContent = t("exercise.marked", { count: selected.size });
      onChange();
    });
    return b;
  });
  const counter = h("p.ex__counter", { aria: { live: "polite" } }, t("exercise.marked", { count: 0 }));
  const bubble = h("div.bubble.bubble--user.bubble--segments", h("p.bubble__text", segs));
  const notes = h("ol.seg-notes");

  return mountAutoExercise(ex, ctx, {
    el: h("div", h("p.ex__instruction", t("exercise.find_error_instruction")), bubble, counter, notes),
    answer: () => [...selected],
    onChange: (cb) => (onChange = cb),
    reset() {
      selected.clear();
      notes.replaceChildren();
      for (const b of segs) {
        b.disabled = false;
        b.className = "seg";
        b.setAttribute("aria-pressed", "false");
      }
      counter.textContent = t("exercise.marked", { count: 0 });
      onChange();
    },
    showResult(result, { reveal }) {
      notes.replaceChildren();
      counter.textContent = t("exercise.found_of", { found: result.found, total: result.total });
      result.items.forEach((it, i) => {
        const b = segs[i];
        b.disabled = true;
        const visible = reveal ? it.show : it.chosen;
        if (!visible) return;
        const state = it.status === "hit" ? "ok" : it.status === "wrong" ? "bad" : it.status === "missed" ? "missed" : "neutral";
        b.classList.add(`seg--${state}`);
        notes.append(
          h(
            `li.seg-note.seg-note--${state}`,
            h("p.seg-note__quote", icon(state === "bad" ? "cross" : "check"), h("span", t("common.quote", { text: ex.segments[i].text.trim() })), h("span.sr-only", t(`exercise.state_${state}`))),
            whyNote(it.why, it.weak ? "ok" : "info"),
          ),
        );
      });
    },
  });
}
