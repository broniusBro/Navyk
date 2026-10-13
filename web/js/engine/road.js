// Geometry of the "road" on the path screen. Pure: waypoints in, SVG path data out.
// Lessons sit on a gentle wave (waveOffset); the road is one smooth curve through all of them
// (Catmull-Rom turned into cubic Béziers), so it flows like a path instead of zig-zagging.

const r1 = (n) => Math.round(n * 10) / 10;

/**
 * Horizontal position of a lesson on the wave, in [-1, 1] (0 = centre line).
 * Every module starts in the centre right under its signpost; neighbouring modules swing to opposite sides.
 */
export function waveOffset(indexInModule, moduleIndex = 0) {
  const v = Math.sin((indexInModule * Math.PI) / 4) * (moduleIndex % 2 ? -1 : 1);
  return Math.round(v * 1000) / 1000 || 0;
}

/**
 * Cubic segment from points[i] to points[i + 1]. Tangents come from the neighbours (Catmull-Rom),
 * so splitting the road at any point keeps both halves on the same curve. The vertical pull keeps
 * the curve heading down through each stop rather than cutting sideways.
 */
function segment(points, i) {
  const p0 = points[Math.max(0, i - 1)];
  const p1 = points[i];
  const p2 = points[i + 1];
  const p3 = points[Math.min(points.length - 1, i + 2)];
  const dy = (p2.y - p1.y) * 0.35;
  const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + Math.max(dy, (p2.y - p0.y) / 6) };
  const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - Math.max(dy, (p3.y - p1.y) / 6) };
  return `C${r1(c1.x)} ${r1(c1.y)} ${r1(c2.x)} ${r1(c2.y)} ${r1(p2.x)} ${r1(p2.y)}`;
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
  for (let i = lo; i < hi; i++) d += segment(points, i);
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
