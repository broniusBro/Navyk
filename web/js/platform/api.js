// Client for the brolingvo backend (same origin). The only network surface of the app.

import { getJson, postJson, request } from "./http.js";
import { getItem, setItem } from "./storage.js";
import { deviceId } from "./device.js";

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

// ---- AI helper (translate check, dialog partner, tutor) ------------------------------------
// Every call resolves (never throws) to the documented shape with `available`. When the AI cannot answer
// (no key on the server, daily limit, network or server error) available=false and `reason` says why,
// so the UI shows its offline fallback. deviceId is sent like /api/review does (limits without an account).

const AI_TIMEOUT = 45000;

function unavailable(res) {
  const reason = res.status === 429 || res.body?.reason === "limit" ? "limit" : res.body?.reason === "no_key" ? "no_key" : "error";
  return { available: false, reason, resetAt: res.body?.resetAt ?? null };
}

/** How the learner wants to be addressed (prefs, set in onboarding/profile): "m" | "f" | "x". */
function learnerGender() {
  try {
    const raw = getItem("brolingvo.prefs");
    const g = (typeof raw === "string" ? JSON.parse(raw) : raw)?.gender;
    return g === "m" || g === "f" ? g : "x";
  } catch {
    return "x";
  }
}

async function aiPost(path, body) {
  const res = await postJson(path, { ...body, gender: learnerGender(), deviceId: deviceId() }, { timeout: AI_TIMEOUT });
  if (res.status !== 200 || !res.body || res.body.available === false) return { ok: false, out: unavailable(res) };
  return { ok: true, body: res.body };
}

const strs = (a, n = 5) => (Array.isArray(a) ? a.filter((x) => typeof x === "string" && x.trim()).slice(0, n) : []);

/** POST /api/ai/translate -> { available, reason?, verdict: ok|close|bad, corrected, notes[] } */
export async function aiTranslate({ lessonId, exerciseId, answer }) {
  const r = await aiPost("/api/ai/translate", { lessonId, exerciseId, answer });
  if (!r.ok) return r.out;
  const b = r.body;
  return {
    available: true,
    verdict: ["ok", "close", "bad"].includes(b.verdict) ? b.verdict : "close",
    corrected: typeof b.corrected === "string" ? b.corrected : "",
    notes: strs(b.notes, 3),
    remaining: Number.isFinite(b.remaining) ? b.remaining : null,
  };
}

/**
 * POST /api/ai/dialog -> { available, reason?, reply: {pl, ru}, correction: {fixed, explain} | null,
 *   goalsDone: number[], chips: string[], finished, summary?: { stars 1..3, praise, tips[] } }
 */
export async function aiDialog({ lessonId, exerciseId, scenarioId, level, history = [], finish = false }) {
  const r = await aiPost("/api/ai/dialog", { lessonId, exerciseId, scenarioId, level, history, finish: finish || undefined });
  if (!r.ok) return r.out;
  const b = r.body;
  const out = {
    available: true,
    reply: { pl: String(b.reply?.pl ?? ""), ru: String(b.reply?.ru ?? "") },
    correction: b.correction && typeof b.correction.fixed === "string" && b.correction.fixed ? { fixed: b.correction.fixed, explain: String(b.correction.explain ?? "") } : null,
    goalsDone: Array.isArray(b.goalsDone) ? b.goalsDone.filter((i) => Number.isInteger(i) && i >= 0) : [],
    chips: strs(b.chips, 3),
    finished: Boolean(b.finished),
  };
  if (b.summary) {
    out.summary = { stars: Math.max(1, Math.min(3, Number(b.summary.stars) || 1)), praise: String(b.summary.praise ?? ""), tips: strs(b.summary.tips, 3) };
  }
  return out;
}

/** POST /api/ai/helper -> { available, reason?, answer: markdown (ru) } */
export async function aiHelper({ lessonId, context, question, history = [] }) {
  const r = await aiPost("/api/ai/helper", { lessonId, context, question, history });
  if (!r.ok) return r.out;
  return { available: true, answer: String(r.body.answer ?? "") };
}

// ---- accounts and progress sync -----------------------------------------------------------
// The session lives in an HttpOnly cookie set by the server; the client never sees a token.

export const authMe = () => getJson("/api/auth/me");
export const authProviders = () => getJson("/api/auth/providers");
export const authRegister = ({ email, password, lang }) => postJson("/api/auth/register", { email, password, lang });
export const authResend = ({ email }) => postJson("/api/auth/resend-confirmation", { email });
export const authConfirm = ({ token }) => postJson("/api/auth/confirm", { token });
export const authLogin = ({ email, password }) => postJson("/api/auth/login", { email, password });
export const authForgot = ({ email, lang }) => postJson("/api/auth/forgot", { email, lang });
export const authReset = ({ token, password }) => postJson("/api/auth/reset", { token, password });
export const authPing = () => postJson("/api/auth/ping", {});
export const authLogout = () => postJson("/api/auth/logout", {});
export const authUpdate = (patch) => request("/api/auth/me", { method: "PATCH", json: patch });

export const getRemoteProgress = () => getJson("/api/progress");
export const putRemoteProgress = (data, baseUpdatedAt) => request("/api/progress", { method: "PUT", json: { data, baseUpdatedAt } });
