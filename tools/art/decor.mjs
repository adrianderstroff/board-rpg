// Desert decor objects: 32x48 frames, 8 columns; tile center (ground anchor) at (16,40).
// Rendered with the SDF renderer through a true 2:1 dimetric camera
// (yaw 45deg, pitch 30deg, scale sqrt2): 1 unit along a grid axis = (1px, 0.5px);
// a tile is 16x16 units; one height block (8px) = 6.53 units.
import {
  Model, ellipsoid, sphere, capsule, roundCone, box, cone, torus, custom, intersect, subtract, union, halfSpace,
  render, Camera, shade, rotX, rotY, rotZ, mmul, alignY,
} from './sdf.mjs';
import { Canvas, grid, mix } from './raster.mjs';
import { P, RAMPS, X } from './palette.mjs';
import { hash2 } from './rng.mjs';

const s = shade;
export const DECOR_NAMES = [
  'palm', 'cactus', 'cactus_small', 'rock_small', 'rock_big', 'well', 'stall_red', 'stall_green',
  'stall_purple', 'crate', 'barrel', 'sign_post', 'pot', 'chest_closed', 'chest_open', 'fence',
  'dead_tree', 'bones', 'tent', 'bed', 'anvil', 'bush', 'lamp_post', 'sparkle',
];
export const DECOR_W = 32, DECOR_H = 48, ANCHOR_X = 16, ANCHOR_Y = 40;

export const isoCamera = (ox = ANCHOR_X, oy = ANCHOR_Y) => new Camera({ yaw: Math.PI / 4, pitch: Math.PI / 6, scale: Math.SQRT2, ox, oy });

const WOOD = RAMPS.wood, WOOD_D = s(RAMPS.wood, -0.6);
const STONE = [P.slate, P.grey3, P.grey2, P.grey1];
const CLAY = [P.brown, P.rust, P.tan, P.sand];
const ADOBE_R = [P.brown, P.clay, P.tan, P.sand];

function lathe(y0, y1, rFn, c = [0, 0, 0]) {
  let rmax = 0; for (let i = 0; i <= 20; i++) rmax = Math.max(rmax, rFn(y0 + ((y1 - y0) * i) / 20));
  return custom((x, y, z) => {
    const yy = Math.min(Math.max(y - c[1], y0), y1);
    const d = Math.hypot(x - c[0], z - c[2]) - rFn(yy);
    return Math.max(d * 0.8, y0 - (y - c[1]), (y - c[1]) - y1);
  }, [c[0], c[1] + (y0 + y1) / 2, c[2], Math.hypot(rmax, (y1 - y0) / 2)]);
}
function woodPlanks(axis = 'y', w = 2.2, ramp = WOOD) {
  return (h) => {
    const k = axis === 'y' ? h.p[1] : axis === 'x' ? h.p[0] : h.p[2];
    const f = ((k / w) % 1 + 1) % 1;
    return f < 0.16 ? s(ramp, -1.2) : ramp;
  };
}

const D = {};

D.palm = () => {
  const m = new Model();
  const pts = [];
  for (let i = 0; i <= 6; i++) { const t = i / 6; pts.push([Math.sin(t * 1.6) * 3.2, t * 24, Math.sin(t * 1.2) * 1.2]); }
  for (let i = 0; i < 6; i++) {
    const r0 = 1.55 - i * 0.1;
    m.add(roundCone(pts[i], pts[i + 1], r0, r0 - 0.1), (h) => (((h.p[1] / 1.6) % 1) < 0.3 ? s(WOOD, -0.9) : s(WOOD, -0.1)), 'trunk');
  }
  const crown = pts[6];
  m.add(sphere([crown[0], crown[1] - 0.8, crown[2]], 1.8), s(RAMPS.wood, -0.5), 'crown');
  // coconuts
  for (const [dx, dz] of [[1, 1.2], [-1.2, 0.6], [0.3, -1.3]]) m.add(sphere([crown[0] + dx, crown[1] - 1.8, crown[2] + dz], 0.9), s(RAMPS.leather, -0.3), 'nut');
  const N = 8;
  for (let k = 0; k < N; k++) {
    const a = (k / N) * Math.PI * 2 + 0.3;
    const len = 9 + (k % 3) * 1.2;
    for (let i = 1; i <= 7; i++) {
      const t = i / 7;
      const r = t * len;
      const p = [crown[0] + Math.cos(a) * r, crown[1] + 1.8 * Math.sin(t * Math.PI * 0.9) * 1.6 - t * t * 7.5, crown[2] + Math.sin(a) * r];
      const wdt = 1.9 * (1 - t * 0.65);
      m.add(ellipsoid(p, [wdt, 0.45, wdt]), (h) => (hash2(k, i, 3) > 0.7 ? s(RAMPS.green, 0.2) : RAMPS.green), 'frond' + k);
    }
  }
  return m;
};

