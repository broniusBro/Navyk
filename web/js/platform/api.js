// Client for the Navyk backend (same origin). The only network surface of the app.

import { getJson, postJson } from "./http.js";
import { getItem, setItem } from "./storage.js";

const lessonCache = new Map();

export async function fetchCourse() {
  const res = await getJson("/api/course");
  if (res.status === 200 && res.body?.levels) {
    setItem("course", res.body);
    return res.body;
  }
  return getItem("course"); // last known copy, so the path works offline
}

/** Lesson JSON or null. Cached in memory; the service worker keeps an offline copy. */
export async function fetchLesson(lang, lessonId) {
  const key = `${lang}/${lessonId}`;
  if (lessonCache.has(key)) return lessonCache.get(key);
  const res = await getJson(`/api/lessons/${encodeURIComponent(lang)}/${encodeURIComponent(lessonId)}`);
  if (res.status === 200 && res.body?.meta && Array.isArray(res.body.blocks)) {
    lessonCache.set(key, res.body);
    return res.body;
  }
  return null;
}

/**
 * Which lessons have content in this language: a lesson is available if the server returns 200.
 * Returns the last known set immediately via onUpdate, then the fresh one.
 */
export async function probeAvailable(lang, ids, onUpdate, concurrency = 4) {
  // The server lists ready lessons in /api/course: no need to probe each one.
  const listed = getItem("course")?.available?.[lang];
  if (Array.isArray(listed)) {
    const set = new Set(listed);
    setItem(`avail:${lang}`, listed);
    onUpdate?.(set);
    return set;
  }
  const known = new Set(getItem(`avail:${lang}`, []));
  if (known.size) onUpdate?.(new Set(known));
  const found = new Set();
  let reachable = false;
  const queue = ids.slice();
  async function worker() {
    while (queue.length) {
      const id = queue.shift();
      const key = `${lang}/${id}`;
      if (lessonCache.has(key)) {
        found.add(id);
        reachable = true;
        continue;
      }
      const res = await getJson(`/api/lessons/${encodeURIComponent(lang)}/${encodeURIComponent(id)}`);
      if (res.status !== 0) reachable = true;
      if (res.status === 200 && res.body?.meta) {
        lessonCache.set(key, res.body);
        found.add(id);
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  if (!reachable) return known; // offline: keep the last known list
  setItem(`avail:${lang}`, [...found]);
  onUpdate?.(found);
  return found;
}

/** POST /api/review. Returns { status, body }; status 0 means network error. */
export function requestReview({ lessonId, exerciseId, lang, prompt, deviceId }) {
  return postJson("/api/review", { lessonId, exerciseId, lang, prompt, deviceId }, { timeout: 45000 });
}
