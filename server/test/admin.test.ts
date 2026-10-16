// Админка: хост admin.*, роли и права, статистика, прогресс, выдача доступа, визиты.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { request } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

const dataDir = mkdtempSync(join(tmpdir(), "navyk-admin-"));
process.env.DATA_DIR = dataDir;
process.env.PUBLIC_ORIGIN = "http://localhost:8080";
process.env.ADMIN_ORIGIN = "http://admin.test";
process.env.COOKIE_SECURE = "false";
process.env.EMAIL_PROVIDER = "log";

const { createApp } = await import("../src/http.ts");
const { openDb } = await import("../src/db.ts");
const { hashPassword } = await import("../src/auth/password.ts");
const { grantFromConsole, summarizeProgress } = await import("../src/admin/routes.ts");
const { touchVisit, resetVisitThrottle } = await import("../src/activity.ts");

let clock = Date.parse("2026-10-16T10:00:00Z");
const db = openDb(join(dataDir, "navyk.sqlite"));
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
        const sc = res.headers["set-cookie"]?.find((c) => c.startsWith("navyk_session="));
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
  const ownerId = await user("owner@navyk.test");
  const learnerId = await user("learner@navyk.test", {
    version: 1,
    xp: 120,
    days: ["2026-10-15", "2026-10-16"],
    lessons: {
      "b1.1": { firstCompletedAt: "2026-10-15", lastCompletedAt: "2026-10-15", bestXp: 25, runs: 1 },
      "a1.1": { firstCompletedAt: "2026-10-16", lastCompletedAt: "2026-10-16", bestXp: 15, runs: 2 },
    },
    repeat: {},
  });
  await user("viewer@navyk.test");
  await user("pending@navyk.test", undefined, false);

  // the admin site serves its own page; the main site has no admin API
  const page = await call("admin", "GET", "/");
  assert.equal(page.status, 200);
  assert.equal((await call("main", "GET", "/api/admin/me")).status, 404);
  assert.equal((await call("admin", "GET", "/api/course")).status, 404, "only admin APIs on the admin host");

  let cookie = await login("owner@navyk.test");
  assert.ok(cookie);
  assert.equal((await call("admin", "GET", "/api/admin/me", undefined, cookie)).body.error, "not_admin");
  assert.deepEqual(grantFromConsole(db, "owner@navyk.test", "owner", clock), { ok: true });
  assert.equal(grantFromConsole(db, "pending@navyk.test", "admin", clock).ok, false, "unconfirmed accounts cannot be admins");
  const me = await call("admin", "GET", "/api/admin/me", undefined, cookie);
  assert.equal(me.status, 200);
  assert.equal(me.body.role, "owner");

  // stats and users
  const stats = (await call("admin", "GET", "/api/admin/stats", undefined, cookie)).body;
  assert.equal(stats.users.total, 4);
  assert.equal(stats.users.confirmed, 3);
  assert.equal(stats.lessonsCompleted, 2);
  assert.equal(stats.levels.find((l: any) => l.id === "advanced").current, 1, "learner is on the Advanced level now");
  const list = (await call("admin", "GET", "/api/admin/users?sort=xp", undefined, cookie)).body;
  assert.equal(list.users[0].email, "learner@navyk.test");
  assert.equal(list.users[0].progress.xp, 120);
  assert.equal(list.users[0].progress.currentLevel, "advanced");
  assert.deepEqual(list.users[0].progress.levels.find((l: any) => l.id === "beginner"), { id: "beginner", done: 1, total: 34 });
  assert.equal((await call("admin", "GET", "/api/admin/users?q=pending", undefined, cookie)).body.total, 1);
  const detail = (await call("admin", "GET", `/api/admin/users/${learnerId}`, undefined, cookie)).body;
  const a11 = detail.levels.find((l: any) => l.id === "advanced").modules[0].lessons[0];
  assert.deepEqual([a11.id, a11.done, a11.bestXp, a11.runs], ["a1.1", true, 15, 2]);

  // grant: viewer sees masked emails and cannot manage access
  assert.equal((await call("admin", "POST", "/api/admin/admins", { email: "viewer@navyk.test", role: "viewer" }, cookie)).status, 200);
  assert.equal((await call("admin", "POST", "/api/admin/admins", { email: "nobody@navyk.test", role: "viewer" }, cookie)).body.error, "user_not_found");
  assert.equal((await call("admin", "POST", "/api/admin/admins", { email: "pending@navyk.test", role: "admin" }, cookie)).body.error, "email_not_confirmed");
  const vCookie = await login("viewer@navyk.test");
  const vList = (await call("admin", "GET", "/api/admin/users", undefined, vCookie)).body;
  assert.ok(vList.users.every((u: any) => u.email.includes("***@")), "viewer sees masked emails");
  assert.equal((await call("admin", "GET", "/api/admin/admins", undefined, vCookie)).status, 403);
  assert.equal((await call("admin", "POST", "/api/admin/admins", { email: "learner@navyk.test", role: "admin" }, vCookie)).status, 403);

  // an admin can manage admins/viewers but not owners
  assert.equal((await call("admin", "POST", "/api/admin/admins", { email: "learner@navyk.test", role: "admin" }, cookie)).status, 200);
  const aCookie = await login("learner@navyk.test");
  assert.equal((await call("admin", "POST", "/api/admin/admins", { email: "viewer@navyk.test", role: "owner" }, aCookie)).status, 403);
  assert.equal((await call("admin", "DELETE", `/api/admin/admins/${ownerId}`, undefined, aCookie)).status, 403);
  // the last owner cannot be removed or demoted
  assert.equal((await call("admin", "DELETE", `/api/admin/admins/${ownerId}`, undefined, cookie)).body.error, "last_owner");
  assert.equal((await call("admin", "POST", "/api/admin/admins", { email: "owner@navyk.test", role: "admin" }, cookie)).body.error, "last_owner");
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
    req.end(JSON.stringify({ email: "viewer@navyk.test", role: "owner" }));
  });
  assert.equal(forged, 403);

  // admin sessions expire after 12 hours: sign in again
  clock += 13 * 3600_000;
  assert.equal((await call("admin", "GET", "/api/admin/me", undefined, cookie)).body.error, "reauth");
});