D.cactus = () => {
  const m = new Model();
  const rib = (h) => {
    const a = Math.atan2(h.p[0] - (h.p[0] > 3 ? 5 : h.p[0] < -2.5 ? -4.6 : 0), h.p[2]);
    return Math.sin(a * 7) > 0.7 ? s(RAMPS.green, -0.9) : s(RAMPS.green, 0.1);
  };
  m.add(roundCone([0, 0, 0], [0, 19, 0], 2.4, 2.1), rib, 'c');
  m.add(capsule([1.8, 8, 0], [5, 8.5, 0], 1.45), rib, 'c');
  m.add(capsule([5, 8.5, 0], [5, 14.5, 0], 1.45), rib, 'c');
  m.add(capsule([-1.8, 11, 0], [-4.6, 11.5, 0], 1.3), rib, 'c');
  m.add(capsule([-4.6, 11.5, 0], [-4.6, 16, 0], 1.3), rib, 'c');
  m.add(sphere([0.4, 21.0, 0.6], 0.8), s(RAMPS.red, 0.6), 'flower');
  return m;
};

D.cactus_small = () => {
  const m = new Model();
  const rib = (h) => (Math.sin(Math.atan2(h.p[0], h.p[2]) * 8) > 0.72 ? s(RAMPS.green, -0.9) : s(RAMPS.green, 0.1));
  m.add(ellipsoid([0, 3.2, 0], [3.3, 3.6, 3.3]), rib, 'c');
  m.add(ellipsoid([3.8, 1.8, 1.5], [1.8, 2.2, 1.8]), rib, 'c2');
  for (const [dx, dz] of [[0, 0], [0.9, 0.5], [-0.7, 0.6]]) m.add(sphere([dx, 6.9, dz], 0.75), s(RAMPS.red, 0.9), 'f');
  return m;
};

function rockCluster(m, blobs, ramp, seed) {
  blobs.forEach(([x, y, z, rx, ry, rz], i) => {
    const e = ellipsoid([x, y, z], [rx, ry, rz], rotY(i * 1.3));
    const f = custom((px, py, pz) => e(px, py, pz) + 0.35 * Math.sin(px * 1.3 + seed) * Math.sin(pz * 1.1 + py * 0.9), e.b);
    m.add(f, (h) => (hash2(Math.floor(h.p[0] * 1.5), Math.floor(h.p[1] * 1.5 + h.p[2]), seed) > 0.9 ? s(ramp, -0.8) : ramp), 'rock' + i);
  });
}
const ROCK = [P.slate, P.grey3, mix(P.grey2, P.clay, 0.25), P.grey1];
D.rock_small = () => { const m = new Model(); rockCluster(m, [[0, 1.2, 0, 3.4, 2.6, 2.8], [3.2, 0.6, 2.2, 1.8, 1.4, 1.6]], ROCK, 1); return m; };
D.rock_big = () => {
  const m = new Model();
  rockCluster(m, [[0, 4, 0, 6.5, 6.5, 5.8], [-3.5, 7.5, -2, 4, 5.5, 4], [4.5, 2, 3.5, 3.4, 2.5, 3]], ROCK, 2);
  return m;
};

