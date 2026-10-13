// Seeded randomness. Pure: same seed, same order (reproducible in tests and on retry).

/** FNV-1a 32-bit hash of a string. */
export function hashString(s) {
  let h = 2166136261 >>> 0;
  for (const ch of String(s)) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/** mulberry32 PRNG: returns a function producing floats in [0, 1). */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const toSeed = (seed) => (typeof seed === "number" ? seed >>> 0 : hashString(seed));

/** Fisher-Yates shuffle of a copy. */
export function shuffle(arr, seed) {
  const out = arr.slice();
  const rnd = mulberry32(toSeed(seed));
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Shuffle that never returns the original order (for order_steps and match_pairs). */
export function shuffleChanged(arr, seed) {
  if (arr.length < 2) return arr.slice();
  for (let k = 0; k < 12; k++) {
    const out = shuffle(arr, `${seed}:${k}`);
    if (out.some((v, i) => v !== arr[i])) return out;
  }
  return [...arr.slice(1), arr[0]];
}

/** Index permutation [0..n-1], shuffled. */
export function shuffledIndices(n, seed, { changed = false } = {}) {
  const idx = Array.from({ length: n }, (_, i) => i);
  return changed ? shuffleChanged(idx, seed) : shuffle(idx, seed);
}
