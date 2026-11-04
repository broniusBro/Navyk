// Grammatical gender of the learner in lesson texts. Pure; shared by the client and the server.
//
// Lesson strings may contain {{g:MASC|FEM}} — e.g. "{{g:Byłem|Byłam}} w Krakowie" (the Russian text uses the same marks).
// gender: "m" | "f" | "x" (not chosen: masculine form in the text, both forms accepted as answers).
// Answer lists (keys "accept") always get BOTH forms, so a learner is never marked wrong for their gender.

export const GENDERS = ["m", "f", "x"];
const MARK = /\{\{g:([^|{}]*)\|([^|{}]*)\}\}/g;

export const normalizeGender = (g) => (GENDERS.includes(g) ? g : "x");
export const hasGenderMarks = (s) => typeof s === "string" && s.includes("{{g:");

/** One string with the form for this gender. */
export function pickGender(s, gender) {
  if (!hasGenderMarks(s)) return s;
  const g = normalizeGender(gender);
  return s.replace(MARK, (_, m, f) => (g === "f" ? f : m));
}

/** Both variants of a string (masculine first); one element when there are no marks. */
export function bothGenders(s) {
  if (!hasGenderMarks(s)) return [s];
  const m = s.replace(MARK, (_, a) => a);
  const f = s.replace(MARK, (_, a, b) => b);
  return m === f ? [m] : [m, f];
}

/** Resolve marks in a whole lesson (or any JSON value). Arrays under "accept" keep both forms. */
export function resolveGender(node, gender, key = "") {
  if (typeof node === "string") return pickGender(node, gender);
  if (Array.isArray(node)) {
    if (key === "accept") {
      const out = [];
      for (const item of node) {
        if (typeof item === "string") {
          // the learner's own form first: it is shown as «the expected answer»
          const forms = bothGenders(item);
          const mine = pickGender(item, gender);
          for (const s of [mine, ...forms]) if (!out.includes(s)) out.push(s);
        } else if (Array.isArray(item)) {
          // build_sentence alternative orders: arrays of tiles
          const m = item.map((w) => bothGenders(w)[0]);
          const f = item.map((w) => bothGenders(w).at(-1));
          const mine = item.map((w) => pickGender(w, gender));
          for (const v of [mine, m, f]) if (!out.some((o) => Array.isArray(o) && o.join("\u0001") === v.join("\u0001"))) out.push(v);
        } else out.push(resolveGender(item, gender));
      }
      return out;
    }
    return node.map((x) => resolveGender(x, gender));
  }
  if (node && typeof node === "object") {
    const out = {};
    for (const [k, v] of Object.entries(node)) out[k] = resolveGender(v, gender, k);
    return out;
  }
  return node;
}

/** Check the marks of one string: well-formed, no nested or stray braces. Returns an error text or "". */
export function genderMarkError(s) {
  if (typeof s !== "string" || !s.includes("{{")) return "";
  const stripped = s.replace(MARK, "");
  if (stripped.includes("{{g") || /\{\{g:[^}]*$/.test(s)) return "broken {{g:...|...}} mark";
  return "";
}
