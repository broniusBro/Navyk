import { test } from "node:test";
import assert from "node:assert/strict";
import { pickGender, bothGenders, resolveGender, genderMarkError, normalizeGender } from "../js/engine/gender.js";

test("pickGender: m, f and not chosen (masculine)", () => {
  const s = "{{g:Byłem|Byłam}} w Krakowie, ты устал{{g:|а}}";
  assert.equal(pickGender(s, "m"), "Byłem w Krakowie, ты устал");
  assert.equal(pickGender(s, "f"), "Byłam w Krakowie, ты устала");
  assert.equal(pickGender(s, "x"), "Byłem w Krakowie, ты устал");
  assert.equal(pickGender("bez znaczników", "f"), "bez znaczników");
  assert.equal(normalizeGender("?"), "x");
});

test("bothGenders gives masculine then feminine", () => {
  assert.deepEqual(bothGenders("{{g:Zrobiłem|Zrobiłam}} to."), ["Zrobiłem to.", "Zrobiłam to."]);
  assert.deepEqual(bothGenders("Tak."), ["Tak."]);
});

test("resolveGender: texts follow the learner, accept lists keep both forms (learner's first)", () => {
  const ex = {
    type: "type_answer",
    prompt: "Напиши: «Я был{{g:|а}} дома»",
    accept: ["{{g:Byłem|Byłam}} w domu.", "W domu {{g:byłem|byłam}}."],
    words: ["{{g:Byłem|Byłam}}", "w", "domu."],
  };
  const f = resolveGender(ex, "f");
  assert.equal(f.prompt, "Напиши: «Я была дома»");
  assert.deepEqual(f.words, ["Byłam", "w", "domu."]);
  assert.equal(f.accept[0], "Byłam w domu.");
  assert.ok(f.accept.includes("Byłem w domu.") && f.accept.includes("W domu byłam.") && f.accept.includes("W domu byłem."));
  const orders = resolveGender({ accept: [["W", "domu", "{{g:byłem.|byłam.}}"]] }, "f").accept;
  assert.deepEqual(orders[0], ["W", "domu", "byłam."]);
  assert.ok(orders.some((o) => o.at(-1) === "byłem."));
});

test("genderMarkError catches broken marks", () => {
  assert.equal(genderMarkError("{{g:był|była}}"), "");
  assert.notEqual(genderMarkError("{{g:był}}"), "");
  assert.notEqual(genderMarkError("{{g:był|była"), "");
});
