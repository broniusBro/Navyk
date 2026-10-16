// Progress, XP and streak math. Pure: functions take a state and return a new one.

import { daysBetween, addDays } from "./dates.js";

export const XP = Object.freeze({ lesson: 10, firstTry: 5, aiPassed: 10 });
export const PROGRESS_VERSION = 1;

export function emptyProgress() {
  return { version: PROGRESS_VERSION, xp: 0, days: [], lessons: {}, repeat: {} };
}

// Strict shape check. The same function cleans data from local storage (client) and data the server
// accepts from PUT /api/progress, so a crafted request cannot store anything but valid progress.
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const LESSON_RE = /^[a-z]\d{1,2}\.\d{1,2}$/;
const EXERCISE_RE = /^[a-z]\d{1,2}\.\d{1,2}\.e\d{1,2}$/;
const CONCEPT_RE = /^[A-Za-z0-9_-]{1,64}$/;
const TYPE_RE = /^[a-z_]{1,32}$/;
const LIMITS = Object.freeze({ xp: 10_000_000, days: 4000, lessons: 500, repeat: 2000, list: 20, dayOffset: 3650 });

const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const isDay = (v) => typeof v === "string" && DAY_RE.test(v);
const int = (v, max) => (Number.isFinite(v) && v >= 0 ? Math.min(Math.floor(v), max) : 0);
const ownKeys = (o) => Object.keys(o).filter((k) => k !== "__proto__" && k !== "constructor" && k !== "prototype");

function cleanLesson(r) {
  if (!isObj(r)) return null;
  const out = {};
  if (isDay(r.firstCompletedAt)) out.firstCompletedAt = r.firstCompletedAt;
  if (isDay(r.lastCompletedAt)) out.lastCompletedAt = r.lastCompletedAt;
  out.bestXp = int(r.bestXp, 10_000);
  out.runs = int(r.runs, 1_000_000);
  return out;
}

function cleanRepeat(key, it) {
  if (!isObj(it) || it.key !== key || !LESSON_RE.test(it.lessonId ?? "") || !CONCEPT_RE.test(it.concept ?? "")) return null;
  if (key !== `${it.lessonId}:${it.concept}` || !isDay(it.baseDay) || !isDay(it.due)) return null;
  const schedule = (Array.isArray(it.schedule) ? it.schedule : [])
    .slice(0, LIMITS.list)
    .filter((s) => isObj(s) && Number.isInteger(s.day) && s.day > 0 && s.day <= LIMITS.dayOffset)
    .map((s) => (typeof s.type === "string" && TYPE_RE.test(s.type) ? { day: s.day, type: s.type } : { day: s.day }));
  if (!schedule.length) return null;
  const out = {
    key,
    lessonId: it.lessonId,
    concept: it.concept,
    exercises: (Array.isArray(it.exercises) ? it.exercises : []).filter((e) => typeof e === "string" && EXERCISE_RE.test(e)).slice(0, LIMITS.list),
    schedule,
    baseDay: it.baseDay,
    step: int(it.step, schedule.length),
    due: it.due,
    done: it.done === true,
  };
  if (isDay(it.lastReviewed)) out.lastReviewed = it.lastReviewed;
  if (it.lapses !== undefined) out.lapses = int(it.lapses, 1_000_000);
  return out;
}

/** Accept anything (storage, network); return a valid progress object with only known fields. */
export function normalizeProgress(raw) {
  const base = emptyProgress();
  if (!isObj(raw) || raw.version !== PROGRESS_VERSION) return base;
  const lessons = {};
  if (isObj(raw.lessons)) {
    for (const id of ownKeys(raw.lessons).filter((k) => LESSON_RE.test(k)).slice(0, LIMITS.lessons)) {
      const r = cleanLesson(raw.lessons[id]);
      if (r) lessons[id] = r;
    }
  }
  const repeat = {};
  if (isObj(raw.repeat)) {
    for (const key of ownKeys(raw.repeat).slice(0, LIMITS.repeat)) {
      const it = cleanRepeat(key, raw.repeat[key]);
      if (it) repeat[key] = it;
    }
  }
  return {
    version: PROGRESS_VERSION,
    xp: int(raw.xp, LIMITS.xp),
    days: Array.isArray(raw.days) ? [...new Set(raw.days.filter(isDay))].sort().slice(-LIMITS.days) : [],
    lessons,
    repeat,
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
