import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pathStatus, levelSummary, recommendedLevel, findLevel, levelOfLesson } from "../js/engine/course.js";

// A small course with three levels: two modules in "a", one in "b", one in "c".
const course = {
  levels: [
    { id: "a", modules: [{ lessons: [{ id: "a1" }, { id: "a2" }] }, { lessons: [{ id: "a3" }] }] },
    { id: "b", modules: [{ lessons: [{ id: "b1" }, { id: "b2" }] }] },
    { id: "c", modules: [{ lessons: [{ id: "c1" }] }] },
  ],
};

test("pathStatus: one current per level, levels do not block each other", () => {
  const st = pathStatus(course, new Set(["a1", "a2", "a3", "b1", "b2"]), new Set());
  assert.equal(st.a1, "current");
  assert.equal(st.a2, "open");
  assert.equal(st.b1, "current");
  assert.equal(st.b2, "open");
  assert.equal(st.c1, "soon");
  assert.equal(Object.values(st).filter((s) => s === "current").length, 2);
});

test("pathStatus: current skips done and unavailable lessons within the level", () => {
  const st = pathStatus(course, new Set(["a1", "a3", "b2"]), new Set(["a1"]));
  assert.equal(st.a1, "done");
  assert.equal(st.a2, "soon");
  assert.equal(st.a3, "current");
  assert.equal(st.b1, "soon");
  assert.equal(st.b2, "current");
});

test("pathStatus: a done lesson stays done even when it is not available any more", () => {
  const st = pathStatus(course, new Set(), new Set(["b1"]));
  assert.equal(st.b1, "done");
  assert.equal(st.b2, "soon");
});

test("levelSummary: totals, done, available, current", () => {
  const avail = new Set(["a1", "a2", "a3", "b1"]);
  const a = levelSummary(course.levels[0], avail, new Set(["a1"]));
  assert.deepEqual({ ...a, current: a.current?.id }, { id: "a", modules: 2, total: 3, done: 1, available: 3, current: "a2", complete: false });
  const b = levelSummary(course.levels[1], avail, new Set());
  assert.equal(b.current.id, "b1");
  assert.equal(b.available, 1);
  const c = levelSummary(course.levels[2], avail, new Set());
  assert.deepEqual({ ...c, current: c.current }, { id: "c", modules: 1, total: 1, done: 0, available: 0, current: null, complete: false });
});

test("levelSummary: complete level has no current; empty level is never complete", () => {
  const a = levelSummary(course.levels[0], new Set(["a1", "a2", "a3"]), new Set(["a1", "a2", "a3"]));
  assert.equal(a.complete, true);
  assert.equal(a.current, null);
  assert.equal(a.done, 3);
  const empty = levelSummary({ id: "x", modules: [] }, new Set(), new Set());
  assert.equal(empty.total, 0);
  assert.equal(empty.complete, false);
  assert.equal(levelSummary(null, new Set(), new Set()).total, 0);
});

test("levelSummary agrees with pathStatus on the current lesson", () => {
  const avail = new Set(["a2", "a3", "b2"]);
  const done = new Set(["a2"]);
  const st = pathStatus(course, avail, done);
  for (const level of course.levels) {
    const s = levelSummary(level, avail, done);
    const cur = Object.keys(st).find((id) => st[id] === "current" && id.startsWith(level.id));
    assert.equal(s.current?.id, cur, level.id);
  }
});

test("recommendedLevel: first unfinished level with something to take, else first unfinished", () => {
  const sum = (avail, done) => course.levels.map((l) => levelSummary(l, new Set(avail), new Set(done)));
  assert.equal(recommendedLevel(sum(["a1", "b1"], [])), "a");
  assert.equal(recommendedLevel(sum(["a1", "a2", "a3", "b1"], ["a1", "a2", "a3"])), "b");
  // "a" is done, "b" has nothing ready yet but "c" has: recommend "c"
  assert.equal(recommendedLevel(sum(["a1", "a2", "a3", "c1"], ["a1", "a2", "a3"])), "c");
  // nothing ready anywhere: the first unfinished level
  assert.equal(recommendedLevel(sum(["a1", "a2", "a3"], ["a1", "a2", "a3"])), "b");
  assert.equal(recommendedLevel(sum([], ["a1", "a2", "a3", "b1", "b2", "c1"])), null);
});

test("findLevel and levelOfLesson", () => {
  assert.equal(findLevel(course, "b").id, "b");
  assert.equal(findLevel(course, "zzz"), null);
  assert.equal(findLevel(null, "a"), null);
  assert.equal(levelOfLesson(course, "a3"), "a");
  assert.equal(levelOfLesson(course, "c1"), "c");
  assert.equal(levelOfLesson(course, "nope"), null);
});

test("real course: three levels, each with its own current lesson", () => {
  const real = JSON.parse(readFileSync(new URL("../../content/course.json", import.meta.url), "utf8"));
  assert.deepEqual(real.levels.map((l) => l.id), ["beginner", "advanced", "pro"]);
  const firstOf = (l) => l.modules[0].lessons[0].id;
  const avail = new Set(real.levels.map(firstOf));
  const st = pathStatus(real, avail, new Set());
  for (const l of real.levels) assert.equal(st[firstOf(l)], "current", l.id);
  const sums = real.levels.map((l) => levelSummary(l, avail, new Set()));
  assert.deepEqual(sums.map((s) => s.total), [34, 42, 45]);
  assert.equal(recommendedLevel(sums), "beginner");
});