D.well = () => {
  const m = new Model();
  const ring = subtract(lathe(0, 5.2, () => 6.2), lathe(-1, 7, () => 4.6));
  m.add(ring, (h) => {
    const a = Math.atan2(h.p[2], h.p[0]);
    const row = Math.floor(h.p[1] / 1.7);
    const col = Math.floor((a / Math.PI) * 6 + (row % 2) * 0.5);
    const fy = (h.p[1] / 1.7) % 1, fa = (((a / Math.PI) * 6 + (row % 2) * 0.5) % 1 + 1) % 1;
    if (h.p[1] > 5.0) return s(STONE, 0.4);
    if (fy < 0.2 || fa < 0.1) return s(STONE, -1);
    return hash2(row, col, 5) > 0.5 ? s(ADOBE_R, 0.2) : s(STONE, 0.3);
  }, 'ring');
  m.add(lathe(0, 3.6, () => 4.7), [P.navy, P.blueDark, P.blueDark, P.blue], 'water');
  for (const sx of [-5.3, 5.3]) m.add(box([sx, 8, 0], [0.7, 8, 0.7], 0.1), WOOD, 'post');
  m.add(capsule([-5.3, 13.2, 0], [5.3, 13.2, 0], 0.5), WOOD_D, 'bar');
  // roof: two sloped planks
  m.add(box([0, 17.3, -2.2], [7.2, 0.35, 2.8], 0.1, rotX(-0.55)), (h) => woodPlanks('x', 1.5, s(RAMPS.red, -0.4))(h), 'roof');
  m.add(box([0, 17.3, 2.2], [7.2, 0.35, 2.8], 0.1, rotX(0.55)), (h) => woodPlanks('x', 1.5, s(RAMPS.red, -0.4))(h), 'roof');
  m.add(capsule([0, 13.2, 0], [0, 9.5, 0], 0.12), P.grey2, 'rope');
  m.add(lathe(0, 2, (y) => 1.2 + y * 0.15, [0, 7.8, 0]), WOOD, 'bucket');
  return m;
};

function stall(awning) {
  const m = new Model();
  m.add(box([0, 3.2, 0], [6.5, 3.2, 4], 0.2), woodPlanks('y', 1.6), 'counter');
  m.add(box([0, 6.6, 0], [6.9, 0.35, 4.3], 0.1), s(WOOD, 0.3), 'top');
  for (const sx of [-6.3, 6.3]) for (const sz of [-3.8, 3.8]) m.add(box([sx, 9, sz], [0.45, 9, 0.45]), WOOD_D, 'post');
  // sloped striped awning with scalloped front
  const aw = box([0, 18.6, 0], [7.6, 0.35, 5.2], 0.1, rotZ(0));
  const awT = custom((x, y, z) => aw(x, y + (x) * 0.0 + z * 0.28, z), aw.b);
  m.add(awT, (h) => (Math.floor((h.p[0] + 20) / 2.2) % 2 ? awning : RAMPS.cream), 'awning');
  for (let i = -3; i <= 3; i++) m.add(ellipsoid([i * 2.2, 19.4 - 5.2 * 0.28 - 0.9, 5.2], [1.1, 1.0, 0.35]), i % 2 ? RAMPS.cream : awning, 'awning');
  // goods
  const goods = [[-4, 7.6, 1.5, RAMPS.orange], [-2.2, 7.6, 2.2, RAMPS.red], [0, 7.6, 1.2, RAMPS.gold], [2.5, 7.9, 1.8, CLAY], [4.4, 7.6, 1.4, RAMPS.green]];
  for (const [x, y, z, r] of goods) m.add(sphere([x, y, z], 1.05), r, 'goods');
  return m;
}
D.stall_red = () => stall(s(RAMPS.red, 0));
D.stall_green = () => stall(s(RAMPS.green, 0.3));
D.stall_purple = () => stall(s(RAMPS.violet, 0.2));

D.crate = () => {
  const m = new Model();
  m.add(box([0, 4.2, 0], [4.2, 4.2, 4.2], 0.2), (h) => {
    const [x, y, z] = h.p;
    const edge = (a) => Math.abs(a) > 3.4;
    const ax = edge(x), ay = y < 0.8 || y > 7.6, az = edge(z);
    if ((ax && ay) || (ay && az) || (ax && az)) return s(WOOD, -0.4);
    const k = Math.abs(h.n[1]) > 0.7 ? x : y;
    return ((k + 10) / 2.1) % 1 < 0.18 ? s(WOOD, -1.2) : s(WOOD, 0.1);
  }, 'crate');
  return m;
};

