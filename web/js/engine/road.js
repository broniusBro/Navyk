// Geometry of the "road" on the path screen. Pure: stops in, SVG path data out.
// Lessons sit on a gentle sine wave (waveOffset): each step moves only a little sideways, so the eye
// glides from one lesson to the next. The road is one smooth curve (Catmull-Rom turned into cubic
// Béziers) through every circle and signpost and, between lessons, past a waypoint beside the title
// on the side the wave is heading (roadPoints) — so it winds round the words instead of crossing them.

const r1 = (n) => Math.round(n * 10) / 10;

/**
 * Horizontal position of a lesson on the wave, in [-1, 1] (0 = centre line).
 * A module starts right under its signpost and swings out and back over 8 lessons;
 * neighbouring modules swing to opposite sides.
 */
export function waveOffset(indexInModule, moduleIndex = 0) {
  const v = Math.sin((Math.max(0, indexInModule) * Math.PI) / 4) * (moduleIndex % 2 ? -1 : 1);
  return Math.round(v * 1000) / 1000 || 0;
}

/**
 * Cubic segment from points[i] to points[i + 1]. Tangents come from the neighbours (Catmull-Rom),
 * so the road has no corners and any split keeps both halves on the same curve. The vertical pull
 * keeps it flowing downwards through each stop.
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
 * Waypoints for the road. stops: [{ kind: "sign" | "node", x, y, label?: { top, bottom, half } }] in
 * road order, in road coordinates; width: road width. Returns { points, at } where at[i] is the index
 * of stop i in points (for splitting the road at a stop).
 */
export function roadPoints(stops, width) {
  const points = [];
  const at = [];
  const centre = width / 2;
  let lastDir = 1;
  stops.forEach((st, i) => {
    at.push(points.length);
    points.push({ x: st.x, y: st.y });
    const next = stops[i + 1];
    if (st.kind !== "node" || !next || !st.label) return;
    // which side of the title to pass: towards the next lesson (or the centre for a signpost)
    const target = next.kind === "sign" ? centre : next.x;
    const dx = target - st.x;
    const dir = Math.abs(dx) > 4 ? Math.sign(dx) : st.x > centre + 4 ? -1 : st.x < centre - 4 ? 1 : lastDir;
    lastDir = dir;
    const x = Math.min(width - 8, Math.max(8, st.x + dir * (st.label.half + 14)));
    points.push({ x, y: st.label.top + (st.label.bottom - st.label.top) * 0.6 });
  });
  return { points, at };
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
