// Merging progress from two sources (this device and the account). Pure.
// Rules (owner's spec): union of completed lessons with max XP per lesson; the streak keeps the
// longest series and the latest active day (we store the set of active days, so the union of days
// gives both); union of repetition items, earliest due wins. Language comes from the account and is
// not part of the progress object.
// The merge is commutative and idempotent: merge(a, b) == merge(b, a), merge(m, m) == m.

import { normalizeProgress, PROGRESS_VERSION } from "./progress.js";

const minStr = (a, b) => (a == null ? b : b == null ? a : a < b ? a : b);
const maxStr = (a, b) => (a == null ? b : b == null ? a : a > b ? a : b);
const num = (v) => (Number.isFinite(v) && v >= 0 ? v : 0);

/** XP earned by lessons (best run of each). Anything above it in progress.xp came from repetitions. */
export function lessonsXp(lessons) {
  return Object.values(lessons ?? {}).reduce((s, l) => s + num(l?.bestXp), 0);
}

function mergeLesson(a, b) {
  if (!a) return b;
  if (!b) return a;
  return {
    firstCompletedAt: minStr(a.firstCompletedAt, b.firstCompletedAt),
    lastCompletedAt: maxStr(a.lastCompletedAt, b.lastCompletedAt),
    bestXp: Math.max(num(a.bestXp), num(b.bestXp)),
    runs: Math.max(num(a.runs), num(b.runs)),
  };
}

/** One repetition item from two copies: an open item beats a finished one, then the earlier due date. */
function pickRepeat(a, b) {
  if (!a) return b;
  if (!b) return a;
  if (Boolean(a.done) !== Boolean(b.done)) return a.done ? b : a;
  if (a.due !== b.due) return a.due < b.due ? a : b;
  // same date: the one further along the schedule, then a stable tie-break
  if ((a.step ?? 0) !== (b.step ?? 0)) return (a.step ?? 0) > (b.step ?? 0) ? a : b;
  return canonical(a) <= canonical(b) ? a : b;
}

export function mergeProgress(x, y) {
  const a = normalizeProgress(x);
  const b = normalizeProgress(y);
  const lessons = {};
  for (const id of new Set([...Object.keys(a.lessons), ...Object.keys(b.lessons)])) {
    lessons[id] = mergeLesson(a.lessons[id], b.lessons[id]);
  }
  const repeat = {};
  for (const key of new Set([...Object.keys(a.repeat), ...Object.keys(b.repeat)])) {
    repeat[key] = pickRepeat(a.repeat[key], b.repeat[key]);
  }
  const extra = Math.max(0, a.xp - lessonsXp(a.lessons), b.xp - lessonsXp(b.lessons));
  return {
    version: PROGRESS_VERSION,
    xp: lessonsXp(lessons) + extra,
    days: [...new Set([...a.days, ...b.days])].sort(),
    lessons,
    repeat,
  };
}

/** Stable JSON (sorted keys) for equality checks. */
export function canonical(v) {
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (v && typeof v === "object") {
    return `{${Object.keys(v)
      .sort()
      .filter((k) => v[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(v ?? null);
}

export const sameProgress = (a, b) => canonical(normalizeProgress(a)) === canonical(normalizeProgress(b));

/** Delay before the n-th retry of a failed sync (0-based), in ms. */
export const retryDelay = (n) => [5000, 20000, 60000, 180000, 300000][Math.min(n, 4)];
