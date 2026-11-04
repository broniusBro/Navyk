import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  emptyProgress, normalizeProgress, lessonXp, streak, completeLesson, scheduleFromMeta, dueItems, reviewItem,
  applyReviews, nextDue, pickReviewExercise, XP,
} from "../js/engine/progress.js";
import { dayKey, daysBetween, addDays } from "../js/engine/dates.js";
import { startSession, recordAttempt, recordPractice, recordSkip, next, isFinished, sessionResults } from "../js/engine/session.js";

const meta = JSON.parse(readFileSync(new URL("../../content/dist/ru/a1m1.1.json", import.meta.url), "utf8")).meta;

test("dates", () => {
  assert.equal(dayKey(new Date(2026, 0, 5)), "2026-01-05");
  assert.equal(addDays("2026-02-27", 2), "2026-03-01");
  assert.equal(addDays("2026-03-29", 1), "2026-03-30"); // DST-safe
  assert.equal(daysBetween("2026-12-30", "2027-01-02"), 3);
});

test("xp: 10 per lesson, 5 per first-try, bonus for passed AI", () => {
  const r = lessonXp([
    { exerciseId: "a", firstTry: true },
    { exerciseId: "b", firstTry: false },
    { exerciseId: "c", firstTry: true },
    { exerciseId: "d", ai: true, passed: true },
  ]);
  assert.deepEqual(r, { base: 10, firstTry: 10, ai: XP.aiPassed, total: 20 + XP.aiPassed });
  assert.equal(lessonXp([{ ai: true, passed: false, firstTry: true }]).total, 10, "AI practice never counts as first-try");
});

test("streak counts consecutive days ending today or yesterday", () => {
  assert.equal(streak([], "2026-10-13"), 0);
  assert.equal(streak(["2026-10-13"], "2026-10-13"), 1);
  assert.equal(streak(["2026-10-11", "2026-10-12"], "2026-10-13"), 2, "still alive before today's lesson");
  assert.equal(streak(["2026-10-10", "2026-10-11"], "2026-10-13"), 0, "broken");
  assert.equal(streak(["2026-10-09", "2026-10-11", "2026-10-12", "2026-10-13"], "2026-10-13"), 3);
});

test("completeLesson: xp, streak, repetition; replays do not farm xp", () => {
  const results = [{ exerciseId: "e1", firstTry: true }, { exerciseId: "e2", firstTry: false }];
  let p = { ...emptyProgress(), days: ["2026-10-12"] };
  const r1 = completeLesson(p, { lessonId: "a1m1.1", results, meta, today: "2026-10-13" });
  assert.equal(r1.awarded, 15);
  assert.equal(r1.progress.xp, 15);
  assert.equal(r1.streakBefore, 1);
  assert.equal(r1.streakAfter, 2);
  assert.equal(r1.newRepeat.length, meta.repeat.length);
  const r2 = completeLesson(r1.progress, { lessonId: "a1m1.1", results, meta, today: "2026-10-13" });
  assert.equal(r2.awarded, 0);
  assert.equal(r2.progress.lessons["a1m1.1"].runs, 2);
  assert.equal(r2.newRepeat.length, 0, "replay does not reset repetition");
  const better = [{ exerciseId: "e1", firstTry: true }, { exerciseId: "e2", firstTry: true }];
  const r3 = completeLesson(r2.progress, { lessonId: "a1m1.1", results: better, meta, today: "2026-10-14" });
  assert.equal(r3.awarded, 5);
  assert.equal(r3.progress.xp, 20);
  assert.deepEqual(r3.progress.days, ["2026-10-12", "2026-10-13", "2026-10-14"]);
  assert.ok(normalizeProgress(r3.progress).repeat["a1m1.1:first_words"], "new lesson ids survive normalizeProgress");
});

test("repetition schedule from meta.repeat", () => {
  const { repeat } = scheduleFromMeta({}, { lessonId: "a1m1.1", meta, today: "2026-10-13" });
  const fw = repeat["a1m1.1:first_words"];
  assert.equal(fw.due, "2026-10-14");
  assert.deepEqual(fw.exercises, ["a1m1.1.e1", "a1m1.1.e2", "a1m1.1.e5"]);
  assert.equal(repeat["a1m1.1:letters_w_ch"].due, "2026-10-15");
  assert.equal(dueItems(repeat, "2026-10-13").length, 0);
  assert.deepEqual(dueItems(repeat, "2026-10-14").map((i) => i.key), ["a1m1.1:first_words"]);
  assert.equal(dueItems(repeat, "2026-10-20").length, 2);
  assert.equal(nextDue(repeat), "2026-10-14");
});

