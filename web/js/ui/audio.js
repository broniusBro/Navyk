// Audio buttons over platform/speech.js: speaker (normal / slow "turtle"), and the audio row of an exercise.
// One sound at a time: starting a button stops the previous one and clears its .is-playing.

import { h } from "./dom.js";
import { t } from "./i18n.js";
import { speak, stop, isTtsAvailable, autoplayEnabled } from "../platform/speech.js";

// Local icons (dom.js icon() has no speaker/mic/turtle). Same output shape: decorative inline SVG.
const PATHS = {
  speaker: "M4 9.5h3.5L12 5.5v13l-4.5-4H4zM15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11",
  turtle: "M5 14.5c0-3.6 2.9-6.5 6.5-6.5S18 10.9 18 14.5zM18 13.5h2.2a1.6 1.6 0 0 0 0-3.2H18.6M7 14.5l-1 3M16 14.5l1 3M3.5 14.5H20M9 8.5l1.2 6M14 8.5l-1.2 6",
  mic: "M12 3.5a3 3 0 0 1 3 3v5a3 3 0 0 1-6 0v-5a3 3 0 0 1 3-3zM6 11.5a6 6 0 0 0 12 0M12 17.5v3M9 20.5h6",
  send: "M4.5 12l15-7-5.5 14-2.5-5.5z M12 13.5l7.5-8.5",
  stop: "M7 7h10v10H7z",
  sparkle: "M12 3.5l1.8 5 5 1.8-5 1.8-1.8 5-1.8-5-5-1.8 5-1.8zM18.5 15.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z",
};

export function uiIcon(name, cls = "icon") {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("class", cls);
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  for (const d of PATHS[name].split(/(?=M)/)) {
    const p = document.createElementNS(ns, "path");
    p.setAttribute("d", d.trim());
    svg.append(p);
  }
  return svg;
}

let playing = null; // the button currently speaking

function setPlaying(btn, on) {
  btn.classList.toggle("is-playing", on);
  btn.setAttribute("aria-pressed", String(on));
}

/** Stop any sound started by an audio button. */
export function stopAudio() {
  if (playing) setPlaying(playing, false);
  playing = null;
  stop();
}

/**
 * Play text with an audio button's visual state. Used by audioButton and by autoplay.
 * Resolves when speech ends.
 */
export async function playWith(btn, text, { slow = false } = {}) {
  if (playing && playing !== btn) setPlaying(playing, false);
  playing = btn;
  if (btn) setPlaying(btn, true);
  try {
    await speak(text, { slow });
  } finally {
    if (playing === btn) {
      if (btn) setPlaying(btn, false);
      playing = null;
    }
  }
}

/**
 * audioButton(text, { big, slow, label }) -> button.audio-btn
 * Tap plays; tap while playing stops. Hidden from layout (still rendered, disabled) when the device cannot speak.
 */
export function audioButton(text, { big = false, slow = false, label } = {}) {
  const cls = `button.audio-btn${big ? ".audio-btn--big" : ""}${slow ? ".audio-btn--slow" : ""}`;
  const name = label ?? t(slow ? "speak.listen_slow" : "speak.listen", { text });
  const btn = h(cls, { type: "button", aria: { label: name, pressed: "false" }, title: name }, uiIcon(slow ? "turtle" : "speaker"));
  if (!isTtsAvailable()) {
    btn.disabled = true;
    btn.title = t("speak.tts_unavailable");
    btn.setAttribute("aria-label", t("speak.tts_unavailable"));
  }
  btn.addEventListener("click", (e) => {
    e.stopPropagation(); // inside a tappable bubble the click must not toggle the translation
    if (playing === btn) return stopAudio();
    playWith(btn, text, { slow });
  });
  return btn;
}

/**
 * Audio row above an exercise for `ex.audio`; with `ex.audio_only` the text stays hidden (listening task).
 * Plays automatically once when autoplay is on. Returns null if the exercise has no audio.
 */
export function exAudio(ex, { autoplay = true } = {}) {
  const text = typeof ex?.audio === "string" ? ex.audio.trim() : "";
  if (!text) return null;
  const main = audioButton(text, { big: true, label: t("speak.listen_task") });
  const slow = audioButton(text, { slow: true, label: t("speak.listen_slow_task") });
  const row = h("div.ex__audio", main, slow, ex.audio_only ? null : h("p.ex__audio-text", { lang: "pl" }, text));
  if (autoplay && autoplayEnabled() && isTtsAvailable()) {
    // after the screen transition; skipped if the learner already left the screen
    setTimeout(() => row.isConnected && playWith(main, text), 450);
  }
  return row;
}

/** Add a speaker button to every li.phrase[data-pl] rendered by the Markdown ```pl block. */
export function hydratePhrases(root) {
  for (const li of root.querySelectorAll("li.phrase[data-pl]")) {
    if (li.querySelector(".audio-btn")) continue;
    li.prepend(audioButton(li.dataset.pl));
  }
  return root;
}
