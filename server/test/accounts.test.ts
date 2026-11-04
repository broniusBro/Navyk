// HTTP-тесты аккаунтов: регистрация → подтверждение → вход, блокировка, сброс пароля,
// CSRF, отсутствие перечисления аккаунтов, синхронизация прогресса, лимит ИИ по аккаунту, имя и удаление аккаунта.
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ORIGIN = "http://localhost:8080";
const dataDir = mkdtempSync(join(tmpdir(), "brolingvo-accounts-"));
process.env.DATA_DIR = dataDir;
process.env.PUBLIC_ORIGIN = ORIGIN;
process.env.EMAIL_PROVIDER = "log";
process.env.COOKIE_SECURE = "false";
delete process.env.ANTHROPIC_API_KEY;

const { createApp } = await import("../src/http.ts");
const { openDb } = await import("../src/db.ts");
const { setEmailCapture, flushEmails } = await import("../src/email/send.ts");
const { sha256 } = await import("../src/auth/sessions.ts");
const { hashAddress } = await import("../src/email/send.ts");
type OutgoingEmail = import("../src/email/send.ts").OutgoingEmail;

const sent: OutgoingEmail[] = [];
setEmailCapture((m) => sent.push(m));

let clock = Date.parse("2026-10-13T10:00:00Z");
const db = openDb(join(dataDir, "brolingvo.sqlite"));
const aiCalls: number[] = [];
// Ответ помощника (helper — простой текст): реальных запросов к Claude API нет.
const fakeClaude = (async () => {
  aiCalls.push(1);
  return Response.json({
    stop_reason: "end_turn",
    content: [{ type: "text", text: "*Dziękuję* — спасибо." }],
    usage: { input_tokens: 10, output_tokens: 10 },
  });
}) as typeof fetch;

const server: Server = createApp({
  db,
  now: () => clock,
  aiPerDay: 2,
  ipAiPerDay: 1000,
  authPerMinutePerIp: 1000,
  emailsPerHourPerAddress: 1000,
  aiOptions: { apiKey: "test", fetchImpl: fakeClaude },
});
let base = "";

before(async () => {
  await new Promise<void>((r) => server.listen(0, r));
  base = `http://localhost:${(server.address() as AddressInfo).port}`;
});
after(() => {
  server.close();
  db.close();
  rmSync(dataDir, { recursive: true, force: true });
});
beforeEach(async () => {
  await flushEmails();
  sent.length = 0;
});

type Res = { status: number; body: any; cookie: string | null; setCookie: string | null };

