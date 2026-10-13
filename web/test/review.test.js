import { test } from "node:test";
import assert from "node:assert/strict";
import { interpretReview, validatePrompt, criterionLevel } from "../js/engine/review.js";

const ok = {
  score: 72,
  verdict: "working",
  passed: true,
  remaining: 4,
  review: {
    privacy_issue: { found: false, message: "" },
    off_task: false,
    criteria: [
      { id: "R1", applicable: true, score: 2, comment: "Clear" },
      { id: "R5", applicable: false, score: 0, comment: "" },
      { id: "R99", applicable: true, score: 2, comment: "bogus" },
    ],
    strengths: ["a", "b", "c", "d"],
    gaps: ["g"],
    improved_prompt: " better ",
  },
};

test("200 review is normalized", () => {
  const r = interpretReview({ status: 200, body: ok });
  assert.equal(r.kind, "review");
  assert.equal(r.passed, true);
  assert.equal(r.verdict, "working");
  assert.deepEqual(r.criteria.map((c) => c.id), ["R1"], "drops inapplicable and unknown criteria");
  assert.equal(r.strengths.length, 3);
  assert.equal(r.improved, "better");
  assert.equal(r.remaining, 4);
});

test("privacy issue always blocks passing", () => {
  const body = { ...ok, review: { ...ok.review, privacy_issue: { found: true, message: "Remove the card number" } } };
  const r = interpretReview({ status: 200, body });
  assert.equal(r.passed, false);
  assert.equal(r.privacy.found, true);
  assert.equal(r.privacy.message, "Remove the card number");
});

test("off_task is never passed", () => {
  const r = interpretReview({ status: 200, body: { ...ok, verdict: "off_task", score: null } });
  assert.equal(r.offTask, true);
  assert.equal(r.passed, false);
  assert.equal(r.score, null);
});

test("error statuses", () => {
  assert.deepEqual(interpretReview({ status: 429, body: { error: "limit", resetAt: "2026-10-14T00:00:00Z" } }), { kind: "limit", resetAt: "2026-10-14T00:00:00Z" });
  assert.deepEqual(interpretReview({ status: 503, body: { error: "unavailable" } }), { kind: "unavailable" });
  assert.deepEqual(interpretReview({ status: 0, body: null }), { kind: "unavailable" });
  assert.deepEqual(interpretReview({ status: 500, body: null }), { kind: "unavailable" });
  assert.deepEqual(interpretReview({ status: 200, body: { nope: 1 } }), { kind: "unavailable" });
  assert.deepEqual(interpretReview({ status: 400, body: { error: "input_too_short" } }), { kind: "invalid", code: "input_too_short" });
  assert.deepEqual(interpretReview({ status: 400, body: { error: "weird" } }), { kind: "unavailable" });
});

test("validatePrompt", () => {
  assert.equal(validatePrompt("  hi ", 15), "input_too_short");
  assert.equal(validatePrompt("x".repeat(15), 15), null);
  assert.equal(validatePrompt("x".repeat(4001), 15), "input_too_long");
  assert.equal(criterionLevel(2), "good");
  assert.equal(criterionLevel(1), "partial");
  assert.equal(criterionLevel(0), "missing");
});
