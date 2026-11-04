// Exercise logic: preparing the view order and checking answers. Pure, no DOM.
// Every check returns { correct, items } where items carry per-element status and `why`,
// so the UI can show every relevant explanation (autonomy rule from FORMAT.md).

import { shuffledIndices } from "./rng.js";
import { checkBuildSentence, checkTypeAnswer, checkSpeak, normalizePl } from "./polish.js";

/** Types checked by the AI helper (with an offline fallback); they record a practice result, not attempts. */
export const AI_TYPES = new Set(["translate", "dialog"]);
export const isAiExercise = (ex) => AI_TYPES.has(ex?.type);

const sameSet = (a, b) => a.size === b.size && [...a].every((x) => b.has(x));
const asText = (item) => (typeof item === "string" ? item : item?.text ?? "");
const asWhy = (item) => (typeof item === "string" ? "" : item?.why ?? "");

/**
 * View order for an exercise (indices into the source arrays). Seeded so a retry or a reload
 * shows the same order. Returns an object; fields depend on type.
 */
export function prepare(ex, seed) {
  const s = `${seed}:${ex.id}`;
  switch (ex.type) {
    case "single_choice":
    case "multi_choice":
      return { order: shuffledIndices(ex.options.length, s) };
    case "match_pairs":
      return {
        leftOrder: ex.pairs.map((_, i) => i),
        rightOrder: shuffledIndices(ex.pairs.length, `${s}:r`, { changed: true }),
      };
    case "order_steps":
      return {
        order: ex.shuffle === false ? ex.items.map((_, i) => i) : shuffledIndices(ex.items.length, s, { changed: true }),
      };
    case "build_sentence":
      // bank order over [...words, ...extra]; never the target order when there is more than one tile
      return { order: shuffledIndices(bankWords(ex).length, s, { changed: true }) };
    case "fill_gap":
      return { gapOrders: ex.gaps.map((g, gi) => shuffledIndices(g.options.length, `${s}:g${gi}`)) };
    default:
      return {};
  }
}

/** single_choice. answer: option index or null. */
export function checkSingle(ex, answer) {
  const items = ex.options.map((o, i) => ({
    index: i,
    chosen: i === answer,
    correct: Boolean(o.correct),
    why: o.why || "",
    show: i === answer || Boolean(o.correct),
  }));
  return { correct: answer != null && Boolean(ex.options[answer]?.correct), items };
}

/** multi_choice. answer: iterable of option indices. */
export function checkMulti(ex, answer) {
  const chosen = new Set(answer);
  const target = new Set(ex.options.flatMap((o, i) => (o.correct ? [i] : [])));
  const items = ex.options.map((o, i) => {
    const c = chosen.has(i);
    const ok = Boolean(o.correct);
    const status = c && ok ? "hit" : c && !ok ? "wrong" : !c && ok ? "missed" : "skip";
    return { index: i, chosen: c, correct: ok, status, why: o.why || "", show: c || ok };
  });
  return { correct: sameSet(chosen, target), items };
}

/** match_pairs. answer: { [leftIndex]: rightIndex } where rightIndex is the source pair index. */
export function checkMatch(ex, answer) {
  const items = ex.pairs.map((p, i) => {
    const r = answer?.[i];
    return { index: i, chosenRight: r ?? null, correct: r === i, why: p.why || "", show: true };
  });
  return { correct: items.every((x) => x.correct), items };
}

/** order_steps. answer: array of source item indices in the learner's order. */
export function checkOrder(ex, answer) {
  const items = answer.map((src, pos) => ({
    position: pos,
    index: src,
    correct: src === pos,
    text: asText(ex.items[src]),
    why: asWhy(ex.items[src]),
    show: true,
  }));
  return { correct: answer.length === ex.items.length && items.every((x) => x.correct), items };
}

/** Tiles of a build_sentence bank: the target words first, then the distractors. */
export const bankWords = (ex) => [...(ex.words ?? []), ...(ex.extra ?? [])].map(String);

/** build_sentence. answer: array of tile texts in the learner's order. */
export const checkBuild = (ex, answer) => checkBuildSentence(ex, answer);

/** type_answer. answer: the typed text. */
export const checkType = (ex, answer) => checkTypeAnswer(ex, answer);

/** speak. answer: recognized text (or alternatives); correct when the match is "good" or "ok". */
export function checkSpoken(ex, answer) {
  const r = checkSpeak(ex, answer);
  return { ...r, correct: r.level !== "bad" };
}

/** fill_gap. answer: array (per gap) of chosen option index or null. */
export function checkFillGap(ex, answer) {
  const gaps = ex.gaps.map((g, gi) => {
    const a = answer?.[gi];
    const ci = g.options.findIndex((o) => o.correct);
    return {
      gap: gi,
      chosen: a ?? null,
      correctIndex: ci,
      correct: a != null && Boolean(g.options[a]?.correct),
      chosenWhy: a != null ? g.options[a]?.why || "" : "",
      correctWhy: g.options[ci]?.why || "",
    };
  });
  return { correct: gaps.every((g) => g.correct), items: gaps };
}

/** Split fill_gap text into parts: strings and { gap: n } markers. */
export function splitGaps(text) {
  const parts = String(text).split("___");
  const out = [];
  parts.forEach((p, i) => {
    if (p) out.push(p);
    if (i < parts.length - 1) out.push({ gap: i });
  });
  return out;
}

/** Dispatch by type. */
export function check(ex, answer) {
  switch (ex.type) {
    case "single_choice": return checkSingle(ex, answer);
    case "multi_choice": return checkMulti(ex, answer);
    case "match_pairs": return checkMatch(ex, answer);
    case "order_steps": return checkOrder(ex, answer);
    case "build_sentence": return checkBuild(ex, answer);
    case "type_answer": return checkType(ex, answer);
    case "speak": return checkSpoken(ex, answer);
    case "fill_gap": return checkFillGap(ex, answer);
    default: throw new Error(`No checker for ${ex.type}`);
  }
}

/** Whether the learner has given enough input to press "Check". */
export function canCheck(ex, answer) {
  switch (ex.type) {
    case "single_choice": return answer != null;
    case "multi_choice": return answer != null && [...answer].length > 0;
    case "match_pairs": return answer != null && Object.keys(answer).length === ex.pairs.length;
    case "order_steps": return Array.isArray(answer) && answer.length === ex.items.length;
    case "build_sentence": return Array.isArray(answer) && answer.length > 0;
    case "type_answer":
    case "speak": return normalizePl(Array.isArray(answer) ? answer[0] : answer).length > 0;
    case "fill_gap": return Array.isArray(answer) && ex.gaps.every((_, i) => answer[i] != null);
    default: return false;
  }
}

/** Attempts policy: no hearts; one retry after a wrong first answer. */
export const MAX_ATTEMPTS = 2;
export function attemptOutcome(correct, attempt) {
  if (correct) return { done: true, firstTry: attempt === 1, canRetry: false, reveal: true };
  const canRetry = attempt < MAX_ATTEMPTS;
  return { done: !canRetry, firstTry: false, canRetry, reveal: !canRetry };
}
