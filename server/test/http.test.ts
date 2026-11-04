import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../src/http.ts";
import { DailyLimiter } from "../src/limits.ts";

delete process.env.ANTHROPIC_API_KEY;
const dataDir = mkdtempSync(join(tmpdir(), "brolingvo-http-"));
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
  assert.deepEqual(await (await fetch(`${base}/api/health`)).json(), { ok: true, ai: false, db: true });
  const course = await (await fetch(`${base}/api/course`)).json();
  assert.deepEqual(course.levels.map((l: any) => l.id), ["a1", "a2", "b1"]);
  assert.equal(course.levels[0].modules[0].id, "a1m1");
  assert.deepEqual(Object.keys(course.available), ["ru"], "content is Russian-only");
  assert.ok(course.available.ru.includes("a1m1.1"));
  // every built lesson is listed in course.json (lessons are still being written, so not every lesson is built yet)
  const ids = new Set(course.levels.flatMap((lv: any) => lv.modules.flatMap((m: any) => m.lessons.map((l: any) => l.id))));
  for (const id of course.available.ru) assert.ok(ids.has(id), `${id} is in course.json`);
  for (const id of ids) assert.match(id as string, /^(a1|a2|b1)m\d+\.\d+$/);
});

test("lessons: existing, missing, bad language, bad id", async () => {
  const r = await fetch(`${base}/api/lessons/ru/a1m1.1`);
  assert.equal(r.status, 200);
  assert.equal((await r.json()).meta.id, "a1m1.1");
  assert.equal((await fetch(`${base}/api/lessons/ru/a1m99.9`)).status, 404);
  assert.equal((await fetch(`${base}/api/lessons/uk/a1m1.1`)).status, 404, "only ru content");
  assert.equal((await fetch(`${base}/api/lessons/de/a1m1.1`)).status, 404);
  assert.equal((await fetch(`${base}/api/lessons/ru/b2.1`)).status, 404, "old Navyk ids are gone");
});

test("talk scenarios are served", async () => {
  const r = await fetch(`${base}/api/talk/scenarios`);
  assert.equal(r.status, 200);
  const ids = (await r.json()).scenarios.map((s: any) => s.id);
  assert.ok(ids.includes("cafe") && ids.includes("free"));
});

test("static files, SPA fallback, security headers", async () => {
  const r = await fetch(`${base}/lesson/a1m1.1`);
  assert.equal(r.status, 200);
  assert.match(r.headers.get("content-type") ?? "", /text\/html/);
  assert.equal(r.headers.get("x-content-type-options"), "nosniff");
  assert.ok(r.headers.get("content-security-policy"));
});

const ai = (kind: string, body: unknown) =>
  fetch(`${base}/api/ai/${kind}`, { method: "POST", headers: { "content-type": "application/json", origin: ORIGIN }, body: JSON.stringify(body) });

test("ai: validation first, then graceful 503 {reason:'no_key'} without API key", async () => {
  assert.equal((await ai("translate", { lessonId: "x" })).status, 400);
  assert.equal((await ai("helper", { question: "" })).status, 400);
  const r = await ai("helper", { question: "Как сказать «спасибо»?", deviceId: "device-123456" });
  assert.equal(r.status, 503);
  assert.deepEqual(await r.json(), { error: "unavailable", reason: "no_key" });
  assert.equal((await ai("dialog", { scenarioId: "cafe" })).status, 503);
});

test("the old prompt reviewer is gone", async () => {
  const r = await fetch(`${base}/api/review`, { method: "POST", headers: { "content-type": "application/json", origin: ORIGIN }, body: "{}" });
  assert.equal(r.status, 404);
  assert.equal((await fetch(`${base}/api/ai/unknown`, { method: "POST", headers: { "content-type": "application/json", origin: ORIGIN }, body: "{}" })).status, 404);
});

test("ai without Origin is rejected (CSRF)", async () => {
  const r = await fetch(`${base}/api/ai/helper`, { method: "POST", headers: { "content-type": "application/json" }, body: '{"question":"hi"}' });
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

test("legal pages: privacy, cookies, terms in four languages", async () => {
  const { legalLang } = await import("../src/http.ts");
  assert.equal(legalLang("pl", "ru"), "pl");
  assert.equal(legalLang("de", "de-DE,uk;q=0.8,en;q=0.5"), "uk");
  assert.equal(legalLang(null, "fr"), "en");
  for (const doc of ["privacy", "cookies", "terms"]) {
    for (const lang of ["ru", "uk", "en", "pl"]) {
      const r = await fetch(`${base}/${doc}?lang=${lang}`);
      assert.equal(r.status, 200, `${doc}.${lang}`);
      const html = await r.text();
      assert.match(html, new RegExp(`<html lang="${lang}">`));
      assert.ok(html.includes("BRONIUS AND BRO GROUP SP. Z O.O."));
      assert.ok(html.includes("NIP: 5214102539"));
      assert.ok(!html.includes("{{"), "all placeholders filled");
    }
  }
  const pl = await fetch(`${base}/terms`, { headers: { "accept-language": "pl-PL,pl;q=0.9" } });
  assert.equal(pl.headers.get("content-language"), "pl");
});