D.barrel = () => {
  const m = new Model();
  m.add(lathe(0, 9.5, (y) => 3.4 + 0.6 * Math.sin((Math.PI * y) / 9.5)), (h) => {
    const y = h.p[1];
    if (Math.abs(y - 1.6) < 0.5 || Math.abs(y - 7.9) < 0.5) return RAMPS.iron;
    if (y > 9.3) return s(WOOD, -0.3);
    const a = Math.atan2(h.p[2], h.p[0]);
    return ((a / Math.PI) * 7 + 10) % 1 < 0.15 ? s(WOOD, -1.1) : WOOD;
  }, 'barrel');
  return m;
};

D.sign_post = () => {
  const m = new Model();
  m.add(box([0, 6, 0], [0.55, 6, 0.55]), WOOD_D, 'post');
  m.add(box([0, 11, 0.8], [4.6, 2.2, 0.35], 0.15), (h) => {
    if (Math.abs(h.p[2] - 1.15) < 0.3 && Math.abs(h.p[1] - 11) < 1.2 && Math.abs(h.p[0]) < 3.4 && Math.floor(h.p[0] * 1.3) % 2 === 0) return s(WOOD, -1.5);
    return s(WOOD, 0.3);
  }, 'board');
  return m;
};

D.pot = () => {
  const m = new Model();
  m.add(lathe(0, 8.5, (y) => (y < 5.5 ? 1.8 + 1.9 * Math.sin((Math.PI * (y + 0.6)) / 7.2) : 1.55 + (y > 7.6 ? 0.45 : 0))), (h) => {
    if (Math.abs(h.p[1] - 4.8) < 0.35) return s(CLAY, -0.9);
    if (h.p[1] > 8.2) return s(P.darkBrown ? [P.darkBrown, P.darkBrown, P.brown, P.brown] : CLAY, 0);
    return CLAY;
  }, 'pot');
  return m;
};

function chest(open) {
  const m = new Model();
  const trim = (h) => {
    const [x, y, z] = h.p;
    const ax = Math.abs(x);
    if ((ax > 2.5 && ax < 3.4) || ax > 4.25 || (Math.abs(z) > 2.85 && y < 0.7)) return RAMPS.gold;
    return woodPlanks('y', 1.7, s(RAMPS.red, -0.9))(h);
  };
  m.add(box([0, 2.6, 0], [4.5, 2.6, 3.1], 0.15), trim, 'base');
  if (!open) {
    m.add(intersect(custom((x, y, z) => Math.hypot(y - 5.1, z) - 3.0, [0, 5.1, 0, 5.6]), box([0, 6.2, 0], [4.5, 1.9, 3.1])), trim, 'lid');
    m.add(box([0, 4.6, 3.2], [0.6, 0.8, 0.3]), RAMPS.gold, 'lock');
  } else {
    m.add(box([0, 5.4, 0], [4.2, 0.2, 2.8]), [P.ink, P.ink, P.darkBrown, P.darkBrown], 'inside');
    const lid = new Model();
    lid.add(intersect(custom((x, y, z) => Math.hypot(y - 5.1, z) - 3.0, [0, 5.1, 0, 5.6]), box([0, 6.2, 0], [4.5, 1.9, 3.1])), trim, 'lid');
    m.merge(lid.transform(rotX(-1.9), [0, 5.2, -3.1]));
    m.add(sphere([-1.2, 5.6, 0.6], 0.9), RAMPS.gold, 'gold');
    m.add(sphere([1.0, 5.5, -0.4], 0.8), RAMPS.gold, 'gold');
  }
  return m;
}
D.chest_closed = () => chest(false);
D.chest_open = () => chest(true);

D.fence = () => {
  const m = new Model();
  for (const z of [-6.5, 0, 6.5]) m.add(box([0, 4.6, z], [0.6, 4.6, 0.6], 0.1), WOOD_D, 'post');
  for (const y of [3.2, 6.8]) m.add(box([0, y, 0], [0.3, 0.55, 7.8]), WOOD, 'rail');
  return m;
};