test("reviewItem: correct advances along schedule from lesson day; wrong returns to nearest day", () => {
  const { repeat } = scheduleFromMeta({}, { lessonId: "a1m1.1", meta, today: "2026-10-13" });
  let it = repeat["a1m1.1:first_words"]; // days 1, 3, 7
  it = reviewItem(it, true, "2026-10-14");
  assert.equal(it.step, 1);
  assert.equal(it.due, "2026-10-16");
  const wrong = reviewItem(it, false, "2026-10-16");
  assert.equal(wrong.step, 1);
  assert.equal(wrong.due, "2026-10-17", "nearest repetition day = schedule[0].day from today");
  assert.equal(wrong.lapses, 1);
  // late review: next due never in the past
  const late = reviewItem(it, true, "2026-10-25");
  assert.equal(late.step, 2);
  assert.equal(late.due, "2026-10-26");
  let done = it;
  for (const d of ["2026-10-16", "2026-10-20"]) done = reviewItem(done, true, d);
  assert.equal(done.done, true);
  assert.equal(dueItems({ x: done }, "2027-01-01").length, 0);
});

test("applyReviews and pickReviewExercise (new exercise types)", () => {
  const { repeat } = scheduleFromMeta({}, { lessonId: "a1m1.1", meta, today: "2026-10-13" });
  const key = "a1m1.1:first_words";
  const p = applyReviews({ ...emptyProgress(), repeat }, [{ key, correct: true }, { key: "missing", correct: true }], "2026-10-14");
  assert.equal(p.repeat[key].step, 1);
  const blocks = [
    { id: "a1m1.1.e1", type: "match_pairs" },
    { id: "a1m1.1.e2", type: "single_choice" },
    { id: "a1m1.1.e5", type: "type_answer" },
    { id: "a1m1.1.e7", type: "dialog" },
  ];
  assert.equal(pickReviewExercise(repeat[key], blocks).id, "a1m1.1.e1", "day 1 wants match_pairs");
  assert.equal(pickReviewExercise(p.repeat[key], blocks).id, "a1m1.1.e2", "day 3 wants single_choice");
  const p2 = applyReviews(p, [{ key, correct: true }], "2026-10-16");
  assert.equal(pickReviewExercise(p2.repeat[key], blocks).id, "a1m1.1.e5", "day 7 wants type_answer");
  assert.equal(pickReviewExercise({ ...repeat[key], exercises: ["nope"] }, blocks), null);
});

test("normalizeProgress tolerates garbage", () => {
  assert.deepEqual(normalizeProgress(null), emptyProgress());
  assert.deepEqual(normalizeProgress("x"), emptyProgress());
  assert.deepEqual(normalizeProgress({ version: 99, xp: 5 }), emptyProgress());
  const n = normalizeProgress({ version: 1, xp: -3, days: ["2026-10-13", "bad", "2026-10-13"], lessons: null, repeat: {} });
  assert.equal(n.xp, 0);
  assert.deepEqual(n.days, ["2026-10-13"]);
  assert.deepEqual(n.lessons, {});
});

test("session: attempts, practice and results", () => {
  const lesson = JSON.parse(readFileSync(new URL("../../content/dist/ru/a1m1.1.json", import.meta.url), "utf8"));
  let s = startSession(lesson);
  assert.ok(s.blocks.every((b) => b.kind !== "sources"));
  let r = recordAttempt(s, "a1m1.1.e1", true);
  s = r.session;
  assert.equal(r.outcome.firstTry, true);
  r = recordAttempt(s, "a1m1.1.e2", false);
  s = r.session;
  assert.equal(r.outcome.canRetry, true);
  assert.equal(s.results["a1m1.1.e2"], undefined);
  r = recordAttempt(s, "a1m1.1.e2", true);
  s = r.session;
  assert.equal(s.results["a1m1.1.e2"].firstTry, false);
  s = recordPractice(s, "a1m1.1.e7", { mode: "review", passed: true });
  s = recordPractice(s, "a1m1.1.e7", { mode: "selfcheck", passed: false });
  assert.equal(s.results["a1m1.1.e7"].passed, true, "a later weaker try does not remove a pass");
  const res = sessionResults(s);
  assert.equal(res.length, lesson.blocks.filter((b) => b.kind === "exercise").length);
  assert.equal(res.find((x) => x.exerciseId === "a1m1.1.e7").ai, true, "dialog is an AI exercise");
  assert.equal(lessonXp(res).total, 10 + 5 + XP.aiPassed);
  while (!isFinished(s)) s = next(s);
  assert.equal(s.index, s.blocks.length);
});

test("recordSkip (speak: «Не могу сейчас говорить»): counts as done, no first-try XP, no error", () => {
  const lessonJson = JSON.parse(readFileSync(new URL("../../content/dist/ru/a1m1.1.json", import.meta.url), "utf8"));
  let s = startSession(lessonJson);
  const speakId = s.blocks.find((b) => b.type === "speak").id;
  s = recordSkip(s, speakId);
  const r = sessionResults(s).find((x) => x.exerciseId === speakId);
  assert.equal(r.skipped, true);
  assert.equal(r.firstTry, false);
  assert.equal(r.correct, true);
  // a real answer recorded before is not overwritten
  let s2 = startSession(lessonJson);
  s2 = recordAttempt(s2, speakId, true).session;
  s2 = recordSkip(s2, speakId);
  assert.equal(sessionResults(s2).find((x) => x.exerciseId === speakId).firstTry, true);
});
