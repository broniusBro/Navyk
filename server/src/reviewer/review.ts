// Сервис проверки промптов ученика через Claude API.
// Без внешних зависимостей: встроенный fetch Node.js.
// Ключ берётся только из переменной окружения ANTHROPIC_API_KEY на сервере.

import { readFileSync } from "node:fs";
import { cleanText } from "../input.ts";

const ROOT = new URL("../../../", import.meta.url);
const read = (path: string) => readFileSync(new URL(path, ROOT), "utf8");

export type Level = "beginner" | "advanced" | "pro";
export type Lang = "ru" | "uk" | "en" | "pl";

export interface LessonReviewContext {
  lessonId: string;
  level: Level;
  lang: Lang;
  goal: string;
  task: string;
  criteria: string[]; // например ["R1", "R2", "R3", "R4"]
  referencePrompt: string;
}

export interface CriterionResult {
  id: string;
  applicable: boolean;
  score: 0 | 1 | 2;
  comment: string;
}

export interface ReviewOutput {
  privacy_issue: { found: boolean; message: string };
  off_task: boolean;
  criteria: CriterionResult[];
  strengths: string[];
  gaps: string[];
  improved_prompt: string;
}

export interface ReviewResult {
  review: ReviewOutput;
  score: number | null; // 0–100, null если off_task
  verdict: "draft" | "working" | "strong" | "off_task";
  /** Задание засчитано: не черновик, по теме и без личных данных (R10 — блокирующий). */
  passed: boolean;
  usage: Usage;
  costUsd: number;
  model: string;
}

interface Usage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

const rubric = JSON.parse(read("content/reviewer/rubric.json"));
const schema = JSON.parse(read("content/reviewer/output.schema.json"));
const models = JSON.parse(read("server/src/config/models.json"));

/** Статичная часть: инструкция проверяющего + рубрика. Кешируется. */
export function buildSystemPrompt(): string {
  const instructions = read("content/reviewer/system-prompt.md").replace(/<!--[\s\S]*?-->/g, "").trim();
  const rubricForModel = {
    scale: rubric.scale,
    criteria: rubric.criteria.map((c: any) => ({ id: c.id, name: c.name, question: c.question, weights: c.weights })),
    blocking: rubric.blocking,
  };
  return `${instructions}\n\n## Rubric\n\n<rubric>\n${JSON.stringify(rubricForModel, null, 2)}\n</rubric>`;
}

export const MIN_CHARS = 5;
export const MAX_CHARS = 4000;

/** Текст ученика — данные. Закрывающий тег внутри него обезвреживается. */
function sanitize(text: string): string {
  // Сначала убираем невидимые символы (ими прячут команды и разбивают теги), потом — наши служебные теги.
  return cleanText(text).replace(/<\s*\/?\s*(student_prompt|lesson_context|rubric)\b[^>]*>/gi, "[tag removed]");
}

export function buildUserMessage(ctx: LessonReviewContext, studentPrompt: string): string {
  const criteria = ctx.criteria.map((id) => {
    const c = rubric.criteria.find((x: any) => x.id === id);
    if (!c) throw new Error(`Unknown criterion ${id}`);
    return { id, weight: c.weights[ctx.level] };
  });
  const lessonContext = {
    language: ctx.lang,
    level: ctx.level,
    lesson_id: ctx.lessonId,
    lesson_goal: ctx.goal,
    task: ctx.task,
    criteria,
    reference_prompt: ctx.referencePrompt,
  };
  return [
    "<lesson_context>",
    JSON.stringify(lessonContext, null, 2),
    "</lesson_context>",
    "",
    "<student_prompt>",
    sanitize(studentPrompt),
    "</student_prompt>",
    "",
    "Review the student prompt according to your instructions.",
  ].join("\n");
}

/** Итоговый балл считает сервер, а не модель: стабильно и не поддаётся уговорам. */
export function computeScore(
  out: ReviewOutput,
  level: Level,
  lessonCriteria: string[],
): { score: number | null; verdict: ReviewResult["verdict"] } {
  if (out.off_task) return { score: null, verdict: "off_task" };
  let got = 0;
  let max = 0;
  for (const id of lessonCriteria) {
    const def = rubric.criteria.find((c: any) => c.id === id);
    const weight: number = def?.weights[level] ?? 0;
    if (weight === 0) continue; // бонусный критерий не влияет на балл
    const r = out.criteria.find((c) => c.id === id);
    const onlyIfRelevant = Boolean(def?.only_if_relevant);
    if (r && !r.applicable && onlyIfRelevant) continue;
    got += (r?.score ?? 0) * weight;
    max += 2 * weight;
  }
  const score = max === 0 ? 100 : Math.round((got / max) * 100);
  const verdict = [...rubric.verdicts].reverse().find((v: any) => score >= v.min).id;
  return { score, verdict };
}

