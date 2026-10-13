// Geometry of the "road" on the path screen. Pure: waypoints in, SVG path data out.
// The road leaves every waypoint vertically and bends between rows (S-curves), so it never runs
// sideways through the labels next to the lesson circles.

const r1 = (n) => Math.round(n * 10) / 10;

/** Cubic segment from a to b with vertical tangents at both ends. */
function segment(a, b) {
  const k = (b.y - a.y) * 0.55;
  return `C${r1(a.x)} ${r1(a.y + k)} ${r1(b.x)} ${r1(b.y - k)} ${r1(b.x)} ${r1(b.y)}`;
}

/**
 * SVG path data through points[from..to] (inclusive). Returns "" for fewer than two points.
 * points: [{ x, y }] in document order (y grows downwards).
 */
export function roadPath(points, from = 0, to = points.length - 1) {
  const lo = Math.max(0, from);
  const hi = Math.min(points.length - 1, to);
  if (hi - lo < 1) return "";
  let d = `M${r1(points[lo].x)} ${r1(points[lo].y)}`;
  for (let i = lo; i < hi; i++) d += segment(points[i], points[i + 1]);
  return d;
}

/**
 * Where the travelled part of the road ends: it runs from the start through signposts and done lessons
 * and stops at the first stop that is neither (including it when it is the current lesson). A locked
 * lesson in between breaks it, so the road never looks travelled past lessons nobody has taken.
 * kinds: ["sign" | "done" | "current" | "open" | "soon"] in road order. Returns -1 if nothing travelled.
 */
export function travelledIndex(kinds) {
  let i = 0;
  while (i < kinds.length && (kinds[i] === "sign" || kinds[i] === "done")) i++;
  if (i < kinds.length && kinds[i] === "current") return i;
  return kinds.slice(0, i).lastIndexOf("done");
}

/** Split the road into the travelled (solid) and upcoming (dashed) parts at index. */
export function splitRoad(points, index) {
  if (index <= 0) return { done: "", todo: roadPath(points) };
  return { done: roadPath(points, 0, index), todo: roadPath(points, index) };
}
