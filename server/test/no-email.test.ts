// Аккаунты без настроенной почты (EMAIL_PROVIDER=log или нет ключа): письма не уходят,
// поэтому регистрация сразу подтверждает аккаунт и входит, а «забыли пароль» честно недоступно.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ORIGIN = "http://localhost:8080";
const dataDir = mkdtempSync(join(tmpdir(), "brolingvo-nomail-"));
process.env.DATA_DIR = dataDir;
process.env.PUBLIC_ORIGIN = ORIGIN;
process.env.EMAIL_PROVIDER = "log";
delete process.env.EMAIL_API_KEY;
process.env.COOKIE_SECURE = "false";

const { createApp } = await import("../src/http.ts");
const { openDb } = await import("../src/db.ts");
const { setEmailCapture, flushEmails, emailConfigured } = await import("../src/email/send.ts");
const { hashPassword } = await import("../src/auth/password.ts");

const sent: unknown[] = [];
setEmailCapture((m) => sent.push(m));
let clock = Date.parse("2026-11-04T10:00:00Z");
const db = openDb(join(dataDir, "brolingvo.sqlite"));
const server: Server = createApp({ db, now: () => clock, authPerMinutePerIp: 1000, emailsPerHourPerAddress: 1000 });
let base = "";
before(async () => {
  await new Promise<void>((r) => server.listen(0, r));
  base = `http://localhost:${(server.address() as AddressInfo).port}`;
});
after(() => {
  server.close();
  setEmailCapture(null);
  db.close();
  rmSync(dataDir, { recursive: true, force: true });
});

