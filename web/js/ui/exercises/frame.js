// Shared frame for auto-checked exercises: question, hint, check, feedback with every relevant `why`,
// one retry, "show answer". Each exercise type supplies an `impl`:
//   { el, answer(), reset(), showResult(result, { reveal }), onChange(cb), submit? }
// impl.submit(fn): optional; the renderer may call fn() to check without the bottom button (Enter in a field).
// impl.idle(): optional { label, fn } shown on the bottom button instead of a disabled "Check" while there
// is nothing to check yet (speak: "Say it" starts the microphone).

import { h, icon } from "../dom.js";
import { t } from "../i18n.js";
import { check, canCheck } from "../../engine/exercises.js";
import { burst, shake, reduced } from "../motion.js";
import { exAudio } from "../audio.js";

/** Tag, question and the optional audio row (`audio` / `audio_only`). */
export function questionHeading(ex) {
  return [h("p.ex__tag", t(`exercise.type.${ex.type}`)), h("h2.ex__question", { tabindex: "-1", data: { autofocus: "1" } }, ex.question), exAudio(ex)];
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

/** Scroll so that el is not hidden under the sticky action bar at the bottom of the lesson. */
function revealAboveBar(el) {
  const bar = document.querySelector(".lesson__bar");
  const fab = document.querySelector(".lesson > .helper-fab"); // «Помощь» floats above the bar
  const barTop = (globalThis.innerHeight ?? 0) - (bar?.getBoundingClientRect().height ?? 0);
  const limit = Math.min(barTop, fab ? fab.getBoundingClientRect().top : barTop) - 12;
  const over = el.getBoundingClientRect().bottom - limit;
  if (over > 0) globalThis.scrollBy?.({ top: over, behavior: reduced() ? "auto" : "smooth" });
}

export function mountAutoExercise(ex, ctx, impl) {
  const feedback = h("div.feedback", { role: "status", aria: { live: "polite" } });
  const root = h("section.ex", { data: { type: ex.type } }, questionHeading(ex), impl.el, feedback, hintBox(ex));
  let state = "answering";

  const updateCheck = () => {
    if (state !== "answering") return;
    const ready = canCheck(ex, impl.answer());
    const idle = ready ? null : impl.idle?.();
    if (idle) ctx.setPrimary(idle.label, idle.fn, { disabled: Boolean(idle.disabled) });
    else ctx.setPrimary(t("exercise.check"), doCheck, { disabled: !ready });
    ctx.setSecondary(null);
  };

  function showFeedback(correct, outcome) {
    feedback.className = `feedback feedback--${correct ? "ok" : "bad"}`;
    const title = correct
      ? t(outcome.firstTry ? "feedback.correct_first" : "feedback.correct")
      : t(outcome.canRetry ? "feedback.wrong_retry" : "feedback.wrong_final");
    feedback.replaceChildren(icon(correct ? "check" : "cross", "icon feedback__icon"), h("p.feedback__title", title));
  }

  /** Correct: green flash on the answer + confetti from the check button. Wrong: a short shake. */
  function celebrate(correct) {
    root.classList.remove("is-correct", "is-wrong");
    void root.offsetWidth; // restart the CSS animation on a second success
    root.classList.add(correct ? "is-correct" : "is-wrong");
    if (correct) burst(ctx.primaryButton?.() ?? feedback, { count: 14 });
    else shake(impl.el);
    revealAboveBar(feedback);
  }

  function doCheck() {
    const answer = impl.answer();
    if (!canCheck(ex, answer)) return;
    const result = check(ex, answer);
    const outcome = ctx.recordAttempt(ex.id, result.correct);
    state = outcome.done ? "done" : "retry";
    impl.showResult(result, { reveal: outcome.reveal });
    showFeedback(result.correct, outcome);
    celebrate(result.correct);
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
  impl.submit?.(() => state === "answering" && doCheck());
  updateCheck();
  return root;
}
