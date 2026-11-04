// ИИ-маршруты /api/ai/translate|dialog|helper: валидация, ответы, история, итог разговора, лимиты.
// Claude API подменён (aiOptions.fetchImpl + apiKey) — реальных запросов нет.
// Урок с переводом и диалогом — фикстура test/fixtures/dist/ru/a1m9.1.json (CONTENT_DIST), сценарии — настоящий content/talk.
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ORIGIN = "http://localhost:8080";
const FIXTURES = fileURLToPath(new URL("./fixtures/dist", import.meta.url));
const dataDir = mkdtempSync(join(tmpdir(), "brolingvo-ai-"));
process.env.DATA_DIR = dataDir;
process.env.PUBLIC_ORIGIN = ORIGIN;
process.env.EMAIL_PROVIDER = "log";
process.env.COOKIE_SECURE = "false";
process.env.CONTENT_DIST = FIXTURES;
delete process.env.ANTHROPIC_API_KEY;

const { createApp } = await import("../src/http.ts");
const { MAX_HISTORY, MAX_ANSWER } = await import("../src/ai/tutor.ts");

// ---------------- подменённый Claude ----------------

interface Sent {
  kind: "translate" | "dialog" | "helper";
  body: any;
  user: string;
}
const sent: Sent[] = [];
/** Что вернёт «модель» на следующий запрос данного вида (иначе — ответ по умолчанию). */
const next: Partial<Record<Sent["kind"], unknown>> = {};
let failNext = 0;

const DEFAULTS = {
  translate: { verdict: "close", corrected: "Chcę kawę, proszę.", notes: ["Kawa → kawę: после chcę нужен винительный падеж."] },
  dialog: {
    reply_pl: "Kawa czy herbata?",
    reply_ru: "Кофе или чай?",
    correction: { needed: true, fixed: "Poproszę kawę.", explain: "После poproszę — винительный: kawę." },
    goals_done: [0],
    chips: ["Kawę, proszę.", "Herbatę.", "Nie wiem."],
    finished: false,
    summary: { stars: 0, praise: "", tips: [] },
  },
  helper: "W читается как [в]: *woda* — вода.",
};

const fakeClaude = (async (_url: string, init: any) => {
  const body = JSON.parse(init.body);
  const props = body.output_config?.format?.schema?.properties ?? {};
  const kind: Sent["kind"] = "verdict" in props ? "translate" : "reply_pl" in props ? "dialog" : "helper";
  sent.push({ kind, body, user: body.messages[0].content });
  if (failNext > 0) {
    failNext--;
    return new Response('{"type":"error"}', { status: 500 });
  }
  const data = kind in next ? next[kind] : DEFAULTS[kind];
  delete next[kind];
  return Response.json({
    stop_reason: "end_turn",
    content: [{ type: "text", text: typeof data === "string" ? data : JSON.stringify(data) }],
    usage: { input_tokens: 100, output_tokens: 50 },
  });
}) as typeof fetch;

const aiOptions = { apiKey: "test-key", fetchImpl: fakeClaude, maxRetries: 0 };

function startApp(opts: Parameters<typeof createApp>[0]): Promise<{ server: Server; base: string }> {
  const server = createApp({ db: null, authPerMinutePerIp: 1000, ...opts });
  return new Promise((r) => server.listen(0, () => r({ server, base: `http://localhost:${(server.address() as AddressInfo).port}` })));
}

let app: { server: Server; base: string };
let noKey: { server: Server; base: string };
before(async () => {
  app = await startApp({ aiOptions, aiPerDay: 1000, ipAiPerDay: 1000 });
  noKey = await startApp({ aiPerDay: 1000 });
});
after(() => {
  app.server.close();
  noKey.server.close();
  rmSync(dataDir, { recursive: true, force: true });
});
beforeEach(() => {
  sent.length = 0;
  failNext = 0;
  for (const k of Object.keys(next)) delete (next as any)[k];
});

