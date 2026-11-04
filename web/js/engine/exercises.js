// Exercise logic: preparing the view order and checking answers. Pure, no DOM.
// Every check returns { correct, items } where items carry per-element status and `why`,
// so the UI can show every relevant explanation (autonomy rule from FORMAT.md).

import { shuffledIndices } from "./rng.js";

export const AI_TYPES = new Set(["write_prompt", "improve_prompt"]);
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
    case "compare_answers":
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
    case "build_prompt":
      return { order: shuffledIndices(ex.blocks.length, s) };
    case "fill_gap":
      return { gapOrders: ex.gaps.map((g, gi) => shuffledIndices(g.options.length, `${s}:g${gi}`)) };
    default:
      return {};
  }
}

/** single_choice and compare_answers. answer: option index or null. */
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

/** find_error. answer: iterable of segment indices the learner tapped. */
export function checkFindError(ex, answer) {
  const chosen = new Set(answer);
  const target = new Set(ex.segments.flatMap((s, i) => (s.weak ? [i] : [])));
  const items = ex.segments.map((s, i) => {
    const c = chosen.has(i);
    const weak = Boolean(s.weak);
    const status = c && weak ? "hit" : c && !weak ? "wrong" : !c && weak ? "missed" : "skip";
    return { index: i, chosen: c, weak, status, why: s.why || "", show: c || weak };
  });
  return { correct: sameSet(chosen, target), items, found: [...chosen].filter((i) => target.has(i)).length, total: target.size };
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

/** build_prompt. answer: array of block ids in the learner's order. */
export function checkBuild(ex, answer) {
  const target = ex.target_order;
  const byId = new Map(ex.blocks.map((b) => [b.id, b]));
  const items = ex.blocks.map((b) => {
    const pos = answer.indexOf(b.id);
    const used = pos >= 0;
    const want = target.indexOf(b.id);
    let status;
    if (b.role === "noise" || want < 0) status = used ? "noise_used" : "noise_skipped";
    else if (!used) status = "missing";
    else status = pos === want ? "ok" : "misplaced";
    return { id: b.id, role: b.role, status, why: b.why || "", show: true };
  });
  const correct = answer.length === target.length && answer.every((id, i) => id === target[i]);
  const text = answer.map((id) => byId.get(id)?.text ?? "").join(" ");
  return { correct, items, text };
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
    case "single_choice":
    case "compare_answers": return checkSingle(ex, answer);
    case "multi_choice": return checkMulti(ex, answer);
    case "find_error": return checkFindError(ex, answer);
    case "match_pairs": return checkMatch(ex, answer);
    case "order_steps": return checkOrder(ex, answer);
    case "build_prompt": return checkBuild(ex, answer);
    case "fill_gap": return checkFillGap(ex, answer);
    default: throw new Error(`No checker for ${ex.type}`);
  }
}

/** Whether the learner has given enough input to press "Check". */
export function canCheck(ex, answer) {
  switch (ex.type) {
    case "single_choice":
    case "compare_answers": return answer != null;
    case "multi_choice":
    case "find_error": return answer != null && [...answer].length > 0;
    case "match_pairs": return answer != null && Object.keys(answer).length === ex.pairs.length;
    case "order_steps": return Array.isArray(answer) && answer.length === ex.items.length;
    case "build_prompt": return Array.isArray(answer) && answer.length > 0;
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

/** Prompt text helpers for write_prompt / improve_prompt. */
export function initialPromptText(ex) {
  return ex.type === "improve_prompt" ? ex.weak_prompt || "" : "";
}

export function insertIdea(text, idea, caret = text.length) {
  const before = text.slice(0, caret);
  const after = text.slice(caret);
  const sepBefore = before && !/\s$/.test(before) ? " " : "";
  const sepAfter = after && !/^\s/.test(after) ? " " : "";
  const inserted = `${sepBefore}${idea}${sepAfter}`;
  return { text: before + inserted + after, caret: before.length + inserted.length };
}
