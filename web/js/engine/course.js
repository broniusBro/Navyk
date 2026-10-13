// Course structure helpers and lesson content preparation. Pure.

export const LANGS = ["ru", "uk", "en"];

/** Pick the UI language from a navigator.language-like string: uk -> uk, ru -> ru, else en. */
export function pickLang(saved, navigatorLanguages = []) {
  if (LANGS.includes(saved)) return saved;
  for (const tag of navigatorLanguages) {
    const base = String(tag || "").toLowerCase().split(/[-_]/)[0];
    if (base === "uk" || base === "ru") return base;
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
 * "current" is the first available lesson not yet done (the path's focus).
 */
export function pathStatus(course, available, completed) {
  const flat = flattenCourse(course);
  const status = {};
  let currentSet = false;
  for (const { lesson } of flat) {
    if (completed.has(lesson.id)) status[lesson.id] = "done";
    else if (!available.has(lesson.id)) status[lesson.id] = "soon";
    else if (!currentSet) {
      status[lesson.id] = "current";
      currentSet = true;
    } else status[lesson.id] = "open";
  }
  return status;
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
