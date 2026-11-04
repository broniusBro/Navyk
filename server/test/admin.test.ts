// Админка: хост admin.*, роли и права, статистика, прогресс, выдача доступа, визиты.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { request } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

const dataDir = mkdtempSync(join(tmpdir(), "brolingvo-admin-"));
process.env.DATA_DIR = dataDir;
process.env.PUBLIC_ORIGIN = "http://localhost:8080";
process.env.ADMIN_ORIGIN = "http://admin.test";
process.env.COOKIE_SECURE = "false";
process.env.EMAIL_PROVIDER = "log";

const { createApp } = await import("../src/http.ts");
const { openDb } = await import("../src/db.ts");
const { hashPassword } = await import("../src/auth/password.ts");
const { grantFromConsole, summarizeProgress } = await import("../src/admin/routes.ts");
const { readFileSync } = await import("node:fs");
const course = JSON.parse(readFileSync(new URL("../../content/course.json", import.meta.url), "utf8"));
const lessonsIn = (level: string) => course.levels.find((l: any) => l.id === level).modules.flatMap((m: any) => m.lessons.map((x: any) => x.id)) as string[];
const { touchVisit, resetVisitThrottle } = await import("../src/activity.ts");

let clock = Date.parse("2026-10-16T10:00:00Z");
const db = openDb(join(dataDir, "brolingvo.sqlite"));
const server = createApp({ db, now: () => clock, authPerMinutePerIp: 1000 });
let port = 0;
const PW = "correct horse battery";

before(async () => {
  await new Promise<void>((r) => server.listen(0, r));
  port = (server.address() as AddressInfo).port;
});
after(() => {
  server.close();
  db.close();
  rmSync(dataDir, { recursive: true, force: true });
});

type Res = { status: number; body: any; cookie: string | null };
function call(host: "admin" | "main", method: string, path: string, body?: unknown, cookie?: string | null): Promise<Res> {
  const origin = host === "admin" ? "http://admin.test" : "http://localhost:8080";
  const headers: Record<string, string> = { host: host === "admin" ? "admin.test" : `localhost:${port}`, origin };
  if (cookie) headers.cookie = cookie;
  const data = body === undefined ? undefined : JSON.stringify(body);
  if (data) headers["content-type"] = "application/json";
  return new Promise((resolve, reject) => {
    const req = request({ host: "127.0.0.1", port, method, path, headers }, (res) => {
      let text = "";
      res.on("data", (c) => (text += c));
      res.on("end", () => {
        const sc = res.headers["set-cookie"]?.find((c) => c.startsWith("brolingvo_session="));
        let parsed: any = null;
        try {
          parsed = text ? JSON.parse(text) : null;
        } catch {
          parsed = text;
        }
        resolve({ status: res.statusCode ?? 0, body: parsed, cookie: sc ? sc.split(";")[0] : null });
      });
    });
    req.on("error", reject);
    if (data) req.write(data);
    req.end();
  });
}

async function user(email: string, progress?: object, confirmed = true) {
  const id = randomUUID();
  db.prepare("INSERT INTO users (id, email, password_hash, lang, email_confirmed_at, created_at) VALUES (?, ?, ?, 'ru', ?, ?)").run(
    id,
    email,
    await hashPassword(PW),
    confirmed ? clock : null,
    clock - 3 * 86400_000,
  );
  if (progress) db.prepare("INSERT INTO progress (user_id, data, updated_at) VALUES (?, ?, ?)").run(id, JSON.stringify(progress), clock);
  return id;
}
const login = async (email: string, host: "admin" | "main" = "admin") => (await call(host, "POST", "/api/auth/login", { email, password: PW })).cookie;

