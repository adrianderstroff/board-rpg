// Deterministic randomness and value noise.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** Integer hash -> [0,1) */
export function hash2(x, y, seed = 0) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 2246822519)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967296;
}
const smooth = (t) => t * t * (3 - 2 * t);
/** Value noise, optionally periodic with period (px,py) lattice cells. */
export function vnoise(x, y, seed = 0, px = 0, py = 0) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const fx = smooth(x - xi), fy = smooth(y - yi);
  const w = (i, j) => hash2(px ? ((i % px) + px) % px : i, py ? ((j % py) + py) % py : j, seed);
  const a = w(xi, yi), b = w(xi + 1, yi), c = w(xi, yi + 1), d = w(xi + 1, yi + 1);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}
export function fbm(x, y, seed = 0, oct = 3, px = 0, py = 0) {
  let s = 0, amp = 0.5, tot = 0, f = 1;
  for (let i = 0; i < oct; i++) {
    s += vnoise(x * f, y * f, seed + i * 17, px * f, py * f) * amp;
    tot += amp; amp *= 0.5; f *= 2;
  }
  return s / tot;
}