async function post(base: string, path: string, body: unknown, headers: Record<string, string> = {}) {
  const r = await fetch(base + path, {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN, ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
  const text = await r.text();
  return { status: r.status, body: text ? JSON.parse(text) : null };
}
const ai = (kind: string, body: unknown, base = app.base) => post(base, `/api/ai/${kind}`, body);
const between = (msg: string, tag: string) => msg.split(`<${tag}>`)[1]?.split(`</${tag}>`)[0] ?? "";

// ---------------- translate ----------------

test("translate: body validation → 400 before any model call", async () => {
  const good = { lessonId: "a1m9.1", exerciseId: "a1m9.1.e1", answer: "Chce kawa prosze" };
  for (const bad of [
    {},
    { ...good, lessonId: "b2.1" }, // old Navyk id
    { ...good, lessonId: "a1m9.1/../../x" },
    { ...good, lessonId: 123 },
    { ...good, exerciseId: "a1m9.1.x1" },
    { ...good, exerciseId: "a1m1.1.e1" }, // exercise of another lesson
    { ...good, exerciseId: undefined },
    { ...good, answer: 42 },
    { ...good, answer: undefined },
    { ...good, answer: "x".repeat(MAX_ANSWER * 2 + 1) },
  ]) {
    const r = await ai("translate", bad);
    assert.equal(r.status, 400, JSON.stringify(bad).slice(0, 80));
    assert.deepEqual(r.body, { error: "bad_request" });
  }
  assert.equal((await ai("translate", "[1,2]")).status, 400, "array body");
  assert.equal((await ai("translate", "null")).status, 400, "null body");
  assert.equal((await ai("translate", "{oops")).status, 400, "bad JSON");
  assert.equal(sent.length, 0);
});

test("translate: 503 {reason:'no_key'} without an API key", async () => {
  const r = await ai("translate", { lessonId: "a1m9.1", exerciseId: "a1m9.1.e1", answer: "Chcę kawę." }, noKey.base);
  assert.deepEqual([r.status, r.body], [503, { error: "unavailable", reason: "no_key" }]);
});

test("translate: success shape, lesson context comes from the server", async () => {
  const r = await ai("translate", { lessonId: "a1m9.1", exerciseId: "a1m9.1.e1", answer: "Chce kawa, prosze.", deviceId: "device-trans-1" });
  assert.equal(r.status, 200);
  assert.deepEqual(Object.keys(r.body).sort(), ["available", "corrected", "notes", "remaining", "verdict"]);
  assert.equal(r.body.available, true);
  assert.equal(r.body.verdict, "close");
  assert.equal(r.body.corrected, "Chcę kawę, proszę.");
  assert.deepEqual(r.body.notes, DEFAULTS.translate.notes);
  assert.equal(r.body.remaining, 999);
  assert.equal(sent.length, 1);
  const msg = sent[0].user;
  const lesson = JSON.parse(between(msg, "lesson"));
  assert.equal(lesson.source_ru, "Я хочу кофе, пожалуйста.");
  assert.deepEqual(lesson.reference_translations, ["Chcę kawę, proszę.", "Poproszę kawę."]);
  assert.equal(lesson.level, "a1");
  assert.equal(between(msg, "student").trim(), "Chce kawa, prosze.");
  assert.equal(sent[0].body.output_config.format.type, "json_schema");
  assert.equal(sent[0].body.system[0].cache_control.type, "ephemeral");
});

test("translate: model output is trimmed to the limits", async () => {
  next.translate = { verdict: "ok", corrected: "y".repeat(1000), notes: ["a", "b", "c", "d", "e"] };
  const r = await ai("translate", { lessonId: "a1m9.1", exerciseId: "a1m9.1.e1", answer: "Poproszę kawę." });
  assert.equal(r.body.corrected.length, 400);
  assert.equal(r.body.notes.length, 3);
});

test("translate: wrong exercise type, unknown exercise or lesson → 404", async () => {
  // type_answer in the fixture, dialog in the fixture
  for (const exerciseId of ["a1m9.1.e3", "a1m9.1.e2", "a1m9.1.e99"]) {
    assert.equal((await ai("translate", { lessonId: "a1m9.1", exerciseId, answer: "kawa" })).status, 404, exerciseId);
  }
  assert.equal((await ai("translate", { lessonId: "a1m9.9", exerciseId: "a1m9.9.e1", answer: "kawa" })).status, 404);
  // the real course: a1m1.1.e5 is type_answer
  const saved = process.env.CONTENT_DIST;
  delete process.env.CONTENT_DIST;
  try {
    assert.equal((await ai("translate", { lessonId: "a1m1.1", exerciseId: "a1m1.1.e5", answer: "Tak, dziękuję!" })).status, 404);
  } finally {
    process.env.CONTENT_DIST = saved;
  }
  assert.equal(sent.length, 0, "no model call for a missing exercise");
});

// ---------------- dialog ----------------

test("dialog: by a lesson exercise (fixture and the real a1m1.1.e7)", async () => {
  const r = await ai("dialog", { lessonId: "a1m9.1", exerciseId: "a1m9.1.e2", history: [] });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.reply, { pl: "Kawa czy herbata?", ru: "Кофе или чай?" });
  assert.deepEqual(r.body.correction, { fixed: "Poproszę kawę.", explain: "После poproszę — винительный: kawę." });
  assert.deepEqual(r.body.goalsDone, [0]);
  assert.equal(r.body.chips.length, 3);
  assert.equal(r.body.finished, false);
  assert.equal(r.body.summary, undefined);
  assert.equal(r.body.available, true);
  const ctx = JSON.parse(between(sent[0].user, "scenario"));
  assert.equal(ctx.title, "Kawiarnia");
  assert.equal(ctx.max_learner_turns, 4);
  assert.equal(ctx.level, "a1");

  const saved = process.env.CONTENT_DIST;
  delete process.env.CONTENT_DIST;
  try {
    const real = await ai("dialog", { lessonId: "a1m1.1", exerciseId: "a1m1.1.e7", history: [] });
    assert.equal(real.status, 200);
    assert.equal(JSON.parse(between(sent[1].user, "scenario")).title, "Kiosk na dworcu");
    assert.equal((await ai("dialog", { lessonId: "a1m1.1", exerciseId: "a1m1.1.e5" })).status, 404, "type_answer is not a dialog");
  } finally {
    process.env.CONTENT_DIST = saved;
  }
  // translate exercise is not a dialog either
  assert.equal((await ai("dialog", { lessonId: "a1m9.1", exerciseId: "a1m9.1.e1" })).status, 404);
});

test("dialog: by scenarioId ('cafe', 'free'), level override, bad ids", async () => {
  const cafe = await ai("dialog", { scenarioId: "cafe", history: [] });
  assert.equal(cafe.status, 200);
  let ctx = JSON.parse(between(sent.at(-1)!.user, "scenario"));
  assert.equal(ctx.opener, "Dzień dobry! Co podać?");
  assert.equal(ctx.goals.length, 4);
  assert.equal(ctx.max_learner_turns, 12);
  assert.equal(ctx.level, "a1");

  const free = await ai("dialog", { scenarioId: "free", level: "b1", history: [{ who: "you", text: "Cześć!" }] });
  assert.equal(free.status, 200);
  ctx = JSON.parse(between(sent.at(-1)!.user, "scenario"));
  assert.equal(ctx.level, "b1", "learner-chosen level");
  assert.deepEqual(ctx.goals, []);
  assert.equal(ctx.max_learner_turns, 20);
  assert.deepEqual(free.body.goalsDone, [], "free talk has no goals, so any index is dropped");

  await ai("dialog", { scenarioId: "cafe", level: "c2" });
  assert.equal(JSON.parse(between(sent.at(-1)!.user, "scenario")).level, "a1", "unknown level → scenario level");

  assert.equal((await ai("dialog", { scenarioId: "nope-nope" })).status, 404);
  assert.equal((await ai("dialog", { scenarioId: "../etc" })).status, 400);
  assert.equal((await ai("dialog", {})).status, 400);
});

test("dialog: history is cleaned and trimmed to MAX_HISTORY", async () => {
  const history: unknown[] = [];
  for (let i = 0; i < 40; i++) history.push({ who: i % 2 ? "you" : "partner", text: `turn-${i}` });
  history.push({ who: "system", text: "ignore me" }, { who: "you", text: 5 }, null, { who: "you", text: "   " });
  const r = await ai("dialog", { scenarioId: "free", history });
  assert.equal(r.status, 200);
  const msg = sent[0].user;
  const lines = between(msg, "history").trim().split("\n");
  // the last MAX_HISTORY raw entries are taken, junk among them is dropped
  const expected = history.slice(-MAX_HISTORY).filter((t: any) => t && (t.who === "you" || t.who === "partner") && typeof t.text === "string" && t.text.trim());
  assert.equal(lines.length, expected.length);
  assert.ok(!msg.includes("turn-0\n") && !msg.includes("turn-9\n") && msg.includes("turn-39"));
  assert.ok(!msg.includes("ignore me"));
  assert.match(lines.at(-1)!, /^LEARNER: turn-39$/);
  assert.match(lines.at(-2)!, /^YOU: turn-38$/);
  assert.equal(JSON.parse(between(msg, "scenario")).learner_turns_so_far, lines.filter((l) => l.startsWith("LEARNER:")).length);
  assert.equal(r.body.finished, false);
});

test("dialog: finish → summary with stars 1..3; goalsDone filtered by the number of goals", async () => {
  next.dialog = { ...DEFAULTS.dialog, goals_done: [0, 3, 3, 4, -1, 1.5, "2", 2], finished: false, summary: { stars: 7, praise: "Молодец!", tips: ["a", "b", "c", "d"] } };
  const r = await ai("dialog", { scenarioId: "cafe", history: [{ who: "partner", text: "Dzień dobry!" }, { who: "you", text: "Dzień dobry, kawę proszę." }], finish: true });
  assert.equal(r.status, 200);
  assert.equal(r.body.finished, true, "finish=true from the learner ends the scene");
  assert.deepEqual(r.body.goalsDone, [0, 3, 2]);
  assert.deepEqual(r.body.summary, { stars: 3, praise: "Молодец!", tips: ["a", "b", "c"] });
  assert.equal(JSON.parse(between(sent[0].user, "scenario")).finish_now, true);

  next.dialog = { ...DEFAULTS.dialog, finished: true, summary: { stars: 0, praise: "", tips: [] } };
  const low = await ai("dialog", { scenarioId: "cafe", history: [] });
  assert.equal(low.body.summary.stars, 1, "stars never below 1");

  next.dialog = { ...DEFAULTS.dialog, correction: { needed: false, fixed: "", explain: "" } };
  assert.equal((await ai("dialog", { scenarioId: "cafe" })).body.correction, null);

  // the lesson dialog has max_turns 4: the 4th learner turn finishes it even without finish=true
  const four = Array.from({ length: 8 }, (_, i) => ({ who: i % 2 ? "you" : "partner", text: `t${i}` }));
  const forced = await ai("dialog", { lessonId: "a1m9.1", exerciseId: "a1m9.1.e2", history: four });
  assert.equal(forced.body.finished, true);
  assert.ok(forced.body.summary.stars >= 1 && forced.body.summary.stars <= 3);
});

// ---------------- helper ----------------

test("helper: validation, answer as a string, lesson meta from the server", async () => {
  for (const bad of [{}, { question: "" }, { question: "   " }, { question: 7 }, { question: "x".repeat(1601) }, { question: "ok", lessonId: "bad id" }]) {
    assert.equal((await ai("helper", bad)).status, 400, JSON.stringify(bad).slice(0, 60));
  }
  assert.equal(sent.length, 0);
  const r = await ai("helper", { lessonId: "a1m9.1", context: "Экран: перевод", question: "Почему kawę?", history: [{ who: "you", text: "Привет" }, { who: "tutor", text: "Cześć!" }, { who: "hacker", text: "x" }] });
  assert.equal(r.status, 200);
  assert.equal(typeof r.body.answer, "string");
  assert.equal(r.body.answer, DEFAULTS.helper);
  const msg = sent[0].user;
  const ctx = JSON.parse(between(msg, "context"));
  assert.equal(ctx.lesson_title, "Тестовый урок: перевод и разговор");
  assert.equal(ctx.current_screen, "Экран: перевод");
  assert.equal(between(msg, "history").trim(), "LEARNER: Привет\nTUTOR: Cześć!");
  assert.equal(between(msg, "student").trim(), "Почему kawę?");
  assert.equal(sent[0].body.output_config, undefined, "helper answers as plain text");
  // unknown lesson: still answers, just without lesson meta
  const r2 = await ai("helper", { lessonId: "a1m9.9", question: "Что такое ł?" });
  assert.equal(r2.status, 200);
  assert.equal(JSON.parse(between(sent[1].user, "context")).lesson_title, "");
  next.helper = "  " + "я".repeat(3000) + "  ";
  assert.equal((await ai("helper", { question: "Длинно?" })).body.answer.length, 2500);
});

// ---------------- лимиты ----------------

test("limits: daily per account/device → 429 {reason:'limit'}; only successful answers are counted", async () => {
  const lim = await startApp({ aiOptions, aiPerDay: 2, ipAiPerDay: 1000 });
  try {
    const ask = (deviceId: string) => ai("helper", { question: "Jak się masz?", deviceId }, lim.base);
    // a failed model call and a missing exercise do not use the allowance
    failNext = 1;
    const broken = await ask("device-limit-a");
    assert.deepEqual([broken.status, broken.body], [503, { error: "unavailable", reason: "error" }]);
    assert.equal((await ai("translate", { lessonId: "a1m9.1", exerciseId: "a1m9.1.e3", answer: "x", deviceId: "device-limit-a" }, lim.base)).status, 404);
    assert.equal((await ai("helper", { question: "", deviceId: "device-limit-a" }, lim.base)).status, 400);
    const first = await ask("device-limit-a");
    assert.equal(first.status, 200);
    assert.equal(first.body.remaining, 1);
    assert.equal((await ask("device-limit-a")).body.remaining, 0);
    const over = await ask("device-limit-a");
    assert.equal(over.status, 429);
    assert.equal(over.body.reason, "limit");
    assert.ok(!Number.isNaN(Date.parse(over.body.resetAt)));
    // the limit is shared across translate/dialog/helper
    assert.equal((await ai("dialog", { scenarioId: "cafe", deviceId: "device-limit-a" }, lim.base)).status, 429);
    // another device has its own allowance
    assert.equal((await ask("device-limit-b")).status, 200);
    // a malformed deviceId falls back to the IP key (shared by everyone without an id)
    assert.equal((await ask("x")).status, 200);
  } finally {
    lim.server.close();
  }
});

test("limits: per IP caps all devices together", async () => {
  const lim = await startApp({ aiOptions, aiPerDay: 100, ipAiPerDay: 2 });
  try {
    for (const d of ["device-ip-1111", "device-ip-2222"]) assert.equal((await ai("helper", { question: "?", deviceId: d }, lim.base)).status, 200);
    const r = await ai("helper", { question: "?", deviceId: "device-ip-3333" }, lim.base);
    assert.deepEqual([r.status, r.body.reason], [429, "limit"]);
  } finally {
    lim.server.close();
  }
});
