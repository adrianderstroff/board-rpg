// Desert chipset: isometric cube blocks, 32x24 frames, 8 columns.
import { Canvas, mix, dither, grid } from './raster.mjs';
import { P, X } from './palette.mjs';
import { hash2, vnoise } from './rng.mjs';
import { drawBlock, wrap16 } from './iso.mjs';

export const CHIPSET_NAMES = [
  'sand', 'sand_dark', 'sand_ripple', 'stone_path', 'plaza', 'grass', 'water_a', 'water_b',
  'quicksand', 'rock', 'adobe', 'adobe_window', 'adobe_door', 'sandstone_fill', 'rock_fill', 'wood',
  'ice', 'dirt', 'tiled_roof', 'oasis_edge',
];

// ---------------------------------------------------------------- texture helpers (periodic in 16)
const fl = Math.floor;
/** per-cell hash in uv space (cells are 1 unit = 2x1 px) */
const H = (u, v, seed) => hash2(wrap16(fl(u)), wrap16(fl(v)), seed);
/** periodic value noise, feature size `sc` units (16/sc must be an integer) */
const N = (u, v, seed, sc = 4) => vnoise(u / sc, v / sc, seed, 16 / sc, 16 / sc);
/** side-face hash (s along face, t down) */
const HS = (s, t, seed) => hash2(wrap16(s), t, seed);

/** Periodic jittered voronoi over the 16x16 uv tile with n x n cells. */
function voronoi(u, v, n, seed, jitter = 0.8) {
  const cs = 16 / n;
  const ci = fl(u / cs), cj = fl(v / cs);
  let f1 = 1e9, f2 = 1e9, id = 0;
  for (let dj = -1; dj <= 1; dj++)
    for (let di = -1; di <= 1; di++) {
      const i = ci + di, j = cj + dj;
      const wi = ((i % n) + n) % n, wj = ((j % n) + n) % n;
      const px = (i + 0.5 + (hash2(wi, wj, seed) - 0.5) * jitter) * cs;
      const py = (j + 0.5 + (hash2(wi, wj, seed + 7) - 0.5) * jitter) * cs;
      const d = Math.hypot(u - px, v - py);
      if (d < f1) { f2 = f1; f1 = d; id = wi * 31 + wj; } else if (d < f2) f2 = d;
    }
  return { f1, f2, id };
}

/** Pick from colors by threshold list on value t: [[t0,c0],[t1,c1],...,[1,cn]] */
const pick = (t, stops) => { for (const [th, c] of stops) if (t < th) return c; return stops[stops.length - 1][1]; };

// generic speckled side
function speckSide(base, light, dark, seed, lip = null, bottom = null) {
  return (s, t) => {
    if (t === 0 && lip) return lip;
    const h = HS(s, t, seed);
    if (bottom && t === 7) return bottom;
    if (h > 0.9) return light;
    if (h < 0.08) return dark;
    return base;
  };
}

// ---------------------------------------------------------------- materials
function sandTop(base, light, dark, pale, seed) {
  return (u, v, x, y) => {
    const n = N(u, v, seed, 8);
    const h = H(u, v, seed + 1);
    if (h > 0.94) return pale;
    if (h < 0.05) return dark;
    if (n > 0.62 && dither(x, y, (n - 0.62) * 3)) return light;
    if (n < 0.3 && dither(x, y, (0.3 - n) * 2.5)) return mix(base, dark, 0.5);
    return base;
  };
}
const sandLeft = speckSide(P.tan, P.sand, P.clay, 11, mix(P.sand, P.tan, 0.35));
const sandRight = speckSide(P.clay, P.tan, P.brown, 12, mix(P.tan, P.clay, 0.4));