export function isPassed(review: ReviewOutput, verdict: ReviewResult["verdict"]): boolean {
  return (verdict === "working" || verdict === "strong") && !review.privacy_issue.found;
}

/** Нормализация ответа модели под наши правила (то, что схема API не может ограничить). */
export function normalize(out: ReviewOutput, lessonCriteria: string[]): ReviewOutput {
  return {
    ...out,
    strengths: out.strengths.slice(0, 3),
    gaps: out.gaps.slice(0, 3),
    criteria: out.criteria.filter((c) => lessonCriteria.includes(c.id)),
  };
}

export function costUsd(usage: Usage, model: string, cacheTtl = "1h"): number {
  const p = models.pricing_usd_per_mtok[model];
  if (!p) return 0;
  const write = cacheTtl === "1h" ? p.cache_write_1h : p.cache_write_5m;
  const usd =
    usage.input_tokens * p.input +
    usage.output_tokens * p.output +
    (usage.cache_creation_input_tokens ?? 0) * write +
    (usage.cache_read_input_tokens ?? 0) * p.cache_read;
  return usd / 1_000_000;
}

export class ReviewError extends Error {
  code: "input_too_short" | "input_too_long" | "api_error" | "refusal" | "bad_output" | "no_api_key";
  constructor(code: ReviewError["code"], message: string) {
    super(message);
    this.code = code;
  }
}

export interface ReviewOptions {
  apiKey?: string;
  fetchImpl?: typeof fetch;
  maxRetries?: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function reviewPrompt(
  ctx: LessonReviewContext,
  studentPrompt: string,
  opts: ReviewOptions = {},
): Promise<ReviewResult> {
  const text = cleanText(studentPrompt);
  if (text.length < MIN_CHARS) throw new ReviewError("input_too_short", "Prompt is too short");
  if (text.length > MAX_CHARS) throw new ReviewError("input_too_long", "Prompt is too long");

  const apiKey = opts.apiKey ?? process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new ReviewError("no_api_key", "ANTHROPIC_API_KEY is not set");
  const doFetch = opts.fetchImpl ?? fetch;
  const { model, max_tokens, cache_ttl } = models.reviewer;

  const body = {
    model,
    max_tokens,
    system: [{ type: "text", text: buildSystemPrompt(), cache_control: { type: "ephemeral", ttl: cache_ttl } }],
    messages: [{ role: "user", content: buildUserMessage(ctx, text) }],
    output_config: { format: { type: "json_schema", schema } },
  };

  const retries = opts.maxRetries ?? 2;
  for (let attempt = 0; ; attempt++) {
    const res = await doFetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
    });

    if ((res.status === 429 || res.status >= 500) && attempt < retries) {
      const after = Number(res.headers.get("retry-after")) || 2 ** attempt;
      await sleep(Math.min(after, 10) * 1000);
      continue;
    }
    if (!res.ok) throw new ReviewError("api_error", `Claude API ${res.status}: ${await res.text()}`);

    const data: any = await res.json();
    if (data.stop_reason === "refusal") throw new ReviewError("refusal", "Model refused to review");
    if (data.stop_reason === "max_tokens" && attempt < retries) {
      body.max_tokens = Math.min(body.max_tokens * 2, 4000);
      continue;
    }
    const block = data.content?.find((b: any) => b.type === "text");
    let parsed: ReviewOutput;
    try {
      parsed = JSON.parse(block?.text ?? "");
    } catch {
      if (attempt < retries) continue;
      throw new ReviewError("bad_output", "Could not parse review JSON");
    }
    const review = normalize(parsed, ctx.criteria);
    const { score, verdict } = computeScore(review, ctx.level, ctx.criteria);
    const passed = isPassed(review, verdict);
    return { review, score, verdict, passed, usage: data.usage, costUsd: costUsd(data.usage, model, cache_ttl), model };
  }
}
