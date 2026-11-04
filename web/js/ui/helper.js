// In-lesson helper: the tutor "Pani Ania" answers in Russian in a bottom sheet, with the current screen as context.
//
// openHelper({ lessonId, exercise?, step?, lessonTitle }) -> sheet api { close, el }
// helperFab(getContext) -> button.helper-fab that opens the helper with getContext() at tap time.

import { h } from "./dom.js";
import { t } from "./i18n.js";
import { openSheet } from "./sheet.js";
import { mountChat } from "./chat.js";
import { uiIcon } from "./audio.js";
import { aiHelper } from "../platform/api.js";

const MAX_CONTEXT = 1500;

// One conversation per lesson screen: reopening the sheet on the same screen keeps the history.
let memo = { key: null, history: [] };

/** Plain-text description of the current screen for the tutor (no answers revealed beyond what is on screen). */
export function describeContext({ lessonTitle, exercise, step } = {}) {
  const lines = [];
  if (lessonTitle) lines.push(`Lesson: ${lessonTitle}`);
  if (exercise) {
    const e = exercise;
    lines.push(`Exercise (${e.type}): ${e.question ?? ""}`);
    if (e.audio && !e.audio_only) lines.push(`Audio: ${e.audio}`);
    if (e.prompt) lines.push(`Prompt: ${e.prompt}`);
    if (e.source) lines.push(`Translate: ${e.source}`);
    if (e.translation) lines.push(`Meaning: ${e.translation}`);
    if (e.phrase) lines.push(`Phrase: ${e.phrase}`);
    if (e.text) lines.push(`Text: ${e.text}`);
    if (e.options) lines.push(`Options: ${e.options.map((o) => o.text).join(" / ")}`);
    if (e.pairs) lines.push(`Pairs: ${e.pairs.map((p) => `${p.left} — ${p.right}`).join("; ")}`);
    if (e.items) lines.push(`Items: ${e.items.map((i) => (typeof i === "string" ? i : i.text)).join(" / ")}`);
    if (e.words) lines.push(`Tiles: ${[...e.words, ...(e.extra ?? [])].join(" ")}`);
    if (e.scenario?.setting) lines.push(`Scene: ${e.scenario.setting}`);
    if (e.hint) lines.push(`Hint: ${e.hint}`);
  } else if (step?.markdown) {
    lines.push(`Explanation screen:\n${step.markdown}`);
  }
  return lines.join("\n").slice(0, MAX_CONTEXT);
}

export function openHelper({ lessonId, exercise = null, step = null, lessonTitle = "" } = {}) {
  const context = describeContext({ lessonTitle, exercise, step });
  const key = `${lessonId}|${exercise?.id ?? step?.markdown?.slice(0, 60) ?? ""}`;
  if (memo.key !== key) memo = { key, history: [] };

  const intro = memo.history.length
    ? memo.history.map((x) => (x.who === "you" ? { who: "you", pl: x.text } : { who: "partner", md: x.text }))
    : [{ who: "partner", md: t(exercise ? "helper.greeting_exercise" : "helper.greeting_step") }];

  const chat = mountChat({
    mode: "helper",
    intro,
    chips: memo.history.length ? [] : [t(exercise ? "helper.chip_hint" : "helper.chip_explain"), t("helper.chip_pronounce"), t("helper.chip_example")],
    onTurn: async (history) => {
      // the greeting is local, not part of the conversation the server sees
      const sent = history.filter((x, i) => !(i === 0 && !memo.history.length && x.who === "tutor"));
      const last = sent[sent.length - 1];
      const r = await aiHelper({ lessonId, context, question: last?.text ?? "", history: sent.slice(0, -1) });
      if (!r.available) return r;
      memo.history = [...sent, { who: "tutor", text: r.answer }];
      return { md: r.answer, text: r.answer };
    },
  });

  const body = [h("p.helper__lead", h("span.ai-avatar.ai-avatar--tutor", { aria: { hidden: "true" } }), h("span", t("helper.lead"))), chat.el];
  const sheet = openSheet({ title: t("helper.title"), body, className: "sheet--helper" });
  const dlg = sheet.el;
  dlg.addEventListener("close", () => chat.destroy(), { once: true });
  setTimeout(() => chat.focusInput(), 320);
  return sheet;
}

/** Floating "ask the tutor" button. getContext() -> { lessonId, exercise?, step?, lessonTitle }. */
export function helperFab(getContext) {
  const btn = h(
    "button.helper-fab",
    { type: "button", aria: { label: t("helper.open"), haspopup: "dialog" }, title: t("helper.open") },
    h("span.ai-avatar.ai-avatar--tutor", { aria: { hidden: "true" } }),
    uiIcon("sparkle", "icon helper-fab__icon"),
    h("span.helper-fab__label", t("helper.fab")),
  );
  btn.addEventListener("click", () => openHelper(getContext()));
  return btn;
}

/** Forget the helper conversation (e.g. when a lesson ends). */
export const resetHelper = () => (memo = { key: null, history: [] });
