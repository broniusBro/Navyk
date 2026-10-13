// Shared frame for auto-checked exercises: question, hint, check, feedback with every relevant `why`,
// one retry, "show answer". Each exercise type supplies an `impl`:
//   { el, answer(), reset(), showResult(result, { reveal }), onChange(cb) }

import { h, icon } from "../dom.js";
import { t } from "../i18n.js";
import { check, canCheck } from "../../engine/exercises.js";

export function questionHeading(ex) {
  return [h("p.ex__tag", t(`exercise.type.${ex.type}`)), h("h2.ex__question", { tabindex: "-1", data: { autofocus: "1" } }, ex.question)];
}

export function hintBox(ex) {
  const panel = h("p.hint__text", { id: `hint-${ex.id}`, hidden: true }, ex.hint ?? "");
  const btn = h(
    "button.btn.btn--ghost.hint__btn",
    { type: "button", aria: { expanded: "false", controls: panel.id } },
    icon("bulb"),
    h("span", t("exercise.hint")),
  );
  btn.addEventListener("click", () => {
    const open = panel.hidden;
    panel.hidden = !open;
    btn.setAttribute("aria-expanded", String(open));
  });
  return ex.hint ? h("div.hint", btn, panel) : null;
}

/** A `why` note rendered under an item. kind: ok | bad | info */
export function whyNote(text, kind = "info", lead = null) {
  if (!text && !lead) return null;
  return h(`p.why.why--${kind}`, lead ? h("strong.why__lead", lead) : null, lead && text ? " " : null, text ?? "");
}

export function mountAutoExercise(ex, ctx, impl) {
  const feedback = h("div.feedback", { role: "status", aria: { live: "polite" } });
  const root = h("section.ex", { data: { type: ex.type } }, questionHeading(ex), impl.el, feedback, hintBox(ex));
  let state = "answering";

  const updateCheck = () => {
    if (state !== "answering") return;
    ctx.setPrimary(t("exercise.check"), doCheck, { disabled: !canCheck(ex, impl.answer()) });
    ctx.setSecondary(null);
  };

  function showFeedback(correct, outcome) {
    feedback.className = `feedback feedback--${correct ? "ok" : "bad"}`;
    const title = correct
      ? t(outcome.firstTry ? "feedback.correct_first" : "feedback.correct")
      : t(outcome.canRetry ? "feedback.wrong_retry" : "feedback.wrong_final");
    feedback.replaceChildren(icon(correct ? "check" : "cross", "icon feedback__icon"), h("p.feedback__title", title));
  }

  function doCheck() {
    const answer = impl.answer();
    if (!canCheck(ex, answer)) return;
    const result = check(ex, answer);
    const outcome = ctx.recordAttempt(ex.id, result.correct);
    state = outcome.done ? "done" : "retry";
    impl.showResult(result, { reveal: outcome.reveal });
    showFeedback(result.correct, outcome);
    if (outcome.canRetry) {
      ctx.setPrimary(t("exercise.retry"), () => {
        state = "answering";
        feedback.replaceChildren();
        feedback.className = "feedback";
        impl.reset();
        updateCheck();
      });
      ctx.setSecondary(t("exercise.show_answer"), () => {
        const final = ctx.recordAttempt(ex.id, false);
        state = "done";
        impl.showResult(result, { reveal: true });
        showFeedback(false, { ...final, canRetry: false });
        ctx.setPrimary(t("common.next"), ctx.next);
        ctx.setSecondary(null);
      });
    } else {
      ctx.setPrimary(t("common.next"), ctx.next);
      ctx.setSecondary(null);
    }
  }

  impl.onChange(updateCheck);
  updateCheck();
  return root;
}
