// write_prompt / improve_prompt: textarea, idea chips, min_chars counter, AI review via backend,
// fallback self-check when the reviewer is unavailable or the daily limit is reached.

import { h, icon, confetti } from "../dom.js";
import { t, formatTime } from "../i18n.js";
import { initialPromptText, insertIdea } from "../../engine/exercises.js";
import { validatePrompt, interpretReview, criterionLevel, MAX_PROMPT_CHARS } from "../../engine/review.js";
import { XP } from "../../engine/progress.js";
import { requestReview } from "../../platform/api.js";
import { copyText } from "../../platform/clipboard.js";
import { questionHeading, hintBox } from "./frame.js";

export function renderPractice(ex, ctx) {
  const minChars = Math.max(1, ex.min_chars ?? 5);
  const review = ex.review ?? {};
  const ta = h("textarea.prompt-input", {
    id: `ta-${ex.id}`,
    rows: 6,
    maxlength: MAX_PROMPT_CHARS,
    placeholder: ex.placeholder ?? "",
    aria: { describedby: `cnt-${ex.id}` },
    spellcheck: "true",
  });
  ta.value = initialPromptText(ex);
  const label = h("label.prompt-label", { for: ta.id }, t(ex.type === "improve_prompt" ? "practice.label_improve" : "practice.label_write"));
  const counter = h("p.counter", { id: `cnt-${ex.id}` });
  const chips = (ex.ideas ?? []).length
    ? h(
        "div.ideas",
        h("p.ideas__title", t("practice.ideas")),
        h(
          "div.ideas__list",
          ex.ideas.map((idea) =>
            h("button.chip.chip--idea", { type: "button", aria: { label: t("practice.insert_idea", { text: idea }) }, onclick: () => addIdea(idea) }, `+ ${idea}`),
          ),
        ),
      )
    : null;
  const weak = ex.type === "improve_prompt" && ex.weak_prompt
    ? h("div.weak", h("p.weak__title", t("practice.weak_prompt")), h("div.bubble.bubble--user.bubble--muted", h("p.bubble__text", ex.weak_prompt)))
    : null;
  const editor = h("div.editor", weak, label, chips, ta, counter);
  const result = h("div.review", { role: "region", aria: { live: "polite", label: t("practice.result_region") } });
  const root = h("section.ex.ex--practice", { data: { type: ex.type } }, questionHeading(ex), editor, hintBox(ex), result);
  const privacyNote = h("p.privacy-note", icon("shield"), h("span", t("practice.privacy_note")));
  editor.append(privacyNote);

  let busy = false;
  let lastPrompt = "";

  function addIdea(idea) {
    const caret = typeof ta.selectionStart === "number" && document.activeElement === ta ? ta.selectionStart : ta.value.length;
    const r = insertIdea(ta.value, idea, caret);
    ta.value = r.text.slice(0, MAX_PROMPT_CHARS);
    ta.focus();
    ta.setSelectionRange(r.caret, r.caret);
    update();
  }

  function update() {
    const len = ta.value.trim().length;
    const left = minChars - len;
    counter.textContent = left > 0 ? t("practice.chars_left", { count: left }) : t("practice.chars_ok", { count: len });
    counter.classList.toggle("counter--ok", left <= 0);
    const err = validatePrompt(ta.value, minChars);
    const changed = ex.type !== "improve_prompt" || ta.value.trim() !== (ex.weak_prompt ?? "").trim();
    ctx.setPrimary(t("practice.send"), send, { disabled: busy || Boolean(err) || !changed });
    ctx.setSecondary(null);
  }
  ta.addEventListener("input", update);

  async function send() {
    if (busy) return;
    const prompt = ta.value.trim();
    if (validatePrompt(prompt, minChars)) return;
    busy = true;
    lastPrompt = prompt;
    ta.readOnly = true;
    root.classList.add("is-busy");
    result.replaceChildren(h("div.loading", h("span.loading__dots", { aria: { hidden: "true" } }, h("i"), h("i"), h("i")), h("p", t("practice.checking"))));
    ctx.setPrimary(t("practice.checking_short"), () => {}, { disabled: true });
    const res = await requestReview({ lessonId: ctx.lessonId, exerciseId: ex.id, lang: ctx.lang, prompt, deviceId: ctx.deviceId });
    busy = false;
    root.classList.remove("is-busy");
    const out = interpretReview(res);
    if (out.kind === "review") showReview(out);
    else if (out.kind === "limit") showFallback("limit", out.resetAt);
    else if (out.kind === "invalid") {
      ta.readOnly = false;
      result.replaceChildren(h("p.alert.alert--warn", t(`practice.error_${out.code}`)));
      update();
    } else showFallback("unavailable");
  }

  function editAgain() {
    ta.readOnly = false;
    result.replaceChildren();
    editor.hidden = false;
    ta.focus();
    update();
  }

  function showReview(r) {
    ctx.recordPractice(ex.id, { mode: "review", passed: r.passed });
    editor.hidden = true;
    const parts = [];
    if (r.privacy.found) {
      parts.push(
        h(
          "div.alert.alert--danger",
          { role: "alert" },
          h("h3.alert__title", icon("shield"), h("span", t("practice.privacy_title"))),
          h("p", r.privacy.message || t("practice.privacy_default")),
          h("p.alert__small", t("practice.privacy_not_passed")),
        ),
      );
    }
    parts.push(
      h(
        `div.verdict.verdict--${r.verdict}${r.passed ? ".is-passed" : ".is-not-passed"}`,
        r.passed ? confetti() : null,
        r.score != null ? h("p.verdict__score", { role: "img", aria: { label: t("practice.score", { score: r.score }) } }, String(r.score)) : null,
        h(
          "div.verdict__body",
          h("h3.verdict__title", t(`practice.hero.${!r.passed && (r.verdict === "working" || r.verdict === "strong") ? "not_passed" : r.verdict}`)),
          h(`p.verdict__text`, r.passed ? t("practice.passed_xp", { xp: XP.aiPassed }) : t(r.offTask ? "practice.off_task" : "practice.not_passed")),
        ),
      ),
    );
    parts.push(h("details.mine", h("summary", t("practice.your_prompt")), h("div.bubble.bubble--user", h("p.bubble__text", lastPrompt))));
    if (r.strengths.length || r.gaps.length) {
      parts.push(
        h(
          "div.review-card",
          r.strengths.length ? listBlock("practice.strengths", r.strengths, "ok") : null,
          r.gaps.length ? listBlock("practice.gaps", r.gaps, "gap") : null,
        ),
      );
    }
    if (r.criteria.length) {
      parts.push(
        h(
          "div.criteria",
          h("h3.review__title", t("practice.criteria")),
          h(
            "ul.criteria__list",
            r.criteria.map((c) => {
              const lvl = criterionLevel(c.score);
              const stars = lvl === "good" ? "\u2605\u2605" : lvl === "partial" ? "\u2605\u2606" : "\u2606\u2606";
              return h(
                `li.crit.crit--${lvl}`,
                h(
                  "p.crit__head",
                  h("span.crit__name", t(`criteria.${c.id}.name`)),
                  h("span.crit__stars", { aria: { hidden: "true" } }, stars),
                  h("span.sr-only", `: ${t(`criteria_level.${lvl}`)}`),
                ),
                c.comment ? h("p.crit__comment", c.comment) : null,
              );
            }),
          ),
        ),
      );
    }
    if (r.improved) parts.push(copyable("practice.improved", r.improved));
    if (review.show_reference && review.reference_prompt) parts.push(copyable("practice.reference", review.reference_prompt.trim(), true));
    if (r.remaining != null) parts.push(h("p.remaining", t("practice.remaining", { count: r.remaining })));
    result.replaceChildren(...parts);
    result.querySelector(".alert, .verdict")?.setAttribute("tabindex", "-1");
    result.querySelector(".alert, .verdict")?.focus();
    ctx.setPrimary(t("common.next"), ctx.next);
    ctx.setSecondary(t("practice.try_again"), editAgain);
  }

  function showFallback(reason, resetAt) {
    ctx.recordPractice(ex.id, { mode: "selfcheck", passed: false });
    editor.hidden = true;
    const items = review.fallback_feedback ?? [];
    const checks = items.map((text, i) => {
      const id = `sc-${ex.id}-${i}`;
      return h("li.selfcheck__item", h("input", { type: "checkbox", id }), h("label", { for: id }, text));
    });
    const head =
      reason === "limit"
        ? h("div.alert.alert--info", h("h3.alert__title", t("practice.limit_title")), h("p", resetAt ? t("practice.limit_text_at", { time: formatTime(resetAt) }) : t("practice.limit_text")))
        : h("div.alert.alert--info", h("h3.alert__title", t("practice.unavailable_title")), h("p", t("practice.unavailable_text")));
    const parts = [
      head,
      h("details.mine", { open: true }, h("summary", t("practice.your_prompt")), h("div.bubble.bubble--user", h("p.bubble__text", lastPrompt))),
      items.length ? h("div.selfcheck", h("h3.review__title", t("practice.selfcheck_title")), h("p.selfcheck__lead", t("practice.selfcheck_lead")), h("ul.selfcheck__list", checks)) : null,
      review.reference_prompt ? copyable("practice.reference", review.reference_prompt.trim(), true) : null,
    ];
    result.replaceChildren(...parts);
    head.setAttribute("tabindex", "-1");
    head.focus();
    ctx.setPrimary(t("common.next"), ctx.next);
    ctx.setSecondary(t(reason === "limit" ? "practice.edit_again" : "practice.retry_send"), reason === "limit" ? editAgain : send);
  }

  update();
  return root;
}

function listBlock(titleKey, items, kind) {
  return h(`div.review-list.review-list--${kind}`, h("h3.review__title", h(`span.hl.hl--${kind === "ok" ? "ok" : "improve"}`, t(titleKey))), h("ul", items.map((s) => h("li", s))));
}

function copyable(titleKey, text, collapsed = false) {
  const status = h("span.copy__status", { aria: { live: "polite" } });
  const btn = h("button.btn.btn--ghost.btn--small", { type: "button" }, icon("copy"), h("span", t("practice.copy")));
  btn.addEventListener("click", async () => {
    const ok = await copyText(text);
    status.textContent = t(ok ? "practice.copied" : "practice.copy_failed");
    setTimeout(() => (status.textContent = ""), 2500);
  });
  const body = h("div.copy__body", h("div.bubble.bubble--user.bubble--suggested", h("p.bubble__text", text)), h("div.copy__actions", btn, status));
  if (collapsed) return h("details.copy", h("summary", t(titleKey)), body);
  return h("div.copy", h("h3.review__title", t(titleKey)), body);
}
