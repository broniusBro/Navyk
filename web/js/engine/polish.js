// Polish text helpers: normalization, diacritics, answer checks for build_sentence / type_answer / speak.
// Pure: strings in, plain objects out. No DOM, no browser APIs.

const DIACRITICS = {
  ą: "a", ć: "c", ę: "e", ł: "l", ń: "n", ó: "o", ś: "s", ź: "z", ż: "z",
  Ą: "A", Ć: "C", Ę: "E", Ł: "L", Ń: "N", Ó: "O", Ś: "S", Ź: "Z", Ż: "Z",
};

/** Polish letters with diacritics, in alphabetical order (for the on-screen key row). */
export const PL_LETTERS = Object.freeze(["ą", "ć", "ę", "ł", "ń", "ó", "ś", "ź", "ż"]);

// Punctuation and quotes of every flavour: Polish „…”, Russian «…», typographic and ASCII.
const PUNCT = /[.,!?;:…«»„“”"‚‘’'`´()[\]{}\-‐‑–—/\\*_~¡¿]/g;

/** Lower case, no punctuation or quotes, single spaces. Diacritics are kept. */
export function normalizePl(s) {
  return String(s ?? "")
    .normalize("NFC")
    .toLocaleLowerCase("pl")
    .replace(PUNCT, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** ą→a, ć→c, ę→e, ł→l, ń→n, ó→o, ś→s, ź/ż→z (case kept); other combining accents are dropped too. */
export function stripDiacritics(s) {
  return String(s ?? "")
    .normalize("NFC")
    .replace(/[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/g, (c) => DIACRITICS[c])
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .normalize("NFC");
}

/** Comparison key that ignores case, punctuation and diacritics. */
export const looseKey = (s) => stripDiacritics(normalizePl(s));

const squash = (s) => String(s ?? "").trim().replace(/\s+/g, " ");

/**
 * type_answer (and the exact-match path of translate).
 * correct: matches an accepted answer ignoring case, spaces and punctuation; also when only diacritics differ.
 * exact: character-for-character equal to an accepted answer (spaces squashed).
 * diacriticsOnly: correct, but only without Polish letters (dziekuje for dziękuję) — show a note.
 * expected: the accepted answer that matched, or the first one.
 */
export function checkTypeAnswer(ex, text) {
  const accepts = (ex?.accept ?? []).filter((a) => typeof a === "string" && a.trim());
  const expected0 = accepts[0] ?? "";
  const n = normalizePl(text);
  if (!n) return { correct: false, exact: false, diacriticsOnly: false, expected: expected0 };
  for (const acc of accepts) {
    if (normalizePl(acc) === n) return { correct: true, exact: squash(acc) === squash(text), diacriticsOnly: false, expected: acc };
  }
  const loose = stripDiacritics(n);
  for (const acc of accepts) {
    if (looseKey(acc) === loose) return { correct: true, exact: false, diacriticsOnly: true, expected: acc };
  }
  return { correct: false, exact: false, diacriticsOnly: false, expected: expected0 };
}

/**
 * build_sentence. words: the learner's tiles in order (strings).
 * Targets are ex.words plus every order in ex.accept. Case and punctuation do not matter.
 * Returns { correct, items: [{ position, text, correct }], expected }.
 */
export function checkBuildSentence(ex, words) {
  const picked = (Array.isArray(words) ? words : []).map(String);
  const targets = [ex?.words ?? [], ...(ex?.accept ?? [])].filter((tg) => Array.isArray(tg) && tg.length);
  const key = normalizePl(picked.join(" "));
  const matched = key ? targets.find((tg) => normalizePl(tg.join(" ")) === key) : undefined;
  // per-tile marks against the matched target, or the target with most tiles in place
  const score = (tg) => picked.filter((w, i) => normalizePl(w) === normalizePl(tg[i] ?? "")).length;
  const ref = matched ?? targets.reduce((best, tg) => (score(tg) > score(best) ? tg : best), targets[0] ?? []);
  const items = picked.map((text, position) => ({ position, text, correct: Boolean(matched) || normalizePl(text) === normalizePl(ref[position] ?? "") }));
  return { correct: Boolean(matched), items, expected: (matched ?? targets[0] ?? []).join(" ") };
}

/** Levenshtein distance over code points. */
export function levenshtein(a, b) {
  const s = [...String(a ?? "")];
  const t = [...String(b ?? "")];
  if (!s.length) return t.length;
  if (!t.length) return s.length;
  let prev = Array.from({ length: t.length + 1 }, (_, j) => j);
  for (let i = 1; i <= s.length; i++) {
    const cur = [i];
    for (let j = 1; j <= t.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (s[i - 1] === t[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[t.length];
}

const charSim = (a, b) => {
  const len = Math.max([...a].length, [...b].length);
  return len ? 1 - levenshtein(a, b) / len : 0;
};

/**
 * How close what was heard (b) is to the expected phrase (a), 0..1. Case, punctuation and diacritics
 * are ignored (recognizers differ in how they spell). Mixes a per-word score (each expected word vs the
 * closest heard word, with a small penalty for extra words) and a whole-string Levenshtein score.
 */
export function similarity(a, b) {
  const A = looseKey(a);
  const B = looseKey(b);
  if (!A || !B) return 0;
  if (A === B) return 1;
  const wa = A.split(" ");
  const wb = B.split(" ");
  const perWord = wa.reduce((sum, w) => sum + Math.max(...wb.map((x) => charSim(w, x))), 0) / wa.length;
  const lenFactor = Math.sqrt(Math.min(1, wa.length / wb.length));
  const score = 0.6 * perWord * lenFactor + 0.4 * charSim(A, B);
  return Math.max(0, Math.min(1, Math.round(score * 100) / 100));
}

/** Score thresholds for speak: good ≥ 0.8, ok ≥ 0.55, else bad. */
export const SPEAK_LEVELS = Object.freeze({ good: 0.8, ok: 0.55 });
export const speakLevel = (score) => (score >= SPEAK_LEVELS.good ? "good" : score >= SPEAK_LEVELS.ok ? "ok" : "bad");

/**
 * speak. heard: recognized text or a list of alternatives. Targets: ex.phrase and optional ex.accept.
 * Returns { score, level: "good" | "ok" | "bad", heard } where heard is the best alternative.
 */
export function checkSpeak(ex, heard) {
  const alts = (Array.isArray(heard) ? heard : [heard]).map((x) => String(x ?? "")).filter((x) => x.trim());
  const targets = [ex?.phrase, ...(ex?.accept ?? [])].filter((x) => typeof x === "string" && x.trim());
  let best = { score: 0, heard: alts[0] ?? "" };
  for (const h of alts) {
    for (const tg of targets) {
      const s = similarity(tg, h);
      if (s > best.score) best = { score: s, heard: h };
    }
  }
  return { score: best.score, level: speakLevel(best.score), heard: best.heard };
}