D.dead_tree = () => {
  const m = new Model();
  const bark = [P.darkBrown, P.brown, mix(P.brown, P.grey3, 0.4), P.grey2];
  m.add(roundCone([0, 0, 0], [0.8, 14, 0.4], 1.8, 0.9), bark, 't');
  const br = [[[0.6, 10, 0.3], [5.5, 17, 1], 0.7], [[0.7, 12.5, 0.3], [-4.5, 19, -1.2], 0.6], [[0.8, 14, 0.4], [1.8, 22, -0.5], 0.55],
    [[3.5, 14.5, 0.7], [6.5, 16, 3], 0.35], [[-2.5, 16, -0.5], [-2.8, 20, 2.5], 0.3]];
  for (const [a, b, r] of br) m.add(roundCone(a, b, r, r * 0.45), bark, 'b');
  for (const [x, z] of [[1.9, 0.3], [-1.6, 0.8]]) m.add(roundCone([0, 0.5, 0], [x, 0.1, z], 1.0, 0.4), bark, 't');
  return m;
};

D.bones = () => {
  const m = new Model();
  const bone = [P.grey3, P.grey1, P.sandLight, P.white];
  m.add(ellipsoid([-2.8, 1.5, 1.5], [1.9, 1.7, 2.0]), bone, 'skull');
  m.add(ellipsoid([-2.8, 0.6, 2.8], [1.3, 0.8, 1.1]), bone, 'skull');
  for (const sx of [-0.7, 0.7]) m.dot([-2.8 + sx, 1.9, 3.3], P.ink, 1, 1, { tol: 2 });
  // ribs
  for (let i = 0; i < 4; i++) {
    const z = -1 - i * 1.5;
    for (const side of [1, -1]) m.add(capsule([1.5, 0.3, z], [1.5 + side * 2.6, 2.2 - Math.abs(side) * 0.2, z + 0.4], 0.36), bone, 'rib');
  }
  m.add(capsule([1.5, 0.4, 0], [1.5, 0.4, -6], 0.45), bone, 'spine');
  m.add(capsule([3.5, 0.3, 3.5], [6.5, 0.3, 1.5], 0.4), bone, 'bone');
  m.add(sphere([6.7, 0.4, 1.4], 0.6), bone, 'bone');
  m.add(sphere([3.3, 0.4, 3.6], 0.6), bone, 'bone');
  return m;
};

D.tent = () => {
  const m = new Model();
  const W = 7.2, Ht = 12, L = 6.8;
  const prism = custom((x, y, z) => Math.max((Math.abs(x) * Ht / W + y - Ht) / Math.hypot(Ht / W, 1), -y, Math.abs(z) - L), [0, Ht / 2, 0, 11]);
  m.add(prism, (h) => {
    if (h.p[2] > L - 0.2 && Math.abs(h.p[0]) < (Ht - h.p[1]) * W / Ht * 0.45 && h.p[1] < 8) return [P.ink, P.ink, P.darkBrown, P.darkBrown];
    return Math.floor((h.p[2] + 20) / 2.3) % 2 ? RAMPS.cream : s(RAMPS.red, -0.2);
  }, 'tent');
  m.add(capsule([0, Ht, L + 1], [0, Ht + 2.5, L + 1], 0.3), WOOD_D, 'pole');
  m.add(capsule([0, Ht, -L - 1], [0, Ht + 2.5, -L - 1], 0.3), WOOD_D, 'pole');
  return m;
};

D.bed = () => {
  const m = new Model();
  m.add(box([0, 2.2, 0], [4.4, 2.2, 7.2], 0.2), WOOD, 'frame');
  m.add(box([0, 6.5, -7.0], [4.4, 3.3, 0.5], 0.2), WOOD, 'head');
  m.add(box([0, 4.6, 0.2], [4.0, 0.8, 6.8], 0.6), RAMPS.white, 'mattress');
  m.add(box([0, 5.0, 2.2], [4.2, 0.7, 4.8], 0.6), s(RAMPS.blue, -0.3), 'blanket');
  m.add(ellipsoid([0, 5.7, -4.6], [2.8, 0.9, 1.5]), RAMPS.white, 'pillow');
  return m;
};

