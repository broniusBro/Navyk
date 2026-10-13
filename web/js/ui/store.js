// App state glue: progress persisted through platform/storage.

import { getItem, setItem } from "../platform/storage.js";
import { normalizeProgress } from "../engine/progress.js";

let progress = normalizeProgress(getItem("progress"));

export const getProgress = () => progress;

export function saveProgress(next) {
  progress = normalizeProgress(next);
  setItem("progress", progress);
  return progress;
}

/** Seed for shuffles: stable per device so a reload shows the same order. */
export function shuffleSeed() {
  let s = getItem("seed");
  if (typeof s !== "number") {
    s = Math.floor(Math.random() * 2 ** 31);
    setItem("seed", s);
  }
  return s;
}