test("admin: host separation, roles, stats, users, progress, grants, audit", async () => {
  const ownerId = await user("owner@brolingvo.test");
  const learnerId = await user("learner@brolingvo.test", {
    version: 1,
    xp: 120,
    days: ["2026-10-15", "2026-10-16"],
    lessons: {
      "a1m1.1": { firstCompletedAt: "2026-10-15", lastCompletedAt: "2026-10-16", bestXp: 15, runs: 2 },
      "a2m1.1": { firstCompletedAt: "2026-10-15", lastCompletedAt: "2026-10-15", bestXp: 25, runs: 1 },
    },
    repeat: {},
  });
  await user("viewer@brolingvo.test");
  await user("pending@brolingvo.test", undefined, false);

  // the admin site serves its own page; the main site has no admin API
  const page = await call("admin", "GET", "/");
  assert.equal(page.status, 200);
  assert.equal((await call("main", "GET", "/api/admin/me")).status, 404);
  assert.equal((await call("admin", "GET", "/api/course")).status, 404, "only admin APIs on the admin host");

  let cookie = await login("owner@brolingvo.test");
  assert.ok(cookie);
  assert.equal((await call("admin", "GET", "/api/admin/me", undefined, cookie)).body.error, "not_admin");
  assert.deepEqual(grantFromConsole(db, "owner@brolingvo.test", "owner", clock), { ok: true });
  assert.equal(grantFromConsole(db, "pending@brolingvo.test", "admin", clock).ok, false, "unconfirmed accounts cannot be admins");
  const me = await call("admin", "GET", "/api/admin/me", undefined, cookie);
  assert.equal(me.status, 200);
  assert.equal(me.body.role, "owner");

  // stats and users
  const stats = (await call("admin", "GET", "/api/admin/stats", undefined, cookie)).body;
  assert.equal(stats.users.total, 4);
  assert.equal(stats.users.confirmed, 3);
  assert.equal(stats.lessonsCompleted, 2);
  assert.deepEqual(stats.levels.map((l: any) => l.id), ["a1", "a2", "b1"]);
  const a2 = stats.levels.find((l: any) => l.id === "a2");
  assert.equal(a2.current, 1, "learner is on A2: the highest level with a completed lesson, although A1 was repeated later");
  assert.equal(a2.started, 1);
  assert.equal(a2.lessons, lessonsIn("a2").length);
  assert.equal(stats.levels.find((l: any) => l.id === "a1").current, 0);
  const list = (await call("admin", "GET", "/api/admin/users?sort=xp", undefined, cookie)).body;
  assert.equal(list.users[0].email, "learner@brolingvo.test");
  assert.equal(list.users[0].progress.xp, 120);
  assert.equal(list.users[0].progress.currentLevel, "a2");
  assert.deepEqual(list.users[0].progress.levels.find((l: any) => l.id === "a1"), { id: "a1", done: 1, total: lessonsIn("a1").length });
  assert.equal((await call("admin", "GET", "/api/admin/users?level=a2", undefined, cookie)).body.total, 1);
  assert.equal((await call("admin", "GET", "/api/admin/users?level=none", undefined, cookie)).body.total, 3);
  assert.equal((await call("admin", "GET", "/api/admin/users?q=pending", undefined, cookie)).body.total, 1);
  const detail = (await call("admin", "GET", `/api/admin/users/${learnerId}`, undefined, cookie)).body;
  const first = detail.levels.find((l: any) => l.id === "a1").modules[0];
  assert.equal(first.id, "a1m1");
  const l11 = first.lessons[0];
  assert.deepEqual([l11.id, l11.done, l11.bestXp, l11.runs], ["a1m1.1", true, 15, 2]);
  assert.equal(typeof l11.title.ru, "string");

  // grant: viewer sees masked emails and cannot manage access
  assert.equal((await call("admin", "POST", "/api/admin/admins", { email: "viewer@brolingvo.test", role: "viewer" }, cookie)).status, 200);
  assert.equal((await call("admin", "POST", "/api/admin/admins", { email: "nobody@brolingvo.test", role: "viewer" }, cookie)).body.error, "user_not_found");
  assert.equal((await call("admin", "POST", "/api/admin/admins", { email: "pending@brolingvo.test", role: "admin" }, cookie)).body.error, "email_not_confirmed");
  const vCookie = await login("viewer@brolingvo.test");
  const vList = (await call("admin", "GET", "/api/admin/users", undefined, vCookie)).body;
  assert.ok(vList.users.every((u: any) => u.email.includes("***@")), "viewer sees masked emails");
  assert.equal((await call("admin", "GET", "/api/admin/admins", undefined, vCookie)).status, 403);
  assert.equal((await call("admin", "POST", "/api/admin/admins", { email: "learner@brolingvo.test", role: "admin" }, vCookie)).status, 403);

  // an admin can manage admins/viewers but not owners
  assert.equal((await call("admin", "POST", "/api/admin/admins", { email: "learner@brolingvo.test", role: "admin" }, cookie)).status, 200);
  const aCookie = await login("learner@brolingvo.test");
  assert.equal((await call("admin", "POST", "/api/admin/admins", { email: "viewer@brolingvo.test", role: "owner" }, aCookie)).status, 403);
  assert.equal((await call("admin", "DELETE", `/api/admin/admins/${ownerId}`, undefined, aCookie)).status, 403);
  // the last owner cannot be removed or demoted
  assert.equal((await call("admin", "DELETE", `/api/admin/admins/${ownerId}`, undefined, cookie)).body.error, "last_owner");
  assert.equal((await call("admin", "POST", "/api/admin/admins", { email: "owner@brolingvo.test", role: "admin" }, cookie)).body.error, "last_owner");
  // revoke
  assert.equal((await call("admin", "DELETE", `/api/admin/admins/${learnerId}`, undefined, cookie)).status, 200);
  assert.equal((await call("admin", "GET", "/api/admin/me", undefined, aCookie)).body.error, "not_admin");

  // audit trail
  const log = (await call("admin", "GET", "/api/admin/audit", undefined, cookie)).body.entries.map((e: any) => e.action);
  assert.deepEqual(log.slice(0, 3), ["revoke", "grant", "grant"]);

  // cross-site: the main site's origin cannot call the admin API with an admin cookie
  const forged = await new Promise<number>((resolve) => {
    const req = request(
      { host: "127.0.0.1", port, method: "POST", path: "/api/admin/admins", headers: { host: "admin.test", origin: "https://evil.example", cookie: cookie!, "content-type": "application/json" } },
      (res) => resolve(res.statusCode ?? 0),
    );
    req.end(JSON.stringify({ email: "viewer@brolingvo.test", role: "owner" }));
  });
  assert.equal(forged, 403);

  // admin sessions expire after 12 hours: sign in again
  clock += 13 * 3600_000;
  assert.equal((await call("admin", "GET", "/api/admin/me", undefined, cookie)).body.error, "reauth");
});