const M = {};
M.sand = { top: sandTop(P.sand, P.sandLight, P.clay, X.sandPale, 1), left: sandLeft, right: sandRight, edge: X.sandPale };
M.sand_dark = {
  top: sandTop(P.tan, P.sand, P.clay, P.sandLight, 2),
  left: speckSide(P.clay, P.tan, P.brown, 13, mix(P.tan, P.clay, 0.3)),
  right: speckSide(mix(P.clay, P.brown, 0.45), P.clay, P.darkBrown, 14, P.clay),
  edge: P.sandLight, edgeAmt: 0.25,
};
M.sand_ripple = {
  top: (u, v, x, y) => {
    const f = Math.sin((2 * Math.PI * (2 * u + v)) / 16 + 0.9 * Math.sin((2 * Math.PI * v) / 16));
    const h = H(u, v, 5);
    if (f > 0.82) return P.sandLight;
    if (f < -0.55 && f > -0.9) return h > 0.5 ? P.tan : mix(P.sand, P.tan, 0.6);
    if (h > 0.96) return X.sandPale;
    return P.sand;
  },
  left: sandLeft, right: sandRight, edge: X.sandPale,
};
M.stone_path = {
  top: (u, v, x, y) => {
    const { f1, f2, id } = voronoi(u, v, 3, 21, 0.7);
    if (f2 - f1 < 0.7) return mix(P.clay, P.brown, 0.3);
    const tone = hash2(id, 0, 22);
    const base = tone < 0.33 ? P.grey2 : tone < 0.66 ? mix(P.grey1, P.sandLight, 0.4) : mix(P.grey2, P.sand, 0.3);
    if (f2 - f1 < 1.3 && (x + y) % 2 === 0) return mix(base, P.grey3, 0.45);
    if (H(u, v, 23) > 0.93) return P.grey1;
    return base;
  },
  left: speckSide(P.tan, P.sand, P.clay, 24, mix(P.grey2, P.tan, 0.5)),
  right: speckSide(P.clay, P.tan, P.brown, 25, mix(P.grey3, P.clay, 0.5)),
  edge: P.white, edgeAmt: 0.2,
};
M.plaza = {
  top: (u, v, x, y) => {
    const a = wrap16(u), b = wrap16(v);
    const gu = a % 8 < 1, gv = b % 8 < 1;
    if (gu || gv) return mix(P.sand, P.clay, 0.3);
    const checker = (fl(a / 8) + fl(b / 8)) % 2;
    const base = checker ? P.sandLight : mix(P.sandLight, P.skinLight, 0.55);
    if ((a % 8 < 2 || b % 8 < 2) && (x + y) % 2 === 0) return mix(base, P.white, 0.4);
    return base;
  },
  left: speckSide(mix(P.sandLight, P.tan, 0.45), P.sandLight, P.clay, 26, P.sandLight),
  right: speckSide(mix(P.sand, P.clay, 0.55), P.sand, P.brown, 27, P.sand),
  edge: P.white, edgeAmt: 0.25,
};
const grassTop = (seed) => (u, v, x, y) => {
  const n = N(u, v, seed, 4);
  const h = H(u, v, seed + 1);
  if (h > 0.93) return P.green;
  if (h < 0.06) return P.greenDeep;
  if (n > 0.6 && dither(x, y, (n - 0.6) * 2.5)) return P.green;
  if (n < 0.32 && dither(x, y, (0.32 - n) * 2.5)) return mix(P.greenDark, P.greenDeep, 0.5);
  return P.greenDark;
};
const dirtLeft = speckSide(P.brown, P.clay, P.darkBrown, 31);
const dirtRight = speckSide(mix(P.brown, P.darkBrown, 0.5), P.brown, P.darkBrown, 32);
M.grass = {
  top: grassTop(30),
  left: (s, t) => (t === 0 || (t === 1 && HS(s, 0, 33) > 0.4) ? (t === 0 ? P.greenDark : P.greenDeep) : dirtLeft(s, t)),
  right: (s, t) => (t === 0 || (t === 1 && HS(s, 0, 34) > 0.4) ? P.greenDeep : dirtRight(s, t)),
  edge: P.green, edgeAmt: 0.4,
};
function waterTop(phase) {
  return (u, v, x, y) => {
    const w1 = Math.sin((2 * Math.PI * (u + 2 * v)) / 16 * 1 + phase + 1.2 * Math.sin((2 * Math.PI * u) / 16));
    const w2 = Math.sin((2 * Math.PI * (3 * u - v)) / 16 + phase * 1.0);
    const n = N(u, v, 40, 8);
    if (w1 > 0.9 && w2 > -0.2) return P.cyan;
    if (w1 > 0.72 && w2 > 0.3) return mix(P.blue, P.cyan, 0.5);
    if (H(u + (phase > 1 ? 5 : 0), v, 41) > 0.985) return P.white;
    if (n < 0.4 && dither(x, y, (0.4 - n) * 3)) return P.blueDark;
    return P.blue;
  };
}
const waterLeft = (s, t) => (t === 0 ? mix(P.blue, P.cyan, 0.3) : HS(s, t, 42) > 0.85 ? P.blue : t > 3 && HS(s, t, 43) > 0.5 ? mix(P.blueDark, P.navy, 0.5) : P.blueDark);
const waterRight = (s, t) => (t === 0 ? P.blueDark : HS(s, t, 44) > 0.88 ? P.blueDark : P.navy);
M.water_a = { top: waterTop(0), left: waterLeft, right: waterRight, topY: 2, sideH: 6, edge: P.cyan, edgeAmt: 0.25 };
M.water_b = { top: waterTop(Math.PI), left: waterLeft, right: waterRight, topY: 2, sideH: 6, edge: P.cyan, edgeAmt: 0.25 };
M.quicksand = {
  top: (u, v, x, y) => {
    const du = u - 8, dv = v - 8, r = Math.hypot(du, dv), a = Math.atan2(dv, du);
    const f = Math.sin(a * 2 + r * 0.95);
    const fade = Math.min(1, Math.max(0, (8.5 - r) / 3));
    if (r < 1.2) return P.brown;
    if (f > 0.55 && dither(x, y, fade)) return mix(P.clay, P.brown, 0.4);
    if (f < -0.7 && dither(x, y, fade)) return P.sand;
    if (H(u, v, 51) > 0.95) return P.sand;
    return P.tan;
  },
  left: M.sand_dark.left, right: M.sand_dark.right, edge: P.sand, edgeAmt: 0.25,
};
const rockTop = (seed) => (u, v, x, y) => {
  const { f1, f2, id } = voronoi(u, v, 2, seed, 0.9);
  const n = N(u, v, seed + 3, 4);
  if (f2 - f1 < 0.45) return P.slate;
  const base = hash2(id, 1, seed) > 0.5 ? P.grey2 : mix(P.grey2, P.clay, 0.3);
  if (n > 0.65 && dither(x, y, (n - 0.65) * 3)) return P.grey1;
  if (n < 0.3 && dither(x, y, (0.3 - n) * 3)) return P.grey3;
  return base;
};
function rockSide(base, light, dark, crack, seed) {
  return (s, t) => {
    const n = vnoise(s / 3, t / 2.5, seed, 16 / 3 | 0, 0);
    const h = HS(s, t, seed + 1);
    // strata cracks: slanted lines
    const k = (s * 2 + t * 3 + fl(HS(fl(s / 4), 0, seed + 2) * 4)) % 9;
    if (k === 0 && h > 0.2) return crack;
    if (t === 0) return light;
    if (n > 0.66) return light;
    if (n < 0.3 || h < 0.07) return dark;
    return base;
  };
}
M.rock = {
  top: rockTop(60),
  left: rockSide(P.grey3, P.grey2, mix(P.grey3, P.slate, 0.6), P.slate, 61),
  right: rockSide(P.slate, P.grey3, mix(P.slate, P.navy, 0.5), P.navy, 62),
  edge: P.grey1, edgeAmt: 0.35,
};
M.rock_fill = {
  top: rockTop(63),
  left: rockSide(mix(P.grey3, P.brown, 0.3), P.grey3, P.slate, P.navy, 64),
  right: rockSide(mix(P.slate, P.darkBrown, 0.3), P.slate, P.navy, P.ink, 65),
  edge: P.grey2, edgeAmt: 0.3,
};
// adobe
const adobeLeft = (s, t) => {
  if (t === 0) return mix(P.sand, P.tan, 0.3);
  const h = HS(s, t, 70);
  if (h > 0.92) return P.sand;
  if (h < 0.07) return P.clay;
  return P.tan;
};
const adobeRight = (s, t) => {
  if (t === 0) return P.tan;
  const h = HS(s, t, 71);
  if (h > 0.92) return P.tan;
  if (h < 0.08) return P.brown;
  return P.clay;
};
const roofTop = (u, v, x, y) => {
  const a = wrap16(u), b = wrap16(v);
  const rim = a < 2 || b < 2 || a > 14 || b > 14;
  if (rim) return a < 1 || b < 1 ? P.sandLight : P.sand;
  // inner floor, with a shadow cast by the rim on the upper-left inner edges
  if (a < 3 || b < 3) return P.clay;
  if (H(u, v, 72) > 0.93) return P.sand;
  return P.tan;
};
M.adobe = { top: roofTop, left: adobeLeft, right: adobeRight, edge: P.sandLight, edgeAmt: 0.2 };
function withWindow(side, dark, isLeft) {
  return (s, t, x, y) => {
    if (s >= 5 && s <= 10 && t >= 2 && t <= 6) {
      if (t === 2) return P.brown; // lintel
      if (t === 6) return isLeft ? P.sandLight : P.sand; // sill
      return (s === 5 && isLeft) ? P.navy : dark;
    }
    return side(s, t, x, y);
  };
}
M.adobe_window = { top: roofTop, left: withWindow(adobeLeft, P.ink, true), right: withWindow(adobeRight, P.ink, false), edge: P.sandLight, edgeAmt: 0.2 };
M.adobe_door = {
  top: roofTop,
  left: (s, t, x, y) => {
    if (s >= 5 && s <= 11 && t >= 1) {
      if (s === 5 || s === 11 || t === 1) return P.darkBrown; // frame
      if (t === 4 && s === 10) return P.gold; // handle
      return (s - 6) % 2 === 0 ? P.clay : P.brown; // planks
    }
    return adobeLeft(s, t);
  },
  right: adobeRight, edge: P.sandLight, edgeAmt: 0.2,
};
M.sandstone_fill = {
  top: sandTop(mix(P.sand, P.tan, 0.3), P.sand, P.clay, P.sandLight, 80),
  left: (s, t) => {
    const band = [P.sand, P.tan, P.tan, mix(P.sand, P.tan, 0.5), P.clay, P.tan, P.tan, mix(P.tan, P.clay, 0.5)][t];
    return HS(s, t, 81) > 0.93 ? P.sandLight : band;
  },
  right: (s, t) => {
    const band = [P.tan, P.clay, P.clay, mix(P.tan, P.clay, 0.5), P.brown, P.clay, P.clay, mix(P.clay, P.brown, 0.5)][t];
    return HS(s, t, 82) > 0.93 ? P.tan : band;
  },
  edge: P.sandLight, edgeAmt: 0.2,
};
M.wood = {
  top: (u, v, x, y) => {
    const b = wrap16(v);
    if (b % 4 < 0.8) return P.darkBrown; // plank gaps
    const plank = fl(b / 4);
    const a = wrap16(u + plank * 5);
    if (a % 8 < 0.7 && (b % 4) > 1.5 && (b % 4) < 2.6) return P.grey3; // nails
    const g = Math.sin(u * 1.3 + plank * 2 + Math.sin(v * 2) * 0.5);
    if (b % 4 < 1.6) return P.tan;
    return g > 0.6 ? P.brown : P.clay;
  },
  left: (s, t) => (t === 0 ? P.clay : s % 8 === 0 || s % 8 === 7 ? P.darkBrown : t === 3 || t === 7 ? P.darkBrown : P.brown),
  right: (s, t) => (t === 0 ? P.brown : s % 8 === 0 || s % 8 === 7 ? P.ink : t === 3 || t === 7 ? P.ink : P.darkBrown),
  edge: P.tan, edgeAmt: 0.3,
};
M.ice = {
  top: (u, v, x, y) => {
    const f = wrap16(u * 1 - v * 0.5 + 16);
    const n = N(u, v, 90, 8);
    if (Math.abs(f - 5) < 0.6 || Math.abs(f - 12) < 0.4) return P.white;
    if (H(u, v, 91) > 0.96) return P.white;
    if (n > 0.6 && dither(x, y, (n - 0.6) * 2.5)) return P.grey1;
    return mix(P.cyan, P.white, 0.55);
  },
  left: (s, t) => (t === 0 ? P.white : (s + t) % 7 === 0 ? P.white : HS(s, t, 92) > 0.8 ? mix(P.cyan, P.white, 0.4) : P.cyan),
  right: (s, t) => (t === 0 ? P.cyan : (s - t + 16) % 7 === 0 ? P.cyan : HS(s, t, 93) > 0.8 ? P.blue : mix(P.blue, P.cyan, 0.35)),
  edge: P.white, edgeAmt: 0.5,
};
M.dirt = {
  top: (u, v, x, y) => {
    const n = N(u, v, 100, 4);
    const h = H(u, v, 101);
    if (h > 0.95) return P.sand; // pebbles
    if (h < 0.05) return P.darkBrown;
    if (n > 0.62 && dither(x, y, (n - 0.62) * 3)) return P.tan;
    return P.clay;
  },
  left: speckSide(P.brown, P.clay, P.darkBrown, 102, mix(P.clay, P.brown, 0.4)),
  right: speckSide(mix(P.brown, P.darkBrown, 0.5), P.brown, P.darkBrown, 103, P.brown),
  edge: P.tan, edgeAmt: 0.3,
};
M.tiled_roof = {
  top: (u, v, x, y) => {
    const b = wrap16(v), a = wrap16(u);
    const row = b % 4; // tile rows running along u
    const k = fl(b / 4);
    const col = (a + k * 2) % 4; // tile columns (staggered)
    if (row < 0.9) return P.brown; // shadow under the row above
    if (col < 0.7) return mix(P.rust, P.brown, 0.5);
    if (row < 2) return P.tan;
    return P.rust;
  },
  left: adobeLeft, right: adobeRight, edge: P.orange, edgeAmt: 0.3,
};
M.oasis_edge = {
  top: (u, v, x, y) => {
    const n = N(u, v, 110, 4) * 0.7 + N(u, v, 111, 2) * 0.3;
    if (n > 0.55) return grassTop(112)(u, v, x, y);
    if (n > 0.49) return dither(x, y, 0.5) ? P.greenDark : P.sand;
    return sandTop(P.sand, P.sandLight, P.clay, X.sandPale, 113)(u, v, x, y);
  },
  left: (s, t) => (t === 0 && HS(s, 0, 114) > 0.5 ? P.greenDark : sandLeft(s, t)),
  right: (s, t) => (t === 0 && HS(s, 0, 115) > 0.5 ? P.greenDeep : sandRight(s, t)),
  edge: X.sandPale, edgeAmt: 0.2,
};

export const MATERIALS = M;

export function chipsetFrames() {
  return CHIPSET_NAMES.map((n) => drawBlock(M[n]));
}
export function chipsetSheet() {
  return grid(chipsetFrames(), 32, 24, 8);
}
