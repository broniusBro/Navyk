// Account rules and API response interpretation. Pure: no network, no DOM.

export const MIN_PASSWORD = 8;

export const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(s ?? "").trim());
export const passwordLongEnough = (p) => String(p ?? "").length >= MIN_PASSWORD;

/** Client-side checks before sending. Returns { email?, password?, confirm? } with error codes. */
export function validateCredentials({ email, password, confirm } = {}, { checkLength = true, checkConfirm = false, needEmail = true } = {}) {
  const errors = {};
  if (needEmail) {
    if (!String(email ?? "").trim()) errors.email = "email_required";
    else if (!isEmail(email)) errors.email = "invalid_email";
  }
  if (password !== undefined) {
    if (!String(password ?? "")) errors.password = "password_required";
    else if (checkLength && !passwordLongEnough(password)) errors.password = "weak_password";
  }
  if (checkConfirm && !errors.password && confirm !== password) errors.confirm = "password_mismatch";
  return errors;
}

/** Keep only the fields the client uses. Returns null for anything that is not a user. */
export function normalizeUser(u) {
  if (!u || typeof u !== "object" || typeof u.email !== "string") return null;
  return { id: String(u.id ?? u.email), email: u.email, lang: typeof u.lang === "string" ? u.lang : null };
}

const FIELD_ERRORS = { invalid_email: "email", weak_password: "password" };

/**
 * Map a transport result { status, body } (status 0 = network error) of any /api/auth call to
 * { ok: true, user } | { ok: false, code, field?, retryAfter? }.
 * okStatus: the success status of this endpoint (200 or 202).
 */
export function interpretAuth(res, okStatus = 200) {
  const status = res?.status ?? 0;
  const body = res?.body ?? null;
  if (status === okStatus) return { ok: true, user: normalizeUser(body?.user) };
  if (status === 0) return { ok: false, code: "network" };
  const err = typeof body?.error === "string" ? body.error : "";
  if (status === 400) {
    if (err in FIELD_ERRORS) return { ok: false, code: err, field: FIELD_ERRORS[err] };
    if (err === "invalid_token") return { ok: false, code: err };
    return { ok: false, code: "generic" };
  }
  if (status === 401) return { ok: false, code: "invalid_credentials" };
  if (status === 403 && err === "email_not_confirmed") return { ok: false, code: err };
  if (status === 429) {
    const s = Number(body?.retryAfter);
    return { ok: false, code: "locked", retryAfter: Number.isFinite(s) && s > 0 ? s : 60 };
  }
  return { ok: false, code: "generic" };
}

/** Seconds from the API -> whole minutes for the message (at least 1). */
export const retryMinutes = (seconds) => Math.max(1, Math.ceil((Number(seconds) || 0) / 60));

/** Lessons marked free_preview are open without an account; everything else needs one. */
export const canOpenLesson = (lesson, signedIn) => Boolean(signedIn || lesson?.free_preview);

/** Token from #/confirm/<token> or #/reset/<token>. */
export function parseTokenRoute(hash) {
  const m = /^#\/(confirm|reset)\/([\w.~-]{8,512})$/.exec(String(hash ?? ""));
  return m ? { kind: m[1], token: m[2] } : null;
}