test("visits: a pause over 30 minutes starts a new visit; duration and last session in the user list", async () => {
  resetVisitThrottle();
  const id = await user("visitor@brolingvo.test");
  const t0 = clock;
  touchVisit(db, id, t0);
  touchVisit(db, id, t0 + 30_000); // throttled (under a minute)
  touchVisit(db, id, t0 + 10 * 60_000);
  touchVisit(db, id, t0 + 25 * 60_000);
  touchVisit(db, id, t0 + 90 * 60_000); // new visit
  touchVisit(db, id, t0 + 95 * 60_000);
  const rows = db.prepare("SELECT started_at, last_at FROM visits WHERE user_id = ? ORDER BY started_at").all(id) as any[];
  assert.equal(rows.length, 2);
  assert.equal((rows[0].last_at - rows[0].started_at) / 60_000, 25);
  assert.equal((rows[1].last_at - rows[1].started_at) / 60_000, 5);

  grantFromConsole(db, "visitor@brolingvo.test", "viewer", clock);
  clock = t0 + 100 * 60_000;
  const cookie = await login("visitor@brolingvo.test");
  const u = (await call("admin", "GET", "/api/admin/users?q=" + encodeURIComponent("v"), undefined, cookie)).body.users.find((x: any) => x.id === id);
  assert.equal(u.visits, 2);
  assert.equal(u.totalMinutes, 30);
  assert.equal(u.lastVisit.minutes, 5);

  // the learner app's ping counts as activity; the admin host does not
  const mainCookie = await login("visitor@brolingvo.test", "main");
  clock += 60 * 60_000;
  assert.equal((await call("main", "POST", "/api/auth/ping", {}, mainCookie)).status, 204);
  assert.equal((db.prepare("SELECT COUNT(*) AS n FROM visits WHERE user_id = ?").get(id) as any).n, 3);
  clock += 60 * 60_000;
  await call("admin", "GET", "/api/auth/me", undefined, cookie);
  assert.equal((db.prepare("SELECT COUNT(*) AS n FROM visits WHERE user_id = ?").get(id) as any).n, 3);
});

