// speak: say the phrase aloud. With speech recognition: mic -> recognized text -> similarity score
// (good / ok / bad, retry once). Without it (or when the microphone is denied): "listen and repeat" and
// an "I said it" button that counts the exercise.

import { h, icon } from "../dom.js";
import { t } from "../i18n.js";
import { audioButton, uiIcon, stopAudio } from "../audio.js";
import { isSttAvailable, listen, abortListening, stopListening } from "../../platform/speech.js";
import { mountAutoExercise, whyNote, questionHeading, hintBox } from "./frame.js";

function phraseBlock(ex) {
  return [
    h("p.speak__phrase", { lang: "pl" }, ex.phrase ?? ""),
    ex.translation ? h("p.speak__translation", ex.translation) : null,
    h("div.speak__listen", audioButton(ex.phrase, { big: true }), audioButton(ex.phrase, { slow: true })),
    ex.tip ? h("p.speak__tip", ex.tip) : null,
  ];
}

const errorKey = (code) => `speak.error_${{ "not-allowed": "not_allowed", "no-speech": "no_speech", network: "network" }[code] ?? "generic"}`;

/** No recognition: listen, repeat, confirm. Counts as done (first try). */
function renderSelfReport(ex, ctx, { reason } = {}) {
  const note = h("p.speak__heard", t(reason === "denied" ? "speak.mic_denied" : "speak.no_stt"));
  const result = h("div.speak__result", { aria: { live: "polite" } });
  const root = h("section.ex", { data: { type: ex.type } }, questionHeading(ex), h("div.speak.speak--self", phraseBlock(ex), note, result), hintBox(ex));
  const done = () => {
    ctx.recordAttempt(ex.id, true);
    result.replaceChildren(h("div.speak__score.is-good", icon("check"), h("span", t("speak.self_done"))), whyNote(ex.why, "ok"));
    ctx.setPrimary(t("common.next"), ctx.next);
    ctx.setSecondary(null);
  };
  ctx.setPrimary(t("speak.i_said"), done);
  ctx.setSecondary(null);
  return root;
}

export function renderSpeak(ex, ctx) {
  if (!isSttAvailable()) return renderSelfReport(ex, ctx);

  let heard = null; // { text, alternatives }
  let onChange = () => {};
  let submitFn = null;
  let listening = false;
  let locked = false;

  const mic = h("button.mic-btn.mic-btn--big", { type: "button", aria: { label: t("speak.mic"), pressed: "false" } }, h("span.mic-btn__rings", { aria: { hidden: "true" } }, h("i"), h("i")), uiIcon("mic"));
  const micLabel = h("p.speak__mic-label", t("speak.tap_to_speak"));
  const heardEl = h("p.speak__heard", { aria: { live: "polite" }, hidden: true });
  const score = h("div.speak__score", { hidden: true });
  const fallbackBtn = h("button.btn.btn--ghost.speak__self", { type: "button", hidden: true }, t("speak.i_said"));
  const notes = h("div.speak__notes");
  const el = h("div.speak", phraseBlock(ex), h("div.speak__mic", mic, micLabel), heardEl, score, fallbackBtn, notes);

  function setListening(on) {
    listening = on;
    onChange(); // bottom button: "Say it" / "Stop"
    mic.classList.toggle("is-listening", on);
    mic.setAttribute("aria-pressed", String(on));
    mic.setAttribute("aria-label", t(on ? "speak.mic_stop" : "speak.mic"));
    micLabel.textContent = t(on ? "speak.listening" : "speak.tap_to_speak");
  }

  async function record() {
    if (locked) return;
    if (listening) return stopListening();
    stopAudio();
    setListening(true);
    heardEl.hidden = true;
    try {
      const r = await listen({
        lang: "pl-PL",
        onPartial: (p) => {
          heardEl.hidden = false;
          heardEl.textContent = t("speak.heard", { text: p });
        },
      });
      if (!el.isConnected) return;
      setListening(false);
      heard = { text: r.text, alternatives: r.alternatives?.length ? r.alternatives : [r.text] };
      heardEl.hidden = false;
      heardEl.textContent = t("speak.heard", { text: r.text });
      onChange();
      submitFn?.();
    } catch (e) {
      if (!el.isConnected) return;
      setListening(false);
      if (e?.code === "aborted") return;
      heardEl.hidden = false;
      heardEl.textContent = t(errorKey(e?.code));
      // denied microphone or no speech twice: let the learner self-report
      fallbackBtn.hidden = false;
    }
  }
  mic.addEventListener("click", record);
  fallbackBtn.addEventListener("click", () => {
    heard = { text: ex.phrase, alternatives: [ex.phrase], self: true };
    onChange();
    submitFn?.();
  });

  const root = mountAutoExercise(ex, ctx, {
    el,
    answer: () => (heard ? heard.alternatives : null),
    onChange: (cb) => (onChange = cb),
    submit: (fn) => (submitFn = fn),
    idle: () => ({ label: t(listening ? "speak.mic_stop" : "speak.say"), fn: record }),
    reset() {
      locked = false;
      heard = null;
      mic.disabled = false;
      score.hidden = true;
      score.className = "speak__score";
      heardEl.hidden = true;
      notes.replaceChildren();
      onChange();
    },
    showResult(r, { reveal }) {
      locked = true;
      mic.disabled = true;
      fallbackBtn.hidden = true;
      abortListening();
      const level = heard?.self ? "good" : r.level;
      score.hidden = false;
      score.className = `speak__score is-${level}`;
      const pct = Math.round(r.score * 100);
      score.replaceChildren(
        icon(level === "bad" ? "cross" : "check"),
        h("span.speak__score-text", t(heard?.self ? "speak.self_done" : `speak.level_${level}`)),
        heard?.self ? null : h("span.speak__score-pct", t("speak.score", { score: pct })),
      );
      if (!heard?.self && r.heard) heardEl.textContent = t("speak.heard", { text: r.heard });
      notes.replaceChildren(r.correct || reveal ? whyNote(ex.why, r.correct ? "ok" : "info") : whyNote(t("speak.try_tip"), "info"));
    },
  });
  return root;
}
