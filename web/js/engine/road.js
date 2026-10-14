// Geometry of the "road" on the path screen. Pure: stops in, SVG path data out.
// Lessons sit left / right of the centre line (waveOffset). The road joins the circles edge to edge
// and never runs through a title: towards a lesson on the other side it leaves the circle sideways,
// runs above the title and drops into the next circle from the top; between lessons on the same side
// it swings round the outside of the title; signposts are entered at the top and left at the bottom.

const r1 = (n) => Math.round(n * 10) / 10;

/**
 * Horizontal position of a lesson, in [-1, 1] (0 = centre line). The first lesson of a module stands
 * right under its signpost; then left, right, right, left, ... Neighbouring modules are mirrored.
 */
export function waveOffset(indexInModule, moduleIndex = 0) {
  if (indexInModule <= 0) return 0;
  const v = [-1, 1, 1, -1][(indexInModule - 1) % 4] * (moduleIndex % 2 ? -1 : 1);
  return v || 0;
}

const cubic = (c1, c2, p) => `C${r1(c1.x)} ${r1(c1.y)} ${r1(c2.x)} ${r1(c2.y)} ${r1(p.x)} ${r1(p.y)}`;
const move = (p) => `M${r1(p.x)} ${r1(p.y)}`;

/**
 * One piece of road from stop a to stop b (b is below a).
 * Stop: { kind: "sign" | "node", x, y, r?, top?, bottom?, labelHalf?, labelBottom? } in road coordinates.
 *  - sign: x = centre, top / bottom = card edges.
 *  - node: x, y = circle centre, r = radius, labelHalf = half the title width, labelBottom = title bottom.
 * width: road width (detours stay inside it).
 */
export function segment(a, b, width) {
  const centre = width / 2;
  const clampX = (x) => Math.min(width - 6, Math.max(6, x));
  // a signpost: leave from the bottom centre, arrive at the top of the circle (or the next signpost)
  if (a.kind === "sign") {
    const p0 = { x: a.x, y: a.bottom };
    const p3 = b.kind === "sign" ? { x: b.x, y: b.top } : { x: b.x, y: b.y - b.r };
    const k = (p3.y - p0.y) * 0.5;
    return move(p0) + cubic({ x: p0.x, y: p0.y + k }, { x: p3.x, y: p3.y - k }, p3);
  }
  const halfTitle = Math.max(a.labelHalf ?? 0, a.r);
  // the way round a's title: beside it, at its lower part
  const around = (s) => ({ x: clampX(a.x + s * (halfTitle + 16)), y: Math.max(a.y + a.r, (a.labelBottom ?? a.y + a.r) - 6) });
  if (b.kind === "sign") {
    const s = a.x < centre - 1 ? -1 : 1;
    const p0 = { x: a.x + s * a.r, y: a.y };
    const w = around(s);
    const p3 = { x: b.x, y: b.top };
    const k = (p3.y - w.y) * 0.55;
    return move(p0) + cubic({ x: w.x, y: p0.y }, { x: w.x, y: w.y - (w.y - p0.y) * 0.5 }, w) + cubic({ x: w.x, y: w.y + k }, { x: p3.x, y: p3.y - k }, p3);
  }
  const dx = b.x - a.x;
  if (Math.abs(dx) > a.r + b.r) {
    const s = Math.sign(dx);
    const p0 = { x: a.x + s * a.r, y: a.y };
    const p3 = { x: b.x, y: b.y - b.r };
    if (Math.abs(dx) > halfTitle + 10) {
      // opposite sides: out of a's facing side, along the top of a's title, then down into b's top
      return move(p0) + cubic({ x: p0.x + (p3.x - p0.x) * 0.75, y: p0.y }, { x: p3.x, y: p0.y + (p3.y - p0.y) * 0.25 }, p3);
    }
    // b is too close to clear a's title on the way: go round the title first, then down into b's top
    const w = around(s);
    const k = (p3.y - w.y) * 0.5;
    return move(p0) + cubic({ x: w.x, y: p0.y }, { x: w.x, y: w.y - (w.y - p0.y) * 0.5 }, w) + cubic({ x: w.x, y: w.y + k }, { x: p3.x, y: p3.y - k }, p3);
  }
  // same side: swing round the outside of a's title and come back into b from the same side
  const s = a.x < centre - 1 ? -1 : 1;
  const p0 = { x: a.x + s * a.r, y: a.y };
  const w = around(s);
  const p3 = { x: b.x + s * b.r, y: b.y };
  return move(p0) + cubic({ x: w.x, y: p0.y }, { x: w.x, y: w.y - (w.y - p0.y) * 0.5 }, w) + cubic({ x: w.x, y: w.y + (p3.y - w.y) * 0.5 }, { x: w.x, y: p3.y }, p3);
}

/** SVG path data for the road from stops[from] to stops[to] (inclusive). "" for fewer than two stops. */
export function roadPath(stops, width, from = 0, to = stops.length - 1) {
  const lo = Math.max(0, from);
  const hi = Math.min(stops.length - 1, to);
  let d = "";
  for (let i = lo; i < hi; i++) d += segment(stops[i], stops[i + 1], width);
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
export function splitRoad(stops, width, index) {
  if (index <= 0) return { done: "", todo: roadPath(stops, width) };
  return { done: roadPath(stops, width, 0, index), todo: roadPath(stops, width, index) };
}
