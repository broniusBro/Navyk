import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  prepare, check, canCheck, checkSingle, checkMulti, checkFindError, checkMatch, checkOrder, checkBuild, checkFillGap,
  splitGaps, attemptOutcome, insertIdea, initialPromptText, isAiExercise,
} from "../js/engine/exercises.js";
import { shuffle, shuffleChanged } from "../js/engine/rng.js";

const lesson = (lang, id) => JSON.parse(readFileSync(new URL(`../../content/dist/${lang}/${id}.json`, import.meta.url), "utf8"));
const ex = (l, id) => l.blocks.find((b) => b.id === id);

test("shuffle is deterministic per seed and a permutation", () => {
  const a = [1, 2, 3, 4, 5, 6, 7];
  assert.deepEqual(shuffle(a, "s"), shuffle(a, "s"));
  assert.deepEqual([...shuffle(a, "s")].sort(), a);
  assert.deepEqual(a, [1, 2, 3, 4, 5, 6, 7], "input not mutated");
  let differs = false;
  for (let i = 0; i < 10; i++) if (shuffle(a, `x${i}`).join() !== shuffle(a, `y${i}`).join()) differs = true;
  assert.ok(differs);
});

test("shuffleChanged never returns the original order", () => {
  for (let i = 0; i < 200; i++) {
    const out = shuffleChanged([0, 1], i);
    assert.deepEqual(out, [1, 0]);
    const out3 = shuffleChanged([0, 1, 2], `k${i}`);
    assert.notDeepEqual(out3, [0, 1, 2]);
  }
});

test("single_choice on real content: correct and wrong with whys", () => {
  const e = ex(lesson("ru", "b1.1"), "b1.1.e1");
  const right = e.options.findIndex((o) => o.correct);
  const wrong = e.options.findIndex((o) => !o.correct);
  assert.equal(checkSingle(e, right).correct, true);
  const r = checkSingle(e, wrong);
  assert.equal(r.correct, false);
  const shown = r.items.filter((i) => i.show).map((i) => i.index).sort();
  assert.deepEqual(shown, [right, wrong].sort(), "shows why for chosen and correct");
  assert.ok(r.items.every((i) => i.why));
});

test("multi_choice requires exact set", () => {
  const e = ex(lesson("ru", "b1.1"), "b1.1.e2");
  const target = e.options.flatMap((o, i) => (o.correct ? [i] : []));
  assert.equal(checkMulti(e, target).correct, true);
  assert.equal(checkMulti(e, target.slice(1)).correct, false);
  const r = checkMulti(e, [...target, e.options.findIndex((o) => !o.correct)]);
  assert.equal(r.correct, false);
  assert.ok(r.items.some((i) => i.status === "wrong"));
  const partial = checkMulti(e, target.slice(0, 1));
  assert.ok(partial.items.some((i) => i.status === "missed" && i.show));
});

test("compare_answers dispatches as single choice", () => {
  const e = ex(lesson("uk", "b2.1"), "b2.1.e1");
  assert.equal(e.type, "compare_answers");
  const right = e.options.findIndex((o) => o.correct);
  assert.equal(check(e, right).correct, true);
  assert.equal(check(e, (right + 1) % e.options.length).correct, false);
});

test("find_error: all weak segments must be found", () => {
  const e = ex(lesson("ru", "b2.1"), "b2.1.e3");
  const weak = e.segments.flatMap((s, i) => (s.weak ? [i] : []));
  assert.equal(e.segments.map((s) => s.text).join(""), e.prompt);
  assert.equal(checkFindError(e, weak).correct, true);
  const r = checkFindError(e, weak.slice(0, 2));
  assert.equal(r.correct, false);
  assert.equal(r.found, 2);
  assert.equal(r.total, weak.length);
  assert.equal(checkFindError(e, [...weak, 0]).correct, false);
});

test("match_pairs: right column shuffled, checking by index", () => {
  const e = ex(lesson("en", "b2.1"), "b2.1.e2");
  const p = prepare(e, 42);
  assert.notDeepEqual(p.rightOrder, p.leftOrder);
  const perfect = Object.fromEntries(e.pairs.map((_, i) => [i, i]));
  assert.equal(checkMatch(e, perfect).correct, true);
  const swapped = { ...perfect, 0: 1, 1: 0 };
  const r = checkMatch(e, swapped);
  assert.equal(r.correct, false);
  assert.deepEqual(r.items.map((i) => i.correct), [false, false, true, true]);
  assert.equal(canCheck(e, { 0: 0 }), false);
  assert.equal(canCheck(e, perfect), true);
});

test("order_steps: shuffled initially and checked by position", () => {
  const e = ex(lesson("ru", "b2.1"), "b2.1.e4");
  const { order } = prepare(e, "seed");
  assert.notDeepEqual(order, e.items.map((_, i) => i));
  assert.equal(checkOrder(e, e.items.map((_, i) => i)).correct, true);
  const r = checkOrder(e, order);
  assert.equal(r.correct, false);
  assert.ok(r.items.every((x) => typeof x.why === "string"));
  assert.deepEqual(prepare({ ...e, shuffle: false }, "seed").order, e.items.map((_, i) => i));
});

