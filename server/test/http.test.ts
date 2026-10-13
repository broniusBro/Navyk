import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { createApp } from "../src/http.ts";
import { DailyLimiter } from "../src/limits.ts";

delete process.env.ANTHROPIC_API_KEY;
const server = createApp();
let base = "";

before(async () => {
  await new Promise<void>((r) => server.listen(0, r));
  base = `http://localhost:${(server.address() as AddressInfo).port}`;
});
after(() => server.close());

test("health and course", async () => {
  assert.deepEqual(await (await fetch(`${base}/api/health`)).json(), { ok: true, reviewer: false });
  const course = await (await fetch(`${base}/api/course`)).json();
  assert.equal(course.levels[0].id, "beginner");
  assert.ok(course.available.uk.includes("b2.1"));
  assert.ok(!course.available.ru.includes("b3.1"));
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
  fetch(`${base}/api/review`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

test("review: validation and graceful 503 without API key", async () => {
  assert.equal((await review({ lessonId: "x" })).status, 400);
  assert.equal((await review({ lessonId: "b2.1", exerciseId: "b2.1.e5", lang: "ru", prompt: "hi" })).status, 400);
  const r = await review({ lessonId: "b2.1", exerciseId: "b2.1.e5", lang: "ru", prompt: "Напиши пост для Instagram про скидки", deviceId: "device-123456" });
  assert.equal(r.status, 503);
  assert.deepEqual(await r.json(), { error: "unavailable" });
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
