// Course structure helpers and lesson content preparation. Pure.

export const LANGS = ["ru", "uk", "en", "pl"];

/** Pick the UI language from a navigator.language-like string: uk/ru/pl as is, else en. */
export function pickLang(saved, navigatorLanguages = []) {
  if (LANGS.includes(saved)) return saved;
  for (const tag of navigatorLanguages) {
    const base = String(tag || "").toLowerCase().split(/[-_]/)[0];
    if (base === "uk" || base === "ru" || base === "pl") return base;
  }
  return "en";
}

/** Localized title with fallback ru -> en -> first available. */
export function localized(obj, lang) {
  if (obj == null) return "";
  if (typeof obj === "string") return obj;
  return obj[lang] ?? obj.ru ?? obj.en ?? Object.values(obj)[0] ?? "";
}

/** Flat ordered list of lessons with level/module context. */
export function flattenCourse(course) {
  const out = [];
  for (const level of course?.levels ?? []) {
    for (const mod of level.modules ?? []) {
      for (const lesson of mod.lessons ?? []) out.push({ level, module: mod, lesson });
    }
  }
  return out;
}

/**
 * Status of each lesson on the path.
 * available: Set of lesson ids that have content on the server.
 * Status: "done" | "current" | "open" | "soon".
 * Levels do not block each other, so every level has its own "current": the first available lesson
 * of that level not yet done (the focus of that level's road).
 */
export function pathStatus(course, available, completed) {
  const status = {};
  for (const level of course?.levels ?? []) {
    let currentSet = false;
    for (const mod of level.modules ?? []) {
      for (const lesson of mod.lessons ?? []) {
        if (completed.has(lesson.id)) status[lesson.id] = "done";
        else if (!available.has(lesson.id)) status[lesson.id] = "soon";
        else if (!currentSet) {
          status[lesson.id] = "current";
          currentSet = true;
        } else status[lesson.id] = "open";
      }
    }
  }
  return status;
}

/**
 * Summary of one level for the levels screen.
 * Returns { id, modules, total, done, available, current: lesson|null, complete }.
 * done counts completed lessons of the level; available counts lessons with content (done or not);
 * current is the first available lesson not yet done; complete means every lesson is done.
 */
export function levelSummary(level, available, completed) {
  const mods = level?.modules ?? [];
  let total = 0;
  let done = 0;
  let avail = 0;
  let current = null;
  for (const mod of mods) {
    for (const lesson of mod.lessons ?? []) {
      total++;
      const isDone = completed.has(lesson.id);
      const isAvail = available.has(lesson.id);
      if (isDone) done++;
      if (isAvail) avail++;
      if (!isDone && isAvail && !current) current = lesson;
    }
  }
  return { id: level?.id ?? null, modules: mods.length, total, done, available: avail, current, complete: total > 0 && done === total };
}

/**
 * Which level to recommend next: the first unfinished level that has a lesson to take now;
 * if none has, the first unfinished level; null when the whole course is done.
 * summaries: levelSummary() results in course order.
 */
export function recommendedLevel(summaries) {
  const open = summaries.find((s) => !s.complete && s.current);
  return (open ?? summaries.find((s) => !s.complete))?.id ?? null;
}

/** Level of the course by id, or null. */
export const findLevel = (course, id) => (course?.levels ?? []).find((l) => l.id === id) ?? null;

/** Id of the level a lesson belongs to, or null if the lesson is not in the course. */
export function levelOfLesson(course, lessonId) {
  for (const level of course?.levels ?? []) {
    for (const mod of level.modules ?? []) {
      if ((mod.lessons ?? []).some((l) => l.id === lessonId)) return level.id;
    }
  }
  return null;
}

/**
 * Replace {{data.section.key}} with values from data (if loaded).
 * ui_paths entries may be a string or { label, hint: {ru,uk,en} }: rendered as **label** (hint).
 * Unknown keys become `key` so the lesson stays readable.
 */
export function resolveDataRefs(markdown, data, lang) {
  return String(markdown).replace(/\{\{\s*data\.([\w-]+)\.([\w-]+)\s*\}\}/g, (_, section, key) => {
    const v = data?.[section]?.[key];
    if (v == null) return `\`${key.replace(/_/g, " ")}\``;
    if (typeof v === "string") return v;
    const label = v.label ?? v.en ?? v.name;
    const hint = localized(v.hint ?? v.explain ?? v.description, lang);
    if (label && hint) return `**${label}** (${hint})`;
    if (label) return `**${label}**`;
    return localized(v, lang);
  });
}

/** Steps of a lesson in playback order (sources are shown on the final screen, not as a step). */
export function playableBlocks(lesson) {
  return (lesson?.blocks ?? []).filter((b) => b.kind === "step" || b.kind === "exercise");
}

export const sourcesBlock = (lesson) => (lesson?.blocks ?? []).find((b) => b.kind === "sources") ?? null;

/** Normalize compare_answers type from the built JSON (the builder may put the variant into type). */
export function normalizeExercise(block) {
  if (block.kind !== "exercise") return block;
  if (Array.isArray(block.cards) && Array.isArray(block.options) && block.type !== "compare_answers") {
    return { ...block, variant: block.variant ?? block.type, type: "compare_answers" };
  }
  return block;
}
