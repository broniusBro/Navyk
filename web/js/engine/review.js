// Interpreting the /api/review response into a view model. Pure.

export const CRITERIA = ["R1", "R2", "R3", "R4", "R5", "R6", "R7", "R8", "R9"];
export const VERDICTS = ["draft", "working", "strong", "off_task"];
export const MAX_PROMPT_CHARS = 4000;

/** Client-side validation before sending. Returns null or an error code (same codes as the API). */
export function validatePrompt(text, minChars = 5) {
  const len = String(text ?? "").trim().length;
  if (len < Math.max(1, minChars)) return "input_too_short";
  if (len > MAX_PROMPT_CHARS) return "input_too_long";
  return null;
}

/**
 * Map a transport result { status, body } (status 0 = network error) to one of:
 * { kind: "review", ... } | { kind: "limit", resetAt } | { kind: "unavailable" } | { kind: "invalid", code }
 */
export function interpretReview(res) {
  const status = res?.status ?? 0;
  const body = res?.body ?? null;
  if (status === 200 && body && body.review && typeof body.review === "object") {
    return { kind: "review", ...normalizeReview(body) };
  }
  if (status === 429) return { kind: "limit", resetAt: body?.resetAt ?? null };
  if (status === 400 && (body?.error === "input_too_short" || body?.error === "input_too_long")) {
    return { kind: "invalid", code: body.error };
  }
  return { kind: "unavailable" };
}

const strList = (a) => (Array.isArray(a) ? a.filter((s) => typeof s === "string" && s.trim()).slice(0, 3) : []);

export function normalizeReview(body) {
  const r = body.review;
  const privacy = { found: Boolean(r.privacy_issue?.found), message: String(r.privacy_issue?.message ?? "") };
  const verdict = VERDICTS.includes(body.verdict) ? body.verdict : r.off_task ? "off_task" : "draft";
  const criteria = (Array.isArray(r.criteria) ? r.criteria : [])
    .filter((c) => CRITERIA.includes(c?.id) && c.applicable !== false)
    .map((c) => ({ id: c.id, score: [0, 1, 2].includes(c.score) ? c.score : 0, comment: String(c.comment ?? "") }));
  return {
    score: Number.isFinite(body.score) ? body.score : null,
    verdict,
    // privacy issue always blocks passing, whatever the server said
    passed: Boolean(body.passed) && !privacy.found && verdict !== "off_task",
    privacy,
    offTask: Boolean(r.off_task) || verdict === "off_task",
    criteria,
    strengths: strList(r.strengths),
    gaps: strList(r.gaps),
    improved: String(r.improved_prompt ?? "").trim(),
    remaining: Number.isFinite(body.remaining) ? body.remaining : null,
  };
}

/** Score 0..2 to a level name used for styling and i18n. */
export const criterionLevel = (score) => (score >= 2 ? "good" : score === 1 ? "partial" : "missing");

/** Self-check (fallback) state: the exercise counts as done once the learner has looked at the list. */
export function selfCheckSummary(checked, total) {
  const n = checked.filter(Boolean).length;
  return { checked: n, total, all: n === total };
}