test("visits: a pause over 30 minutes starts a new visit; duration and last session in the user list", async () => {
  resetVisitThrottle();
  const id = await user("visitor@navyk.test");
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

  grantFromConsole(db, "visitor@navyk.test", "viewer", clock);
  clock = t0 + 100 * 60_000;
  const cookie = await login("visitor@navyk.test");
  const u = (await call("admin", "GET", "/api/admin/users?q=" + encodeURIComponent("v"), undefined, cookie)).body.users.find((x: any) => x.id === id);
  assert.equal(u.visits, 2);
  assert.equal(u.totalMinutes, 30);
  assert.equal(u.lastVisit.minutes, 5);

  // the learner app's ping counts as activity; the admin host does not
  const mainCookie = await login("visitor@navyk.test", "main");
  clock += 60 * 60_000;
  assert.equal((await call("main", "POST", "/api/auth/ping", {}, mainCookie)).status, 204);
  assert.equal((db.prepare("SELECT COUNT(*) AS n FROM visits WHERE user_id = ?").get(id) as any).n, 3);
  clock += 60 * 60_000;
  await call("admin", "GET", "/api/auth/me", undefined, cookie);
  assert.equal((db.prepare("SELECT COUNT(*) AS n FROM visits WHERE user_id = ?").get(id) as any).n, 3);
});

test("progress summary: streak, current level, unknown lessons ignored", () => {
  const s = summarizeProgress({ xp: 10.7, days: ["2026-10-14", "2026-10-15", "bad"], lessons: { "b1.1": { lastCompletedAt: "2026-10-15" }, "zz9.9": {} } }, "2026-10-16");
  assert.equal(s.xp, 10);
  assert.equal(s.streak, 2, "yesterday still counts");
  assert.equal(s.completed, 1);
  assert.equal(s.currentLevel, "beginner");
  assert.equal(summarizeProgress(null, "2026-10-16").currentLevel, null);
});