test("order_steps accepts plain-string items", () => {
  const e = { id: "x", type: "order_steps", items: ["a", "b", "c"] };
  const r = checkOrder(e, [0, 1, 2]);
  assert.equal(r.correct, true);
  assert.equal(r.items[0].text, "a");
});

const buildEx = {
  id: "t.e1",
  type: "build_prompt",
  blocks: [
    { id: "b1", text: "Write a post", role: "goal", why: "g" },
    { id: "b2", text: "for our bakery", role: "context", why: "c" },
    { id: "b3", text: "in 3 lines", role: "format", why: "f" },
    { id: "b4", text: "please be smart", role: "noise", why: "n" },
  ],
  target_order: ["b1", "b2", "b3"],
};

test("build_prompt: exact order, noise excluded", () => {
  assert.equal(checkBuild(buildEx, ["b1", "b2", "b3"]).correct, true);
  const withNoise = checkBuild(buildEx, ["b1", "b2", "b3", "b4"]);
  assert.equal(withNoise.correct, false);
  assert.equal(withNoise.items.find((i) => i.id === "b4").status, "noise_used");
  const misplaced = checkBuild(buildEx, ["b2", "b1", "b3"]);
  assert.equal(misplaced.items.find((i) => i.id === "b1").status, "misplaced");
  const missing = checkBuild(buildEx, ["b1", "b2"]);
  assert.equal(missing.items.find((i) => i.id === "b3").status, "missing");
  assert.equal(checkBuild(buildEx, ["b1", "b2", "b3"]).text, "Write a post for our bakery in 3 lines");
});

const gapEx = {
  id: "t.e2",
  type: "fill_gap",
  text: "Say ___ and ___.",
  gaps: [
    { options: [{ text: "what", correct: true, why: "w1" }, { text: "nothing", correct: false, why: "w2" }] },
    { options: [{ text: "why", correct: true, why: "w3" }, { text: "never", correct: false, why: "w4" }] },
  ],
};

test("fill_gap: every gap must be right; whys for chosen and correct", () => {
  assert.equal(checkFillGap(gapEx, [0, 0]).correct, true);
  const r = checkFillGap(gapEx, [1, 0]);
  assert.equal(r.correct, false);
  assert.equal(r.items[0].chosenWhy, "w2");
  assert.equal(r.items[0].correctWhy, "w1");
  assert.equal(canCheck(gapEx, [0, null]), false);
  assert.deepEqual(splitGaps(gapEx.text), ["Say ", { gap: 0 }, " and ", { gap: 1 }, "."]);
  assert.deepEqual(splitGaps("___ start"), [{ gap: 0 }, " start"]);
});

test("attempt policy: one retry, then reveal; first-try flag", () => {
  assert.deepEqual(attemptOutcome(true, 1), { done: true, firstTry: true, canRetry: false, reveal: true });
  assert.deepEqual(attemptOutcome(false, 1), { done: false, firstTry: false, canRetry: true, reveal: false });
  assert.deepEqual(attemptOutcome(true, 2), { done: true, firstTry: false, canRetry: false, reveal: true });
  assert.deepEqual(attemptOutcome(false, 2), { done: true, firstTry: false, canRetry: false, reveal: true });
});

test("practice helpers", () => {
  const imp = ex(lesson("ru", "b2.1"), "b2.1.e5");
  assert.equal(initialPromptText(imp), imp.weak_prompt);
  assert.equal(initialPromptText(ex(lesson("ru", "b1.1"), "b1.1.e5")), "");
  assert.ok(isAiExercise(imp));
  assert.deepEqual(insertIdea("Hello", "world"), { text: "Hello world", caret: 11 });
  assert.deepEqual(insertIdea("", "x"), { text: "x", caret: 1 });
  assert.deepEqual(insertIdea("ab cd", "X", 2), { text: "ab X cd", caret: 4 });
});

test("every exercise in built content is renderable and checkable", () => {
  const known = new Set(["single_choice", "multi_choice", "compare_answers", "find_error", "match_pairs", "order_steps", "build_prompt", "fill_gap", "write_prompt", "improve_prompt"]);
  for (const lang of ["ru", "uk", "en", "pl"]) {
    for (const id of ["b1.1", "b2.1", "b2.8", "b4.3", "b6.2", "b7.6"]) {
      for (const e of lesson(lang, id).blocks.filter((b) => b.kind === "exercise")) {
        assert.ok(known.has(e.type), `${lang}/${e.id}: ${e.type}`);
        assert.ok(e.hint, `${e.id} has hint`);
        if (!isAiExercise(e)) prepare(e, 1);
      }
    }
  }
});