test("progress summary: streak, current level a1/a2/b1, unknown lessons ignored", () => {
  // old Navyk ids (b1.1) and lessons not in course.json are ignored
  const s = summarizeProgress(
    { version: 1, xp: 10.7, days: ["2026-10-14", "2026-10-15", "bad"], lessons: { "a1m1.1": { lastCompletedAt: "2026-10-15" }, "b1.1": {}, "a1m99.1": {} } },
    "2026-10-16",
  );
  assert.equal(s.xp, 10);
  assert.equal(s.streak, 2, "yesterday still counts");
  assert.equal(s.completed, 1);
  assert.deepEqual(s.levels.map((l) => l.id), ["a1", "a2", "b1"]);
  assert.equal(s.currentLevel, "a1");
  assert.equal(summarizeProgress(null, "2026-10-16").currentLevel, null);
  assert.equal(summarizeProgress({ version: 1, lessons: { "b1m2.3": {} } }, "2026-10-16").currentLevel, "b1");
  // all of A1 done → the learner is now on A2
  const allA1 = Object.fromEntries(lessonsIn("a1").map((id) => [id, { lastCompletedAt: "2026-10-15" }]));
  const full = summarizeProgress({ version: 1, lessons: allA1 }, "2026-10-16");
  assert.deepEqual(full.levels[0], { id: "a1", done: lessonsIn("a1").length, total: lessonsIn("a1").length });
  assert.equal(full.currentLevel, "a2");
  // B1 is the last level: finishing it keeps B1
  const allB1 = Object.fromEntries(lessonsIn("b1").map((id) => [id, {}]));
  assert.equal(summarizeProgress({ version: 1, lessons: allB1 }, "2026-10-16").currentLevel, "b1");
});

test("admin site is branded brolingvo, not Navyk or the old Claude course", () => {
  const read = (f: string) => readFileSync(new URL(`../../web-admin/${f}`, import.meta.url), "utf8");
  const html = read("index.html");
  assert.match(html, /<title>brolingvo · админка<\/title>/);
  const i18n = JSON.parse(read("i18n/ru.json"));
  assert.equal(i18n.app.title, "brolingvo · админка");
  for (const f of ["index.html", "admin.js", "admin.css", "i18n/ru.json"]) {
    assert.doesNotMatch(read(f), /navyk|anthropic|claude|beginner|advanced/i, f);
  }
  assert.match(read("admin.js"), /a1: "A1", a2: "A2", b1: "B1"/);
});

test("set-admin-login: creates a confirmed owner, or resets the password of an existing account", async () => {
  const { setAdminLogin } = await import("../src/admin/login.ts");
  assert.deepEqual(await setAdminLogin(db, "boss@brolingvo.com", "short", "owner", clock), { ok: false, error: "weak_password" });
  assert.deepEqual(await setAdminLogin(db, "not-an-email", PW, "owner", clock), { ok: false, error: "bad_email" });

  assert.deepEqual(await setAdminLogin(db, " Boss@Brolingvo.com ", "forced admin pass 1", "owner", clock), { ok: true, created: true });
  let r = await call("admin", "POST", "/api/auth/login", { email: "boss@brolingvo.com", password: "forced admin pass 1" });
  assert.equal(r.status, 200);
  const me = await call("admin", "GET", "/api/admin/me", undefined, r.cookie);
  assert.equal(me.body.role, "owner");

  // existing (unconfirmed) account: password replaced, email confirmed, old sessions dropped
  await user("late@example.com", undefined, false);
  assert.deepEqual(await setAdminLogin(db, "late@example.com", "forced admin pass 2", "viewer", clock), { ok: true, created: false });
  assert.equal((await call("admin", "POST", "/api/auth/login", { email: "late@example.com", password: PW })).status, 401);
  r = await call("admin", "POST", "/api/auth/login", { email: "late@example.com", password: "forced admin pass 2" });
  assert.equal(r.status, 200);
  assert.equal((await call("admin", "GET", "/api/admin/me", undefined, r.cookie)).body.role, "viewer");
});
