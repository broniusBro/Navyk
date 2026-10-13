// Lesson run state: which screen, attempts and results per exercise. Pure reducer-style helpers.

import { playableBlocks, normalizeExercise } from "./course.js";
import { attemptOutcome, isAiExercise } from "./exercises.js";

export function startSession(lesson) {
  const blocks = playableBlocks(lesson).map(normalizeExercise);
  return { lessonId: lesson.meta.id, blocks, index: 0, attempts: {}, results: {} };
}

export const currentBlock = (s) => s.blocks[s.index] ?? null;
export const isLast = (s) => s.index >= s.blocks.length - 1;
export const progressRatio = (s) => (s.blocks.length ? s.index / s.blocks.length : 0);

/** Record a checked attempt for an auto-checked exercise. Returns { session, outcome }. */
export function recordAttempt(s, exerciseId, correct) {
  const attempt = (s.attempts[exerciseId] ?? 0) + 1;
  const outcome = attemptOutcome(correct, attempt);
  const attempts = { ...s.attempts, [exerciseId]: attempt };
  let results = s.results;
  if (outcome.done) {
    results = { ...results, [exerciseId]: { exerciseId, firstTry: outcome.firstTry, correct } };
  }
  return { session: { ...s, attempts, results }, outcome: { ...outcome, attempt } };
}

/**
 * Record an AI practice result. mode: "review" (got AI feedback) | "selfcheck" (fallback).
 * The exercise counts as done either way; only a passed AI review earns the bonus.
 * A later passed attempt upgrades an earlier non-passed one.
 */
export function recordPractice(s, exerciseId, { mode, passed }) {
  const prev = s.results[exerciseId];
  const result = { exerciseId, ai: true, mode, passed: Boolean(passed) || Boolean(prev?.passed) };
  return { ...s, results: { ...s.results, [exerciseId]: result } };
}

export const next = (s) => ({ ...s, index: Math.min(s.index + 1, s.blocks.length) });
export const isFinished = (s) => s.index >= s.blocks.length;

/** Results in block order, for XP calculation. Exercises the learner skipped count as not first-try. */
export function sessionResults(s) {
  return s.blocks
    .filter((b) => b.kind === "exercise")
    .map((b) => s.results[b.id] ?? { exerciseId: b.id, firstTry: false, ai: isAiExercise(b), passed: false });
}
