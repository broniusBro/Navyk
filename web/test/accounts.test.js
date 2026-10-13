import { test } from "node:test";
import assert from "node:assert/strict";
import { validateCredentials, interpretAuth, normalizeUser, canOpenLesson, parseTokenRoute, retryMinutes, isEmail } from "../js/engine/auth.js";
import { mergeProgress, sameProgress, lessonsXp, retryDelay } from "../js/engine/sync.js";
import { emptyProgress, normalizeProgress } from "../js/engine/progress.js";
import { roadPath, splitRoad, travelledIndex, waveOffset } from "../js/engine/road.js";

test("validateCredentials", () => {
  assert.deepEqual(validateCredentials({ email: "a@b.co", password: "12345678" }), {});
  assert.deepEqual(validateCredentials({ email: "", password: "" }), { email: "email_required", password: "password_required" });
  assert.deepEqual(validateCredentials({ email: "nope", password: "short" }), { email: "invalid_email", password: "weak_password" });
  assert.deepEqual(validateCredentials({ email: "a@b.co", password: "short" }, { checkLength: false }), {}, "login does not check length");
  assert.deepEqual(validateCredentials({ password: "12345678", confirm: "12345679" }, { needEmail: false, checkConfirm: true }), { confirm: "password_mismatch" });
  assert.deepEqual(validateCredentials({ email: "a@b.co" }), {}, "email-only form");
  assert.ok(isEmail(" x.y+z@mail.example.com "));
  assert.ok(!isEmail("a@b"));
});

test("interpretAuth maps the API contract", () => {
  assert.deepEqual(interpretAuth({ status: 200, body: { user: { id: 1, email: "a@b.co", lang: "uk" } } }), { ok: true, user: { id: "1", email: "a@b.co", lang: "uk" } });
  assert.deepEqual(interpretAuth({ status: 202, body: { ok: true } }, 202), { ok: true, user: null });
  assert.deepEqual(interpretAuth({ status: 0, body: null }), { ok: false, code: "network" });
  assert.deepEqual(interpretAuth({ status: 400, body: { error: "invalid_email" } }), { ok: false, code: "invalid_email", field: "email" });
  assert.deepEqual(interpretAuth({ status: 400, body: { error: "weak_password" } }), { ok: false, code: "weak_password", field: "password" });
  assert.deepEqual(interpretAuth({ status: 400, body: { error: "invalid_token" } }), { ok: false, code: "invalid_token" });
  assert.deepEqual(interpretAuth({ status: 401, body: { error: "invalid_credentials" } }), { ok: false, code: "invalid_credentials" });
  assert.deepEqual(interpretAuth({ status: 403, body: { error: "email_not_confirmed" } }), { ok: false, code: "email_not_confirmed" });
  assert.deepEqual(interpretAuth({ status: 429, body: { error: "locked", retryAfter: 125 } }), { ok: false, code: "locked", retryAfter: 125 });
  assert.equal(interpretAuth({ status: 429, body: {} }).retryAfter, 60);
  assert.deepEqual(interpretAuth({ status: 500, body: null }), { ok: false, code: "generic" });
  assert.equal(retryMinutes(125), 3);
  assert.equal(retryMinutes(0), 1);
  assert.equal(normalizeUser({ id: 1 }), null);
});

test("free preview access rule and token routes", () => {
  assert.equal(canOpenLesson({ id: "b1.1", free_preview: true }, false), true);
  assert.equal(canOpenLesson({ id: "b1.2" }, false), false);
  assert.equal(canOpenLesson({ id: "b1.2" }, true), true);
  assert.deepEqual(parseTokenRoute("#/confirm/abcDEF123_-xyz"), { kind: "confirm", token: "abcDEF123_-xyz" });
  assert.deepEqual(parseTokenRoute("#/reset/0123456789abcdef"), { kind: "reset", token: "0123456789abcdef" });
  assert.equal(parseTokenRoute("#/reset/<script>"), null);
  assert.equal(parseTokenRoute("#/confirm/short"), null);
});

const item = (key, due, extra = {}) => ({ key, lessonId: key.split(":")[0], concept: key.split(":")[1], exercises: [], schedule: [{ day: 1 }, { day: 3 }], baseDay: "2026-10-10", step: 0, due, done: false, ...extra });

