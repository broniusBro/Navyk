// API аккаунтов и синхронизации прогресса (контракт — docs/adr/0003-accounts-sqlite.md).
// Без перечисления аккаунтов: регистрация, повторная отправка и «забыл пароль» отвечают одинаково.
import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Db } from "../db.ts";
import { send, readJsonBody, BodyError, clientIp, log, publicOrigin } from "../httputil.ts";
import { WindowLimiter } from "../limits.ts";
import { queueEmail, hashAddress } from "../email/send.ts";
import type { EmailLang } from "../email/templates.ts";
import { hashPassword, verifyPassword, dummyVerify, isWeakPassword } from "./password.ts";
import {
  createSession,
  readSession,
  clearSessionCookie,
  publicUser,
  sha256,
  newSecret,
  SECRET_RE,
  type UserRow,
} from "./sessions.ts";

const LANGS = new Set(["ru", "uk", "en", "pl"]);
const DEFAULT_LANG: EmailLang = "ru"; // исходный язык курса
const EMAIL_RE = /^[^\s@<>()",;:\\[\]]{1,64}@[^\s@<>()",;:\\[\]]+\.[^\s@<>()",;:\\[\]]{2,}$/;

export const CONFIRM_TTL_MS = 24 * 3600_000;
export const RESET_TTL_MS = 3600_000;
export const MAX_FAILED_LOGINS = 5;
export const LOCK_MS = 15 * 60_000;
export const PROGRESS_MAX_BYTES = 256 * 1024;
const AUTH_BODY_LIMIT = 8 * 1024;

export interface AuthOptions {
  db: Db | null;
  authPerMinutePerIp?: number;
  emailsPerHourPerAddress?: number;
  now?: () => number;
}

export function normalizeEmail(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const e = v.trim().toLowerCase();
  if (e.length > 254 || !EMAIL_RE.test(e)) return null;
  return e;
}

const pickLang = (v: unknown, fallback: string = DEFAULT_LANG): EmailLang =>
  (typeof v === "string" && LANGS.has(v) ? v : LANGS.has(fallback) ? fallback : DEFAULT_LANG) as EmailLang;

export function createAuth(opts: AuthOptions) {
  const db = opts.db;
  const now = opts.now ?? Date.now;
  const ipLimiter = new WindowLimiter(opts.authPerMinutePerIp ?? Number(process.env.AUTH_PER_MINUTE_PER_IP ?? 20), 60_000);
  const emailLimiter = new WindowLimiter(opts.emailsPerHourPerAddress ?? Number(process.env.EMAILS_PER_HOUR_PER_ADDRESS ?? 3), 3600_000);

  const ghostFailures = new Map<string, { count: number; lockedUntil: number }>();
  const userByEmail = (email: string) => db!.prepare("SELECT * FROM users WHERE email = ?").get(email) as UserRow | undefined;
  const userById = (id: string) => db!.prepare("SELECT * FROM users WHERE id = ?").get(id) as UserRow | undefined;

  /**
   * Новый одноразовый токен; в базе — только SHA-256.
   * reset: прежние неиспользованные ссылки сброса гасятся.
   * confirm: ссылка несёт хеш пароля своей регистрации — подтверждение включает именно этот пароль,
   * так что чужая повторная регистрация того же адреса не может подменить пароль владельца.
   */
  function issueToken(userId: string, kind: "confirm" | "reset", passwordHash: string | null = null): string {
    const token = newSecret();
    const t = now();
    if (kind === "reset") db!.prepare("UPDATE tokens SET used_at = ? WHERE user_id = ? AND kind = 'reset' AND used_at IS NULL").run(t, userId);
    db!.prepare("INSERT INTO tokens (hash, user_id, kind, expires_at, used_at, password_hash) VALUES (?, ?, ?, ?, NULL, ?)").run(
      sha256(token),
      userId,
      kind,
      t + (kind === "confirm" ? CONFIRM_TTL_MS : RESET_TTL_MS),
      passwordHash,
    );
    return token;
  }

  /** Проверяет токен (не гасит). */
  function findToken(token: unknown, kind: "confirm" | "reset"): { hash: string; user: UserRow; passwordHash: string | null } | null {
    if (typeof token !== "string" || !SECRET_RE.test(token)) return null;
    const hash = sha256(token);
    const row = db!.prepare("SELECT user_id, expires_at, used_at, password_hash FROM tokens WHERE hash = ? AND kind = ?").get(hash, kind) as
      | { user_id: string; expires_at: number; used_at: number | null; password_hash: string | null }
      | undefined;
    if (!row || row.used_at !== null || row.expires_at <= now()) return null;
    const user = userById(row.user_id);
    return user ? { hash, user, passwordHash: row.password_hash } : null;
  }

  const link = (kind: "confirm" | "reset", token: string) => `${publicOrigin()}/#/${kind}/${token}`;

  function sendConfirm(u: UserRow, lang: EmailLang, passwordHash: string | null = null) {
    queueEmail(db, { userId: u.id, to: u.email, kind: "confirm", lang, link: link("confirm", issueToken(u.id, "confirm", passwordHash)) });
  }
  function sendReset(u: UserRow, lang: EmailLang, kind: "reset" | "already_registered") {
    queueEmail(db, { userId: u.id, to: u.email, kind, lang, link: link("reset", issueToken(u.id, "reset")) });
  }

  /** Лимит писем на один адрес. Считается для любого адреса, есть ли аккаунт или нет. */
  function emailLimited(res: ServerResponse, email: string): boolean {
    const wait = emailLimiter.hit(hashAddress(email), now());
    if (!wait) return false;
    send(res, 429, { error: "rate_limited", retryAfter: wait }, { "retry-after": String(wait) });
    return true;
  }

  function loggedIn(res: ServerResponse, status: number, u: UserRow) {
    send(res, status, { user: publicUser(u) }, { "set-cookie": createSession(db!, u.id, now()) });
  }

  // ---------------- handlers ----------------

  async function register(body: any, res: ServerResponse) {
    const email = normalizeEmail(body.email);
    if (!email) return send(res, 400, { error: "invalid_email" });
    if (isWeakPassword(body.password, email)) return send(res, 400, { error: "weak_password" });
    if (emailLimited(res, email)) return;
    const lang = pickLang(body.lang);
    // Хешируем всегда: время ответа не должно зависеть от того, есть ли аккаунт.
    const hash = await hashPassword(body.password);
    const existing = userByEmail(email);
    if (!existing) {
      const u: UserRow = {
        id: randomUUID(),
        email,
        password_hash: hash,
        lang,
        email_confirmed_at: null,
        created_at: now(),
        failed_logins: 0,
        locked_until: null,
      };
      try {
        db!.prepare("INSERT INTO users (id, email, password_hash, lang, email_confirmed_at, created_at) VALUES (?, ?, ?, ?, NULL, ?)").run(
          u.id,
          u.email,
          u.password_hash,
          u.lang,
          u.created_at,
        );
        sendConfirm(u, lang);
      } catch {
        // гонка двух одинаковых регистраций: аккаунт уже создан параллельным запросом
      }
    } else if (existing.email_confirmed_at) {
      sendReset(existing, lang, "already_registered");
    } else {
      // Аккаунт не подтверждён: пароль в users не меняем, новая ссылка несёт пароль этой регистрации
      // и включит его только при переходе по ней (защита от подмены пароля и «предзахвата» адреса).
      sendConfirm(existing, lang, hash);
    }
    return send(res, 202, { ok: true });
  }

  function confirm(body: any, res: ServerResponse) {
    const t = findToken(body.token, "confirm");
    if (!t) return send(res, 400, { error: "invalid_token" });
    const ts = now();
    db!.exec("BEGIN IMMEDIATE");
    try {
      db!.prepare("UPDATE tokens SET used_at = ? WHERE user_id = ? AND kind = 'confirm' AND used_at IS NULL").run(ts, t.user.id);
      db!.prepare(
        "UPDATE users SET email_confirmed_at = COALESCE(email_confirmed_at, ?), password_hash = COALESCE(?, password_hash), failed_logins = 0, locked_until = NULL WHERE id = ?",
      ).run(ts, t.passwordHash, t.user.id);
      if (t.passwordHash) db!.prepare("DELETE FROM sessions WHERE user_id = ?").run(t.user.id);
      db!.exec("COMMIT");
    } catch (e) {
      db!.exec("ROLLBACK");
      throw e;
    }
    log({ event: "auth_confirmed" });
    return loggedIn(res, 200, userById(t.user.id)!);
  }

  function resendConfirmation(body: any, res: ServerResponse) {
    const email = normalizeEmail(body.email);
    if (!email) return send(res, 202, { ok: true });
    if (emailLimited(res, email)) return;
    const u = userByEmail(email);
    if (u && !u.email_confirmed_at) sendConfirm(u, pickLang(body.lang, u.lang));
    return send(res, 202, { ok: true });
  }

  async function login(body: any, res: ServerResponse) {
    const email = normalizeEmail(body.email);
    const password = typeof body.password === "string" && body.password.length <= 1024 ? body.password : "";
    const u = email ? userByEmail(email) : undefined;
    const ts = now();
    if (!u) {
      // Для неизвестного адреса ведём ту же блокировку в памяти: иначе 429 после 5 ошибок выдавал бы, что аккаунт есть.
      const key = email ?? "";
      const g = ghostFailures.get(key);
      if (g?.lockedUntil && g.lockedUntil > ts) {
        const retryAfter = Math.ceil((g.lockedUntil - ts) / 1000);
        return send(res, 429, { error: "locked", retryAfter }, { "retry-after": String(retryAfter) });
      }
      await dummyVerify(password);
      if (email) {
        if (ghostFailures.size > 50_000) ghostFailures.clear();
        const count = (g && !g.lockedUntil ? g.count : 0) + 1;
        ghostFailures.set(key, count >= MAX_FAILED_LOGINS ? { count: 0, lockedUntil: ts + LOCK_MS } : { count, lockedUntil: 0 });
      }
      return send(res, 401, { error: "invalid_credentials" });
    }
    if (u.locked_until && u.locked_until > ts) {
      const retryAfter = Math.ceil((u.locked_until - ts) / 1000);
      return send(res, 429, { error: "locked", retryAfter }, { "retry-after": String(retryAfter) });
    }
    if (!(await verifyPassword(password, u.password_hash))) {
      const failed = u.failed_logins + 1;
      if (failed >= MAX_FAILED_LOGINS) {
        db!.prepare("UPDATE users SET failed_logins = 0, locked_until = ? WHERE id = ?").run(ts + LOCK_MS, u.id);
        log({ event: "auth_locked" });
      } else {
        db!.prepare("UPDATE users SET failed_logins = ?, locked_until = NULL WHERE id = ?").run(failed, u.id);
      }
      return send(res, 401, { error: "invalid_credentials" });
    }
    if (!u.email_confirmed_at) return send(res, 403, { error: "email_not_confirmed" });
    db!.prepare("UPDATE users SET failed_logins = 0, locked_until = NULL WHERE id = ?").run(u.id);
    return loggedIn(res, 200, u);
  }

  function forgot(body: any, res: ServerResponse) {
    const email = normalizeEmail(body.email);
    if (!email) return send(res, 202, { ok: true });
    if (emailLimited(res, email)) return;
    const u = userByEmail(email);
    if (u) sendReset(u, pickLang(body.lang, u.lang), "reset");
    return send(res, 202, { ok: true });
  }

  async function reset(body: any, res: ServerResponse) {
    const t = findToken(body.token, "reset");
    if (!t) return send(res, 400, { error: "invalid_token" });
    if (isWeakPassword(body.password, t.user.email)) return send(res, 400, { error: "weak_password" });
    const hash = await hashPassword(body.password);
    // Повторная проверка после await: токен мог быть использован параллельным запросом.
    if (!findToken(body.token, "reset")) return send(res, 400, { error: "invalid_token" });
    const ts = now();
    db!.exec("BEGIN IMMEDIATE");
    try {
      db!.prepare("UPDATE tokens SET used_at = ? WHERE user_id = ? AND used_at IS NULL").run(ts, t.user.id);
      db!.prepare(
        "UPDATE users SET password_hash = ?, email_confirmed_at = COALESCE(email_confirmed_at, ?), failed_logins = 0, locked_until = NULL WHERE id = ?",
      ).run(hash, ts, t.user.id);
      db!.prepare("DELETE FROM sessions WHERE user_id = ?").run(t.user.id);
      db!.exec("COMMIT");
    } catch (e) {
      db!.exec("ROLLBACK");
      throw e;
    }
    log({ event: "auth_password_reset" });
    return loggedIn(res, 200, userById(t.user.id)!);
  }

  function logout(req: IncomingMessage, res: ServerResponse) {
    const s = readSession(db, req, now());
    if (s) db!.prepare("DELETE FROM sessions WHERE id_hash = ?").run(s.idHash);
    return send(res, 204, null, { "set-cookie": clearSessionCookie() });
  }

  function withCookie(s: { refreshCookie: string | null }): Record<string, string> {
    return s.refreshCookie ? { "set-cookie": s.refreshCookie } : {};
  }

  function me(req: IncomingMessage, res: ServerResponse) {
    const s = readSession(db, req, now());
    if (!s) return send(res, 401, { error: "unauthorized" });
    return send(res, 200, { user: publicUser(s.user) }, withCookie(s));
  }

  function patchMe(req: IncomingMessage, body: any, res: ServerResponse) {
    const s = readSession(db, req, now());
    if (!s) return send(res, 401, { error: "unauthorized" });
    if (body.lang !== undefined) {
      if (typeof body.lang !== "string" || !LANGS.has(body.lang)) return send(res, 400, { error: "bad_request" });
      db!.prepare("UPDATE users SET lang = ? WHERE id = ?").run(body.lang, s.user.id);
    }
    return send(res, 200, { user: publicUser(userById(s.user.id)!) }, withCookie(s));
  }

  function getProgress(req: IncomingMessage, res: ServerResponse) {
    const s = readSession(db, req, now());
    if (!s) return send(res, 401, { error: "unauthorized" });
    const row = db!.prepare("SELECT data, updated_at FROM progress WHERE user_id = ?").get(s.user.id) as
      | { data: string; updated_at: number }
      | undefined;
    return send(
      res,
      200,
      row ? { data: JSON.parse(row.data), updatedAt: new Date(row.updated_at).toISOString() } : { data: null, updatedAt: null },
      { ...withCookie(s), "cache-control": "no-store" },
    );
  }

  function putProgress(req: IncomingMessage, body: any, res: ServerResponse) {
    const s = readSession(db, req, now());
    if (!s) return send(res, 401, { error: "unauthorized" });
    const data = body?.data;
    if (data === null || typeof data !== "object") return send(res, 400, { error: "bad_request" });
    const json = JSON.stringify(data);
    if (Buffer.byteLength(json) > PROGRESS_MAX_BYTES) return send(res, 413, { error: "too_large" });
    // Сервер хранит блоб целиком, слияние делает клиент. updatedAt строго растёт.
    const prev = db!.prepare("SELECT updated_at FROM progress WHERE user_id = ?").get(s.user.id) as { updated_at: number } | undefined;
    const ts = Math.max(now(), (prev?.updated_at ?? 0) + 1);
    db!.prepare(
      "INSERT INTO progress (user_id, data, updated_at) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at",
    ).run(s.user.id, json, ts);
    if (prev && typeof body.baseUpdatedAt === "string" && Date.parse(body.baseUpdatedAt) !== prev.updated_at) {
      log({ event: "progress_base_mismatch" });
    }
    return send(res, 200, { data, updatedAt: new Date(ts).toISOString() }, withCookie(s));
  }

  const POST_ROUTES: Record<string, (body: any, res: ServerResponse) => unknown> = {
    "/api/auth/register": register,
    "/api/auth/confirm": confirm,
    "/api/auth/resend-confirmation": resendConfirmation,
    "/api/auth/login": login,
    "/api/auth/forgot": forgot,
    "/api/auth/reset": reset,
  };

  /** Обрабатывает /api/auth/* и /api/progress. Возвращает false, если путь не наш. */
  async function handle(req: IncomingMessage, res: ServerResponse, path: string): Promise<boolean> {
    const method = req.method ?? "GET";
    const isAuth = path.startsWith("/api/auth/");
    if (!isAuth && path !== "/api/progress") return false;
    if (!db) {
      send(res, 503, { error: "unavailable" });
      return true;
    }
    if (isAuth && method === "POST" && path !== "/api/auth/logout") {
      const wait = ipLimiter.hit(clientIp(req), now());
      if (wait) {
        send(res, 429, { error: "rate_limited", retryAfter: wait }, { "retry-after": String(wait) });
        return true;
      }
    }
    const needsBody = (method === "POST" && POST_ROUTES[path]) || method === "PATCH" || (method === "PUT" && path === "/api/progress");
    let body: any = {};
    if (needsBody) {
      try {
        body = await readJsonBody(req, path === "/api/progress" ? PROGRESS_MAX_BYTES + 4096 : AUTH_BODY_LIMIT);
      } catch (e) {
        if (e instanceof BodyError && e.code === "body_too_large") send(res, 413, { error: "too_large" });
        else send(res, 400, { error: "bad_request" });
        return true;
      }
      if (body === null || typeof body !== "object" || Array.isArray(body)) {
        send(res, 400, { error: "bad_request" });
        return true;
      }
    }
    if (method === "POST" && POST_ROUTES[path]) await POST_ROUTES[path](body, res);
    else if (method === "POST" && path === "/api/auth/logout") logout(req, res);
    else if (method === "GET" && path === "/api/auth/me") me(req, res);
    else if (method === "PATCH" && path === "/api/auth/me") patchMe(req, body, res);
    else if (method === "GET" && path === "/api/progress") getProgress(req, res);
    else if (method === "PUT" && path === "/api/progress") putProgress(req, body, res);
    else if (["/api/auth/me", "/api/progress", "/api/auth/logout", ...Object.keys(POST_ROUTES)].includes(path))
      send(res, 405, { error: "method_not_allowed" });
    else send(res, 404, { error: "not_found" });
    return true;
  }

  return { handle, userIdFor: (req: IncomingMessage) => readSession(db, req, now())?.user.id ?? null };
}
