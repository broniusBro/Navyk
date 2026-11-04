// Reusable chat: the dialog exercise, the "Talk" tab and the in-lesson helper.
//
// mountChat(opts) -> api; append api.el where the chat should live.
//   opts.mode       "dialog" | "talk" | "helper"
//   opts.scenario   { title, setting, goals: string[] } — header with goals (dialog/talk); omit for none
//   opts.opener     { pl, ru } — first partner line shown locally (no request)
//   opts.intro      [{ who: "partner"|"you", pl, ru?, md? }] — bubbles shown at start (e.g. the tutor's greeting)
//   opts.start      true: call onTurn([]) at mount so the AI opens the conversation
//   opts.chips      initial suggestion chips (strings)
//   opts.onTurn(history) -> Promise<reply>    history: [{ who: "partner"|"tutor"|"you", text }]
//       reply: { pl?, ru?, md?, correction?: { fixed, explain }, chips?, goalsDone?, finished?, summary? }
//          or  { available: false, reason } (no key / limit / error)
//   opts.onUnavailable(reason, { text }) -> true if handled (otherwise a system note is shown)
//   opts.onReply(reply), opts.onFinished(reply)
//   opts.placeholder, opts.maxLength (default 500)
//
// Bubbles: .bubble--partner (AI: tap toggles .bubble__ru translation, speaker button, autoplay by
// 'brolingvo.autoplay'), .bubble--you (with .bubble__fix correction), .bubble--system. Helper replies are
// Markdown in Russian (rendered by the safe renderer) and are not spoken.

import { h, icon, markdown } from "./dom.js";
import { t } from "./i18n.js";
import { reduced } from "./motion.js";
import { audioButton, playWith, stopAudio, uiIcon, hydratePhrases } from "./audio.js";
import { isSttAvailable, listen, stopListening, abortListening, autoplayEnabled, isTtsAvailable } from "../platform/speech.js";

const MAX_LEN = 500;

