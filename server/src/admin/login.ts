// Задать вход в админку с сервера: создать аккаунт (или обновить существующий), выставить пароль,
// подтвердить почту и выдать роль. Используется скриптом deploy/set-admin-login.sh.
import { randomUUID } from "node:crypto";
import type { Db } from "../db.ts";
import { hashPassword, isWeakPassword } from "../auth/password.ts";
import { normalizeEmail } from "../auth/routes.ts";
import { grantFromConsole, audit } from "./routes.ts";
import type { Role } from "./roles.ts";

export type SetLoginResult = { ok: true; created: boolean } | { ok: false; error: "bad_email" | "weak_password" };

export async function setAdminLogin(db: Db, rawEmail: string, password: string, role: Role, now = Date.now()): Promise<SetLoginResult> {
  const email = normalizeEmail(rawEmail);
  if (!email) return { ok: false, error: "bad_email" };
  if (isWeakPassword(password, email)) return { ok: false, error: "weak_password" };
  const hash = await hashPassword(password);
  const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email) as { id: string } | undefined;
  let id: string;
  if (existing) {
    id = existing.id;
    db.prepare(
      "UPDATE users SET password_hash = ?, email_confirmed_at = COALESCE(email_confirmed_at, ?), failed_logins = 0, locked_until = NULL WHERE id = ?",
    ).run(hash, now, id);
    db.prepare("DELETE FROM sessions WHERE user_id = ?").run(id); // старый пароль больше не даёт сессий
  } else {
    id = randomUUID();
    db.prepare("INSERT INTO users (id, email, password_hash, lang, email_confirmed_at, created_at) VALUES (?, ?, ?, 'ru', ?, ?)").run(id, email, hash, now, now);
  }
  audit(db, null, "password_set", id, { email, via: "console" }, now);
  grantFromConsole(db, email, role, now);
  return { ok: true, created: !existing };
}
