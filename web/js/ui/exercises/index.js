// Exercise type -> renderer. Adding a type = one entry here + a checker in engine/exercises.js
// (auto-checked types) or an entry in AI_TYPES (AI-reviewed types with an offline fallback).

import { renderSingle, renderMulti } from "./choice.js";
import { renderMatch } from "./match_pairs.js";
import { renderOrder } from "./order.js";
import { renderFillGap } from "./fill_gap.js";
import { renderBuildSentence } from "./build_sentence.js";
import { renderTypeAnswer } from "./type_answer.js";
import { renderSpeak } from "./speak.js";
import { renderTranslate } from "./translate.js";
import { renderDialog } from "./dialog.js";

export const RENDERERS = {
  single_choice: renderSingle,
  multi_choice: renderMulti,
  match_pairs: renderMatch,
  order_steps: renderOrder,
  fill_gap: renderFillGap,
  build_sentence: renderBuildSentence,
  type_answer: renderTypeAnswer,
  speak: renderSpeak,
  translate: renderTranslate,
  dialog: renderDialog,
};

export const renderExercise = (ex, ctx) => (RENDERERS[ex.type] ?? null)?.(ex, ctx) ?? null;
