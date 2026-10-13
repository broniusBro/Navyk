// Загрузка контекста проверки из собранного контента (content/dist, см. scripts/build_content.py).
import { readFileSync } from "node:fs";
import type { Lang, LessonReviewContext } from "./review.ts";

const ROOT = new URL("../../../", import.meta.url);

export function loadReviewContext(lessonId: string, exerciseId: string, lang: Lang): LessonReviewContext {
  const lesson = JSON.parse(readFileSync(new URL(`content/dist/${lang}/${lessonId}.json`, ROOT), "utf8"));
  const ex = lesson.blocks.find((b: any) => b.kind === "exercise" && b.id === exerciseId);
  if (!ex?.review) throw new Error(`No review exercise ${exerciseId} in ${lessonId}.${lang}`);
  return {
    lessonId,
    level: lesson.meta.level,
    lang,
    goal: lesson.meta.goal,
    task: ex.review.task,
    criteria: ex.review.criteria,
    referencePrompt: ex.review.reference_prompt,
  };
}
