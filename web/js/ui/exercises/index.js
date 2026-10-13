// Exercise type -> renderer. Adding a type = one entry here + a checker in engine/exercises.js.

import { renderSingle, renderMulti, renderCompare } from "./choice.js";
import { renderFindError } from "./find_error.js";
import { renderMatch } from "./match_pairs.js";
import { renderOrder, renderBuild } from "./order.js";
import { renderFillGap } from "./fill_gap.js";
import { renderPractice } from "./practice.js";

export const RENDERERS = {
  single_choice: renderSingle,
  multi_choice: renderMulti,
  compare_answers: renderCompare,
  find_error: renderFindError,
  match_pairs: renderMatch,
  order_steps: renderOrder,
  build_prompt: renderBuild,
  fill_gap: renderFillGap,
  write_prompt: renderPractice,
  improve_prompt: renderPractice,
};

export const renderExercise = (ex, ctx) => (RENDERERS[ex.type] ?? null)?.(ex, ctx) ?? null;