async function call(method: string, path: string, body?: unknown, opts: { cookie?: string | null; origin?: string | null } = {}): Promise<Res> {
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

const tokenFrom = (m: OutgoingEmail) => m.link.split("/").pop()!;
let n = 0;
const freshEmail = () => `Learner${++n}@Example.com`;
const PASSWORD = "correct horse battery";

async function lastMail(): Promise<OutgoingEmail> {
  await flushEmails();
  assert.ok(sent.length > 0, "an email was sent");
  return sent[sent.length - 1];
}

async function registerAndConfirm(email = freshEmail(), password = PASSWORD) {
  assert.equal((await call("POST", "/api/auth/register", { email, password, lang: "uk" })).status, 202);
  const mail = await lastMail();
  const r = await call("POST", "/api/auth/confirm", { token: tokenFrom(mail) });
  assert.equal(r.status, 200);
  return { email, cookie: r.cookie!, user: r.body.user };
}

test("register → confirm (auto-login) → me → login", async () => {
  const email = freshEmail();
  const reg = await call("POST", "/api/auth/register", { email, password: PASSWORD, lang: "uk" });
  assert.deepEqual([reg.status, reg.body], [202, { ok: true }]);
  const mail = await lastMail();
  assert.equal(mail.kind, "confirm");
  assert.equal(mail.to, email.toLowerCase());
  assert.match(mail.link, /^http:\/\/localhost:8080\/#\/confirm\/[A-Za-z0-9_-]{43}$/);
  assert.match(mail.subject, /Підтверди/);
  assert.match(mail.subject, /brolingvo/);
  assert.match(mail.text, /brolingvo — безкоштовний курс польської мови\./);
  assert.doesNotMatch(mail.text, /Navyk|Anthropic/i);
  assert.match(mail.html, /#FFB020/);

  // До подтверждения: верный пароль → 403, неверный → 401
  assert.deepEqual((await call("POST", "/api/auth/login", { email, password: PASSWORD })).body, { error: "email_not_confirmed" });
  assert.equal((await call("POST", "/api/auth/login", { email, password: "wrong password!" })).status, 401);

  const conf = await call("POST", "/api/auth/confirm", { token: tokenFrom(mail) });
  assert.equal(conf.status, 200);
  assert.equal(conf.body.user.email, email.toLowerCase());
  assert.equal(conf.body.user.lang, "uk");
  assert.deepEqual(Object.keys(conf.body.user).sort(), ["createdAt", "email", "id", "lang", "name"]);
  assert.equal(conf.body.user.name, null);
  assert.match(conf.setCookie!, /^brolingvo_session=[A-Za-z0-9_-]{43}; Path=\/; HttpOnly; SameSite=Lax; Max-Age=2592000$/);

  // Токен одноразовый
  assert.deepEqual((await call("POST", "/api/auth/confirm", { token: tokenFrom(mail) })).body, { error: "invalid_token" });

  const me = await call("GET", "/api/auth/me", undefined, { cookie: conf.cookie });
  assert.deepEqual(me.body.user, conf.body.user);

  const login = await call("POST", "/api/auth/login", { email: email.toUpperCase(), password: PASSWORD });
  assert.equal(login.status, 200);
  assert.ok(login.cookie);

  const patched = await call("PATCH", "/api/auth/me", { lang: "en" }, { cookie: login.cookie });
  assert.equal(patched.body.user.lang, "en");
  assert.equal((await call("PATCH", "/api/auth/me", { lang: "de" }, { cookie: login.cookie })).status, 400);

  const out = await call("POST", "/api/auth/logout", undefined, { cookie: login.cookie });
  assert.equal(out.status, 204);
  assert.match(out.setCookie!, /Max-Age=0/);
  assert.equal((await call("GET", "/api/auth/me", undefined, { cookie: login.cookie })).status, 401);
  // другая сессия жива
  assert.equal((await call("GET", "/api/auth/me", undefined, { cookie: conf.cookie })).status, 200);
});

test("nothing secret is stored in plain text", async () => {
  const { email } = await registerAndConfirm();
  const u = db.prepare("SELECT * FROM users WHERE email = ?").get(email.toLowerCase()) as any;
  assert.match(u.password_hash, /^scrypt\$32768\$8\$1\$[A-Za-z0-9_-]{22}\$[A-Za-z0-9_-]{86}$/);
  const mail = sent.find((m) => m.kind === "confirm")!;
  const raw = tokenFrom(mail);
  assert.equal((db.prepare("SELECT count(*) AS c FROM tokens WHERE hash = ?").get(sha256(raw)) as any).c, 1);
  assert.equal((db.prepare("SELECT count(*) AS c FROM tokens WHERE hash = ?").get(raw) as any).c, 0);
  const logRow = db.prepare("SELECT * FROM email_log WHERE user_id = ? ORDER BY id DESC").get(u.id) as any;
  assert.equal(logRow.status, "logged");
  assert.match(logRow.to_hash, /^[0-9a-f]{64}$/);
  assert.ok(!JSON.stringify(logRow).includes("@"));
});

test("validation: invalid email, weak passwords", async () => {
  const bad = (b: object) => call("POST", "/api/auth/register", { lang: "ru", ...b });
  assert.deepEqual((await bad({ email: "nope", password: PASSWORD })).body, { error: "invalid_email" });
  assert.deepEqual((await bad({ email: "a@b.co", password: "short" })).body, { error: "weak_password" });
  assert.deepEqual((await bad({ email: "a@b.co", password: "password123" })).body, { error: "weak_password" });
  assert.deepEqual((await bad({ email: "longname@b.co", password: "longname@b.co" })).body, { error: "weak_password" });
  assert.deepEqual((await bad({ email: "a@b.co", password: "x".repeat(129) })).body, { error: "weak_password" });
  assert.equal((await call("POST", "/api/auth/register", "not json" as any)).status, 400);
});

test("no account enumeration: register, resend, forgot answer the same", async () => {
  const { email } = await registerAndConfirm();
  const unconfirmed = freshEmail();
  await call("POST", "/api/auth/register", { email: unconfirmed, password: PASSWORD, lang: "ru" });
  let unknown = freshEmail();
  await flushEmails();
  sent.length = 0;

  const created: string[] = [];
  for (const path of ["/api/auth/resend-confirmation", "/api/auth/forgot", "/api/auth/register"]) {
    unknown = freshEmail(); // register creates an account, so each path gets its own unknown address
    created.push(unknown.toLowerCase());
    const answers = [];
    for (const e of [email, unconfirmed, unknown]) {
      const r = await call("POST", path, { email: e, password: "another good one", lang: "en" });
      answers.push([r.status, JSON.stringify(r.body), r.setCookie]);
    }
    assert.deepEqual(answers[0], answers[1], path);
    assert.deepEqual(answers[1], answers[2], path);
    assert.deepEqual(answers[0], [202, '{"ok":true}', null]);
  }
  // login: unknown email and wrong password look the same
  const a = await call("POST", "/api/auth/login", { email: freshEmail(), password: PASSWORD });
  const b = await call("POST", "/api/auth/login", { email, password: "wrong password!" });
  assert.deepEqual([a.status, a.body], [b.status, b.body]);

  await flushEmails();
  const kinds = sent.map((m) => `${m.to}:${m.kind}`);
  // confirmed → "already registered" (register) and reset (forgot); unconfirmed → confirm twice + reset;
  // unknown → nothing, except register which creates the account and sends its confirmation
  assert.deepEqual(
    kinds.sort(),
    [
      `${email.toLowerCase()}:already_registered`,
      `${email.toLowerCase()}:reset`,
      `${unconfirmed.toLowerCase()}:confirm`,
      `${unconfirmed.toLowerCase()}:confirm`,
      `${unconfirmed.toLowerCase()}:reset`,
      `${created[2]}:confirm`,
    ].sort(),
  );
  const already = sent.find((m) => m.kind === "already_registered")!;
  assert.match(already.link, /\/#\/reset\//);
  assert.match(already.subject, /already have/);
});

test("re-registering an unconfirmed address cannot take over the first password silently", async () => {
  const email = freshEmail();
  await call("POST", "/api/auth/register", { email, password: PASSWORD, lang: "ru" });
  const first = await lastMail();
  await call("POST", "/api/auth/register", { email, password: "attacker password", lang: "ru" });
  // the owner confirms with the first link → the first password works, the second does not
  assert.equal((await call("POST", "/api/auth/confirm", { token: tokenFrom(first) })).status, 200);
  assert.equal((await call("POST", "/api/auth/login", { email, password: PASSWORD })).status, 200);
  assert.equal((await call("POST", "/api/auth/login", { email, password: "attacker password" })).status, 401);
});

test("confirm token expires after 24h", async () => {
  const email = freshEmail();
  await call("POST", "/api/auth/register", { email, password: PASSWORD, lang: "en" });
  const mail = await lastMail();
  clock += 24 * 3600_000 + 1000;
  assert.deepEqual((await call("POST", "/api/auth/confirm", { token: tokenFrom(mail) })).body, { error: "invalid_token" });
  // resend gives a working link
  await call("POST", "/api/auth/resend-confirmation", { email });
  const again = await lastMail();
  assert.equal((await call("POST", "/api/auth/confirm", { token: tokenFrom(again) })).status, 200);
  assert.deepEqual((await call("POST", "/api/auth/confirm", { token: "short" })).body, { error: "invalid_token" });
});

test("lockout after 5 failures for 15 minutes", async () => {
  const { email } = await registerAndConfirm();
  for (let i = 0; i < 5; i++) {
    assert.equal((await call("POST", "/api/auth/login", { email, password: "wrong password!" })).status, 401);
  }
  const locked = await call("POST", "/api/auth/login", { email, password: PASSWORD });
  assert.equal(locked.status, 429);
  assert.equal(locked.body.error, "locked");
  assert.ok(locked.body.retryAfter > 0 && locked.body.retryAfter <= 900);
  clock += 15 * 60_000 + 1000;
  assert.equal((await call("POST", "/api/auth/login", { email, password: PASSWORD })).status, 200);
});

test("lockout looks the same for unknown addresses (no enumeration)", async () => {
  const unknown = freshEmail();
  for (let i = 0; i < 5; i++) {
    assert.equal((await call("POST", "/api/auth/login", { email: unknown, password: "wrong password!" })).status, 401);
  }
  const r = await call("POST", "/api/auth/login", { email: unknown, password: "wrong password!" });
  assert.equal(r.status, 429);
  assert.equal(r.body.error, "locked");
  clock += 15 * 60_000 + 1000;
  assert.equal((await call("POST", "/api/auth/login", { email: unknown, password: "wrong password!" })).status, 401);
});

test("forgot → reset: new password, revokes all sessions, token single-use and 1h", async () => {
  const { email, cookie } = await registerAndConfirm();
  const second = (await call("POST", "/api/auth/login", { email, password: PASSWORD })).cookie;

  assert.equal((await call("POST", "/api/auth/forgot", { email, lang: "ru" })).status, 202);
  const mail = await lastMail();
  assert.equal(mail.kind, "reset");
  assert.match(mail.link, /^http:\/\/localhost:8080\/#\/reset\//);
  assert.match(mail.subject, /пароль/);

  assert.deepEqual((await call("POST", "/api/auth/reset", { token: tokenFrom(mail), password: "123" })).body, { error: "weak_password" });
  const r = await call("POST", "/api/auth/reset", { token: tokenFrom(mail), password: "brand new secret" });
  assert.equal(r.status, 200);
  assert.ok(r.cookie);
  assert.equal((await call("GET", "/api/auth/me", undefined, { cookie })).status, 401);
  assert.equal((await call("GET", "/api/auth/me", undefined, { cookie: second })).status, 401);
  assert.equal((await call("GET", "/api/auth/me", undefined, { cookie: r.cookie })).status, 200);
  assert.equal((await call("POST", "/api/auth/login", { email, password: PASSWORD })).status, 401);
  assert.equal((await call("POST", "/api/auth/login", { email, password: "brand new secret" })).status, 200);
  assert.deepEqual((await call("POST", "/api/auth/reset", { token: tokenFrom(mail), password: "another new one" })).body, {
    error: "invalid_token",
  });

  await call("POST", "/api/auth/forgot", { email, lang: "en" });
  const late = await lastMail();
  clock += 3600_000 + 1000;
  assert.deepEqual((await call("POST", "/api/auth/reset", { token: tokenFrom(late), password: "another new one" })).body, {
    error: "invalid_token",
  });
});

test("reset also confirms an unconfirmed email", async () => {
  const email = freshEmail();
  await call("POST", "/api/auth/register", { email, password: PASSWORD, lang: "en" });
  await call("POST", "/api/auth/forgot", { email, lang: "en" });
  const mail = await lastMail();
  assert.equal((await call("POST", "/api/auth/reset", { token: tokenFrom(mail), password: "brand new secret" })).status, 200);
  assert.equal((await call("POST", "/api/auth/login", { email, password: "brand new secret" })).status, 200);
});

test("CSRF: non-GET /api/* without matching Origin → 403", async () => {
  const { cookie } = await registerAndConfirm();
  for (const origin of [null, "https://evil.example", "http://localhost:8080.evil.example"]) {
    assert.equal((await call("POST", "/api/auth/login", { email: "a@b.co", password: PASSWORD }, { origin })).status, 403);
    assert.equal((await call("PUT", "/api/progress", { data: {} }, { origin, cookie })).status, 403);
    assert.equal((await call("POST", "/api/auth/logout", undefined, { origin, cookie })).status, 403);
  }
  assert.equal((await call("GET", "/api/auth/me", undefined, { origin: null, cookie })).status, 200);
});

test("progress: auth required, put/get, size limit", async () => {
  assert.equal((await call("GET", "/api/progress")).status, 401);
  assert.equal((await call("PUT", "/api/progress", { data: {} })).status, 401);
  const { cookie } = await registerAndConfirm();
  const empty = await call("GET", "/api/progress", undefined, { cookie });
  assert.deepEqual(empty.body, { data: null, updatedAt: null });

  const data = { version: 1, xp: 120, days: ["2026-10-15"], lessons: { "a1m1.1": { firstCompletedAt: "2026-10-15", lastCompletedAt: "2026-10-15", bestXp: 25, runs: 1 } }, repeat: {} };
  const put = await call("PUT", "/api/progress", { data, baseUpdatedAt: null }, { cookie });
  assert.equal(put.status, 200);
  assert.deepEqual(put.body.data, data);

  assert.ok(!Number.isNaN(Date.parse(put.body.updatedAt)));

  const got = await call("GET", "/api/progress", undefined, { cookie });
  assert.deepEqual(got.body, put.body);

  const put2 = await call("PUT", "/api/progress", { data: { xp: 130 }, baseUpdatedAt: put.body.updatedAt }, { cookie });
  assert.ok(Date.parse(put2.body.updatedAt) > Date.parse(put.body.updatedAt));

  // anything but valid progress is dropped before it is stored
  const junk = await call(
    "PUT",
    "/api/progress",
    { data: { ...data, xp: 1e12, evil: "<script>", days: ["2026-10-15", "'; DROP TABLE users;--"], lessons: { ...data.lessons, "<img src=x>": { bestXp: 5 }, "b2.1": { bestXp: 5 }, "a1m1.2": { bestXp: "9999999", runs: -5, html: "<b>" } }, repeat: { x: { due: "never" } } } },
    { cookie },
  );
  assert.equal(junk.status, 200);
  // old Navyk ids (b2.1) and junk keys are dropped; new ids (a1m1.2) are kept with sane values
  assert.deepEqual(junk.body.data, { ...data, xp: 10_000_000, lessons: { ...data.lessons, "a1m1.2": { bestXp: 0, runs: 0 } } });
  const raw = await call("PUT", "/api/progress", JSON.parse('{"data":{"version":1,"__proto__":{"admin":true},"lessons":{"__proto__":{"bestXp":1}}}}'), { cookie });
  assert.equal(raw.status, 200);
  assert.equal(({} as any).admin, undefined);
  assert.deepEqual(raw.body.data.lessons, {});
  assert.equal((await call("PUT", "/api/progress", { data: "x" }, { cookie })).status, 400);
  const big = await call("PUT", "/api/progress", { data: { blob: "x".repeat(256 * 1024) } }, { cookie });
  assert.equal(big.status, 413);
});

test("AI limit is keyed by the account, not by deviceId", async () => {
  const { cookie } = await registerAndConfirm();
  const ask = (deviceId: string, c?: string) =>
    call("POST", "/api/ai/helper", { lessonId: "a1m1.1", question: "Как читается w?", deviceId }, { cookie: c });
  const before = aiCalls.length;
  const first = await ask("device-aaaaaaaa", cookie);
  assert.equal(first.status, 200);
  assert.equal(first.body.answer, "*Dziękuję* — спасибо.");
  const second = await ask("device-bbbbbbbb", cookie);
  assert.equal(second.status, 200);
  assert.equal(second.body.remaining, 0);
  // the account limit holds even with a new deviceId, and the model is not called
  const third = await ask("device-cccccccc", cookie);
  assert.equal(third.status, 429);
  assert.equal(third.body.reason, "limit");
  assert.equal(aiCalls.length - before, 2);
  // anonymous with the same new deviceId still has its own allowance
  assert.equal((await ask("device-cccccccc")).status, 200);
});

test("health reports ai and db", async () => {
  const h = await call("GET", "/api/health");
  assert.deepEqual(h.body, { ok: true, ai: false, db: true });
});

// ---------------- личный кабинет: имя и удаление аккаунта ----------------

test("display name: cleaned, max 40 characters, empty string removes it", async () => {
  const { cookie } = await registerAndConfirm();
  const patch = (b: object) => call("PATCH", "/api/auth/me", b, { cookie });
  const ZWSP = "\u200b";
  const ok = await patch({ name: `  Ania${ZWSP} \n Kowalska\u202e ` });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.user.name, "Ania Kowalska", "invisible characters dropped, one line, trimmed");
  assert.equal((await call("GET", "/api/auth/me", undefined, { cookie })).body.user.name, "Ania Kowalska");
  // 40 characters (even non-ASCII) fit, 41 do not
  const forty = "Ż".repeat(40);
  assert.equal((await patch({ name: forty })).body.user.name, forty);
  const long = await patch({ name: "x".repeat(41) });
  assert.deepEqual([long.status, long.body], [400, { error: "name_too_long" }]);
  assert.equal((await call("GET", "/api/auth/me", undefined, { cookie })).body.user.name, forty, "rejected update changes nothing");
  // only invisible characters → counts as empty after cleaning
  assert.equal((await patch({ name: `${ZWSP}${ZWSP}` })).body.user.name, null);
  await patch({ name: "Ania" });
  assert.equal((await patch({ name: "" })).body.user.name, null, "empty string removes the name");
  assert.equal((await patch({ name: 42 })).status, 400);
  assert.equal((await patch({ name: ["Ania"] })).status, 400);
  // name and lang together; other fields ignored
  const both = await patch({ name: "<b>Ola</b>", lang: "pl", email: "evil@x.co" });
  assert.equal(both.body.user.name, "<b>Ola</b>", "stored as text; the client renders via textContent");
  assert.equal(both.body.user.lang, "pl");
  assert.notEqual(both.body.user.email, "evil@x.co");
  assert.equal((await call("PATCH", "/api/auth/me", { name: "x" })).status, 401);
});

test("delete account: password required, removes everything, clears the cookie", async () => {
  const { email, cookie, user } = await registerAndConfirm();
  const other = await call("POST", "/api/auth/login", { email, password: PASSWORD });
  await call("PUT", "/api/progress", { data: { version: 1, xp: 5, days: [], lessons: {}, repeat: {} } }, { cookie });
  db.prepare("INSERT INTO visits (user_id, started_at, last_at) VALUES (?, ?, ?)").run(user.id, clock, clock);
  db.prepare("INSERT INTO admin_roles (user_id, role, granted_by, granted_at) VALUES (?, 'viewer', NULL, ?)").run(user.id, clock);
  db.prepare("INSERT INTO admin_audit (at, actor_id, action, target_id, details) VALUES (?, NULL, 'grant', ?, ?)").run(clock, user.id, JSON.stringify({ email: email.toLowerCase(), to: "viewer" }));
  await call("POST", "/api/auth/forgot", { email }); // a live reset token

  // no session → 401; wrong password → 401 wrong_password, nothing deleted
  assert.equal((await call("DELETE", "/api/auth/me", { password: PASSWORD })).status, 401);
  const wrong = await call("DELETE", "/api/auth/me", { password: "not my password" }, { cookie });
  assert.deepEqual([wrong.status, wrong.body], [401, { error: "wrong_password" }]);
  assert.deepEqual((await call("DELETE", "/api/auth/me", {}, { cookie })).body, { error: "wrong_password" });
  assert.deepEqual((await call("DELETE", "/api/auth/me", { confirm: "DELETE" }, { cookie })).body, { error: "wrong_password" }, "confirm:DELETE is only for Google accounts");
  assert.equal((await call("GET", "/api/auth/me", undefined, { cookie })).status, 200);

  const logs: string[] = [];
  const orig = console.log;
  console.log = (...a: unknown[]) => void logs.push(a.join(" "));
  let del: Res;
  try {
    del = await call("DELETE", "/api/auth/me", { password: PASSWORD }, { cookie });
  } finally {
    console.log = orig;
  }
  assert.deepEqual([del.status, del.body], [200, { ok: true }]);
  assert.match(del.setCookie!, /^brolingvo_session=; .*Max-Age=0/);
  const entry = logs.map((l) => JSON.parse(l)).find((e) => e.event === "account_deleted");
  assert.equal(entry.emailHash, hashAddress(email.toLowerCase()));
  assert.ok(!logs.join("\n").toLowerCase().includes(email.toLowerCase()), "no plain email in the log");

  // every session is gone, the same credentials no longer sign in
  assert.equal((await call("GET", "/api/auth/me", undefined, { cookie })).status, 401);
  assert.equal((await call("GET", "/api/auth/me", undefined, { cookie: other.cookie })).status, 401);
  assert.equal((await call("POST", "/api/auth/login", { email, password: PASSWORD })).status, 401);
  for (const t of ["users WHERE id", "sessions WHERE user_id", "tokens WHERE user_id", "progress WHERE user_id", "visits WHERE user_id", "admin_roles WHERE user_id", "email_log WHERE user_id"]) {
    assert.equal((db.prepare(`SELECT COUNT(*) AS n FROM ${t} = ?`).get(user.id) as any).n, 0, t);
  }
  const audit = db.prepare("SELECT details FROM admin_audit WHERE target_id = ?").get(user.id) as any;
  assert.ok(!audit.details.includes("@"), "audit keeps the action, not the address");
  // the address is free again
  assert.equal((await call("POST", "/api/auth/register", { email, password: PASSWORD, lang: "ru" })).status, 202);
});

test("delete account: only from our Origin, wrong passwords lock like login", async () => {
  const { email, cookie } = await registerAndConfirm();
  for (const origin of [null, "https://evil.example"]) {
    assert.equal((await call("DELETE", "/api/auth/me", { password: PASSWORD }, { origin, cookie })).status, 403);
  }
  for (let i = 0; i < 5; i++) assert.equal((await call("DELETE", "/api/auth/me", { password: "wrong password!" }, { cookie })).status, 401);
  const locked = await call("DELETE", "/api/auth/me", { password: PASSWORD }, { cookie });
  assert.equal(locked.status, 429);
  assert.equal(locked.body.error, "locked");
  assert.equal((await call("POST", "/api/auth/login", { email, password: PASSWORD })).status, 429, "the same lock as login");
  clock += 15 * 60_000 + 1000;
  assert.equal((await call("DELETE", "/api/auth/me", { password: PASSWORD }, { cookie })).status, 200);
});

test("rate limits: per IP on auth, per address on emails", async () => {
  const app = createApp({ db, authPerMinutePerIp: 3, emailsPerHourPerAddress: 2, now: () => clock });
  await new Promise<void>((r) => app.listen(0, r));
  const b = `http://localhost:${(app.address() as AddressInfo).port}`;
  const post = (path: string, body: object) =>
    fetch(b + path, { method: "POST", headers: { origin: ORIGIN, "content-type": "application/json" }, body: JSON.stringify(body) });
  try {
    assert.equal((await post("/api/auth/forgot", { email: "x@y.co" })).status, 202);
    assert.equal((await post("/api/auth/forgot", { email: "X@y.co" })).status, 202);
    const third = await post("/api/auth/forgot", { email: "x@y.co" });
    assert.equal(third.status, 429);
    assert.ok((await third.json()).retryAfter > 0);
    assert.equal((await post("/api/auth/login", { email: "x@y.co", password: "p" })).status, 429); // 4th from this IP
  } finally {
    app.close();
  }
});

// ---------------- Google sign-in ----------------

test("google: providers, start redirect, callback creates a confirmed account and a session", async () => {
  const { setGoogleFetch } = await import("../src/auth/google.ts");
  delete process.env.GOOGLE_CLIENT_ID;
  assert.deepEqual((await call("GET", "/api/auth/providers")).body, { google: false });
  process.env.GOOGLE_CLIENT_ID = "cid.apps.googleusercontent.com";
  process.env.GOOGLE_CLIENT_SECRET = "secret";
  assert.deepEqual((await call("GET", "/api/auth/providers")).body, { google: true });

  const start = await fetch(`${base}/api/auth/google/start?lang=uk`, { redirect: "manual" });
  assert.equal(start.status, 302);
  const loc = new URL(start.headers.get("location")!);
  assert.equal(loc.host, "accounts.google.com");
  assert.equal(loc.searchParams.get("redirect_uri"), `${ORIGIN}/api/auth/google/callback`);
  assert.equal(loc.searchParams.get("code_challenge_method"), "S256");
  const state = loc.searchParams.get("state")!;
  const oauthCookie = start.headers.get("set-cookie")!.split(";")[0];

  const email = freshEmail();
  const idToken = (claims: object) => `x.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.y`;
  let tokenBody = "";
  setGoogleFetch((async (_u: any, init: any) => {
    tokenBody = String(init.body);
    return Response.json({
      id_token: idToken({ iss: "https://accounts.google.com", aud: "cid.apps.googleusercontent.com", exp: Math.floor(clock / 1000) + 3600, sub: "g-123", email, email_verified: true }),
    });
  }) as typeof fetch);

  // wrong state → back to login with an error, no session
  const bad = await fetch(`${base}/api/auth/google/callback?code=c&state=nope`, { redirect: "manual", headers: { cookie: oauthCookie } });
  assert.equal(bad.headers.get("location"), "/#/login?e=google");

  const ok = await fetch(`${base}/api/auth/google/callback?code=c&state=${state}`, { redirect: "manual", headers: { cookie: oauthCookie } });
  assert.equal(ok.status, 302);
  assert.equal(ok.headers.get("location"), "/#/");
  assert.ok(tokenBody.includes("code_verifier="), "PKCE verifier sent");
  const session = ok.headers.getSetCookie().find((c) => c.startsWith("brolingvo_session="))!.split(";")[0];
  const me = await call("GET", "/api/auth/me", undefined, { cookie: session });
  assert.equal(me.status, 200);
  assert.equal(me.body.user.email, email.toLowerCase());
  assert.equal(me.body.user.lang, "uk");

  // second sign-in with the same Google account finds the same user
  const again = await fetch(`${base}/api/auth/google/callback?code=c&state=${state}`, { redirect: "manual", headers: { cookie: oauthCookie } });
  const session2 = again.headers.getSetCookie().find((c) => c.startsWith("brolingvo_session="))!.split(";")[0];
  assert.equal((await call("GET", "/api/auth/me", undefined, { cookie: session2 })).body.user.id, me.body.user.id);
  setGoogleFetch(null);
});

test("google: linking an unconfirmed account voids the password someone else may have set", async () => {
  const { setGoogleFetch, startGoogle } = await import("../src/auth/google.ts");
  process.env.GOOGLE_CLIENT_ID = "cid.apps.googleusercontent.com";
  process.env.GOOGLE_CLIENT_SECRET = "secret";
  const email = freshEmail();
  assert.equal((await call("POST", "/api/auth/register", { email, password: PASSWORD, lang: "ru" })).status, 202);
  const g = startGoogle("ru");
  const state = new URL(g.location).searchParams.get("state")!;
  setGoogleFetch((async () =>
    Response.json({
      id_token: `x.${Buffer.from(JSON.stringify({ iss: "accounts.google.com", aud: "cid.apps.googleusercontent.com", exp: Math.floor(clock / 1000) + 60, sub: "g-777", email, email_verified: true })).toString("base64url")}.y`,
    })) as typeof fetch);
  const r = await fetch(`${base}/api/auth/google/callback?code=c&state=${state}`, { redirect: "manual", headers: { cookie: g.cookie.split(";")[0] } });
  assert.equal(r.headers.get("location"), "/#/");
  // the password from the unconfirmed registration no longer works
  assert.equal((await call("POST", "/api/auth/login", { email, password: PASSWORD })).status, 401);
  // unverified Google email is refused
  setGoogleFetch((async () =>
    Response.json({ id_token: `x.${Buffer.from(JSON.stringify({ iss: "accounts.google.com", aud: "cid.apps.googleusercontent.com", exp: Math.floor(clock / 1000) + 60, sub: "g-9", email: "x@y.z", email_verified: false })).toString("base64url")}.y` })) as typeof fetch);
  const r2 = await fetch(`${base}/api/auth/google/callback?code=c&state=${state}`, { redirect: "manual", headers: { cookie: g.cookie.split(";")[0] } });
  assert.equal(r2.headers.get("location"), "/#/login?e=google");
  setGoogleFetch(null);
  delete process.env.GOOGLE_CLIENT_ID;
});

test("google: an account without a password is deleted with {confirm:'DELETE'}", async () => {
  const { setGoogleFetch, startGoogle } = await import("../src/auth/google.ts");
  process.env.GOOGLE_CLIENT_ID = "cid.apps.googleusercontent.com";
  process.env.GOOGLE_CLIENT_SECRET = "secret";
  const email = freshEmail();
  const g = startGoogle("ru");
  const state = new URL(g.location).searchParams.get("state")!;
  setGoogleFetch((async () =>
    Response.json({
      id_token: `x.${Buffer.from(JSON.stringify({ iss: "accounts.google.com", aud: "cid.apps.googleusercontent.com", exp: Math.floor(clock / 1000) + 60, sub: "g-del", email, email_verified: true })).toString("base64url")}.y`,
    })) as typeof fetch);
  const r = await fetch(`${base}/api/auth/google/callback?code=c&state=${state}`, { redirect: "manual", headers: { cookie: g.cookie.split(";")[0] } });
  const cookie = r.headers.getSetCookie().find((c) => c.startsWith("brolingvo_session="))!.split(";")[0];
  setGoogleFetch(null);
  delete process.env.GOOGLE_CLIENT_ID;
  assert.equal((await call("DELETE", "/api/auth/me", { confirm: "delete" }, { cookie })).status, 401, "exact word only");
  assert.deepEqual((await call("DELETE", "/api/auth/me", { confirm: "DELETE" }, { cookie })).body, { ok: true });
  assert.equal((await call("GET", "/api/auth/me", undefined, { cookie })).status, 401);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM users WHERE google_sub = 'g-del'").get()!.n as number, 0);
});
