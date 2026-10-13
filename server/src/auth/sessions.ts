// Сессии: случайные 32 байта в cookie, в базе — только SHA-256. Скользящий срок 30 дней.
import { randomBytes, createHash } from "node:crypto";
import type { IncomingMessage } from "node:http";
import type { Db } from "../db.ts";
import { parseCookies } from "../httputil.ts";

export const SESSION_TTL_MS = 30 * 24 * 3600_000;
/** Продлеваем сессию не чаще раза в час, чтобы не писать в базу на каждый запрос. */
const TOUCH_EVERY_MS = 3600_000;

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
export const newSecret = () => randomBytes(32).toString("base64url");
export const SECRET_RE = /^[A-Za-z0-9_-]{32,128}$/;

export function cookieSecure(): boolean {
  return process.env.COOKIE_SECURE !== "false";
}

export function cookieName(): string {
  return cookieSecure() ? "__Host-navyk_session" : "navyk_session";
}

export function sessionCookie(value: string, maxAgeSec = SESSION_TTL_MS / 1000): string {
  return `${cookieName()}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}${cookieSecure() ? "; Secure" : ""}`;
}

export const clearSessionCookie = () => sessionCookie("", 0);

export interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  lang: string;
  email_confirmed_at: number | null;
  created_at: number;
  failed_logins: number;
  locked_until: number | null;
}

export function publicUser(u: UserRow) {
  return { id: u.id, email: u.email, lang: u.lang, createdAt: new Date(u.created_at).toISOString() };
}

/** Создаёт сессию и возвращает значение для заголовка Set-Cookie. */
export function createSession(db: Db, userId: string, now = Date.now()): string {
  const secret = newSecret();
  db.prepare("INSERT INTO sessions (id_hash, user_id, created_at, expires_at, last_seen_at) VALUES (?, ?, ?, ?, ?)").run(
    sha256(secret),
    userId,
    now,
    now + SESSION_TTL_MS,
    now,
  );
  return sessionCookie(secret);
}

export interface SessionInfo {
  user: UserRow;
  idHash: string;
  /** Set-Cookie с продлённым сроком, если сессию только что продлили. */
  refreshCookie: string | null;
}

export function readSession(db: Db | null, req: IncomingMessage, now = Date.now()): SessionInfo | null {
  if (!db) return null;
  const secret = parseCookies(req)[cookieName()];
  if (!secret || !SECRET_RE.test(secret)) return null;
  const idHash = sha256(secret);
  const row = db
    .prepare(
      `SELECT s.expires_at AS s_expires, s.last_seen_at AS s_seen, u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id_hash = ?`,
    )
    .get(idHash) as (UserRow & { s_expires: number; s_seen: number }) | undefined;
  if (!row) return null;
  if (row.s_expires <= now) {
    db.prepare("DELETE FROM sessions WHERE id_hash = ?").run(idHash);
    return null;
  }
  let refreshCookie: string | null = null;
  if (now - row.s_seen >= TOUCH_EVERY_MS) {
    db.prepare("UPDATE sessions SET last_seen_at = ?, expires_at = ? WHERE id_hash = ?").run(now, now + SESSION_TTL_MS, idHash);
    refreshCookie = sessionCookie(secret);
  }
  const { s_expires: _e, s_seen: _s, ...user } = row;
  return { user: user as UserRow, idHash, refreshCookie };
}
