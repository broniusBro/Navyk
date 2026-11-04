// Speech wrapper: text-to-speech (Polish voice) and speech recognition (pl-PL).
// Web: speechSynthesis + SpeechRecognition / webkitSpeechRecognition.
// Mobile app: replace this module with native TTS/STT (same exports, same promise shapes).

const RATE_KEY = "brolingvo.ttsRate";
const AUTOPLAY_KEY = "brolingvo.autoplay";
export const RATES = Object.freeze({ normal: 0.95, slow: 0.6 });

// Voices that usually sound natural; earlier = better.
const GOOD_VOICES = [/natural/i, /neural/i, /google/i, /zosia/i, /paulina/i, /ewa/i, /premium|enhanced/i];

const synth = () => globalThis.speechSynthesis ?? null;
const Utterance = () => globalThis.SpeechSynthesisUtterance ?? null;
const Recognition = () => globalThis.SpeechRecognition ?? globalThis.webkitSpeechRecognition ?? null;

function readSetting(key) {
  try {
    return globalThis.localStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

/** Saved speech rate: "slow" | "normal" | a number 0.3..1.5. Default normal (0.95). */
export function ttsRate() {
  const v = readSetting(RATE_KEY);
  if (v === "slow") return RATES.slow;
  const n = Number(v);
  if (v != null && v !== "" && Number.isFinite(n) && n >= 0.3 && n <= 1.5) return n;
  return RATES.normal;
}

/** Auto-play AI replies and exercise audio. On unless 'brolingvo.autoplay' is "0", "false" or "off". */
export function autoplayEnabled() {
  const v = readSetting(AUTOPLAY_KEY);
  return !(v === "0" || v === "false" || v === "off");
}

// ---- text to speech -------------------------------------------------------------------

let voice = null;
let voicesLoaded = false;

/** Best Polish voice: pl-PL first, then any pl-*, preferring natural/neural/known good names. */
export function pickVoice(voices) {
  const pl = (voices ?? []).filter((v) => /^pl([-_]|$)/i.test(v.lang ?? ""));
  if (!pl.length) return null;
  const rank = (v) => {
    const i = GOOD_VOICES.findIndex((re) => re.test(v.name ?? ""));
    return (i < 0 ? GOOD_VOICES.length : i) * 2 + (/^pl[-_]pl$/i.test(v.lang) ? 0 : 1);
  };
  return pl.slice().sort((a, b) => rank(a) - rank(b))[0];
}

function refreshVoice() {
  const s = synth();
  if (!s) return;
  const list = s.getVoices?.() ?? [];
  if (list.length) voicesLoaded = true;
  voice = pickVoice(list);
}

if (synth()) {
  refreshVoice();
  try {
    synth().addEventListener?.("voiceschanged", refreshVoice);
  } catch {
    /* old Safari */
  }
}

/** True if the device can speak (a Polish voice is not guaranteed: the default voice with lang=pl-PL is used then). */
export function isTtsAvailable() {
  return Boolean(synth() && Utterance());
}

/** True when a dedicated Polish voice is installed (voices load asynchronously; false until they do). */
export const hasPolishVoice = () => (voicesLoaded ? Boolean(voice) : false);

let current = null; // { utterance, resolve }

/** Stop speaking (resolves the pending speak() with false). */
export function stop() {
  const s = synth();
  const c = current;
  current = null;
  if (c) c.resolve(false);
  try {
    s?.cancel();
  } catch {
    /* ignore */
  }
}

/**
 * Speak Polish text. Resolves true when finished, false when stopped/failed.
 * opts.rate overrides the saved rate; opts.slow uses the slow rate.
 */
export function speak(text, { rate, slow = false } = {}) {
  const s = synth();
  const U = Utterance();
  const say = String(text ?? "").trim();
  if (!s || !U || !say) return Promise.resolve(false);
  stop();
  if (!voice) refreshVoice();
  return new Promise((resolve) => {
    const u = new U(say);
    u.lang = voice?.lang ?? "pl-PL";
    if (voice) u.voice = voice;
    u.rate = rate ?? (slow ? RATES.slow : ttsRate());
    u.pitch = 1;
    const entry = { utterance: u, resolve };
    const done = (ok) => {
      if (current === entry) current = null;
      resolve(ok);
    };
    u.onend = () => done(true);
    u.onerror = () => done(false);
    current = entry;
    try {
      // Safari/Chrome sometimes stay paused after a cancel()
      s.resume?.();
      s.speak(u);
    } catch {
      done(false);
    }
  });
}

export const isSpeaking = () => Boolean(current);

// ---- speech recognition ---------------------------------------------------------------

export function isSttAvailable() {
  return Boolean(Recognition());
}

let rec = null;

/** Stop listening: the pending listen() resolves with what was heard so far (or rejects with "no-speech"). */
export function stopListening() {
  try {
    rec?.stop();
  } catch {
    /* ignore */
  }
}

/** Abort listening: the pending listen() rejects with code "aborted". */
export function abortListening() {
  try {
    rec?.abort();
  } catch {
    /* ignore */
  }
}

/**
 * Listen once. Resolves { text, confidence, alternatives: string[] }.
 * Rejects with an Error whose .code is one of: unsupported | not-allowed | no-speech | network | aborted | error.
 */
export function listen({ lang = "pl-PL", onPartial, maxAlternatives = 3, timeoutMs = 12000 } = {}) {
  const R = Recognition();
  if (!R) return Promise.reject(Object.assign(new Error("unsupported"), { code: "unsupported" }));
  stop(); // do not record our own voice
  abortListening();
  return new Promise((resolve, reject) => {
    const r = new R();
    rec = r;
    r.lang = lang;
    r.interimResults = typeof onPartial === "function";
    r.maxAlternatives = maxAlternatives;
    r.continuous = false;
    let best = null;
    let settled = false;
    let lastError = null;
    const timer = setTimeout(() => stopListening(), timeoutMs);
    const finish = (fn, val) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (rec === r) rec = null;
      fn(val);
    };
    r.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) {
          const alts = Array.from(res, (a) => a.transcript.trim()).filter(Boolean);
          best = { text: alts[0] ?? "", confidence: res[0]?.confidence ?? 0, alternatives: alts };
        } else interim += res[0]?.transcript ?? "";
      }
      if (interim && onPartial) onPartial(interim.trim());
    };
    r.onerror = (e) => {
      const code = e.error === "not-allowed" || e.error === "service-not-allowed" ? "not-allowed" : ["no-speech", "network", "aborted", "audio-capture"].includes(e.error) ? (e.error === "audio-capture" ? "not-allowed" : e.error) : "error";
      lastError = code;
    };
    r.onend = () => {
      if (best && best.text) finish(resolve, best);
      else finish(reject, Object.assign(new Error(lastError ?? "no-speech"), { code: lastError ?? "no-speech" }));
    };
    try {
      r.start();
    } catch {
      finish(reject, Object.assign(new Error("error"), { code: "error" }));
    }
  });
}