async function call(method: string, path: string, body?: unknown, opts: { cookie?: string | null; origin?: string | null } = {}) {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["content-type"] = "application/json";
  const origin = opts.origin === undefined ? ORIGIN : opts.origin;
  if (origin) headers.origin = origin;
  if (opts.cookie) headers.cookie = opts.cookie;
  const r = await fetch(base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text();
  const setCookie = r.headers.get("set-cookie");
  return { status: r.status, body: text ? JSON.parse(text) : null, setCookie, cookie: setCookie ? setCookie.split(";")[0] : null };
}
const PASSWORD = "correct horse battery";

async function withEnv(env: Record<string, string | undefined>, fn: () => void) {
  const old = Object.fromEntries(Object.keys(env).map((k) => [k, process.env[k]]));
  for (const [k, v] of Object.entries(env)) v === undefined ? delete process.env[k] : (process.env[k] = v);
  try {
    fn();
  } finally {
    for (const [k, v] of Object.entries(old)) v === undefined ? delete process.env[k] : (process.env[k] = v);
  }
}

test("email is configured only with brevo/resend and a key", async () => {
  await withEnv({ EMAIL_PROVIDER: "log", EMAIL_API_KEY: "k" }, () => assert.equal(emailConfigured(), false));
  await withEnv({ EMAIL_PROVIDER: undefined, EMAIL_API_KEY: "k" }, () => assert.equal(emailConfigured(), false));
  await withEnv({ EMAIL_PROVIDER: "smtp", EMAIL_API_KEY: "k" }, () => assert.equal(emailConfigured(), false));
  await withEnv({ EMAIL_PROVIDER: "brevo", EMAIL_API_KEY: undefined }, () => assert.equal(emailConfigured(), false));
  await withEnv({ EMAIL_PROVIDER: "Brevo", EMAIL_API_KEY: "k" }, () => assert.equal(emailConfigured(), true));
  await withEnv({ EMAIL_PROVIDER: "resend", EMAIL_API_KEY: "k" }, () => assert.equal(emailConfigured(), true));
});

test("providers report email: false", async () => {
  assert.deepEqual((await call("GET", "/api/auth/providers")).body, { google: false, email: false });
});

test("register without email: 201, confirmed account, session cookie, /me works at once", async () => {
  const r = await call("POST", "/api/auth/register", { email: "Ola@Example.com", password: PASSWORD, lang: "ru" });
  assert.equal(r.status, 201);
  assert.equal(r.body.ok, true);
  assert.equal(r.body.autoConfirmed, true);
  assert.equal(r.body.user.email, "ola@example.com");
  assert.equal(r.body.user.lang, "ru");
  assert.match(r.setCookie!, /^brolingvo_session=[A-Za-z0-9_-]{43}; Path=\/; HttpOnly; SameSite=Lax; Max-Age=2592000$/);
  const me = await call("GET", "/api/auth/me", undefined, { cookie: r.cookie });
  assert.equal(me.status, 200);
  assert.deepEqual(me.body.user, r.body.user);
  assert.ok((db.prepare("SELECT email_confirmed_at FROM users WHERE email = 'ola@example.com'").get() as any).email_confirmed_at);
  // login with the same credentials works; progress sync works
  assert.equal((await call("POST", "/api/auth/login", { email: "ola@example.com", password: PASSWORD })).status, 200);
  assert.equal((await call("PUT", "/api/progress", { data: { version: 1, xp: 1, days: [], lessons: {}, repeat: {} } }, { cookie: r.cookie })).status, 200);
  await flushEmails();
  assert.equal(sent.length, 0, "no email is even attempted");
});

test("register without email: taken address → 409 email_taken, no session, the owner's password is untouched", async () => {
  await call("POST", "/api/auth/register", { email: "taken@example.com", password: PASSWORD, lang: "ru" });
  for (const password of [PASSWORD, "attacker password 1"]) {
    const again = await call("POST", "/api/auth/register", { email: "TAKEN@example.com", password, lang: "ru" });
    assert.deepEqual([again.status, again.body, again.setCookie], [409, { error: "email_taken" }, null]);
  }
  assert.equal((await call("POST", "/api/auth/login", { email: "taken@example.com", password: PASSWORD })).status, 200);
  assert.equal((await call("POST", "/api/auth/login", { email: "taken@example.com", password: "attacker password 1" })).status, 401);
  // validation still comes first
  assert.deepEqual((await call("POST", "/api/auth/register", { email: "nope", password: PASSWORD })).body, { error: "invalid_email" });
  assert.deepEqual((await call("POST", "/api/auth/register", { email: "new@example.com", password: "short" })).body, { error: "weak_password" });
  assert.equal((await call("POST", "/api/auth/register", { email: "csrf@example.com", password: PASSWORD }, { origin: null })).status, 403);
});

test("unconfirmed account from the email era: same password confirms it, another password → 409 and counts as a failure", async () => {
  const id = "11111111-2222-3333-4444-555555555555";
  db.prepare("INSERT INTO users (id, email, password_hash, lang, email_confirmed_at, created_at) VALUES (?, 'old@example.com', ?, 'ru', NULL, ?)").run(id, await hashPassword(PASSWORD), clock);
  const wrong = await call("POST", "/api/auth/register", { email: "old@example.com", password: "a different password", lang: "ru" });
  assert.deepEqual([wrong.status, wrong.body, wrong.setCookie], [409, { error: "email_taken" }, null]);
  assert.equal((db.prepare("SELECT failed_logins FROM users WHERE id = ?").get(id) as any).failed_logins, 1);
  assert.equal((db.prepare("SELECT email_confirmed_at FROM users WHERE id = ?").get(id) as any).email_confirmed_at, null);
  const ok = await call("POST", "/api/auth/register", { email: "old@example.com", password: PASSWORD, lang: "ru" });
  assert.equal(ok.status, 201);
  assert.equal(ok.body.user.id, id);
  assert.equal((await call("GET", "/api/auth/me", undefined, { cookie: ok.cookie })).status, 200);
});

test("login of an unconfirmed account with the right password confirms it (no email could ever arrive)", async () => {
  const id = "22222222-2222-3333-4444-555555555555";
  db.prepare("INSERT INTO users (id, email, password_hash, lang, email_confirmed_at, created_at) VALUES (?, 'late@example.com', ?, 'ru', NULL, ?)").run(id, await hashPassword(PASSWORD), clock);
  assert.equal((await call("POST", "/api/auth/login", { email: "late@example.com", password: "wrong password!" })).status, 401);
  const r = await call("POST", "/api/auth/login", { email: "late@example.com", password: PASSWORD });
  assert.equal(r.status, 200);
  assert.ok((db.prepare("SELECT email_confirmed_at FROM users WHERE id = ?").get(id) as any).email_confirmed_at);
});

test("forgot and resend without email → 503 email_unavailable", async () => {
  for (const path of ["/api/auth/forgot", "/api/auth/resend-confirmation"]) {
    for (const email of ["ola@example.com", "unknown@example.com"]) {
      const r = await call("POST", path, { email, lang: "ru" });
      assert.deepEqual([r.status, r.body], [503, { error: "email_unavailable" }], `${path} ${email}`);
    }
  }
  await flushEmails();
  assert.equal(sent.length, 0);
});