D.anvil = () => {
  const m = new Model();
  m.add(lathe(0, 5, () => 3.4), (h) => (h.p[1] > 4.8 ? s(WOOD, 0.3) : woodPlanks('y', 2.5, WOOD_D)(h)), 'stump');
  m.add(box([0, 6.0, 0], [1.4, 1.0, 1.6], 0.15), RAMPS.iron, 'anvil');
  m.add(box([0, 7.8, 0], [2.0, 0.9, 3.4], 0.2), s(RAMPS.iron, 0.3), 'anvil');
  m.add(roundCone([0, 7.9, 3.2], [0, 8.3, 6.0], 0.9, 0.2), s(RAMPS.iron, 0.3), 'anvil');
  return m;
};

D.bush = () => {
  const m = new Model();
  const blobs = [[0, 3, 0, 3.4], [2.8, 2.4, 1.6, 2.6], [-2.6, 2.3, 1.2, 2.5], [0.8, 2.2, -2.6, 2.6], [-1.2, 5, -0.5, 2.3], [1.5, 4.8, 1.0, 2.2]];
  const leaf = [P.teal, P.greenDeep, P.greenDark, P.green];
  blobs.forEach(([x, y, z, r], i) => m.add(sphere([x, y, z], r), (h) => (hash2(Math.floor(h.p[0] * 1.4 + 9), Math.floor(h.p[1] * 1.4 + h.p[2] * 0.7 + 9), 7) > 0.8 ? s(leaf, -0.7) : leaf), 'b' + i));
  for (const [x, y, z] of [[1.8, 5.2, 2.6], [-2.8, 4.1, 2.8], [3.6, 3.4, 3]]) m.add(sphere([x, y, z], 0.55), s(RAMPS.red, 0.5), 'berry');
  return m;
};

D.lamp_post = () => {
  const m = new Model();
  m.add(lathe(0, 2, (y) => 1.6 - y * 0.3), RAMPS.iron, 'base');
  m.add(capsule([0, 1, 0], [0, 22, 0], 0.55), RAMPS.iron, 'pole');
  m.add(box([0, 24.4, 0], [1.9, 2.2, 1.9], 0.15), (h) => (Math.abs(h.p[0]) < 1.5 && Math.abs(h.p[2]) < 1.5 || Math.abs(h.p[1] - 24.4) < 1.6 && (Math.abs(h.p[0]) < 1.4 || Math.abs(h.p[2]) < 1.4) ? [P.orange, P.gold, P.yellow, P.white] : RAMPS.iron), 'lamp');
  m.add(cone([0, 0, 0], 26.4, 28.2, 2.6, 0.4), RAMPS.iron, 'cap');
  return m;
};

function sparkle() {
  const c = new Canvas(DECOR_W, DECOR_H);
  const star = (x, y, r, col, core) => {
    for (let i = -r; i <= r; i++) { c.set(x + i, y, col); c.set(x, y + i, col); }
    c.set(x, y, core);
    if (r >= 2) { c.set(x - 1, y - 1, col); c.set(x + 1, y + 1, col); c.set(x + 1, y - 1, col); c.set(x - 1, y + 1, col); c.set(x, y, P.white); }
  };
  // small item glint on the ground at the anchor
  c.ellipse(16, 40, 3, 1.5, withA(P.gold, 110), true);
  star(16, 36, 3, P.yellow, P.white);
  star(12, 39, 1, P.gold, P.yellow);
  star(20, 41, 1, P.gold, P.white);
  star(19, 33, 1, P.white, P.white);
  return c;
}
function withA(c, a) { return ((c & 0xffffff00) | a) >>> 0; }

export function decorFrames() {
  return DECOR_NAMES.map((n) => {
    if (n === 'sparkle') return sparkle();
    const m = D[n]();
    return render(m, { w: DECOR_W, h: DECOR_H, cam: isoCamera(), inner: 1.2 });
  });
}
export function decorSheet() { return grid(decorFrames(), DECOR_W, DECOR_H, 8); }
