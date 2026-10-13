import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../src/http.ts";
import { DailyLimiter } from "../src/limits.ts";

delete process.env.ANTHROPIC_API_KEY;
const dataDir = mkdtempSync(join(tmpdir(), "navyk-http-"));
process.env.DATA_DIR = dataDir;
process.env.PUBLIC_ORIGIN = "http://localhost:8080";
const ORIGIN = "http://localhost:8080";
const server = createApp();
let base = "";

before(async () => {
  await new Promise<void>((r) => server.listen(0, r));
  base = `http://localhost:${(server.address() as AddressInfo).port}`;
});
after(() => {
  server.close();
  rmSync(dataDir, { recursive: true, force: true });
});

test("health and course", async () => {
  assert.deepEqual(await (await fetch(`${base}/api/health`)).json(), { ok: true, reviewer: false, db: true });
  const course = await (await fetch(`${base}/api/course`)).json();
  assert.equal(course.levels[0].id, "beginner");
  assert.ok(course.available.uk.includes("b2.1"));
  // every beginner lesson listed in course.json is built in all three languages
  const ids = course.levels[0].modules.flatMap((m: any) => m.lessons.map((l: any) => l.id));
  for (const lang of ["ru", "uk", "en"]) assert.deepEqual([...course.available[lang]].sort(), [...ids].sort());
});

test("lessons: existing, missing, bad language", async () => {
  assert.equal((await fetch(`${base}/api/lessons/uk/b2.1`)).status, 200);
  assert.equal((await fetch(`${base}/api/lessons/ru/b9.9`)).status, 404);
  assert.equal((await fetch(`${base}/api/lessons/de/b2.1`)).status, 404);
});

test("static files, SPA fallback, security headers", async () => {
  const r = await fetch(`${base}/lesson/b2.1`);
  assert.equal(r.status, 200);
  assert.match(r.headers.get("content-type") ?? "", /text\/html/);
  assert.equal(r.headers.get("x-content-type-options"), "nosniff");
  assert.ok(r.headers.get("content-security-policy"));
});

const review = (body: unknown) =>
  fetch(`${base}/api/review`, { method: "POST", headers: { "content-type": "application/json", origin: ORIGIN }, body: JSON.stringify(body) });

test("review: validation and graceful 503 without API key", async () => {
  assert.equal((await review({ lessonId: "x" })).status, 400);
  assert.equal((await review({ lessonId: "b2.1", exerciseId: "b2.1.e5", lang: "ru", prompt: "hi" })).status, 400);
  const r = await review({ lessonId: "b2.1", exerciseId: "b2.1.e5", lang: "ru", prompt: "Напиши пост для Instagram про скидки", deviceId: "device-123456" });
  assert.equal(r.status, 503);
  assert.deepEqual(await r.json(), { error: "unavailable" });
});

test("review without Origin is rejected (CSRF)", async () => {
  const r = await fetch(`${base}/api/review`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  assert.equal(r.status, 403);
});

test("daily limiter resets at UTC midnight", () => {
  const l = new DailyLimiter(2);
  const d1 = new Date("2026-10-13T10:00:00Z");
  l.use("a", d1);
  l.use("a", d1);
  assert.equal(l.canUse("a", d1), false);
  assert.equal(l.canUse("a", new Date("2026-10-14T00:00:01Z")), true);
  assert.equal(l.resetAt(d1), "2026-10-14T00:00:00.000Z");
});

test("static files always revalidate: no-cache + ETag → 304", async () => {
  const r1 = await fetch(`${base}/js/app.js`);
  assert.equal(r1.status, 200);
  assert.equal(r1.headers.get("cache-control"), "no-cache");
  const etag = r1.headers.get("etag");
  assert.ok(etag);
  const r2 = await fetch(`${base}/js/app.js`, { headers: { "if-none-match": etag! } });
  assert.equal(r2.status, 304);
  assert.equal((await fetch(`${base}/sw.js`)).headers.get("cache-control"), "no-cache");
});
