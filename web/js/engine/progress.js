// Progress, XP and streak math. Pure: functions take a state and return a new one.

import { daysBetween, addDays } from "./dates.js";

export const XP = Object.freeze({ lesson: 10, firstTry: 5, aiPassed: 10 });
export const PROGRESS_VERSION = 1;

export function emptyProgress() {
  return { version: PROGRESS_VERSION, xp: 0, days: [], lessons: {}, repeat: {} };
}

/** Accept anything from storage; return a valid progress object. */
export function normalizeProgress(raw) {
  const base = emptyProgress();
  if (!raw || typeof raw !== "object" || raw.version !== PROGRESS_VERSION) return base;
  return {
    version: PROGRESS_VERSION,
    xp: Number.isFinite(raw.xp) && raw.xp >= 0 ? Math.floor(raw.xp) : 0,
    days: Array.isArray(raw.days) ? [...new Set(raw.days.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)))].sort() : [],
    lessons: raw.lessons && typeof raw.lessons === "object" ? raw.lessons : {},
    repeat: raw.repeat && typeof raw.repeat === "object" ? raw.repeat : {},
  };
}

/**
 * XP for one lesson run.
 * results: [{ exerciseId, firstTry: bool, ai?: bool, passed?: bool }]
 */
export function lessonXp(results) {
  let firstTry = 0;
  let ai = 0;
  for (const r of results) {
    if (r.ai) {
      if (r.passed) ai += XP.aiPassed;
    } else if (r.firstTry) firstTry += XP.firstTry;
  }
  return { base: XP.lesson, firstTry, ai, total: XP.lesson + firstTry + ai };
}

/** Days in a row with at least one completed lesson, ending today (or yesterday if not yet today). */
export function streak(days, today) {
  const set = new Set(days);
  let cursor = set.has(today) ? today : addDays(today, -1);
  if (!set.has(cursor)) return 0;
  let n = 0;
  while (set.has(cursor)) {
    n++;
    cursor = addDays(cursor, -1);
  }
  return n;
}

/** True if the learner already extended the streak today. */
export const activeToday = (days, today) => days.includes(today);

/**
 * Record a finished lesson. Replays do not farm XP: only the part above the previous best is added.
 * Returns { progress, awarded, earned, streakBefore, streakAfter, newRepeat }.
 */
export function completeLesson(progress, { lessonId, results, meta, today }) {
  const prev = progress.lessons[lessonId];
  const earned = lessonXp(results);
  const prevBest = prev?.bestXp ?? 0;
  const awarded = Math.max(0, earned.total - prevBest);
  const streakBefore = streak(progress.days, today);
  const days = progress.days.includes(today) ? progress.days : [...progress.days, today].sort();
  const lessons = {
    ...progress.lessons,
    [lessonId]: {
      firstCompletedAt: prev?.firstCompletedAt ?? today,
      lastCompletedAt: today,
      bestXp: Math.max(prevBest, earned.total),
      runs: (prev?.runs ?? 0) + 1,
    },
  };
  const { repeat, added } = scheduleFromMeta(progress.repeat, { lessonId, meta, today });
  const next = { ...progress, xp: progress.xp + awarded, days, lessons, repeat };
  return { progress: next, awarded, earned, streakBefore, streakAfter: streak(days, today), newRepeat: added };
}

export const isCompleted = (progress, lessonId) => Boolean(progress.lessons[lessonId]);

// ---- spaced repetition -------------------------------------------------------------------

export const repeatKey = (lessonId, concept) => `${lessonId}:${concept}`;

/** Create repetition items from meta.repeat. Existing items are kept (a replay does not reset them). */
export function scheduleFromMeta(repeat, { lessonId, meta, today }) {
  const out = { ...repeat };
  const added = [];
  for (const r of meta?.repeat ?? []) {
    const schedule = (r.schedule ?? []).filter((s) => Number.isFinite(s.day) && s.day > 0).sort((a, b) => a.day - b.day);
    if (!schedule.length) continue;
    const key = repeatKey(lessonId, r.concept);
    if (out[key]) continue;
    out[key] = {
      key,
      lessonId,
      concept: r.concept,
      exercises: r.exercises ?? [],
      schedule,
      baseDay: today,
      step: 0,
      due: addDays(today, schedule[0].day),
      done: false,
    };
    added.push(out[key]);
  }
  return { repeat: out, added };
}

/** Items due on or before today, oldest first. */
export function dueItems(repeat, today) {
  return Object.values(repeat)
    .filter((it) => !it.done && daysBetween(it.due, today) >= 0)
    .sort((a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : a.key.localeCompare(b.key)));
}

/** Next upcoming due date (for "next review in N days"), or null. */
export function nextDue(repeat) {
  const dates = Object.values(repeat).filter((it) => !it.done).map((it) => it.due).sort();
  return dates[0] ?? null;
}

/**
 * Apply a review result. Correct: move to the next schedule step (counted from the lesson day).
 * Wrong: the concept comes back on the nearest repetition day (schedule[0].day from today), step kept.
 */
export function reviewItem(item, correct, today) {
  if (correct) {
    const step = item.step + 1;
    if (step >= item.schedule.length) return { ...item, step, done: true, lastReviewed: today };
    let due = addDays(item.baseDay, item.schedule[step].day);
    if (daysBetween(today, due) < 1) due = addDays(today, 1);
    return { ...item, step, due, lastReviewed: today };
  }
  return { ...item, due: addDays(today, item.schedule[0].day), lastReviewed: today, lapses: (item.lapses ?? 0) + 1 };
}

export function applyReviews(progress, outcomes, today) {
  const repeat = { ...progress.repeat };
  for (const { key, correct } of outcomes) {
    if (repeat[key]) repeat[key] = reviewItem(repeat[key], correct, today);
  }
  return { ...progress, repeat };
}

/** Type preferred at the current step, for picking which exercise to show. */
export const stepType = (item) => item.schedule[Math.min(item.step, item.schedule.length - 1)]?.type ?? null;

/**
 * Choose the exercise to show for a due item from the lesson's exercise blocks.
 * Prefers an exercise of the scheduled type among item.exercises; otherwise rotates through
 * item.exercises by step, so the learner does not see the same one every time.
 */
export function pickReviewExercise(item, exerciseBlocks) {
  const pool = exerciseBlocks.filter((b) => item.exercises.includes(b.id));
  if (!pool.length) return null;
  const want = stepType(item);
  return pool.find((b) => b.type === want) ?? pool[(item.step + (item.lapses ?? 0)) % pool.length];
}
