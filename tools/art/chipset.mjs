// Desert chipset: isometric cube blocks, 32x24 frames, 8 columns.
import { Canvas, mix, dither, grid } from './raster.mjs';
import { P, X } from './palette.mjs';
import { hash2, vnoise } from './rng.mjs';
import { drawBlock, wrap16 } from './iso.mjs';

export const CHIPSET_NAMES = [
  'sand', 'sand_dark', 'sand_ripple', 'stone_path', 'plaza', 'grass', 'water_a', 'water_b',
  'quicksand', 'rock', 'adobe', 'adobe_window', 'adobe_door', 'sandstone_fill', 'rock_fill', 'wood',
  'ice', 'dirt', 'tiled_roof', 'oasis_edge',
  // coast, forest, ruins, elf village (20..34)
  'sea_a', 'sea_b', 'cobble', 'deck', 'hull_fill', 'forest_floor', 'flowers', 'scorched',
  'stairs', 'overgrown_step', 'ruin_floor', 'ruin_wall', 'elf_roof', 'elf_wall', 'moss_stone',
  // interiors (35..38)
  'doorway', 'floorboards', 'plaster_wall', 'rug',
  // ponds, mountains, temple, jungle, mirage tower, hall of fears, island (39..54)
  'shallow_a', 'shallow_b', 'deep_a', 'deep_b', 'cliff', 'mountain_path', 'tatami', 'temple_wall',
  'temple_roof', 'jungle_floor', 'tower_floor', 'tower_wall', 'dark_floor', 'garden_soil', 'bamboo_wall', 'thatch_roof',
  // caves (55..56)
  'cave_floor', 'cave_wall',
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

// ---------------------------------------------------------------- coast, forest, ruins, elf village

/** voronoi() plus the offset (du,dv) from the nearest cell point, for per-stone shading. */
function voronoiC(u, v, n, seed, jitter = 0.8) {
  const cs = 16 / n;
  const ci = fl(u / cs), cj = fl(v / cs);
  let f1 = 1e9, f2 = 1e9, id = 0, du = 0, dv = 0;
  for (let dj = -1; dj <= 1; dj++)
    for (let di = -1; di <= 1; di++) {
      const i = ci + di, j = cj + dj;
      const wi = ((i % n) + n) % n, wj = ((j % n) + n) % n;
      const px = (i + 0.5 + (hash2(wi, wj, seed) - 0.5) * jitter) * cs;
      const py = (j + 0.5 + (hash2(wi, wj, seed + 7) - 0.5) * jitter) * cs;
      const d = Math.hypot(u - px, v - py);
      if (d < f1) { f2 = f1; f1 = d; id = wi * 31 + wj; du = u - px; dv = v - py; } else if (d < f2) f2 = d;
    }
  return { f1, f2, id, du, dv };
}

/**
 * Cut-stone side face: one course of blocks with vertical joints, a lit top lip and a
 * shadowed bottom joint. `joints` = s positions of the vertical joints.
 */
function cutStone(base, light, dark, joint, lip, seed, joints) {
  return (s, t) => {
    if (t === 0) return lip;
    if (t === 7) return joint;
    if (joints.includes(s)) return joint;
    if (joints.includes(s - 1) && t < 6) return light; // lit edge right of a joint
    const h = HS(s, t, seed);
    if (h > 0.9) return light;
    if (h < 0.07) return dark;
    return base;
  };
}

// --- sea: deeper, darker water with broad swells and foam glints
function seaTop(phase) {
  return (u, v, x, y) => {
    const warp = (N(u, v, 125, 8) - 0.5) * 4 + (N(u, v, 126, 4) - 0.5) * 1.5;
    const sw = Math.sin((2 * Math.PI * (u + v)) / 16 + phase + warp + 0.9 * Math.sin((2 * Math.PI * (u - v)) / 16));
    const ch = Math.sin((2 * Math.PI * (3 * u - 2 * v)) / 16 - phase + warp * 0.5);
    const n = N(u, v, 120, 8);
    if (sw > 0.93 && ch > -0.3) return H(u + (phase > 1 ? 7 : 0), v, 121) > 0.55 ? P.white : P.grey1;
    if (sw > 0.8 && ch > 0.1) return mix(P.blue, P.cyan, 0.3);
    if (sw > 0.6 && dither(x, y, (sw - 0.6) * 3)) return mix(P.blueDark, P.blue, 0.6);
    if (H(u + (phase > 1 ? 9 : 0), v + (phase > 1 ? 3 : 0), 122) > 0.99) return P.grey1;
    if (sw < -0.55 || (n < 0.35 && dither(x, y, (0.35 - n) * 3))) return mix(P.navy, P.blueDark, 0.45);
    return P.blueDark;
  };
}
const seaLeft = (s, t) => (t === 0 ? mix(P.blueDark, P.blue, 0.45) : HS(s, t, 123) > 0.86 ? mix(P.blueDark, P.blue, 0.3) : t > 2 ? P.navy : mix(P.navy, P.blueDark, 0.6));
const seaRight = (s, t) => (t === 0 ? mix(P.navy, P.blueDark, 0.6) : HS(s, t, 124) > 0.88 ? mix(P.navy, P.blueDark, 0.5) : t > 2 ? mix(P.navy, P.ink, 0.5) : P.navy);
M.sea_a = { top: seaTop(0), left: seaLeft, right: seaRight, topY: 2, sideH: 6, edge: P.blue, edgeAmt: 0.3 };
M.sea_b = { top: seaTop(Math.PI), left: seaLeft, right: seaRight, topY: 2, sideH: 6, edge: P.blue, edgeAmt: 0.3 };

// --- cobble: rounded grey/blue-grey stones, dark mortar, a little moss
M.cobble = {
  top: (u, v, x, y) => {
    const { f1, f2, id, du, dv } = voronoiC(u, v, 4, 130, 0.6);
    const gap = f2 - f1;
    if (gap < 0.6) return N(u, v, 131, 4) > 0.68 ? P.greenDeep : mix(P.slate, P.navy, 0.5);
    const tone = hash2(id, 3, 132);
    const base = tone < 0.4 ? P.grey2 : tone < 0.75 ? mix(P.grey2, P.grey3, 0.45) : mix(P.grey2, P.blueDark, 0.18);
    const lit = du + dv; // <0: upper (screen) half of the stone
    if (gap < 1.2 && lit > 0) return mix(base, P.slate, 0.7); // shaded lower rim
    if (lit < -0.8 && gap > 0.9 && f1 < 2.4) return mix(base, P.grey1, 0.65); // highlight
    if (H(u, v, 133) > 0.95) return P.grey3;
    return base;
  },
  left: cutStone(P.grey3, P.grey2, mix(P.grey3, P.slate, 0.5), P.slate, P.grey2, 134, [5, 13]),
  right: cutStone(P.slate, P.grey3, mix(P.slate, P.navy, 0.5), P.navy, P.grey3, 135, [2, 10]),
  edge: P.grey1, edgeAmt: 0.3,
};

// --- ship deck and hull
function hullSide(base, streak, seam, seed) {
  return (s, t) => {
    if (t === 2 || t === 5) return seam; // board seams
    const board = t < 2 ? 0 : t < 5 ? 1 : 2;
    if (wrap16(s + board * 5) === 0) return seam; // butt joints
    if (HS(s, t, seed) > 0.85) return streak;
    return base;
  };
}
const hullLeft = hullSide(P.darkBrown, mix(P.darkBrown, P.brown, 0.5), P.ink, 140);
const hullRight = hullSide(mix(P.darkBrown, P.ink, 0.4), P.darkBrown, P.ink, 141);
const hullTop = (u, v, x, y) => {
  const b = wrap16(v);
  if (b % 4 < 0.8) return P.ink;
  const plank = fl(b / 4);
  if (wrap16(u + plank * 6) < 0.8) return P.ink;
  if (H(u, v, 142) > 0.88) return mix(P.darkBrown, P.brown, 0.5);
  return P.darkBrown;
};
M.hull_fill = { top: hullTop, left: hullLeft, right: hullRight, edge: P.brown, edgeAmt: 0.3 };
M.deck = {
  top: (u, v, x, y) => {
    const b = wrap16(v);
    const bb = b % 4;
    if (bb < 0.8) return P.brown; // seam between planks
    const plank = fl(b / 4);
    const a = wrap16(u + plank * 5 + (plank % 2) * 3);
    if (a < 0.7) return P.brown; // butt joint
    if (a > 1.1 && a < 1.9 && bb > 2 && bb < 2.8) return P.brown; // nail next to the butt joint
    const tone = hash2(plank, fl((u + plank * 5 + (plank % 2) * 3 + 16) / 16), 143);
    const base = tone < 0.35 ? P.sand : tone < 0.7 ? mix(P.sand, P.tan, 0.5) : mix(P.sand, P.sandLight, 0.4);
    if (bb < 1.6) return mix(base, P.sandLight, 0.45); // lit plank edge
    const g = Math.sin(u * 1.1 + plank * 2.3 + Math.sin(v * 1.7) * 0.6);
    if (g > 0.85 && dither(x, y, 0.5)) return mix(base, P.clay, 0.45);
    return base;
  },
  left: (s, t) => (t === 0 ? P.tan : t === 1 ? P.clay : t === 2 ? P.ink : hullLeft(s, t)),
  right: (s, t) => (t === 0 ? P.clay : t === 1 ? mix(P.clay, P.brown, 0.5) : t === 2 ? P.ink : hullRight(s, t)),
  edge: P.sandLight, edgeAmt: 0.35,
};

// --- forest floor: moss, earth, fallen leaves, twigs
const forestTop = (u, v, x, y) => {
  const n = N(u, v, 150, 4) * 0.7 + N(u, v, 151, 2) * 0.3;
  const h = H(u, v, 152);
  // twigs: short streaks along u
  if (H(u, v, 153) > 0.985 || H(u - 1, v, 153) > 0.985 || H(u - 2, v, 153) > 0.985) return P.brown;
  if (h > 0.975) return P.orange;
  if (h > 0.96) return P.gold;
  if (h < 0.025) return P.tan;
  if (h < 0.04) return P.rust;
  if (n < 0.4) return dither(x, y, (0.4 - n) * 4) ? P.darkBrown : mix(P.brown, P.darkBrown, 0.5);
  if (n < 0.46) return dither(x, y, 0.5) ? P.greenDeep : mix(P.brown, P.darkBrown, 0.5);
  if (n > 0.66 && dither(x, y, (n - 0.66) * 3)) return P.greenDark;
  return P.greenDeep;
};
const darkDirtLeft = speckSide(mix(P.brown, P.darkBrown, 0.35), P.brown, P.darkBrown, 154);
const darkDirtRight = speckSide(mix(P.brown, P.darkBrown, 0.7), mix(P.brown, P.darkBrown, 0.3), P.ink, 155);
M.forest_floor = {
  top: forestTop,
  left: (s, t) => (t === 0 ? P.greenDeep : t === 1 && HS(s, 0, 156) > 0.45 ? P.teal : darkDirtLeft(s, t)),
  right: (s, t) => (t === 0 ? P.teal : t === 1 && HS(s, 0, 157) > 0.45 ? P.teal : darkDirtRight(s, t)),
  edge: P.greenDark, edgeAmt: 0.35,
};

// --- flowers: dense overgrown flower bed
const FLOWER_COLS = [
  [P.red, P.yellow], [P.yellow, P.orange], [P.white, P.gold], [X.purpleLight, P.yellow],
  [P.magenta, P.white], [P.pink, P.yellow], [P.red, P.white], [P.white, P.yellow],
];
const leafBed = (u, v, x, y, seed) => {
  const { f1, f2, du, dv } = voronoiC(u, v, 8, seed, 0.9);
  if (f2 - f1 < 0.35) return P.teal; // deep gaps between leaves
  if (du + dv < -0.4 && f1 < 1.2) return P.greenDark; // lit upper side of each leaf
  if (du + dv > 0.6) return mix(P.greenDeep, P.teal, 0.5);
  return P.greenDeep;
};
function flowerLayer(u, v, n, seed, jit) {
  const { f1, id, du, dv } = voronoiC(u, v, n, seed, jit);
  if (hash2(id, 5, seed) < 0.12) return null; // a few gaps
  const [petal, eye] = FLOWER_COLS[fl(hash2(id, 9, seed) * FLOWER_COLS.length)];
  if (f1 < 0.45) return eye;
  if (f1 < 1.15) return du + dv > 0.5 ? mix(petal, P.ink, 0.25) : petal;
  return null;
}
const flowersTop = (u, v, x, y) =>
  flowerLayer(u, v, 5, 160, 0.85) ?? flowerLayer(u + 8, v + 5, 4, 161, 0.9) ?? leafBed(u, v, x, y, 162);
M.flowers = {
  top: flowersTop,
  left: (s, t) => {
    if (t === 0) return HS(s, 0, 163) > 0.85 ? P.red : P.greenDark;
    if (t === 1) return HS(s, 1, 164) > 0.25 ? P.greenDeep : dirtLeft(s, t);
    if (t === 2 && HS(s, 0, 165) > 0.6) return P.teal;
    return dirtLeft(s, t);
  },
  right: (s, t) => {
    if (t === 0) return HS(s, 0, 166) > 0.85 ? P.yellow : P.greenDeep;
    if (t === 1) return HS(s, 1, 167) > 0.25 ? P.teal : dirtRight(s, t);
    if (t === 2 && HS(s, 0, 168) > 0.6) return P.teal;
    return dirtRight(s, t);
  },
  edge: P.green, edgeAmt: 0.3,
};

// --- scorched earth
M.scorched = {
  top: (u, v, x, y) => {
    const n = N(u, v, 170, 4);
    const h = H(u, v, 171);
    if (h > 0.985) return P.orange; // embers
    if (h > 0.975) return P.gold;
    if (H(u, v, 172) > 0.965) return P.ink; // charred stalk stubs
    if (H(u, v - 1, 172) > 0.965) return P.darkBrown; // stub shadow below
    if (h < 0.06) return P.grey2; // ash flecks
    if (n > 0.6 && dither(x, y, (n - 0.6) * 3)) return P.grey3;
    if (n < 0.35 && dither(x, y, (0.35 - n) * 3)) return P.ink;
    return mix(P.slate, P.darkBrown, 0.45);
  },
  left: speckSide(mix(P.darkBrown, P.brown, 0.3), P.brown, P.ink, 173, mix(P.slate, P.grey3, 0.3)),
  right: speckSide(mix(P.darkBrown, P.ink, 0.3), P.darkBrown, P.ink, 174, P.slate),
  edge: P.grey3, edgeAmt: 0.3,
};

// --- stairs: light stone slab, bright front lip, cut-stone risers
const stairsTop = (u, v, x, y) => {
  const a = wrap16(u), b = wrap16(v);
  if (a > 14.9 || b > 14.9) return P.white; // front lip
  if (a > 13.9 || b > 13.9) return mix(P.grey1, P.white, 0.4);
  // hairline cracks: one long wandering crack plus a short spur
  const c1 = Math.abs(b - (3 + a * 0.55 + Math.sin(a * 0.9) * 1.2)) < 0.4 && a > 2 && a < 11;
  const c2 = Math.abs(a - (12 - b * 0.5)) < 0.35 && b > 9 && b < 13;
  if (c1 || c2) return mix(P.grey2, P.grey3, 0.5);
  const n = N(u, v, 180, 4);
  if (H(u, v, 181) > 0.95) return P.grey2;
  if (n > 0.62 && dither(x, y, (n - 0.62) * 3)) return mix(P.grey1, P.white, 0.3);
  if (n < 0.33 && dither(x, y, (0.33 - n) * 3)) return mix(P.grey1, P.grey2, 0.5);
  return P.grey1;
};
const stairsLeft = cutStone(P.grey2, P.grey1, mix(P.grey2, P.grey3, 0.5), P.grey3, P.white, 182, [7]);
const stairsRight = cutStone(P.grey3, P.grey2, mix(P.grey3, P.slate, 0.5), P.slate, P.grey1, 183, [4, 12]);
M.stairs = { top: stairsTop, left: stairsLeft, right: stairsRight, edge: P.white, edgeAmt: 0.25 };

// --- overgrown step: flowers spilling over the stone slab
const hangLeaves = (side, seed) => (s, t, x, y) => {
  const len = fl(HS(s, 0, seed) * 4); // 0..3 rows of hanging leaves
  if (t < len) {
    if (t === len - 1 && HS(s, 1, seed + 1) > 0.8) return P.pink;
    return (s + t) % 3 === 0 ? P.greenDark : t === len - 1 ? P.teal : P.greenDeep;
  }
  return side(s, t, x, y);
};
M.overgrown_step = {
  top: (u, v, x, y) => {
    const a = wrap16(u), b = wrap16(v);
    const n = N(u, v, 190, 4);
    // stone shows at the front lip and in a couple of holes
    if (a > 14.9 || b > 14.9) return (n > 0.5 && dither(x, y, 0.5)) ? leafBed(u, v, x, y, 162) : stairsTop(u, v, x, y);
    if (n < 0.12) return stairsTop(u, v, x, y);
    if (n < 0.17) return dither(x, y, 0.5) ? P.greenDeep : stairsTop(u, v, x, y);
    return flowersTop(u, v, x, y);
  },
  left: hangLeaves(stairsLeft, 191),
  right: hangLeaves(stairsRight, 192),
  edge: P.green, edgeAmt: 0.25,
};

// --- ruins: sandstone flagstones with sand drifts
const ruinStone = (u, v, x, y, seed) => {
  const b = wrap16(v);
  const row = fl(b / 8);
  const a = wrap16(u + row * 4);
  const la = a % 8, lb = b % 8;
  if (la < 0.8 || lb < 0.8) return mix(P.clay, P.brown, 0.35); // joints
  const id = fl(a / 8) * 2 + row;
  const tone = hash2(id, 0, seed);
  const base = tone < 0.4 ? P.sand : tone < 0.75 ? mix(P.sand, P.sandLight, 0.45) : mix(P.sand, P.tan, 0.35);
  if (la < 1.8 || lb < 1.8) return mix(base, P.sandLight, 0.5); // worn lit edge
  if (la > 7.1 || lb > 7.1) return P.tan; // shaded edge
  // a crack across some stones
  const ct = hash2(id, 1, seed);
  if (ct > 0.4 && Math.abs(lb - (1.5 + la * (0.4 + ct * 0.5) + Math.sin(la * 2 + ct * 9) * 0.5)) < 0.4) return P.clay;
  if (H(u, v, seed + 2) > 0.95) return P.tan;
  if (H(u, v, seed + 3) < 0.03) return P.clay;
  return base;
};
M.ruin_floor = {
  top: (u, v, x, y) => {
    const n = N(u, v, 200, 8) * 0.6 + N(u, v, 201, 4) * 0.4;
    if (n > 0.6) return sandTop(P.sand, P.sandLight, P.clay, X.sandPale, 202)(u, v, x, y);
    if (n > 0.54) return dither(x, y, (n - 0.54) * 12) ? P.sandLight : ruinStone(u, v, x, y, 203);
    return ruinStone(u, v, x, y, 203);
  },
  left: M.sandstone_fill.left, right: M.sandstone_fill.right,
  edge: P.sandLight, edgeAmt: 0.25,
};

// --- ruin wall: ashlar courses, erosion pits, cracks; broken top with rubble
function ashlar(base, light, dark, joint, seed) {
  return (s, t) => {
    if (t === 3 || t === 7) return joint;
    const off = t < 3 ? 0 : 5;
    const k = wrap16(s + off) % 10;
    if (k === 0) return joint;
    if (k === 1 && HS(s, t, seed + 4) > 0.3) return light;
    // cracks: short diagonal runs
    if (HS(fl((s + t) / 2), 0, seed + 1) > 0.88 && (s + t) % 2 === 0 && t > 3) return joint;
    const h = HS(s, t, seed);
    if (h < 0.08) return dark; // erosion pits
    if (h > 0.92) return light;
    if (t === 0 || t === 4) return light;
    return base;
  };
}
M.ruin_wall = {
  top: (u, v, x, y) => {
    const { f1, f2, id, du, dv } = voronoiC(u, v, 4, 210, 0.9);
    const n = N(u, v, 211, 4);
    if (f2 - f1 < 0.5) return n > 0.5 ? P.brown : P.clay;
    const tone = hash2(id, 2, 212);
    const base = tone < 0.4 ? P.sand : tone < 0.75 ? P.tan : mix(P.sand, P.sandLight, 0.4);
    if (du + dv < -1 && f1 < 1.8) return mix(base, P.sandLight, 0.6);
    if (du + dv > 1.2) return mix(base, P.clay, 0.6);
    if (H(u, v, 213) > 0.93) return P.clay;
    return base;
  },
  left: ashlar(P.sand, P.sandLight, P.clay, P.clay, 214),
  right: ashlar(P.tan, P.sand, P.brown, P.brown, 215),
  edge: P.sandLight, edgeAmt: 0.3,
};

// --- elf houses: living leaf roof, pale timber walls
const leafRoofTop = (u, v, x, y) => {
  const b = wrap16(v);
  const row = fl(b / 4);
  const a = wrap16(u + (row % 2) * 2);
  const lu = (a % 4) - 2 + 0.5, lv = (b % 4);
  const leaf = fl(a / 4) + row * 4;
  // rounded leaf shingle: lower edge is a curve, the row below overlaps
  const bh = hash2(leaf, 0, 220);
  const edgeY = 3.2 - lu * lu * 0.35 - (bh > 0.6 ? 0.5 : 0);
  if (lv > edgeY) return P.teal; // shadow under the leaf tip
  const n = N(u, v, 221, 8);
  if (bh > 0.88 && Math.abs(lu) < 0.8 && lv > 1 && lv < 2.2) return bh > 0.94 ? P.pink : P.white; // blossoms
  // leaf colour varies per leaf and in broad patches (young light leaves / old dark ones)
  const lightLeaf = bh + (n - 0.5) * 0.8;
  const body = lightLeaf > 0.75 ? P.green : lightLeaf < 0.2 ? P.greenDeep : P.greenDark;
  const hi = body === P.green ? mix(P.green, P.yellow, 0.35) : body === P.greenDark ? P.green : P.greenDark;
  if (lv > edgeY - 0.7) return body === P.greenDeep ? P.teal : P.greenDeep; // leaf tip rim
  if (lu < 0 && lv < 1.4) return hi;
  if (H(u, v, 222) > 0.93) return hi;
  return body;
};
function timber(board, seam, post, postLight, seed) {
  return (s, t) => {
    if (s === 0 || s === 15 || s === 8) return post;
    if (s === 1 || s === 9) return postLight;
    if (t === 2 || t === 5) return seam;
    if (HS(s, t, seed) > 0.9) return seam;
    return board;
  };
}
const elfLeft = timber(P.sandLight, mix(P.sand, P.sandLight, 0.4), P.clay, P.tan, 230);
const elfRight = timber(P.sand, mix(P.sand, P.tan, 0.5), P.brown, P.clay, 231);
const eaves = (side, seed) => (s, t, x, y) => {
  if (t === 0) return (s % 3 === 0) ? P.greenDark : P.greenDeep;
  if (t === 1) return HS(s, 1, seed) > 0.4 ? ((s % 3 === 1) ? P.teal : P.greenDeep) : side(s, t, x, y);
  if (t === 2 && HS(s, 2, seed) > 0.75) return P.teal;
  return side(s, t, x, y);
};
M.elf_roof = { top: leafRoofTop, left: eaves(elfLeft, 232), right: eaves(elfRight, 233), edge: P.green, edgeAmt: 0.35 };
M.elf_wall = {
  top: leafRoofTop,
  left: (s, t, x, y) => {
    const d = Math.hypot(s - 4, (t - 3.5) * 1.1);
    if (d < 1.6) return (s < 4 && t < 4) ? P.navy : P.ink; // dark inside
    if (d < 2.6) return (s + t) < 7 ? P.yellow : P.gold; // warm light rim
    if (d < 3.1) return P.clay;
    return elfLeft(s, t);
  },
  right: (s, t, x, y) => {
    // round-topped door between the centre post and the right corner
    const ds = s - 11.5;
    const top = 2 + ds * ds * 0.35;
    if (s >= 10 && s <= 13 && t >= top) {
      if (s === 13 && t === 5) return P.gold; // handle
      return s === 10 ? P.ink : P.darkBrown;
    }
    if (s >= 9 && s <= 14 && t >= top - 1) return P.brown; // frame
    return elfRight(s, t);
  },
  edge: P.green, edgeAmt: 0.35,
};

// --- mossy flagstones
M.moss_stone = {
  top: (u, v, x, y) => {
    const { f1, f2, id, du, dv } = voronoiC(u, v, 3, 240, 0.7);
    const n = N(u, v, 241, 4);
    const gap = f2 - f1;
    if (gap < 0.7) return n > 0.4 ? P.greenDeep : P.teal;
    if (gap < 1.2 && n > 0.45) return dither(x, y, 0.5) ? P.greenDark : P.greenDeep;
    if (n > 0.68) return dither(x, y, (n - 0.68) * 5) ? P.greenDark : P.green;
    const tone = hash2(id, 4, 242);
    const base = tone < 0.4 ? P.grey2 : tone < 0.75 ? mix(P.grey2, P.grey1, 0.4) : mix(P.grey2, P.grey3, 0.3);
    if (du + dv < -1.5 && gap > 1.4) return mix(base, P.grey1, 0.5);
    if (gap < 1.4 && du + dv > 0) return mix(base, P.grey3, 0.5);
    if (H(u, v, 243) > 0.95) return P.grey3;
    return base;
  },
  left: (s, t) => (t === 0 && HS(s, 0, 244) > 0.5 ? P.greenDark : cutStone(P.grey3, P.grey2, P.slate, P.slate, P.grey2, 245, [6, 14])(s, t)),
  right: (s, t) => (t === 0 && HS(s, 0, 246) > 0.5 ? P.greenDeep : cutStone(P.slate, P.grey3, P.navy, P.navy, P.grey3, 247, [3, 11])(s, t)),
  edge: P.grey1, edgeAmt: 0.25,
};

// ---------------------------------------------------------------- interiors (inn, houses, shops)
// Bands below are whole uv units wide so the 2:1 lines stay solid (no dotted seams).
/** uv clamped into the tile (edge pixels can sample slightly outside [0,16)). */
const cl16 = (a) => Math.min(Math.max(a, 0), 15.99);

// --- floorboards: tight honey-toned boards (5 per tile, 1-unit seams) along u, staggered joints
const HONEY = [mix(P.sand, P.gold, 0.18), mix(P.sand, P.tan, 0.3), mix(P.sand, P.gold, 0.05), mix(P.sand, P.tan, 0.15), mix(P.sand, P.gold, 0.3)];
const BOARD_EDGES = [0, 3, 6, 10, 13, 16];
const boardsTop = (u, v, x, y) => {
  const b = wrap16(v);
  let board = 0; while (b >= BOARD_EDGES[board + 1]) board++;
  const fb = b - BOARD_EDGES[board];
  if (fb < 1) return mix(P.clay, P.brown, 0.45); // seam
  const off = [0, 9, 4, 12, 7][board];
  const a = wrap16(u + off);
  if (a < 1) return mix(P.clay, P.brown, 0.6); // butt joint (one per board per tile)
  const base = HONEY[board % HONEY.length];
  if (a >= 1 && a < 3 && fb >= 1 && fb < 2) return mix(base, P.sandLight, 0.35); // worn end by the joint
  if (hash2(fl(a / 2), board, 251) > 0.8 && fb >= 2) return mix(base, P.tan, 0.4); // grain streak
  return base;
};
const boardsLeft = (s, t) => {
  if (t === 0) return mix(P.sand, P.gold, 0.15);
  if (t === 1) return P.tan;
  if (t === 4 || wrap16(s + (t > 4 ? 6 : 0)) % 12 === 11) return P.brown;
  return HS(s, t, 252) > 0.88 ? P.tan : P.clay;
};
const boardsRight = (s, t) => {
  if (t === 0) return P.tan;
  if (t === 1) return P.clay;
  if (t === 4 || wrap16(s + (t > 4 ? 3 : 9)) % 12 === 11) return P.darkBrown;
  return HS(s, t, 253) > 0.88 ? P.clay : P.brown;
};
M.floorboards = { top: boardsTop, left: boardsLeft, right: boardsRight, edge: P.sandLight, edgeAmt: 0.25 };

// --- doorway: a dark opening at floor level, a lit wooden sill along the two front edges
M.doorway = {
  top: (u, v, x, y) => {
    const a = cl16(u), b = cl16(v), f = Math.max(a, b);
    if (f >= 15) return mix(P.tan, P.sand, 0.5); // worn front lip
    if (f >= 13) {
      if (f < 14) return mix(P.sand, P.tan, 0.25); // lit top of the sill
      return P.clay;
    }
    if (f >= 12) return P.ink; // shadow gap behind the sill
    // interior: deep shadow at the back, faint boards where the room light spills in
    const k = (a + b) / 24; // 0 back corner .. ~1 at the sill
    const seam = (wrap16(v) % 4) < 1;
    if (k > 0.62) return seam ? P.ink : dither(x, y, (k - 0.62) * 2.2) ? mix(P.darkBrown, P.brown, 0.35) : P.darkBrown;
    if (k > 0.36) return dither(x, y, (k - 0.36) * 3.8) ? P.darkBrown : P.ink;
    return P.ink;
  },
  left: (s, t) => {
    if (t === 0) return P.clay; // sill front
    if (s <= 1 || s >= 14) return s === 1 ? P.brown : P.ink; // frame posts
    if (t === 1) return P.brown;
    return HS(s, t, 254) > 0.86 ? P.brown : P.darkBrown;
  },
  right: (s, t) => {
    if (t === 0) return P.brown;
    if (s <= 1 || s >= 14) return P.ink;
    if (t === 1) return mix(P.darkBrown, P.brown, 0.5);
    return HS(s, t, 255) > 0.86 ? mix(P.darkBrown, P.brown, 0.4) : mix(P.darkBrown, P.ink, 0.35);
  },
  edge: null,
};

// --- plaster wall: whitewashed faces over a dark baseboard, dark beam top
const PLASTER_CRACK = new Set(['10,1', '11,2', '11,3', '12,3']);
M.plaster_wall = {
  top: (u, v, x, y) => {
    const a = cl16(u), b = cl16(v);
    if (a >= 15 || b >= 15) return P.brown; // front arris
    if (b >= 7.5 && b < 8.5) return P.ink; // joint between the two beams
    const g = hash2(fl(a / 3), fl(b), 256);
    if (g > 0.8) return mix(P.darkBrown, P.brown, 0.5);
    return P.darkBrown;
  },
  left: (s, t, x, y) => {
    if (t === 7) return P.darkBrown;
    if (t === 6) return s % 8 === 7 ? P.darkBrown : P.brown;
    if (t === 0) return P.sandLight; // soft shadow under the beam / rail above
    if (PLASTER_CRACK.has(`${s},${t}`)) return mix(P.sandLight, P.clay, 0.35);
    return HS(s, t, 257) > 0.9 ? P.sandLight : X.sandPale;
  },
  right: (s, t, x, y) => {
    if (t === 7) return P.ink;
    if (t === 6) return s % 8 === 3 ? P.ink : P.darkBrown;
    if (t === 0) return mix(P.sand, P.sandLight, 0.4);
    return HS(s, t, 258) > 0.9 ? mix(P.sand, P.sandLight, 0.45) : mix(P.sandLight, P.sand, 0.25);
  },
  edge: P.clay, edgeAmt: 0.4,
};

// --- rug: red woven field, ochre border with a dotted pattern, cream fringes, over floorboards
const OCHRE = mix(P.gold, P.tan, 0.45);
M.rug = {
  top: (u, v, x, y) => {
    const a = cl16(u), b = cl16(v);
    if (b < 2 || b >= 14 || a < 1 || a >= 15) return boardsTop(u, v, x, y);
    if (a < 2 || a >= 14) return fl(b) % 2 ? X.sandPale : P.sand; // fringe threads
    const e = Math.min(a - 2, b - 2, 14 - a, 14 - b); // distance to the rug edge (0..6)
    if (e < 1) return P.darkRed;
    if (e < 3) { // ochre border with little red lozenges
      const al = (a - 2 < 3 || 14 - a < 3) ? b : a;
      return fl(e) === 1 && fl(al) % 3 === 1 ? P.darkRed : OCHRE;
    }
    if (e < 4) return P.darkRed;
    const dd = Math.abs(fl(a) + 0.5 - 8) + Math.abs(fl(b) + 0.5 - 8);
    if (dd < 1.5) return P.navy; // central medallion
    if (dd < 2.5) return P.gold;
    if (dd < 3.5) return OCHRE;
    return (fl(a) + fl(b)) % 2 ? P.red : mix(P.red, P.darkRed, 0.35); // woven field
  },
  left: boardsLeft, right: boardsRight, edge: P.sandLight, edgeAmt: 0.25,
};

// ---------------------------------------------------------------- ponds (shallow / deep water)
// --- shallow pond: light teal water over a sandy, pebbly bottom with drifting caustics
const SHALLOW = mix(P.cyan, P.greenDark, 0.35);
const shallowBed = (u, v, x, y) => {
  const { f1, f2, id, du, dv } = voronoiC(u, v, 4, 300, 0.8);
  const pebble = hash2(id, 1, 301) > 0.55 && f1 < 1.1 + hash2(id, 2, 301) * 0.6;
  if (pebble) {
    const tone = hash2(id, 3, 301);
    const base = tone < 0.4 ? P.grey2 : tone < 0.75 ? P.clay : mix(P.grey1, P.sand, 0.5);
    return du + dv < -0.4 ? mix(base, P.white, 0.3) : du + dv > 0.5 ? mix(base, P.slate, 0.4) : base;
  }
  const n = N(u, v, 302, 8);
  if (H(u, v, 303) > 0.93) return P.sandLight;
  if (n < 0.38 && dither(x, y, (0.38 - n) * 3)) return P.tan;
  return f2 - f1 < 0.4 && dither(x, y, 0.5) ? P.tan : P.sand;
};
function shallowTop(phase) {
  const off = phase > 1 ? 4 : 0; // caustic net drifts by a whole cell between phases
  return (u, v, x, y) => {
    const w = Math.sin((2 * Math.PI * (u + 2 * v)) / 16 + phase + 1.1 * Math.sin((2 * Math.PI * u) / 16));
    if (w > 0.94) return mix(SHALLOW, P.white, 0.75); // ripple crest
    if (w > 0.82) return mix(SHALLOW, P.cyan, 0.8);
    const c = voronoi(u + off, v + off / 2, 3, 305, 0.9);
    const bed = mix(shallowBed(u, v, x, y), SHALLOW, 0.48);
    if (c.f2 - c.f1 < 0.35) return mix(bed, P.white, 0.3); // caustic lines
    if (w < -0.75) return mix(bed, P.blue, 0.25); // ripple trough
    return bed;
  };
}
const shallowLeft = (s, t) => {
  if (t === 0) return mix(SHALLOW, P.white, 0.3);
  if (t === 1) return HS(s, t, 306) > 0.7 ? SHALLOW : mix(SHALLOW, P.sand, 0.3);
  const h = HS(s, t, 307);
  return h > 0.9 ? mix(P.sand, SHALLOW, 0.3) : h < 0.1 ? mix(P.clay, SHALLOW, 0.3) : mix(P.tan, SHALLOW, 0.3);
};
const shallowRight = (s, t) => {
  if (t === 0) return SHALLOW;
  if (t === 1) return HS(s, t, 308) > 0.7 ? mix(SHALLOW, P.blueDark, 0.35) : mix(SHALLOW, P.clay, 0.4);
  const h = HS(s, t, 309);
  return h > 0.9 ? mix(P.tan, SHALLOW, 0.3) : h < 0.1 ? mix(P.brown, SHALLOW, 0.3) : mix(P.clay, SHALLOW, 0.3);
};
M.shallow_a = { top: shallowTop(0), left: shallowLeft, right: shallowRight, topY: 2, sideH: 6, edge: P.white, edgeAmt: 0.3 };
M.shallow_b = { top: shallowTop(Math.PI), left: shallowLeft, right: shallowRight, topY: 2, sideH: 6, edge: P.white, edgeAmt: 0.3 };

// --- deep pond: dark green-blue, slow broad ripples, floating lily pads with shadows
const DEEP = mix(P.teal, P.blueDark, 0.45);
const LILY = [[5, 4, 1.9], [12, 11, 1.6], [3.5, 12.5, 1.2]]; // (u, v, radius)
function deepTop(phase) {
  return (u, v, x, y) => {
    const a = wrap16(u), b = wrap16(v);
    // lily pads (with a notch) and their soft shadow below-right
    for (const [lu, lv, r] of LILY) {
      const du = a - lu, dv = b - lv, d = Math.hypot(du, dv);
      const ang = Math.atan2(dv, du);
      const notch = Math.abs(ang - 0.6) < 0.35 && d > r * 0.3;
      if (d < r && !notch) {
        if (d < 0.5) return P.greenDeep;
        return du + dv < -0.5 ? P.green : P.greenDark;
      }
    }
    for (const [lu, lv, r] of LILY) if (Math.hypot(a - lu - 0.9, b - lv - 0.9) < r) return mix(DEEP, P.ink, 0.45);
    const warp = (N(u, v, 310, 8) - 0.5) * 3;
    const w = Math.sin((2 * Math.PI * (u - v)) / 16 + phase + warp + 0.8 * Math.sin((2 * Math.PI * (u + v)) / 16));
    const n = N(u, v, 311, 4);
    if (w > 0.9) return mix(DEEP, P.blue, 0.55);
    if (w > 0.72 && dither(x, y, 0.5)) return mix(DEEP, P.blue, 0.3);
    if (H(u + (phase > 1 ? 6 : 0), v, 312) > 0.99) return mix(P.cyan, DEEP, 0.4);
    if (n < 0.38 && dither(x, y, (0.38 - n) * 3)) return mix(DEEP, P.navy, 0.6);
    if (n > 0.66 && dither(x, y, (n - 0.66) * 3)) return mix(DEEP, P.greenDeep, 0.6);
    return DEEP;
  };
}
const deepLeft = (s, t) => (t === 0 ? mix(DEEP, P.blue, 0.3) : HS(s, t, 313) > 0.86 ? DEEP : t > 2 ? mix(P.teal, P.navy, 0.6) : mix(DEEP, P.navy, 0.5));
const deepRight = (s, t) => (t === 0 ? mix(DEEP, P.navy, 0.4) : HS(s, t, 314) > 0.88 ? mix(DEEP, P.navy, 0.5) : t > 2 ? mix(P.navy, P.ink, 0.5) : P.navy);
M.deep_a = { top: deepTop(0), left: deepLeft, right: deepRight, topY: 2, sideH: 6, edge: P.greenDark, edgeAmt: 0.3 };
M.deep_b = { top: deepTop(Math.PI), left: deepLeft, right: deepRight, topY: 2, sideH: 6, edge: P.greenDark, edgeAmt: 0.3 };

// ---------------------------------------------------------------- mountains
// --- cliff: grey-brown layered rock, mossy top, strongly stratified sides
const CLIFF = mix(P.grey3, P.brown, 0.35);
const CLIFF_L = mix(P.grey2, P.clay, 0.3);
const CLIFF_D = mix(P.slate, P.darkBrown, 0.4);
/** Stratified rock face: 3-px courses (ledge, face, shadow seam) stepping up/down between blocks. */
function cliffSide([ledge, face, lower, seam], moss, seed) {
  return (s, t) => {
    if (t === 0) return HS(s, 0, seed) > 0.4 ? moss : ledge;
    const blk = fl(wrap16(s + fl(HS(0, 0, seed) * 5)) / 5);
    const tt = t + fl(hash2(blk, 0, seed + 1) * 3);
    const k = tt % 3;
    if (k === 0) return HS(s, t, seed + 2) < 0.12 ? lower : seam; // strata seam / overhang shadow
    if (k === 1) return HS(s, t, seed + 3) > 0.2 ? ledge : face; // lit ledge
    if (wrap16(s * 3 + t * 2) % 11 === 0 && HS(s, t, seed + 4) > 0.3) return seam; // cracks
    if (t === 1 && HS(s, 1, seed) > 0.75) return moss; // moss creeping over the top ledge
    return HS(s, t, seed + 5) < 0.12 ? lower : face;
  };
}
M.cliff = {
  top: (u, v, x, y) => {
    const m = N(u, v, 320, 4) * 0.7 + N(u, v, 321, 8) * 0.3;
    if (m > 0.72) return dither(x, y, (m - 0.72) * 6) ? P.greenDark : P.greenDeep; // moss
    if (m > 0.68 && dither(x, y, 0.5)) return P.greenDeep;
    const { f1, f2, id, du, dv } = voronoiC(u, v, 3, 322, 0.9);
    if (f2 - f1 < 0.5) return CLIFF_D; // cracks
    const base = hash2(id, 1, 323) > 0.5 ? CLIFF : mix(CLIFF, P.grey2, 0.35);
    if (du + dv < -1.2 && f2 - f1 > 1) return CLIFF_L;
    if (f2 - f1 < 1 && du + dv > 0) return mix(base, CLIFF_D, 0.5);
    if (H(u, v, 324) > 0.94) return P.grey2;
    return base;
  },
  left: cliffSide([mix(CLIFF_L, P.grey1, 0.35), CLIFF_L, mix(CLIFF, P.grey3, 0.3), CLIFF_D], P.greenDark, 325),
  right: cliffSide([CLIFF, mix(CLIFF, CLIFF_D, 0.5), CLIFF_D, mix(P.navy, P.darkBrown, 0.4)], P.greenDeep, 330),
  edge: P.grey2, edgeAmt: 0.3,
};

// --- mountain path: packed light-brown earth with gravel and small stones
const MPATH = mix(P.sand, P.grey2, 0.3);
M.mountain_path = {
  top: (u, v, x, y) => {
    if (H(u, v, 340) > 0.955) return hash2(fl(u), fl(v), 341) > 0.5 ? P.grey1 : P.grey2; // stones
    if (H(u, v - 1, 340) > 0.955 || H(u - 1, v, 340) > 0.955) return P.clay; // their shadow
    const n = N(u, v, 342, 4);
    const h = H(u, v, 343);
    if (h > 0.88) return mix(P.grey2, P.sand, 0.4); // gravel
    if (h < 0.06) return mix(P.clay, P.grey3, 0.4);
    if (n > 0.62 && dither(x, y, (n - 0.62) * 3)) return mix(P.sandLight, P.grey1, 0.3);
    if (n < 0.33 && dither(x, y, (0.33 - n) * 3)) return mix(P.clay, P.grey3, 0.25);
    return MPATH;
  },
  left: speckSide(mix(P.clay, P.grey3, 0.3), P.grey2, P.brown, 344, MPATH),
  right: speckSide(mix(P.brown, P.grey3, 0.3), P.grey3, P.darkBrown, 345, mix(P.clay, P.grey3, 0.3)),
  edge: P.sandLight, edgeAmt: 0.3,
};

// ---------------------------------------------------------------- temple
// --- tatami: two straw mats per tile (long along u), dark cloth borders on the long edges
const STRAW = mix(P.sandLight, P.greenDark, 0.18);
const STRAW_D = mix(P.sand, P.greenDark, 0.3);
const CLOTH = mix(P.greenDeep, P.navy, 0.5);
M.tatami = {
  top: (u, v, x, y) => {
    const a = cl16(u), b = cl16(v);
    const lb = b % 8;
    if (a < 1) return mix(STRAW_D, P.brown, 0.5); // short-edge seam
    if (lb < 1 || lb >= 7) return lb < 1 && fl(a) % 4 === 2 ? mix(CLOTH, P.grey3, 0.4) : CLOTH; // cloth border
    if (lb < 2) return mix(STRAW_D, P.brown, 0.25); // shadow next to the border
    const weave = fl(a) % 2 === 0; // rush weave across the mat
    if (weave) return (fl(b) + fl(a / 2)) % 3 === 0 ? mix(STRAW, P.sandLight, 0.5) : STRAW;
    return STRAW_D;
  },
  left: (s, t) => {
    if (t === 0) return STRAW;
    if (t === 1) return CLOTH;
    if (t === 7) return P.ink;
    return s % 8 === 7 ? P.darkBrown : HS(s, t, 350) > 0.88 ? P.clay : P.brown;
  },
  right: (s, t) => {
    if (t === 0) return STRAW_D;
    if (t === 1) return mix(CLOTH, P.ink, 0.4);
    if (t === 7) return P.ink;
    return s % 8 === 3 ? P.ink : HS(s, t, 351) > 0.88 ? P.brown : P.darkBrown;
  },
  edge: P.sandLight, edgeAmt: 0.3,
};

// --- temple wall: vermilion pillars, cream plaster panels, gold trim, dark beam on top
const beamTop = (u, v, x, y) => {
  const a = cl16(u), b = cl16(v);
  if (a >= 15 || b >= 15) return P.darkRed; // lacquered front arris
  if (b >= 7.5 && b < 8.5) return P.ink;
  return hash2(fl(a / 3), fl(b), 355) > 0.8 ? mix(P.darkBrown, P.brown, 0.4) : P.darkBrown;
};
function templeSide(pillar, pillarLit, panel, panelShade, trim, base, seed, isLeft) {
  return (s, t) => {
    if (t === 0) return trim; // gold trim under the beam
    if (t === 1) return isLeft ? P.darkRed : mix(P.darkRed, P.ink, 0.4); // lintel
    if (t === 7) return base;
    const ps = isLeft ? [0, 1, 7, 8] : [7, 8, 14, 15];
    if (ps.includes(s)) return (s === ps[0] || s === ps[2]) ? pillarLit : pillar;
    if (t === 6) return panelShade;
    if (t === 2 && (s === 2 || s === 6 || s === 9 || s === 13)) return trim; // gold corner brackets
    return HS(s, t, seed) > 0.92 ? panelShade : panel;
  };
}
M.temple_wall = {
  top: beamTop,
  left: templeSide(P.red, mix(P.red, P.pink, 0.45), X.sandPale, P.sandLight, P.gold, P.darkBrown, 356, true),
  right: templeSide(P.darkRed, P.red, mix(P.sandLight, P.sand, 0.3), mix(P.sand, P.clay, 0.3), mix(P.gold, P.tan, 0.4), P.ink, 357, false),
  edge: P.red, edgeAmt: 0.3,
};

// --- temple roof: rows of rounded jade-green glazed tiles; sides = red beams with gold ends
M.temple_roof = {
  top: (u, v, x, y) => {
    const a = wrap16(u), b = wrap16(v);
    const row = fl(b / 4), lb = b % 4;
    const la = (a + (row % 2) * 2) % 4; // barrel tiles run down the slope (along v)
    if (lb < 0.9) return P.teal; // shadow under the row above
    if (la < 0.9) return mix(P.teal, P.greenDeep, 0.5); // channel between barrels
    if (la < 1.9) return lb < 2 ? mix(P.green, P.white, 0.35) : P.green; // glazed highlight
    if (la < 3) return P.greenDark;
    return P.greenDeep;
  },
  left: (s, t) => {
    if (t === 0) return s % 2 ? P.greenDark : P.green; // tile ends at the eave
    if (t === 1) return P.ink;
    if (t <= 3) return s % 4 === 1 || s % 4 === 2 ? (t === 2 ? P.yellow : P.gold) : P.darkBrown; // rafter ends
    if (t === 4) return P.gold;
    if (t === 7) return P.darkBrown;
    return HS(s, t, 360) > 0.9 ? mix(P.red, P.pink, 0.3) : P.red;
  },
  right: (s, t) => {
    if (t === 0) return s % 2 ? P.greenDeep : P.greenDark;
    if (t === 1) return P.ink;
    if (t <= 3) return s % 4 === 1 || s % 4 === 2 ? (t === 2 ? P.gold : P.tan) : P.ink;
    if (t === 4) return mix(P.gold, P.tan, 0.5);
    if (t === 7) return P.ink;
    return HS(s, t, 361) > 0.9 ? P.red : P.darkRed;
  },
  edge: P.green, edgeAmt: 0.35,
};

// ---------------------------------------------------------------- jungle
// --- rainforest floor: dark soil, broad fallen leaves, small ferns, damp moss
const fern = (u, v, seed) => {
  const { id, du, dv } = voronoiC(u, v, 3, seed, 0.6);
  if (hash2(id, 1, seed) < 0.45) return null;
  const flip = hash2(id, 2, seed) > 0.5;
  const p = flip ? du + dv : du - dv; // along the spine
  const q = flip ? du - dv : du + dv; // across
  if (Math.abs(p) > 3.2) return null;
  if (Math.abs(q) < 0.5) return P.greenDark; // spine
  const reach = 2.4 - Math.abs(p) * 0.55;
  if (Math.abs(q) < reach && fl(p * 1.6 + 8) % 2 === 0) return q < 0 ? P.green : P.greenDark;
  return null;
};
M.jungle_floor = {
  top: (u, v, x, y) => {
    const f = fern(u, v, 370);
    if (f) return f;
    const { f1, f2, id, du, dv } = voronoiC(u + 3, v + 5, 5, 371, 0.9);
    const lh = hash2(id, 3, 371);
    if (lh > 0.5 && f1 < 1.4 && f2 - f1 > 0.3) { // fallen leaf
      const col = lh > 0.85 ? P.rust : lh > 0.7 ? mix(P.gold, P.greenDark, 0.5) : lh > 0.6 ? P.brown : P.greenDark;
      if (Math.abs(du - dv) < 0.25) return mix(col, P.darkBrown, 0.45); // midrib
      return du + dv < -0.3 ? mix(col, P.yellow, 0.2) : col;
    }
    const m = N(u, v, 372, 4);
    const h = H(u, v, 373);
    if (m > 0.58) return dither(x, y, (m - 0.58) * 4) ? P.green : P.greenDark; // damp moss
    if (m > 0.52) return dither(x, y, 0.5) ? P.greenDeep : P.darkBrown;
    if (h > 0.95) return P.brown;
    if (h < 0.05) return P.ink;
    return m < 0.3 && dither(x, y, 0.5) ? mix(P.darkBrown, P.ink, 0.5) : P.darkBrown;
  },
  left: (s, t) => {
    if (t === 0) return HS(s, 0, 374) > 0.3 ? P.greenDark : P.green;
    if (t === 1 && HS(s, 0, 375) > 0.4) return P.greenDeep;
    if (t === 2 && HS(s, 0, 376) > 0.8) return P.greenDeep; // hanging roots / moss
    return darkDirtLeft(s, t);
  },
  right: (s, t) => {
    if (t === 0) return HS(s, 0, 377) > 0.3 ? P.greenDeep : P.greenDark;
    if (t === 1 && HS(s, 0, 378) > 0.4) return P.teal;
    if (t === 2 && HS(s, 0, 379) > 0.8) return P.teal;
    return darkDirtRight(s, t);
  },
  edge: P.green, edgeAmt: 0.35,
};

// ---------------------------------------------------------------- mirage tower
// glyphs: 5x5 bitmaps (rows of bits), drawn in gold inside each 8x8 floor tile
const GLYPHS = [
  [0b00100, 0b01110, 0b00100, 0b00100, 0b01010], // ankh-ish
  [0b11111, 0b10001, 0b10101, 0b10001, 0b11111], // eye-in-square
  [0b00100, 0b01010, 0b10001, 0b01010, 0b00100], // diamond
  [0b10101, 0b10101, 0b01110, 0b00100, 0b00100], // sprout / trident
];
const glyphAt = (g, i, j) => i >= 0 && j >= 0 && i < 5 && j < 5 && (GLYPHS[g][j] >> (4 - i)) & 1;
const PALE = mix(P.sandLight, X.sandPale, 0.5);
const LAPIS = mix(P.blueDark, P.navy, 0.25);
M.tower_floor = {
  top: (u, v, x, y) => {
    const a = cl16(u), b = cl16(v);
    const la = a % 8, lb = b % 8;
    if (la < 1 || lb < 1) return LAPIS; // lapis inlay along the joints
    const ta = fl(a / 8), tb = fl(b / 8);
    const g = (ta + tb * 2 + 1) % GLYPHS.length;
    if (glyphAt(g, fl(la) - 2, fl(lb) - 2)) return (ta + tb) % 2 ? P.gold : mix(P.gold, P.yellow, 0.4);
    if (la < 2 || lb < 2) return mix(PALE, P.white, 0.4); // lit edge next to the inlay
    if (la >= 7 || lb >= 7) return P.sand;
    // faint diagonal shimmer
    const sh = wrap16(u + v * 0.5 + 4);
    if (sh > 5 && sh < 7 && dither(x, y, 0.4)) return mix(PALE, P.white, 0.6);
    if (H(u, v, 380) > 0.94) return P.sandLight;
    return PALE;
  },
  left: (s, t) => {
    if (t === 0) return P.gold;
    if (t === 1) return LAPIS;
    if (t === 7) return P.clay;
    if (s % 8 === 7) return P.tan;
    return HS(s, t, 381) > 0.9 ? P.sandLight : mix(P.sandLight, P.sand, 0.4);
  },
  right: (s, t) => {
    if (t === 0) return mix(P.gold, P.tan, 0.4);
    if (t === 1) return mix(LAPIS, P.ink, 0.35);
    if (t === 7) return P.brown;
    if (s % 8 === 3) return P.clay;
    return HS(s, t, 382) > 0.9 ? P.sand : mix(P.sand, P.tan, 0.35);
  },
  edge: P.white, edgeAmt: 0.3,
};

// --- tower wall: smooth sandstone blocks, lapis band with gold trim, incised glyphs
const INCISE = [0b101, 0b010, 0b111, 0b100, 0b110, 0b011, 0b001, 0b111]; // 3-px glyph columns
function towerSide(stone, lit, joint, lapis, gold, incise, seed, off) {
  return (s, t) => {
    if (t === 0) return lit; // capstone lip
    if (t === 1 || t === 3) return gold;
    if (t === 2) return (s + off) % 4 === 0 ? gold : lapis; // lapis band with gold studs
    if (t === 7) return joint;
    if (wrap16(s + off) % 8 === 0) return joint; // block joint
    // incised glyph panel (t 4..6), a column of marks every few pixels
    const k = wrap16(s + off) % 8;
    if (k >= 2 && k <= 6) {
      const col = INCISE[(fl(wrap16(s + off) / 8) * 5 + k + seed) % INCISE.length];
      if ((col >> (t - 4)) & 1) return incise;
    }
    return HS(s, t, seed) > 0.92 ? lit : stone;
  };
}
M.tower_wall = {
  top: (u, v, x, y) => {
    const a = cl16(u), b = cl16(v);
    if (a >= 15 || b >= 15) return P.gold; // gold trim along the front rim
    if (a < 1 || b < 1) return mix(P.gold, P.tan, 0.4);
    if (a < 3 || b < 3 || a >= 13 || b >= 13) return PALE;
    if (a < 4 || b < 4 || a >= 12 || b >= 12) return LAPIS; // lapis inlay square
    if (glyphAt(1, fl(a) - 6, fl(b) - 6)) return P.gold;
    return fl(a) === 4 || fl(b) === 4 ? mix(PALE, P.white, 0.4) : P.sandLight;
  },
  left: towerSide(mix(P.sandLight, P.sand, 0.3), PALE, P.tan, LAPIS, P.gold, P.clay, 385, 0),
  right: towerSide(mix(P.sand, P.tan, 0.3), P.sand, P.clay, mix(LAPIS, P.ink, 0.35), mix(P.gold, P.tan, 0.4), P.brown, 386, 3),
  edge: P.white, edgeAmt: 0.3,
};

// ---------------------------------------------------------------- hall of fears
// --- black polished stone with faint violet veins and a sheen
const OBSIDIAN = mix(P.ink, P.navy, 0.35);
M.dark_floor = {
  top: (u, v, x, y) => {
    const a = cl16(u), b = cl16(v);
    if (a % 8 < 0.6 || b % 8 < 0.6) return P.ink; // fine slab joints
    const n = N(u, v, 390, 8) * 0.65 + N(u, v, 391, 4) * 0.35;
    const vein = Math.abs(n - 0.5);
    if (vein < 0.015) return P.purple;
    if (vein < 0.035) return X.purpleDark;
    if (vein < 0.055 && dither(x, y, 0.5)) return mix(OBSIDIAN, X.purpleDark, 0.5);
    // polished sheen: a soft diagonal reflection band
    const sh = wrap16(u - v * 0.5 + 16);
    if (sh > 3 && sh < 4.5) return mix(OBSIDIAN, P.slate, 0.55);
    if (sh > 2 && sh < 6 && dither(x, y, 0.35)) return mix(OBSIDIAN, P.slate, 0.35);
    if (H(u, v, 392) > 0.975) return P.slate;
    return OBSIDIAN;
  },
  left: (s, t) => {
    if (t === 0) return P.slate;
    if (t === 7 || s % 8 === 7) return P.ink;
    if ((s * 2 + t) % 11 === 0 && HS(s, t, 393) > 0.4) return X.purpleDark;
    return HS(s, t, 394) > 0.9 ? mix(P.navy, P.slate, 0.4) : P.navy;
  },
  right: (s, t) => {
    if (t === 0) return P.navy;
    if (t === 7 || s % 8 === 3) return P.ink;
    if ((s * 2 - t + 16) % 11 === 0 && HS(s, t, 395) > 0.4) return X.purpleDark;
    return HS(s, t, 396) > 0.9 ? P.navy : mix(P.ink, P.navy, 0.4);
  },
  edge: P.slate, edgeAmt: 0.4,
};

// ---------------------------------------------------------------- island
// --- tilled garden beds: furrows along u with small green shoots on the ridges
M.garden_soil = {
  top: (u, v, x, y) => {
    const b = wrap16(v);
    const lb = b % 4;
    const row = fl(b / 4);
    const a = wrap16(u + row * 3);
    if (lb >= 1.5 && lb < 2.5 && fl(a) % 4 === 1 && hash2(fl(a / 4), row, 400) > 0.25) {
      return lb < 2 ? P.green : P.greenDark; // shoot on the ridge
    }
    if (lb >= 2.5 && lb < 3.5 && fl(a) % 4 === 1 && hash2(fl(a / 4), row, 400) > 0.25) return P.greenDeep;
    if (lb < 1) return mix(P.darkBrown, P.ink, 0.4); // furrow bottom
    if (lb < 2) return P.clay; // lit ridge top
    if (H(u, v, 401) > 0.93) return P.tan;
    return lb >= 3 ? P.darkBrown : P.brown;
  },
  left: darkDirtLeft, right: darkDirtRight, edge: P.clay, edgeAmt: 0.3,
};

// --- bamboo wall: vertical poles lashed with rope; top = bamboo slats
const BAMBOO = mix(P.gold, P.sand, 0.45);
function bambooSide(lit, base, shade, gap, rope, ropeD, seed, off) {
  return (s, t) => {
    if (t === 2 || t === 5) { // rope lashing
      return (s + t) % 3 === 0 ? ropeD : rope;
    }
    const k = wrap16(s + off) % 3;
    if (k === 2) return gap;
    const pole = fl(wrap16(s + off) / 3);
    const node = 1 + fl(hash2(pole, 0, seed) * 6); // node ring height varies per pole
    if (t === node && t !== 2 && t !== 5) return shade;
    if (t === 7) return shade;
    return k === 0 ? lit : base;
  };
}
const bambooLeft = bambooSide(mix(BAMBOO, P.yellow, 0.4), BAMBOO, P.tan, P.brown, P.clay, P.brown, 410, 0);
const bambooRight = bambooSide(BAMBOO, mix(BAMBOO, P.tan, 0.5), P.clay, P.darkBrown, P.brown, P.darkBrown, 411, 1);
M.bamboo_wall = {
  top: (u, v, x, y) => {
    const a = wrap16(u), b = cl16(v);
    const lb = fl(b) % 3;
    if (lb === 0) return P.brown; // gaps between slats
    const slat = fl(b / 3);
    if (fl(a) === fl(hash2(slat, 1, 412) * 16)) return P.tan; // node ring
    return lb === 1 ? mix(BAMBOO, P.yellow, 0.35) : BAMBOO;
  },
  left: bambooLeft, right: bambooRight, edge: P.sandLight, edgeAmt: 0.3,
};

// --- palm-leaf thatch: layered rows of frond strands with ragged edges
const thatchFringe = (side, seed, a, b) => (s, t, x, y) => {
  const len = 1 + fl(HS(s, 0, seed) * 2.5);
  if (t < len) return t === len - 1 ? b : (s % 2 ? a : b);
  if (t === len) return P.darkBrown; // shadow under the eave
  return side(s, t, x, y);
};
M.thatch_roof = {
  top: (u, v, x, y) => {
    const b = wrap16(v);
    const row = fl(b / 4);
    const a = wrap16(u + (row % 2) * 1.5);
    const lb = b % 4;
    const strand = fl(a);
    const h = hash2(strand, row, 420);
    const ragged = 3.2 - h * 1.1;
    if (lb > ragged) return lb > ragged + 0.5 ? P.brown : P.clay; // shadow under the fronds' tips
    if (hash2(strand, row, 421) > 0.8) return mix(P.gold, P.greenDark, 0.4); // greenish fresh frond
    if (strand % 2 === 0) return lb < 1 ? P.sandLight : P.sand;
    return h > 0.6 ? P.tan : mix(P.sand, P.tan, 0.5);
  },
  left: thatchFringe(bambooLeft, 425, P.sand, P.tan),
  right: thatchFringe(bambooRight, 426, P.tan, P.clay),
  edge: P.sandLight, edgeAmt: 0.3,
};

// ---------------------------------------------------------------- caves
const CAVE = mix(P.slate, P.darkBrown, 0.5);
const CAVE_D = mix(P.ink, P.darkBrown, 0.35);
const CAVE_L = mix(P.grey3, P.brown, 0.35);
const GLOW = mix(P.green, P.cyan, 0.35); // phosphorescent moss
const BONES = [[11, 5, -1]]; // (u, v, direction) short bones lying on the floor
M.cave_floor = {
  top: (u, v, x, y) => {
    const a = wrap16(u), b = wrap16(v);
    for (const [bu, bv, d] of BONES) {
      const p = a - bu, q = b - bv - p * d * 0.5; // along / across the bone
      if (Math.abs(p) <= 1.6 && Math.abs(q) < 0.6) return X.sandPale;
      if (Math.abs(Math.abs(p) - 1.9) < 0.5 && Math.abs(q) < 1.1) return P.sandLight; // knobbed ends
      if (Math.abs(p) <= 2.4 && q >= 0.6 && q < 1.3) return CAVE_D; // shadow
    }
    const n = N(u, v, 450, 8) * 0.7 + N(u, v, 451, 4) * 0.3;
    if (n < 0.36) { // puddle
      if (H(u, v, 452) > 0.93) return P.grey1; // glint
      if (n > 0.32) return mix(P.navy, P.slate, 0.5); // wet rim
      return (fl(a) + fl(b)) % 5 === 0 ? mix(P.blueDark, P.navy, 0.3) : mix(P.navy, P.blueDark, 0.35);
    }
    if (H(u, v, 453) > 0.955) return CAVE_L; // pebble
    if (H(u, v - 1, 453) > 0.955 || H(u - 1, v, 453) > 0.955) return CAVE_D;
    const { f1, f2 } = voronoi(u, v, 3, 454, 0.8);
    if (f2 - f1 < 0.5) return CAVE_D; // cracks between flat stones
    if (n > 0.65 && dither(x, y, (n - 0.65) * 3)) return mix(CAVE, CAVE_L, 0.5);
    if (H(u, v, 455) < 0.06) return CAVE_D;
    return CAVE;
  },
  left: rockSide(CAVE, CAVE_L, CAVE_D, P.ink, 456),
  right: rockSide(mix(CAVE, CAVE_D, 0.5), CAVE, P.ink, P.ink, 457),
  edge: P.grey3, edgeAmt: 0.3,
};
/** stalagmite bumps: cones rising from the bottom of a side face */
function caveSide(base, lit, dark, crack, seed) {
  const rock = rockSide(base, lit, dark, crack, seed);
  return (s, t) => {
    for (const c of [3, 9, 13]) {
      const hgt = 3 + fl(hash2(c, 0, seed) * 4); // cone height
      const w = (t - (8 - hgt)) * 0.45; // half-width grows downward
      const d = s - c;
      if (t >= 8 - hgt && Math.abs(d) <= w) return d < 0 ? lit : Math.abs(d) < 0.5 ? mix(lit, base, 0.5) : base;
      if (t >= 8 - hgt && d > w && d <= w + 1) return dark; // shadow right of the cone
    }
    if (HS(s, t, seed + 9) > 0.94 && t < 5) return GLOW; // glowing moss specks
    return rock(s, t);
  };
}
M.cave_wall = {
  top: (u, v, x, y) => {
    // stalagmite bumps seen from above: rounded knobs lit upper-left
    const { f1, id, du, dv } = voronoiC(u, v, 3, 460, 0.8);
    const r = 1.3 + hash2(id, 1, 460) * 1;
    const m = N(u, v, 467, 8) * 0.6 + N(u, v, 466, 4) * 0.4;
    if (m > 0.63 && f1 > 0.9) return dither(x, y, (m - 0.63) * 8) ? GLOW : P.greenDeep; // phosphorescent moss
    if (f1 < r) {
      if (f1 < 0.6) return P.grey2; // tip
      if (f1 < 1.1 && du + dv < 0) return P.grey3;
      return du + dv < 0 ? CAVE_L : du + dv > 0.8 ? CAVE_D : CAVE;
    }
    if (f1 < r + 0.7 && du + dv > 0) return P.ink; // cast shadow
    if (m > 0.58 && dither(x, y, 0.4)) return P.teal;
    return rockTop(462)(u, v, x, y) === P.slate ? CAVE_D : H(u, v, 463) > 0.9 ? CAVE : mix(CAVE, CAVE_D, 0.5);
  },
  left: caveSide(CAVE, CAVE_L, CAVE_D, P.ink, 464),
  right: caveSide(mix(CAVE, CAVE_D, 0.5), CAVE, P.ink, P.ink, 465),
  edge: P.grey3, edgeAmt: 0.3,
};

export const MATERIALS = M;

export function chipsetFrames() {
  return CHIPSET_NAMES.map((n) => drawBlock(M[n]));
}
export function chipsetSheet() {
  return grid(chipsetFrames(), 32, 24, 8);
}
