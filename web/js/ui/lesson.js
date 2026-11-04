// Lesson player: one block per screen, progress bar, close button, bottom action bar.

import { h, icon, markdown, focusFirst } from "./dom.js";
import { t } from "./i18n.js";
import { enter } from "./motion.js";
import { renderExercise } from "./exercises/index.js";
import { startSession, currentBlock, recordAttempt, recordPractice, next, isFinished, progressRatio } from "../engine/session.js";
import { resolveDataRefs } from "../engine/course.js";

/**
 * mountLesson(container, { lesson, lang, deviceId, seed, data, onClose, onFinish(session) })
 */
export function mountLesson(container, opts) {
  const { lesson } = opts;
  let session = startSession(lesson);

  const bar = h("div.progress", { role: "progressbar", aria: { valuemin: 0, valuemax: session.blocks.length, label: t("lesson.progress") } }, h("div.progress__fill"));
  const closeBtn = h("button.icon-btn.lesson__close", { type: "button", aria: { label: t("lesson.close") } }, icon("close"));
  closeBtn.addEventListener("click", () => {
    if (session.index === 0 || confirmLeave()) opts.onClose();
  });
  const header = h("header.lesson__top", closeBtn, bar);
  const stage = h("main.lesson__stage", { id: "main" });
  const primary = h("button.btn.btn--primary.btn--wide", { type: "button" });
  const secondary = h("button.btn.btn--ghost.btn--wide", { type: "button", hidden: true });
  const actions = h("div.lesson__actions", secondary, primary);
  const root = h("div.lesson", header, stage, h("footer.lesson__bar", actions));
  container.replaceChildren(root);

  let primaryFn = null;
  let secondaryFn = null;
  primary.addEventListener("click", () => !primary.disabled && primaryFn?.());
  secondary.addEventListener("click", () => secondaryFn?.());

  const ctx = {
    lessonId: lesson.meta.id,
    lang: opts.lang,
    deviceId: opts.deviceId,
    seed: opts.seed,
    setPrimary(label, fn, { disabled = false } = {}) {
      primary.textContent = label;
      primary.disabled = disabled;
      primary.setAttribute("aria-disabled", String(disabled));
      primaryFn = fn;
    },
    setSecondary(label, fn) {
      secondary.hidden = !label;
      if (label) secondary.textContent = label;
      secondaryFn = fn ?? null;
    },
    recordAttempt(exerciseId, correct) {
      const r = recordAttempt(session, exerciseId, correct);
      session = r.session;
      return r.outcome;
    },
    recordPractice(exerciseId, result) {
      session = recordPractice(session, exerciseId, result);
    },
    next: () => advance(),
    primaryButton: () => primary,
  };

  function confirmLeave() {
    return globalThis.confirm ? globalThis.confirm(t("lesson.leave_confirm")) : true;
  }

  function renderStep(block) {
    const md = resolveDataRefs(block.markdown, opts.data, opts.lang);
    const body = markdown(md, { assistantLabel: t("chat.claude") });
    const el = h(`section.step.step--${block.variant ?? "explain"}`, block.variant === "hook" ? h("h1.step__title", { tabindex: "-1" }, h("span.hl", lesson.meta.title)) : null, block.variant === "summary" ? h("h2.step__kicker", { tabindex: "-1" }, h("span.hl.hl--ok", t("lesson.summary"))) : null, body);
    ctx.setPrimary(t("common.next"), ctx.next);
    ctx.setSecondary(null);
    return el;
  }

  function show() {
    const block = currentBlock(session);
    const ratio = progressRatio(session);
    bar.firstChild.style.transform = `translateX(${-(100 - Math.max(4, ratio * 100))}%)`;
    bar.setAttribute("aria-valuenow", String(session.index + 1));
    bar.setAttribute("aria-valuetext", t("lesson.progress_text", { n: session.index + 1, total: session.blocks.length }));
    let el;
    if (block.kind === "step") el = renderStep(block);
    else {
      el = renderExercise(block, ctx);
      if (!el) {
        el = h("section.step", h("p.alert.alert--info", t("lesson.unsupported")));
        ctx.setPrimary(t("common.next"), ctx.next);
        ctx.setSecondary(null);
      }
    }
    stage.replaceChildren(el);
    enter(el, session.index > 0 ? 1 : 0);
    stage.scrollTop = 0;
    globalThis.scrollTo?.(0, 0);
    focusFirst(stage);
  }

  function advance() {
    session = next(session);
    if (isFinished(session)) {
      bar.firstChild.style.transform = "none";
      opts.onFinish(session);
      return;
    }
    show();
  }

  show();
  return { destroy: () => root.remove() };
}