export function mountChat(opts = {}) {
  const mode = opts.mode ?? "talk";
  const helper = mode === "helper";
  const partnerWho = helper ? "tutor" : "partner";
  const maxLength = opts.maxLength ?? MAX_LEN;
  const history = [];
  let busy = false;
  let finished = false;
  let inputMode = "free";
  let goalsDone = new Set();
  let chipHandler = null;
  let lastYou = null;
  let destroyed = false;

  // ---- header with goals
  let goalItems = [];
  let header = null;
  if (opts.scenario && (opts.scenario.title || opts.scenario.setting || opts.scenario.goals?.length)) {
    const sc = opts.scenario;
    goalItems = (sc.goals ?? []).map((g, i) =>
      h("li", { data: { goal: i } }, h("span.chat__goal-mark", { aria: { hidden: "true" } }, icon("check")), h("span", g), h("span.sr-only.chat__goal-state", t("chat.goal_todo"))),
    );
    header = h(
      "header.chat__scenario",
      sc.title ? h("h3", { lang: "pl" }, sc.title) : null,
      sc.setting ? h("p", sc.setting) : null,
      goalItems.length ? h("div.chat__goals-wrap", h("p.chat__goals-title", t("chat.goals")), h("ul.chat__goals", goalItems)) : null,
    );
  }

  // ---- log, typing, chips, input
  const log = h("div.chat__log", { role: "log", aria: { live: "polite", label: t(helper ? "helper.log" : "chat.log") } });
  const typing = h(
    "div.chat__typing",
    { hidden: true, role: "status" },
    h("span.ai-avatar", { class: helper ? "ai-avatar--tutor" : "ai-avatar--partner", aria: { hidden: "true" } }),
    h("span.chat__dots", { aria: { hidden: "true" } }, h("i"), h("i"), h("i")),
    h("span.sr-only", t(helper ? "helper.typing" : "chat.typing")),
  );
  const chipsBox = h("div.chat__chips", { role: "group", aria: { label: t("chat.chips") }, hidden: true });

  const ta = h("textarea.chat__textarea", {
    rows: 1,
    maxlength: maxLength,
    placeholder: opts.placeholder ?? t(helper ? "helper.placeholder" : "chat.placeholder"),
    aria: { label: t(helper ? "helper.input_label" : "chat.input_label") },
    lang: helper ? "ru" : "pl",
    spellcheck: helper ? "true" : "false",
    autocomplete: "off",
  });
  const sendBtn = h("button.chat__send", { type: "submit", aria: { label: t("chat.send") }, disabled: true }, uiIcon("send"));
  const stt = isSttAvailable();
  const micBtn = stt ? h("button.mic-btn", { type: "button", aria: { label: t("chat.mic"), pressed: "false" } }, uiIcon("mic")) : null;
  const form = h("form.chat__input", ta, micBtn, sendBtn);
  const status = h("p.chat__status", { aria: { live: "polite" }, hidden: true });

  const el = h(`div.chat.chat--${mode}`, header, log, typing, chipsBox, status, form);

  // ---- helpers
  const scrollDown = () => {
    if (destroyed) return;
    log.scrollTop = log.scrollHeight;
    const last = form.hidden ? chipsBox : form;
    if (el.isConnected) last.scrollIntoView?.({ block: "nearest", behavior: reduced() ? "auto" : "smooth" });
  };

  const syncSend = () => {
    sendBtn.disabled = busy || finished || !ta.value.trim();
    if (micBtn) micBtn.disabled = finished || (busy && !listening);
  };

  function showStatus(text) {
    status.hidden = !text;
    status.textContent = text ?? "";
  }

  /** Add a bubble. who: "partner" | "you" | "system". data: { pl, ru, md, fix, audio } */
  function addBubble(who, data = {}) {
    const isPartner = who === "partner";
    const parts = [];
    if (isPartner) parts.push(h("span.ai-avatar", { class: helper ? "ai-avatar--tutor" : "ai-avatar--partner", aria: { hidden: "true" } }));
    let ru = null;
    if (data.md) {
      const body = markdown(data.md);
      body.classList.add("bubble__md");
      hydratePhrases(body);
      parts.push(body);
    } else if (data.pl != null) {
      parts.push(h("p.bubble__pl", { lang: helper || who === "system" ? null : "pl" }, data.pl));
    }
    if (data.ru) {
      ru = h("p.bubble__ru", { hidden: true }, data.ru);
      parts.push(ru);
    }
    const canSpeak = !helper && isTtsAvailable() && data.pl && who !== "system" && data.audio !== false;
    const speaker = canSpeak ? audioButton(data.pl, { label: t("chat.listen") }) : null;
    if (speaker) parts.push(speaker);
    const b = h(`div.bubble.bubble--${who}`, parts);
    if (ru) {
      b.setAttribute("role", "button");
      b.setAttribute("tabindex", "0");
      b.setAttribute("aria-expanded", "false");
      b.setAttribute("aria-label", t("chat.tap_translate", { text: data.pl ?? "" }));
      const toggle = () => {
        ru.hidden = !ru.hidden;
        b.setAttribute("aria-expanded", String(!ru.hidden));
        b.classList.toggle("is-open", !ru.hidden);
      };
      b.addEventListener("click", (e) => {
        if (e.target.closest?.("a, button:not(.bubble)")) return;
        toggle();
      });
      b.addEventListener("keydown", (e) => {
        if (e.target !== b || (e.key !== "Enter" && e.key !== " ")) return;
        e.preventDefault();
        toggle();
      });
    }
    if (data.fix) attachFix(b, data.fix);
    log.append(b);
    if (who === "you") lastYou = b;
    scrollDown();
    if (speaker && isPartner && data.autoplay !== false && autoplayEnabled()) playWith(speaker, data.pl);
    return b;
  }

  /** Correction under the learner's bubble: fixed sentence + short explanation. */
  function attachFix(bubble, fix) {
    if (!bubble || !fix?.fixed) return;
    bubble.querySelector(".bubble__fix")?.remove();
    bubble.classList.add("has-fix");
    bubble.append(
      h(
        "p.bubble__fix",
        h("span.sr-only", t("chat.fix_label")),
        h("strong.bubble__fix-text", { lang: "pl" }, fix.fixed),
        fix.explain ? h("span.bubble__fix-explain", ` ${fix.explain}`) : null,
      ),
    );
    scrollDown();
  }

  function systemNote(text) {
    return addBubble("system", { pl: text, audio: false });
  }

  function setTyping(on) {
    typing.hidden = !on;
    if (on) scrollDown();
  }

  /** Suggestion chips. onPick(text) defaults to sending the chip as the learner's message. */
  function setChips(list, onPick = null) {
    chipHandler = onPick;
    const items = (list ?? []).filter((c) => typeof c === "string" && c.trim());
    chipsBox.replaceChildren(
      ...items.map((c) =>
        h("button.chip", { type: "button", lang: helper ? null : "pl", onclick: () => (chipHandler ? chipHandler(c) : send(c)) }, c),
      ),
    );
    chipsBox.hidden = items.length === 0;
    if (items.length) scrollDown();
  }

  function setGoalsDone(indices) {
    for (const i of indices ?? []) if (Number.isInteger(i)) goalsDone.add(i);
    goalItems.forEach((li, i) => {
      const done = goalsDone.has(i);
      li.classList.toggle("is-done", done);
      li.querySelector(".chat__goal-state").textContent = t(done ? "chat.goal_done" : "chat.goal_todo");
    });
  }

  /** free: text + mic + chips; chips: only chips (+ mic); off: nothing (finished / waiting). */
  function setInputMode(m) {
    inputMode = m;
    form.hidden = m === "off" || (m === "chips" && !micBtn);
    ta.hidden = m === "chips";
    sendBtn.hidden = m === "chips";
    if (m === "off") chipsBox.hidden = true;
    syncSend();
  }

  /** Final summary: stars (1..3), praise, tips, goals. */
  function showSummary(summary = {}, { title } = {}) {
    const stars = Math.max(0, Math.min(3, Number(summary.stars) || 0));
    const box = h(
      "div.chat__summary",
      { tabindex: "-1" },
      h("h3.chat__summary-title", title ?? t("chat.summary_title")),
      stars
        ? h(
            "div.stars",
            { role: "img", aria: { label: t("chat.stars", { count: stars }) } },
            [1, 2, 3].map((n) => h(`span.star${n <= stars ? ".is-on" : ""}`, { aria: { hidden: "true" } }, icon("star"))),
          )
        : null,
      summary.praise ? h("p.chat__summary-praise", summary.praise) : null,
      goalItems.length
        ? h(
            "ul.chat__goals.chat__summary-goals",
            goalItems.map((li, i) => h(`li${goalsDone.has(i) ? ".is-done" : ""}`, h("span.chat__goal-mark", { aria: { hidden: "true" } }, icon(goalsDone.has(i) ? "check" : "cross")), h("span", li.textContent.replace(li.querySelector(".chat__goal-state").textContent, "")))),
          )
        : null,
      summary.tips?.length ? h("div.chat__summary-tips", h("p.chat__summary-sub", t("chat.tips")), h("ul", summary.tips.map((x) => h("li", x)))) : null,
      summary.extra ?? null,
    );
    log.append(box);
    scrollDown();
    box.focus({ preventScroll: true });
    return box;
  }

  const record = (who, text) => history.push({ who: who === "partner" ? partnerWho : "you", text });

  // ---- one turn
  async function requestReply() {
    if (!opts.onTurn) return;
    busy = true;
    syncSend();
    setChips([]);
    setTyping(true);
    let reply;
    try {
      reply = await opts.onTurn(history.map((x) => ({ ...x })));
    } catch {
      reply = { available: false, reason: "error" };
    }
    if (destroyed) return;
    setTyping(false);
    busy = false;
    if (!reply || reply.available === false) {
      const reason = reply?.reason ?? "error";
      const lastText = history[history.length - 1]?.who === "you" ? history[history.length - 1].text : "";
      // the learner's line stays on screen but leaves the history, so the next send does not repeat it
      if (lastText) history.pop();
      const handled = opts.onUnavailable?.(reason, { text: lastText });
      if (!handled) systemNote(t(`ai.unavailable_${reason}`));
      syncSend();
      return reply;
    }
    const text = reply.pl ?? reply.md ?? reply.text ?? "";
    if (reply.correction) attachFix(lastYou, reply.correction);
    if (text) {
      addBubble("partner", reply.md != null ? { md: reply.md } : { pl: text, ru: reply.ru });
      record("partner", text);
    }
    if (reply.goalsDone) setGoalsDone(reply.goalsDone);
    opts.onReply?.(reply);
    if (reply.finished) {
      finished = true;
      setInputMode("off");
      if (reply.summary) showSummary(reply.summary);
      opts.onFinished?.(reply);
    } else {
      setChips(reply.chips ?? []);
    }
    syncSend();
    return reply;
  }

  /** Send a learner message (from the textarea, a chip or the microphone). */
  async function send(text) {
    const msg = String(text ?? "").trim().slice(0, maxLength);
    if (!msg || busy || finished) return null;
    stopAudio();
    addBubble("you", { pl: msg, audio: false });
    record("you", msg);
    ta.value = "";
    autosize();
    return requestReply();
  }

  /** Ask for the next reply without a new learner message (e.g. "finish" in dialog). */
  const requestNext = () => (busy || finished ? null : requestReply());

  // ---- input events
  const autosize = () => {
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 140)}px`;
  };
  ta.addEventListener("input", () => {
    autosize();
    syncSend();
  });
  ta.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      form.requestSubmit?.() ?? send(ta.value);
    }
  });
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    send(ta.value);
  });

  let listening = false;
  async function toggleMic() {
    if (listening) return stopListening();
    if (busy || finished) return;
    stopAudio();
    listening = true;
    micBtn.classList.add("is-listening");
    micBtn.setAttribute("aria-pressed", "true");
    micBtn.setAttribute("aria-label", t("chat.mic_stop"));
    showStatus(t("speak.listening"));
    const before = ta.value;
    try {
      const r = await listen({ lang: helper ? "ru-RU" : "pl-PL", onPartial: (p) => (ta.value = before ? `${before} ${p}` : p) });
      if (destroyed) return;
      showStatus("");
      if (opts.onVoice) opts.onVoice(r);
      else if (helper || inputMode === "free") {
        ta.value = before ? `${before} ${r.text}` : r.text;
        autosize();
        if (!helper) send(ta.value); // spoken line goes straight into the conversation
      }
    } catch (e) {
      if (destroyed) return;
      ta.value = before;
      showStatus(e?.code === "aborted" ? "" : t(`speak.error_${["not-allowed", "no-speech", "network"].includes(e?.code) ? e.code.replace("-", "_") : "generic"}`));
    } finally {
      listening = false;
      if (!destroyed) {
        micBtn.classList.remove("is-listening");
        micBtn.setAttribute("aria-pressed", "false");
        micBtn.setAttribute("aria-label", t("chat.mic"));
        syncSend();
      }
    }
  }
  micBtn?.addEventListener("click", toggleMic);

  // ---- start
  for (const b of opts.intro ?? []) {
    addBubble(b.who === "you" ? "you" : "partner", { pl: b.pl ?? b.text, ru: b.ru, md: b.md, autoplay: false });
    record(b.who === "you" ? "you" : "partner", b.pl ?? b.text ?? b.md ?? "");
  }
  if (opts.opener?.pl) {
    addBubble("partner", { pl: opts.opener.pl, ru: opts.opener.ru });
    record("partner", opts.opener.pl);
  }
  setChips(opts.chips ?? []);
  syncSend();
  if (opts.start) requestReply();

  return {
    el,
    send,
    requestNext,
    addBubble,
    attachFix,
    systemNote,
    setTyping,
    setChips,
    setGoalsDone,
    setInputMode,
    showSummary,
    showStatus,
    history: () => history.map((x) => ({ ...x })),
    record,
    isBusy: () => busy,
    isFinished: () => finished,
    finish() {
      finished = true;
      setInputMode("off");
    },
    focusInput: () => ta.focus(),
    destroy() {
      destroyed = true;
      abortListening();
      stopAudio();
      el.remove();
    },
  };
}
