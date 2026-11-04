// translate: Russian -> Polish. Exact match with `accept` counts without AI; otherwise the AI tutor
// reviews the answer (.ai-review). If the AI is unavailable: self-check list + reference, and it counts.

import { h, icon } from "../dom.js";
import { t, formatTime } from "../i18n.js";
import { checkTypeAnswer } from "../../engine/polish.js";
import { lessonOfExercise } from "../../engine/exercises.js";
import { aiTranslate } from "../../platform/api.js";
import { audioButton } from "../audio.js";
import { burst } from "../motion.js";
import { questionHeading, hintBox, whyNote } from "./frame.js";
import { plField } from "./type_answer.js";

function avatarHead(titleKey) {
  return h("div.ai-review__head", h("span.ai-avatar.ai-avatar--tutor", { aria: { hidden: "true" } }), h("strong", t(titleKey)));
}

function reference(text) {
  return h("p.ai-review__fix", h("span.ai-review__fix-label", t("ai.reference")), " ", h("strong", { lang: "pl" }, text), audioButton(text));
}

export function renderTranslate(ex, ctx) {
  const accepts = ex.accept ?? [];
  const { input, keys } = plField(`tr-${ex.id}`, { rows: 3, placeholder: t("ai.translate_placeholder") });
  const source = h("p.type-ans__prompt.translate__source", ex.source ?? "");
  const editor = h("div.type-ans.translate", source, input, keys);
  const out = h("div.translate__out", { aria: { live: "polite" } });
  const root = h("section.ex.ex--translate", { data: { type: ex.type } }, questionHeading(ex), editor, out, hintBox(ex));
  let busy = false;
  let lastAnswer = "";

  const update = () => {
    if (busy) return;
    ctx.setPrimary(t("exercise.check"), send, { disabled: !input.value.trim() });
    ctx.setSecondary(null);
  };
  input.addEventListener("input", update);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      if (input.value.trim()) send();
    }
  });

  function lock(on) {
    input.readOnly = on;
    keys.setDisabled(on);
  }

  function editAgain() {
    lock(false);
    out.replaceChildren();
    root.classList.remove("is-correct", "is-wrong");
    input.focus();
    update();
  }

  function finishOk() {
    root.classList.remove("is-wrong");
    void root.offsetWidth;
    root.classList.add("is-correct");
    burst(ctx.primaryButton?.() ?? out, { count: 14 });
  }

  async function send() {
    const answer = input.value.trim();
    if (!answer || busy) return;
    lastAnswer = answer;
    lock(true);
    const exact = checkTypeAnswer(ex, answer);
    if (exact.correct && !exact.diacriticsOnly) {
      ctx.recordPractice(ex.id, { mode: "exact", passed: true });
      out.replaceChildren(
        h(
          "div.ai-review",
          avatarHead("ai.tutor_name"),
          h("p.ai-review__verdict.ai-review__verdict--ok", icon("check"), h("span", t("ai.verdict_ok"))),
          h("p.ai-review__fix", h("strong", { lang: "pl" }, exact.expected), audioButton(exact.expected)),
          whyNote(ex.why, "ok"),
        ),
      );
      finishOk();
      ctx.setPrimary(t("common.next"), ctx.next);
      ctx.setSecondary(null);
      return;
    }
    busy = true;
    out.replaceChildren(
      h(
        "div.ai-review.is-loading",
        { role: "status" },
        avatarHead("ai.tutor_name"),
        h("p.ai-review__verdict", t("ai.checking")),
        h("ul.ai-review__list", { aria: { hidden: "true" } }, h("li"), h("li")),
      ),
    );
    ctx.setPrimary(t("ai.checking_short"), () => {}, { disabled: true });
    ctx.setSecondary(null);
    const r = await aiTranslate({ lessonId: lessonOfExercise(ex.id) ?? ctx.lessonId, exerciseId: ex.id, answer });
    busy = false;
    if (!root.isConnected) return;
    if (r.available) showReview(r);
    else showFallback(r);
  }

  function showReview(r) {
    const passed = r.verdict === "ok";
    ctx.recordPractice(ex.id, { mode: "review", passed });
    const box = h(
      "div.ai-review",
      { tabindex: "-1" },
      avatarHead("ai.tutor_name"),
      h(`p.ai-review__verdict.ai-review__verdict--${r.verdict}`, icon(passed ? "check" : r.verdict === "close" ? "bulb" : "cross"), h("span", t(`ai.verdict_${r.verdict}`))),
      r.corrected && !passed ? h("p.ai-review__fix", h("span.ai-review__fix-label", t("ai.corrected")), " ", h("strong", { lang: "pl" }, r.corrected), audioButton(r.corrected)) : null,
      r.corrected && passed ? h("p.ai-review__fix", h("strong", { lang: "pl" }, r.corrected), audioButton(r.corrected)) : null,
      r.notes.length ? h("ul.ai-review__list", r.notes.map((n) => h("li", n))) : null,
      !passed && accepts[0] ? reference(accepts[0]) : null,
      whyNote(ex.why, passed ? "ok" : "info"),
      r.remaining != null ? h("p.ai-review__remaining", t("ai.remaining", { count: r.remaining })) : null,
    );
    out.replaceChildren(box);
    box.focus({ preventScroll: true });
    if (passed) finishOk();
    ctx.setPrimary(t("common.next"), ctx.next);
    ctx.setSecondary(passed ? null : t("ai.try_again"), passed ? null : editAgain);
  }

  function showFallback(r) {
    ctx.recordPractice(ex.id, { mode: "selfcheck", passed: false });
    const items = ex.review?.fallback_feedback ?? [];
    const headText = r.reason === "limit" ? (r.resetAt ? t("ai.limit_at", { time: formatTime(r.resetAt) }) : t("ai.limit")) : t("ai.offline");
    const box = h(
      "div.ai-review.ai-review--fallback",
      { tabindex: "-1" },
      avatarHead("ai.selfcheck_title"),
      h("p.ai-review__verdict", headText),
      h("p.ai-review__mine", h("span", t("ai.your_answer")), " ", h("span", { lang: "pl" }, lastAnswer)),
      items.length
        ? h(
            "ul.ai-review__list.selfcheck__list",
            items.map((text, i) => {
              const id = `sc-${ex.id}-${i}`;
              return h("li.selfcheck__item", h("input", { type: "checkbox", id }), h("label", { for: id }, text));
            }),
          )
        : null,
      accepts[0] ? reference(accepts[0]) : null,
      whyNote(ex.why, "info"),
    );
    out.replaceChildren(box);
    box.focus({ preventScroll: true });
    ctx.setPrimary(t("common.next"), ctx.next);
    ctx.setSecondary(r.reason === "limit" ? null : t("ai.retry"), r.reason === "limit" ? null : () => send());
  }

  update();
  return root;
}
