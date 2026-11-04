import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import {
  prepare, check, canCheck, checkSingle, checkMulti, checkMatch, checkOrder, checkFillGap,
  splitGaps, attemptOutcome, isAiExercise, AI_TYPES, bankWords, lessonOfExercise,
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

const real = lesson("ru", "a1m1.1");

test("single_choice on real content: correct and wrong with whys", () => {
  const e = ex(real, "a1m1.1.e2");
  const right = e.options.findIndex((o) => o.correct);
  const wrong = e.options.findIndex((o) => !o.correct);
  assert.equal(checkSingle(e, right).correct, true);
  const r = checkSingle(e, wrong);
  assert.equal(r.correct, false);
  const shown = r.items.filter((i) => i.show).map((i) => i.index).sort();
  assert.deepEqual(shown, [right, wrong].sort(), "shows why for chosen and correct");
  assert.ok(r.items.every((i) => i.why));
});

const multiEx = {
  id: "t.e3",
  type: "multi_choice",
  options: [
    { text: "a", correct: true, why: "1" },
    { text: "b", correct: true, why: "2" },
    { text: "c", correct: false, why: "3" },
  ],
};

test("multi_choice requires exact set", () => {
  const e = multiEx;
  const target = [0, 1];
  assert.equal(checkMulti(e, target).correct, true);
  assert.equal(checkMulti(e, target.slice(1)).correct, false);
  const r = checkMulti(e, [...target, 2]);
  assert.equal(r.correct, false);
  assert.ok(r.items.some((i) => i.status === "wrong"));
  const partial = checkMulti(e, target.slice(0, 1));
  assert.ok(partial.items.some((i) => i.status === "missed" && i.show));
});

test("match_pairs: right column shuffled, checking by index", () => {
  const e = ex(real, "a1m1.1.e1");
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
  const e = { id: "t.e4", type: "order_steps", items: [{ text: "Dzień dobry!", why: "1" }, { text: "Poproszę kawę.", why: "2" }, { text: "Dziękuję!", why: "3" }] };
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

test("build_sentence on real content: bank = words + extra, shuffled; dispatch and canCheck", () => {
  const e = ex(real, "a1m1.1.e6");
  const bank = bankWords(e);
  assert.deepEqual(bank, [...e.words, ...e.extra]);
  const { order } = prepare(e, 7);
  assert.deepEqual([...order].sort(), bank.map((_, i) => i));
  assert.notDeepEqual(order, bank.map((_, i) => i));
  assert.deepEqual(prepare(e, 7).order, order, "seeded");
  assert.equal(check(e, e.words).correct, true);
  assert.equal(check(e, ["Tak,", "dziękuję.", "Cześć!"]).correct, false);
  assert.equal(canCheck(e, []), false);
  assert.equal(canCheck(e, ["Nie,"]), true);
});

test("type_answer and speak dispatch through check/canCheck", () => {
  const ta = ex(real, "a1m1.1.e5");
  assert.equal(check(ta, "tak dziekuje").correct, true);
  assert.equal(check(ta, "tak dziekuje").diacriticsOnly, true);
  assert.equal(check(ta, "Nie").correct, false);
  assert.equal(canCheck(ta, "  ,. "), false);
  assert.equal(canCheck(ta, "tak"), true);
  const sp = ex(real, "a1m1.1.e4");
  assert.equal(check(sp, ["dziękuję"]).correct, true);
  assert.equal(check(sp, ["dzień dobry"]).correct, false);
  assert.equal(canCheck(sp, null), false);
  assert.equal(canCheck(sp, ["dziękuję"]), true);
});

test("AI types and lessonOfExercise", () => {
  assert.ok(isAiExercise({ type: "translate" }));
  assert.ok(isAiExercise({ type: "dialog" }));
  assert.ok(!isAiExercise({ type: "type_answer" }));
  assert.deepEqual([...AI_TYPES].sort(), ["dialog", "translate"]);
  assert.equal(lessonOfExercise("a1m1.1.e7"), "a1m1.1");
  assert.equal(lessonOfExercise("b1m10.4.e12"), "b1m10.4");
  assert.equal(lessonOfExercise("nope"), null);
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

test("every exercise in built content is renderable and checkable", () => {
  const RENDERERS_TYPES = ["single_choice", "multi_choice", "match_pairs", "order_steps", "fill_gap", "build_sentence", "type_answer", "speak", "translate", "dialog"];
  const course = JSON.parse(readFileSync(new URL("../../content/course.json", import.meta.url), "utf8"));
  assert.deepEqual(Object.keys(course.exercise_types).sort(), [...RENDERERS_TYPES].sort(), "client knows every course type");
  for (const [type, meta] of Object.entries(course.exercise_types)) assert.equal(Boolean(meta.ai), isAiExercise({ type }), type);
  const dir = new URL("../../content/dist/ru/", import.meta.url);
  for (const f of readdirSync(dir).filter((n) => n.endsWith(".json"))) {
    for (const e of JSON.parse(readFileSync(new URL(f, dir), "utf8")).blocks.filter((b) => b.kind === "exercise")) {
      assert.ok(RENDERERS_TYPES.includes(e.type), `${e.id}: ${e.type}`);
      assert.ok(e.hint, `${e.id} has hint`);
      if (!isAiExercise(e)) prepare(e, 1);
    }
  }
});