test("mergeProgress: union of lessons with max XP, days, earliest repetition", () => {
  const device = {
    ...emptyProgress(),
    xp: 25 + 4, // 4 XP from repetitions
    days: ["2026-10-12", "2026-10-13"],
    lessons: { "b1.1": { firstCompletedAt: "2026-10-12", lastCompletedAt: "2026-10-13", bestXp: 25, runs: 2 } },
    repeat: { "b1.1:P1": item("b1.1:P1", "2026-10-16", { step: 1 }), "b1.1:X": item("b1.1:X", "2026-10-14") },
  };
  const account = {
    ...emptyProgress(),
    xp: 15 + 30,
    days: ["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-12"],
    lessons: {
      "b1.1": { firstCompletedAt: "2026-10-01", lastCompletedAt: "2026-10-01", bestXp: 15, runs: 1 },
      "b2.1": { firstCompletedAt: "2026-10-02", lastCompletedAt: "2026-10-02", bestXp: 30, runs: 1 },
    },
    repeat: { "b1.1:P1": item("b1.1:P1", "2026-10-11") },
  };
  const m = mergeProgress(device, account);
  assert.deepEqual(Object.keys(m.lessons).sort(), ["b1.1", "b2.1"]);
  assert.deepEqual(m.lessons["b1.1"], { firstCompletedAt: "2026-10-01", lastCompletedAt: "2026-10-13", bestXp: 25, runs: 2 });
  assert.equal(m.xp, 25 + 30 + 4, "max XP per lesson plus repetition XP, never double-counted");
  assert.deepEqual(m.days, ["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-12", "2026-10-13"], "longest series and latest day both kept");
  assert.equal(m.repeat["b1.1:P1"].due, "2026-10-11", "earliest due wins");
  assert.ok(m.repeat["b1.1:X"]);
  assert.equal(lessonsXp(m.lessons), 55);
});

test("mergeProgress is commutative, idempotent and tolerant", () => {
  const a = { ...emptyProgress(), xp: 10, days: ["2026-10-13"], lessons: { x: { bestXp: 10, runs: 1, firstCompletedAt: "2026-10-13", lastCompletedAt: "2026-10-13" } }, repeat: { "x:a": item("x:a", "2026-10-15", { done: true }) } };
  const b = { ...emptyProgress(), xp: 0, repeat: { "x:a": item("x:a", "2026-10-20") } };
  const ab = mergeProgress(a, b);
  assert.ok(sameProgress(ab, mergeProgress(b, a)));
  assert.ok(sameProgress(ab, mergeProgress(ab, ab)));
  assert.equal(ab.repeat["x:a"].done, false, "an open item beats a finished copy");
  assert.ok(sameProgress(mergeProgress(null, "junk"), emptyProgress()));
  assert.ok(sameProgress(mergeProgress(a, null), normalizeProgress(a)));
  assert.equal(retryDelay(0), 5000);
  assert.equal(retryDelay(99), 300000);
});

test("road geometry", () => {
  const pts = [{ x: 50, y: 10 }, { x: 150, y: 90 }, { x: 60, y: 170 }];
  assert.equal(roadPath(pts.slice(0, 1)), "");
  const d = roadPath(pts);
  assert.equal(d, "M50 10C66.7 38 148.3 62 150 90C151.7 118 75 142 60 170");
  // split halves lie on the same curve
  assert.equal(roadPath(pts, 0, 1) + roadPath(pts, 1, 2).replace(/^M[\d.]+ [\d.]+/, ""), d);
  assert.equal(waveOffset(0, 0), 0);
  assert.equal(waveOffset(1, 0), 0.707);
  assert.equal(waveOffset(2, 0), 1);
  assert.equal(waveOffset(1, 1), -0.707);
  assert.equal(waveOffset(4, 0), 0);
  assert.equal(travelledIndex(["sign", "done", "done", "current", "open"]), 3);
  assert.equal(travelledIndex(["sign", "done", "soon"]), 1);
  assert.equal(travelledIndex(["sign", "open"]), -1);
  assert.equal(travelledIndex(["sign", "current"]), 1);
  assert.equal(travelledIndex(["sign", "done", "soon", "sign", "current"]), 1, "a locked lesson breaks the travelled part");
  assert.equal(travelledIndex(["sign", "done", "sign", "done", "current", "open"]), 4);
  const s = splitRoad(pts, 1);
  assert.equal(s.done, roadPath(pts, 0, 1));
  assert.equal(s.todo, roadPath(pts, 1, 2));
  assert.deepEqual(splitRoad(pts, -1), { done: "", todo: d });
});
