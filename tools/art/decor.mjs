// Desert decor objects: 32x48 frames, 8 columns; tile center (ground anchor) at (16,40).
// Rendered with the SDF renderer through a true 2:1 dimetric camera
// (yaw 45deg, pitch 30deg, scale sqrt2): 1 unit along a grid axis = (1px, 0.5px);
// a tile is 16x16 units; one height block (8px) = 6.53 units.
import {
  Model, ellipsoid, sphere, capsule, roundCone, box, cone, torus, custom, intersect, subtract, union, halfSpace,
  render, Camera, shade, rotX, rotY, rotZ, mmul, alignY,
} from './sdf.mjs';
import { Canvas, grid, mix, dither } from './raster.mjs';
import { P, RAMPS, X } from './palette.mjs';
import { hash2 } from './rng.mjs';

const s = shade;
export const DECOR_NAMES = [
  'palm', 'cactus', 'cactus_small', 'rock_small', 'rock_big', 'well', 'stall_red', 'stall_green',
  'stall_purple', 'crate', 'barrel', 'sign_post', 'pot', 'chest_closed', 'chest_open', 'fence',
  'dead_tree', 'bones', 'tent', 'bed', 'anvil', 'bush', 'lamp_post', 'sparkle',
  'skeleton', 'mast', 'tree_oak', 'tree_pine', 'mushroom', 'pillar', 'pillar_broken', 'rubble',
  'rope_coil', 'anchor', 'bollard', 'fern', 'lantern_elf', 'net_rack',
  // interiors (38..45)
  'counter', 'inn_sign', 'magic_sign', 'bookshelf', 'table', 'stairs_up', 'stairs_down', 'scroll_shelf',
  // temple / pond / jungle (46..55)
  'pillow', 'incense_burner', 'buddha_statue', 'stone_lantern', 'prayer_flags', 'bamboo', 'reeds', 'lily_pad',
  'jungle_tree', 'banana_plant',
  // puzzles / mirage tower (56..63)
  'switch_up', 'switch_down', 'gate_bars', 'seed_sprout', 'bramble', 'mirage_crystal', 'pedestal', 'dark_brazier',
  // ship (64..)
  'ship_wheel', 'ship_wheel_r1', 'ship_wheel_r2', 'ship_wheel_r3',
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

// ---------------------------------------------------------------- ruins / forest / dock props
// Screen-horizontal ground axis: local +x after DIAG maps onto grid (1,0,-1)/sqrt2.
const DIAG = rotY(Math.PI / 4);
const BONE = [P.grey3, P.grey1, P.sandLight, P.white];
const SANDSTONE = [P.brown, P.clay, P.sand, P.sandLight];
const LEAF = [P.teal, P.greenDeep, P.greenDark, P.green];
const PINE = [P.ink, P.teal, P.greenDeep, P.greenDark];
const ROPE = [P.brown, P.clay, P.sand, P.sandLight];
const RUST = [P.darkBrown, P.brown, P.rust, P.tan];
const speckle = (ramp, seed, k = 1.4, thr = 0.82, dark = -0.8) => (h) =>
  (hash2(Math.floor(h.p[0] * k + 50), Math.floor(h.p[1] * k + h.p[2] * 0.7 + 50), seed) > thr ? s(ramp, dark) : ramp);
const IRON_L = s(RAMPS.iron, 0.45), RUST_D = s(RUST, -0.4);
const rusty = (seed) => (h) => {
  const r = hash2(Math.floor(h.p[0] * 0.9 + 40), Math.floor(h.p[1] * 0.9 + h.p[2] * 0.8 + 40), seed);
  return r > 0.86 ? RUST_D : IRON_L;
};
/** Torus lying in the local x-y plane (ring axis = z). */
function torusXY([cx, cy, cz], R, r) {
  return custom((x, y, z) => { const q = Math.hypot(x - cx, y - cy) - R; return Math.hypot(q, z - cz) - r; }, [cx, cy, cz, R + r]);
}

D.skeleton = () => {
  const m = new Model();
  // body laid along local z (skull at -z), lateral x, lying on its back
  m.add(ellipsoid([0, 2.1, -8.2], [2.3, 2.0, 2.4]), BONE, 'skull');
  m.add(ellipsoid([0, 1.0, -6.6], [1.5, 0.9, 1.1]), BONE, 'skull');
  for (const sx of [-0.9, 0.9]) m.dot([sx, 3.7, -8.6], P.ink, 2, 1, { tol: 3, ax: 1 });
  m.dot([0, 3.4, -7.5], P.ink, 1, 1, { tol: 3 });
  m.add(capsule([0, 0.8, -6.0], [0, 0.5, 3.6], 0.45), BONE, 'spine');
  for (let i = 0; i < 4; i++) {
    const z = -4.6 + i * 1.45, w = 3.1 - i * 0.3, hgt = 3.0 - i * 0.3;
    for (const sd of [1, -1]) {
      m.add(capsule([0, 0.8, z], [sd * w * 0.75, hgt, z + 0.3], 0.36), BONE, 'rib');
      m.add(capsule([sd * w * 0.75, hgt, z + 0.3], [sd * w, 0.4, z + 0.7], 0.36), BONE, 'rib');
    }
  }
  m.add(ellipsoid([0, 1.0, 4.0], [2.5, 1.0, 1.4]), BONE, 'pelvis');
  // arms: one along the side, one flung out
  m.add(capsule([3.2, 0.5, -5.0], [4.2, 0.5, -1.0], 0.4), BONE, 'arm');
  m.add(capsule([4.2, 0.5, -1.0], [4.0, 0.45, 2.8], 0.36), BONE, 'arm');
  m.add(sphere([3.9, 0.45, 3.5], 0.65), BONE, 'arm');
  m.add(capsule([-3.2, 0.5, -5.0], [-6.0, 0.5, -6.8], 0.4), BONE, 'arm2');
  m.add(capsule([-6.0, 0.5, -6.8], [-7.6, 0.45, -4.2], 0.36), BONE, 'arm2');
  m.add(sphere([-7.8, 0.45, -3.6], 0.65), BONE, 'arm2');
  // legs, one bent
  m.add(capsule([1.4, 0.5, 4.8], [2.0, 0.5, 8.6], 0.45), BONE, 'leg');
  m.add(capsule([2.0, 0.5, 8.6], [1.8, 0.45, 11.6], 0.4), BONE, 'leg');
  m.add(capsule([-1.4, 0.5, 4.8], [-3.8, 0.5, 7.8], 0.45), BONE, 'leg2');
  m.add(capsule([-3.8, 0.5, 7.8], [-2.8, 0.45, 11.0], 0.4), BONE, 'leg2');
  // rusty broken sword + a scrap of cloth beside the body
  m.add(box([5.9, 0.35, 6.3], [0.6, 0.22, 2.8], 0.1, rotY(0.4)), RUST, 'sword');
  m.add(box([5.0, 0.5, 3.9], [1.5, 0.4, 0.35], 0.1, rotY(0.4)), RAMPS.iron, 'hilt');
  m.add(box([-4.4, 0.2, 1.8], [1.8, 0.18, 2.1], 0.15, rotY(0.3)), s(RAMPS.tanCloth, -0.6), 'cloth');
  return m.transform(rotY(-0.35), [0, 0, 0], [0, 0, 0.6]);
};

D.mast = () => {
  const m = new Model();
  m.add(lathe(0, 1.4, (y) => 2.5 - y * 0.5), WOOD_D, 'collar');
  m.add(roundCone([0, 0, 0], [0, 30.5, 0], 1.05, 0.6), (h) => (Math.abs(h.p[1] - 13) < 0.5 || Math.abs(h.p[1] - 27) < 0.4 ? RAMPS.iron : WOOD), 'mast');
  m.add(sphere([0, 30.8, 0], 0.8), RAMPS.gold, 'truck');
  // yard with a furled sail (bunched in bights between the ties)
  const rig = new Model();
  rig.add(capsule([-10, 22.6, 0], [10, 22.6, 0], 0.55), WOOD_D, 'yard');
  rig.add(custom((x, y, z) => {
    const t = Math.min(Math.abs(x) / 9.4, 1);
    const tie = Math.abs(((x + 30) % 3.4) - 1.7) / 1.7; // 0 at a tie, 1 between
    const r = (1.25 + 0.45 * tie) * Math.sqrt(1 - t * t * t) + 0.25;
    return Math.max(Math.hypot((y - 21.3) * 0.9, z - 0.5) - r, Math.abs(x) - 9.5) * 0.85;
  }, [0, 21.3, 0.5, 10]), (h) => (Math.abs(((h.p[0] + 30) % 3.4) - 1.7) > 1.45 ? s(ROPE, -0.6) : RAMPS.cream), 'sail');
  // pennant flying from the truck
  rig.add(custom((x, y, z) => {
    const u = x - 0.5; const half = 0.95 * (1 - u / 5.5);
    return Math.max(Math.abs(y - 29.6 + u * 0.15 - 0.3 * Math.sin(u * 1.3)) - half, -u, u - 5.5, Math.abs(z) - 0.2);
  }, [3, 29.5, 0, 3.8]), s(RAMPS.red, 0.2), 'pennant');
  rig.line([0, 29, 0], [-9.6, 23, 0], P.brown, { bias: 1 });
  rig.line([0, 29, 0], [9.6, 23, 0], P.brown, { bias: 1 });
  const out = m.merge(rig.transform(rotY(Math.PI / 4 + 0.25)));
  // shrouds to the deck: thin 1px ropes behind everything (drawn after the outline pass)
  out.post = (cv, cam) => {
    for (const [a, b] of [[[0, 20, 0], [-6, 0, 5]], [[0, 20, 0], [5, 0, -6]], [[0, 26, 0], [-7.5, 0, -2]]]) {
      const pa = cam.project(a), pb = cam.project(b);
      cv.line(pa[0], pa[1], pb[0], pb[1], (x, y, i) => (cv.alpha(x, y) ? null : i % 3 === 2 ? P.clay : P.brown));
    }
  };
  return out;
};

D.tree_oak = () => {
  const m = new Model();
  const bark = [P.darkBrown, P.brown, P.clay, P.tan];
  m.add(roundCone([0, 0, 0], [0.3, 15, 0.2], 2.2, 1.3), (h) => (Math.sin(Math.atan2(h.p[2], h.p[0]) * 5 + h.p[1] * 0.3) > 0.6 ? s(bark, -0.9) : s(bark, -0.2)), 'trunk');
  for (const [x, z] of [[2.4, 0.6], [-1.8, 1.6], [0.5, -2.3]]) m.add(roundCone([0, 0.8, 0], [x, 0.1, z], 1.2, 0.5), s(bark, -0.2), 'trunk');
  m.add(roundCone([0.3, 12, 0.2], [4, 17, 1], 0.8, 0.5), s(bark, -0.2), 'branch');
  const blobs = [
    [0, 17, 0, 6.2], [5.0, 16, 2.5, 4.4], [-4.6, 16.5, 1.8, 4.4], [1.5, 16.2, -4.5, 4.4], [-2.0, 15.6, 4.6, 4.0], [3.2, 16, 4.8, 3.6],
    [0.8, 22.5, 0.6, 5.4], [-3.4, 21.5, -1.8, 3.8], [3.8, 21.5, -0.5, 3.8], [0, 26.0, 0.2, 3.6],
  ];
  blobs.forEach(([x, y, z, r], i) => m.add(sphere([x, y, z], r), (h) => {
    const n = hash2(Math.floor(h.p[0] * 1.2 + 30), Math.floor(h.p[1] * 1.2 + h.p[2] * 0.6 + 30), 11);
    if (n > 0.86) return s(LEAF, -0.9);
    if (n < 0.08 && h.lam > 0.1) return s(LEAF, 1.5);
    return LEAF;
  }, 'c' + i));
  return m;
};

D.tree_pine = () => {
  const m = new Model();
  m.add(roundCone([0, 0, 0], [0, 8, 0], 1.4, 1.0), s(RAMPS.wood, -0.3), 'trunk');
  const tiers = [[4.5, 13.5, 7.6], [10, 19, 6.2], [15, 24, 4.8], [20, 31, 3.4]];
  tiers.forEach(([y0, y1, r], i) => {
    const c = cone([0, 0, 0], y0, y1, r, 0.2);
    const f = custom((x, y, z) => c(x, y, z) + 0.35 * Math.max(0, Math.sin(Math.atan2(z, x) * 9 + i)) * Math.max(0, 1 - (y - y0) / 2.5), c.b);
    m.add(f, (h) => (h.p[1] < y0 + 0.9 ? s(PINE, 0.2) : speckle(PINE, 12 + i, 1.6, 0.85, -0.9)(h)), 't' + i);
  });
  return m;
};

D.mushroom = () => {
  const m = new Model();
  const stem = [P.clay, P.sand, P.sandLight, X.sandPale];
  const shroom = (x, z, hgt, r, ramp, spots, tag) => {
    m.add(roundCone([x, 0, z], [x, hgt, z], r * 0.38, r * 0.3), stem, tag + 's');
    const cap = intersect(ellipsoid([x, hgt, z], [r, r * 0.8, r]), halfSpace([x, hgt - 0.2, z], [0, 1, 0]));
    m.add(cap, (h) => {
      if (spots) {
        const a = Math.atan2(h.p[2] - z, h.p[0] - x), e = h.p[1] - hgt;
        const sp = Math.sin(a * 5) * Math.sin(e * 3.2 + 0.5) + (e > r * 0.62 ? 1 : 0);
        if (sp > 0.72) return RAMPS.white;
      }
      return ramp;
    }, tag);
  };
  shroom(0.3, -1.4, 5.4, 3.7, RAMPS.red, true, 'a');
  shroom(4.0, 2.4, 3.0, 2.3, RAMPS.red, true, 'b');
  shroom(-3.6, 2.4, 3.4, 2.4, [P.brown, P.clay, P.tan, P.sand], false, 'c');
  return m;
};

function column(top, broken) {
  const m = new Model();
  m.add(box([0, 1.0, 0], [4.6, 1.0, 4.6], 0.2), speckle(SANDSTONE, 21, 1.3, 0.88), 'plinth');
  m.add(lathe(0, 1.4, (y) => 3.8 - y * 0.35, [0, 2, 0]), s(SANDSTONE, 0.2), 'torus');
  const shaft = lathe(3.3, top, (y) => 3.0 - (y - 3.3) * 0.012);
  let sdf = shaft;
  if (broken) sdf = intersect(shaft, custom((x, y, z) => (y - (top - 1.6 + 1.7 * Math.sin(Math.atan2(z, x) * 3 + 0.8) + 0.8 * Math.sin(Math.atan2(z, x) * 7))) * 0.6, [0, top, 0, 1e6]));
  m.add(sdf, (h) => {
    const a = Math.atan2(h.p[2], h.p[0]);
    if (broken && h.n[1] > 0.55) return s(SANDSTONE, -0.3);
    const cr = hash2(Math.floor(h.p[1] * 0.9), Math.floor(a * 4), 23);
    if (cr > 0.93) return s(SANDSTONE, -1.1);
    return Math.cos(a * 8) > 0.55 ? s(SANDSTONE, -0.7) : SANDSTONE;
  }, 'shaft');
  return m;
}
D.pillar = () => {
  const m = column(26, false);
  m.add(lathe(0, 2.0, (y) => 3.0 + y * 0.6, [0, 25.6, 0]), s(SANDSTONE, 0.2), 'capital');
  m.add(box([0, 28.6, 0], [4.4, 1.0, 4.4], 0.2), speckle(SANDSTONE, 24, 1.3, 0.86), 'abacus');
  return m;
};
D.pillar_broken = () => {
  const m = column(11.5, true);
  // fallen drum lying beside the stump
  const drum = new Model();
  drum.add(lathe(-2.6, 2.6, () => 2.6), (h) => (Math.abs(h.p[1]) > 2.4 ? s(SANDSTONE, -0.4) : Math.cos(Math.atan2(h.p[2], h.p[0]) * 8) > 0.55 ? s(SANDSTONE, -0.7) : SANDSTONE), 'drum');
  m.merge(drum.transform(mmul(rotY(0.5), rotZ(Math.PI / 2)), [0, 0, 0], [5.0, 2.6, 5.2]));
  m.add(ellipsoid([-4.8, 0.8, 5.6], [1.6, 1.0, 1.3], rotY(0.7)), s(SANDSTONE, -0.2), 'chip');
  return m;
};

D.rubble = () => {
  const m = new Model();
  const blocks = [[-2.5, 1.6, -1.5, 2.6, 1.6, 2.0, 0.4], [2.8, 1.2, 1.0, 2.0, 1.2, 1.6, 1.1], [-0.5, 1.0, 3.8, 1.5, 1.0, 1.4, 0.2], [0.8, 3.6, -1.0, 1.6, 1.0, 1.3, 0.9]];
  blocks.forEach(([x, y, z, hx, hy, hz, a], i) => m.add(box([x, y, z], [hx, hy, hz], 0.35, mmul(rotY(a), rotZ(i === 3 ? 0.25 : 0))), speckle(SANDSTONE, 30 + i, 1.3, 0.86), 'r' + i));
  for (const [x, z, r] of [[4.8, -2.5, 0.9], [-5.0, 2.6, 0.8], [3.2, 4.4, 0.7], [-4.2, -4.0, 0.7]]) m.add(sphere([x, r * 0.6, z], r), s(SANDSTONE, -0.3), 'peb');
  return m;
};

D.rope_coil = () => {
  const m = new Model();
  const twist = (h) => (Math.sin(Math.atan2(h.p[2], h.p[0]) * 26 + h.p[1] * 4) > 0.45 ? s(ROPE, -0.9) : ROPE);
  const loops = [[0.75, 5.2], [0.75, 3.7], [0.75, 2.2], [2.1, 4.5], [2.1, 3.0]];
  loops.forEach(([y, R], i) => m.add(torus([0, y, 0], R, 0.72), twist, 'l' + i));
  m.add(sphere([0, 0.3, 0], 1.3), s(ROPE, -1.2), 'hole');
  m.add(capsule([4.2, 0.6, 3.0], [7.2, 0.55, 4.8], 0.6), twist, 'end');
  m.add(capsule([7.2, 0.55, 4.8], [8.2, 0.55, 2.4], 0.6), twist, 'end');
  return m;
};

D.anchor = () => {
  const m = new Model();
  const iron = rusty(40);
  m.add(capsule([0, 3.0, 0], [0, 20.5, 0], 0.95), iron, 'shank');
  m.add(torusXY([0, 22.8, 0], 1.7, 0.5), IRON_L, 'ring');
  m.add(capsule([-4.2, 18.5, 0], [4.2, 18.5, 0], 0.65), iron, 'stock');
  for (const sx of [-1, 1]) m.add(sphere([sx * 4.4, 18.5, 0], 0.9), iron, 'stock');
  // crown: lower half of a ring with flukes at the tips
  m.add(intersect(torusXY([0, 7.5, 0], 6.2, 0.9), halfSpace([0, 7.8, 0], [0, -1, 0])), iron, 'arms');
  for (const sx of [-1, 1]) m.add(roundCone([sx * 6.1, 7.2, 0], [sx * 7.3, 11.2, 0], 1.6, 0.25), iron, 'fluke');
  m.add(sphere([0, 1.6, 0], 1.3), iron, 'crown');
  // standing on its crown, leaning a little; chain piled at the foot
  const out = m.transform(mmul(DIAG, rotZ(0.12)), [0, 0, 0], [0, 0, 0]);
  out.add(torus([4.2, 0.5, 3.6], 1.8, 0.5), IRON_L, 'chain');
  out.add(torus([3.9, 1.3, 3.9], 1.2, 0.45), s(IRON_L, 0.3), 'chain2');
  return out;
};

D.bollard = () => {
  const m = new Model();
  m.add(lathe(0, 1.0, () => 3.4), s(RAMPS.iron, 0.2), 'foot');
  m.add(lathe(0, 8.4, (y) => 2.2 + (y > 6.4 ? 0.3 + (y - 6.4) * 0.45 : 0)), rusty(41), 'post');
  m.add(ellipsoid([0, 8.4, 0], [3.1, 0.9, 3.1]), IRON_L, 'cap');
  const twist = (h) => (Math.sin(Math.atan2(h.p[2], h.p[0]) * 18 + h.p[1] * 4) > 0.45 ? s(ROPE, -0.9) : s(ROPE, 0.3));
  m.add(torus([0, 3.2, 0], 2.9, 0.8), twist, 'rope');
  m.add(torus([0, 4.8, 0], 2.85, 0.8), twist, 'rope2');
  m.add(capsule([2.5, 4.0, 2.0], [5.8, 0.7, 4.4], 0.8), twist, 'rope3');
  m.add(capsule([5.8, 0.7, 4.4], [7.4, 0.7, 7.0], 0.8), twist, 'rope3');
  return m;
};

D.fern = () => {
  const m = new Model();
  const N = 10;
  for (let k = 0; k < N; k++) {
    const a = (k / N) * Math.PI * 2 + 0.2 + hash2(k, 1, 51) * 0.4;
    const inner = k % 2 === 0;
    const len = (inner ? 4.6 : 7.2) + hash2(k, 2, 51) * 1.6, rise = (inner ? 10.5 : 7.5) + hash2(k, 3, 51) * 2;
    for (let i = 1; i <= 8; i++) {
      const t = i / 8, r = t * len;
      const p = [Math.cos(a) * r, rise * Math.sin(t * Math.PI * 0.72) - t * t * 2.2 + 0.4, Math.sin(a) * r];
      const wdt = 1.55 * Math.sin(Math.PI * (0.12 + t * 0.8));
      m.add(ellipsoid(p, [0.45, 0.3, wdt], rotY(-a)), (h) => (i % 2 ? s(LEAF, 0.35) : s(LEAF, -0.15)), 'f' + k);
      if (i < 8) m.add(capsule(p, [Math.cos(a) * (r + len / 8), p[1], Math.sin(a) * (r + len / 8)], 0.25), s(LEAF, -0.4), 'f' + k);
    }
  }
  m.add(sphere([0, 0.8, 0], 1.4), s(LEAF, -0.6), 'core');
  return m;
};

D.lantern_elf = () => {
  const m = new Model();
  const silver = [P.grey3, P.grey2, P.grey1, P.white];
  for (const a of [0, 2.1, 4.2]) m.add(roundCone([0, 1.6, 0], [Math.cos(a) * 2.4, 0.2, Math.sin(a) * 2.4], 0.7, 0.35), silver, 'root');
  // slender stem curving over into a hook
  const pts = [[0, 0, 0], [0.3, 7, 0], [0.2, 14, 0], [-0.3, 20, 0], [0.4, 24.5, 0], [2.4, 27, 0], [4.4, 26.6, 0]];
  const stem = new Model();
  for (let i = 0; i < pts.length - 1; i++) stem.add(roundCone(pts[i], pts[i + 1], 0.75 - i * 0.07, 0.68 - i * 0.07), silver, 'stem');
  // little leaves on the stem
  for (const [y, sd] of [[16, 1], [21, -1]]) stem.add(ellipsoid([sd * 1.4, y, 0], [1.3, 0.4, 0.6], rotZ(sd * 0.6)), s(RAMPS.green, 0.3), 'leaf');
  // leaf-shaped lamp hanging from the hook, bright core
  const glow = [P.greenDark, P.cyan, mix(P.cyan, P.white, 0.55), P.white];
  stem.add(capsule([4.4, 26.6, 0], [4.4, 25.2, 0], 0.18), P.grey2, 'wire');
  stem.add(roundCone([4.4, 19.6, 0], [4.4, 24.4, 0], 0.4, 1.6), { ramp: glow, bias: 1.3 }, 'lamp');
  stem.add(roundCone([4.4, 22.8, 0], [4.4, 18.8, 0], 1.55, 0.2), { ramp: glow, bias: 0.9 }, 'lamp');
  stem.add(ellipsoid([4.4, 25.2, 0], [2.0, 0.55, 2.0]), s(RAMPS.green, 0.1), 'lampcap');
  m.merge(stem.transform(rotY(Math.PI / 4 + Math.PI)));
  return m;
};

D.net_rack = () => {
  const r = new Model();
  for (const x of [-7, 7]) {
    for (const sd of [-1, 1]) r.add(roundCone([x, 0, sd * 2.2], [x, 13.2, 0], 0.55, 0.5), WOOD_D, 'post');
  }
  r.add(capsule([-8, 13.4, 0], [8, 13.4, 0], 0.55), WOOD, 'bar');
  const k = 0.32, cs = Math.cos(Math.atan(k));
  const net = custom((x, y, z) => {
    const bottom = 3.2 + 1.6 * (1 - Math.cos((x / 6.6) * Math.PI)) * 0.5 + 0.6 * Math.sin(x * 1.3);
    const b2 = z < 0 ? Math.max(bottom, 8.6 + 0.8 * Math.sin(x * 0.9)) : bottom;
    return Math.max((Math.abs(Math.abs(z) - (13.3 - y) * k)) * cs - 0.2, b2 - y, y - 13.3, Math.abs(x) - 6.6);
  }, [0, 8.5, 0, 9]);
  r.add(net, (h) => {
    const u = ((h.p[0] + 20.4) / 1.9) % 1, v = ((h.p[1] + 20.3) / 1.7) % 1;
    if (h.p[1] < 12.7 && u > 0.3 && v > 0.34) return null;
    return [P.slate, P.grey3, mix(P.grey2, P.sand, 0.5), P.sandLight];
  }, 'net');
  for (const x of [-5.2, -2.6, 0, 2.6, 5.2]) for (const sd of [1]) {
    const y = 3.4 + 1.6 * (1 - Math.cos((x / 6.6) * Math.PI)) * 0.5 + 0.6 * Math.sin(x * 1.3);
    r.add(sphere([x, y, sd * ((13.3 - y) * k)], 0.6), RAMPS.orange, 'float');
  }
  return r.transform(rotY(Math.PI / 4 + 0.5));
};

// ---------------------------------------------------------------- interiors: shop / inn / elf magic shop props
// Wall-standing furniture (bookshelf, scroll_shelf) shows its front on world +x (the lit, screen-left face):
// it belongs against the back wall that runs toward the upper right (flipX for the other wall).
const HONEY_WOOD = [P.brown, P.clay, P.tan, P.sand];
const ELF_WOOD = [P.clay, P.sand, P.sandLight, X.sandPale];
const SILVER = [P.grey3, P.grey2, P.grey1, P.white];
const PAPER = [P.sand, P.sandLight, X.sandPale, P.white];
const GLOW_CYAN = [P.blue, P.cyan, mix(P.cyan, P.white, 0.55), P.white];
const GLOW_VIOLET = [P.purple, P.magenta, mix(P.magenta, P.white, 0.45), P.white];
const FLAME = [P.orange, P.gold, P.yellow, P.white];

/** Pixel glyph stamp: rows of chars, map char -> color (unmapped = skip). */
function stamp(cv, x0, y0, rows, colors) {
  rows.forEach((r, j) => [...r].forEach((ch, i) => { if (colors[ch] != null) cv.set(x0 + i, y0 + j, colors[ch]); }));
}
/** Soft dithered glow: tint opaque pixels toward `col` around (cx, cy). */
function halo(cv, cx, cy, r, col, strength = 0.6) {
  for (let y = Math.floor(cy - r); y <= cy + r; y++)
    for (let x = Math.floor(cx - r); x <= cx + r; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / r;
      if (d >= 1 || !cv.inside(x, y)) continue;
      if (cv.alpha(x, y) && dither(x, y, strength * (1 - d))) cv.set(x, y, mix(cv.get(x, y), col, 0.45));
    }
}
/** Screen-facing frame: `at(u, y, v)` puts u along the screen-horizontal axis, v toward the viewer. */
const AXU = [Math.SQRT1_2, 0, -Math.SQRT1_2], AXV = [Math.SQRT1_2, 0, Math.SQRT1_2];
const at = (u, y, v = 0) => [AXU[0] * u + AXV[0] * v, y, AXU[2] * u + AXV[2] * v];

D.counter = () => {
  const m = new Model();
  // panelled body on a plinth, thick top slab with an overhang
  m.add(box([0, 0.5, 0], [6.6, 0.5, 6.0], 0.1), s(HONEY_WOOD, -0.9), 'plinth');
  m.add(box([0, 5.2, 0], [6.2, 4.4, 5.6], 0.1), (h) => {
    const [x, y, z] = h.p;
    const k = Math.abs(h.n[0]) > 0.7 ? z : x; // along the face
    if (Math.abs(y - 5.2) > 3.6 || Math.abs(k) > 4.9) return s(HONEY_WOOD, -0.4); // panel frame
    if ((((k + 20) % 3.3) + 3.3) % 3.3 < 0.45) return s(HONEY_WOOD, -1.1); // panel grooves
    return HONEY_WOOD;
  }, 'body');
  m.add(box([0, 10.1, 0], [7.2, 0.55, 6.6], 0.15), s(HONEY_WOOD, 0.4), 'top');
  // cloth runner draped over the lit front edge
  m.add(box([2.2, 10.75, 0.6], [4.6, 0.12, 2.3]), s(RAMPS.green, 0.2), 'cloth');
  m.add(box([6.95, 8.9, 0.6], [0.12, 1.9, 2.3]), (h) => (h.p[1] < 7.4 ? RAMPS.gold : s(RAMPS.green, 0.2)), 'cloth');
  // open ledger + quill, brass bell
  m.add(box([2.6, 11.05, 0.6], [2.0, 0.22, 1.7], 0.1), s(RAMPS.red, -0.6), 'book');
  for (const sz of [-0.85, 0.85]) m.add(box([2.6, 11.4 - Math.abs(sz) * 0.1, 0.6 + sz], [1.8, 0.14, 0.8], 0.05), (h) => ((((h.p[0] + 20) % 0.9) < 0.3 && Math.abs(h.p[2] - 0.6 - sz) < 0.55) ? s(PAPER, -1.2) : PAPER), 'page' + sz);
  m.add(capsule([1.6, 11.6, 2.4], [4.4, 13.8, 3.2], 0.22), RAMPS.white, 'quill');
  m.add(intersect(sphere([-3.2, 11.2, -2.6], 1.35), halfSpace([-3.2, 11.0, -2.6], [0, 1, 0])), RAMPS.gold, 'bell');
  m.add(lathe(0, 0.3, () => 1.7, [-3.2, 10.65, -2.6]), s(RAMPS.wood, -0.3), 'bellbase');
  m.add(sphere([-3.2, 12.8, -2.6], 0.45), s(RAMPS.gold, 0.5), 'bell');
  return m;
};

D.inn_sign = () => {
  // signboard on two posts under a little tiled cap, facing the viewer; letters stamped in pixel space
  const m = new Model();
  const w = 7.9, h = 4.1, y = 13;
  for (const sd of [-1, 1]) m.add(box(at(sd * (w + 0.2), (y + h) / 2 + 0.6), [0.55, (y + h) / 2 + 0.6, 0.55], 0.1, DIAG), WOOD_D, 'post');
  m.add(box(at(0, y), [w + 0.5, h + 0.5, 0.45], 0.1, DIAG), s(RAMPS.wood, 0.3), 'rim');
  m.add(box(at(0, y, 0.2), [w - 0.4, h - 0.4, 0.45], 0.05, DIAG), [P.ink, P.darkBrown, P.darkBrown, P.darkBrown], 'board');
  m.add(box(at(0, y + h + 1.1, 0.1), [w + 1.6, 0.6, 1.3], 0.2, DIAG), s(RAMPS.red, -0.3), 'cap');
  const front = at(0, y, 0.7);
  m.post = (cv, cam) => {
    const [cx, cy] = cam.project(front);
    const x0 = Math.round(cx) - 7, y0 = Math.round(cy) - 3;
    const INN = [
      'III.N...N.N...N',
      '.I..NN..N.NN..N',
      '.I..N.N.N.N.N.N',
      '.I..N.N.N.N.N.N',
      '.I..N..NN.N..NN',
      'III.N...N.N...N',
    ];
    stamp(cv, x0, y0, INN, { I: X.sandPale, N: X.sandPale });
  };
  return m;
};

D.magic_sign = () => {
  const m = new Model();
  // slender silver post with root feet, curling over into an arm; the board hangs from two chains
  const base = at(-8.6, 0);
  for (const a of [0.4, 2.5, 4.6]) m.add(roundCone(at(-8.6, 1.4), [base[0] + Math.cos(a) * 2.2, 0.2, base[2] + Math.sin(a) * 2.2], 0.6, 0.3), SILVER, 'root');
  const pts = [[-8.6, 0], [-8.8, 8], [-8.5, 16], [-8.3, 22], [-7.2, 25], [-4.5, 25.8], [4.5, 25.8], [6.5, 25.2]];
  for (let i = 0; i < pts.length - 1; i++) m.add(roundCone(at(pts[i][0], pts[i][1]), at(pts[i + 1][0], pts[i + 1][1]), 0.62 - i * 0.03, 0.6 - i * 0.03), SILVER, 'stem');
  m.add(sphere(at(6.6, 25.2), 0.8), s(RAMPS.green, 0.2), 'leaf');
  for (const [u, yy, r] of [[-8.3, 19, 0.6], [-6.4, 26.6, -0.5], [-8.9, 12, 0.7]]) m.add(ellipsoid(at(u + Math.sign(r) * 1.2, yy), [1.4, 0.45, 0.7], mmul(DIAG, rotZ(r))), s(RAMPS.green, 0.35), 'leaf');
  m.line(at(-3.4, 25.4), at(-3.4, 22.4), P.grey2, { bias: 1 });
  m.line(at(3.4, 25.4), at(3.4, 22.4), P.grey2, { bias: 1 });
  // pointed-arch board with a silver rim
  const arch = (hw, hy, cy, t, v) => union(
    box(at(0, cy, v), [hw, hy, t], 0.6, DIAG),
    box(at(0, cy + hy - 0.3, v), [hw * 0.72, hw * 0.72, t], 0.4, mmul(DIAG, rotZ(Math.PI / 4))),
  );
  m.add(arch(6.4, 6.0, 15.4, 0.45, 0), SILVER, 'rim');
  m.add(arch(5.6, 5.3, 15.4, 0.45, 0.25), [X.purpleDark, P.navy, mix(P.navy, P.purple, 0.5), P.purple], 'board');
  for (const sd of [-1, 1]) m.add(ellipsoid(at(sd * 5.8, 20.6, 0.7), [1.3, 0.55, 0.5], mmul(DIAG, rotZ(sd * 0.7))), s(RAMPS.green, 0.35), 'sprig');
  const front = at(0, 15.2, 0.75);
  m.post = (cv, cam) => {
    const [cx, cy] = cam.project(front);
    const x0 = Math.round(cx) - 6, y0 = Math.round(cy) - 7;
    halo(cv, x0 + 6.5, y0 + 4, 8, P.cyan, 0.9);
    stamp(cv, x0, y0, [
      '......c......',
      '.....cwc.....',
      '..cccwwwccc..',
      '...cwwwwwc...',
      '....cwwwc....',
      '....cc.cc....',
      '...c.....c...',
    ], { c: P.cyan, w: P.white });
    stamp(cv, x0, y0 + 8, [
      '.rr.......rr.',
      'rsrpppppppsrr',
      'rsrpkpkpkpsrr',
      '.rr.......rr.',
    ], { r: P.clay, s: P.sand, p: X.sandPale, k: P.purple });
  };
  return m;
};

/** Wall shelf carcass: front on world +x, width along z, open compartments between `shelves` heights. */
function shelfCarcass(m, ramp, height, shelves, depth = 3.2) {
  const cx = -4.4; // pushed back toward the wall
  const body = box([cx, height / 2, 0], [depth, height / 2, 7.2], 0.15);
  const cells = [];
  for (let i = 0; i + 1 < shelves.length; i++) cells.push(box([cx + 0.9, (shelves[i] + shelves[i + 1]) / 2 + 0.3, 0], [depth, (shelves[i + 1] - shelves[i]) / 2 - 0.55, 6.3]));
  m.add(subtract(body, ...cells), (h) => (h.n[0] > 0.7 && h.p[0] < cx + depth - 0.3 ? s(ramp, -1.4) : ramp), 'carcass');
  return { front: cx + depth };
}

const BOOK_RAMPS = [s(RAMPS.red, -0.3), s(RAMPS.blue, -0.5), s(RAMPS.green, -0.2), s(RAMPS.gold, -0.4), s(RAMPS.violet, 0), s(RAMPS.leather, 0), s(RAMPS.teal, 0.4), s(RAMPS.cream, -0.3)];
D.bookshelf = () => {
  const m = new Model();
  const shelves = [0.6, 7.2, 13.6, 20.0, 25.6];
  const { front } = shelfCarcass(m, WOOD, 25.6, shelves);
  shelves.slice(0, -1).forEach((y0, row) => {
    const bw = 1.05, top = (z) => {
      const i = Math.floor((z + 6.3) / bw);
      if (hash2(i, row, 61) < 0.08) return y0 + 0.9; // a gap
      return y0 + 0.7 + (shelves[row + 1] - y0 - 1.9) * (0.62 + hash2(i, row, 62) * 0.38);
    };
    const books = custom((x, y, z) => Math.max(Math.abs(x - (front - 2.2)) - 1.7, Math.abs(z) - 6.2, y0 + 0.6 - y, y - top(z)), [front - 2.2, (y0 + shelves[row + 1]) / 2, 0, 8]);
    m.add(books, (h) => {
      const i = Math.floor((h.p[2] + 6.3) / bw), fz = (((h.p[2] + 6.3) / bw) % 1 + 1) % 1;
      const r = BOOK_RAMPS[Math.floor(hash2(i, row, 63) * BOOK_RAMPS.length)];
      if (fz < 0.14) return s(r, -1.5);
      const t = (h.p[1] - y0) / (shelves[row + 1] - y0);
      if (Math.abs(t - 0.62) < 0.05 && h.n[0] > 0.7) return RAMPS.gold; // spine band
      return r;
    }, 'books' + row);
  });
  m.add(lathe(0, 2.2, (y) => 1.2 + Math.sin(y * 1.4) * 0.5, [-3.6, 25.6, -3.8]), CLAY, 'pot');
  return m;
};

D.table = () => {
  const m = new Model();
  m.add(lathe(0, 0.9, () => 6.0, [0, 8.4, 0]), (h) => (h.p[1] > 9.2 ? (Math.hypot(h.p[0], h.p[2]) > 5.4 ? s(HONEY_WOOD, 0.1) : HONEY_WOOD) : s(HONEY_WOOD, -0.6)), 'top');
  m.add(lathe(0, 8.4, (y) => 0.9 + (y < 1.2 ? (1.2 - y) * 1.2 : 0) + (y > 7.4 ? (y - 7.4) * 0.9 : 0)), s(WOOD, -0.2), 'leg');
  for (const a of [0.3, 2.4, 4.5]) m.add(roundCone([0, 0.6, 0], [Math.cos(a) * 3.6, 0.35, Math.sin(a) * 3.6], 0.6, 0.4), s(WOOD, -0.2), 'foot');
  // candle on a brass dish
  m.add(lathe(0, 0.35, () => 1.5, [-1.6, 9.3, -1.8]), RAMPS.gold, 'dish');
  m.add(lathe(0, 3.4, () => 0.62, [-1.6, 9.6, -1.8]), PAPER, 'candle');
  m.add(roundCone([-1.6, 13.2, -1.8], [-1.6, 14.9, -1.8], 0.55, 0.12), { ramp: FLAME, bias: 1 }, 'flame');
  // mug with a handle, and an apple on a plate
  m.add(lathe(0, 2.6, () => 1.3, [2.2, 9.3, 1.2]), (h) => (h.p[1] > 11.7 ? [P.clay, P.sandLight, X.sandPale, P.white] : Math.abs(h.p[1] - 10.2) < 0.25 ? s(RAMPS.iron, 0.3) : s(RAMPS.wood, 0.2)), 'mug');
  m.add(torusXY([3.6, 10.6, 1.2], 0.8, 0.3), s(RAMPS.wood, 0.2), 'handle');
  m.add(lathe(0, 0.3, () => 1.8, [-1.4, 9.3, 2.6]), RAMPS.white, 'plate');
  m.add(sphere([-1.4, 9.9, 2.6], 0.8), s(RAMPS.red, 0.3), 'apple');
  m.post = (cv, cam) => { const [x, y] = cam.project([-1.6, 14.2, -1.8]); halo(cv, x, y, 7, P.yellow, 0.7); };
  return m;
};

// stairs run along world x (grid y): the entry is on the lit +x side (screen lower-left),
// stairs_up climbs toward -x (grid -y, the upper-right back wall), stairs_down descends the same way.
D.stairs_up = () => {
  const m = new Model();
  const N = 6, rise = 2.9, run = 14.4 / N, x0 = 7.2;
  const steps = [];
  for (let k = 1; k <= N; k++) { const e = x0 - (k - 1) * run; steps.push(box([(e - 7.2) / 2, (k * rise) / 2, 0], [(e + 7.2) / 2, (k * rise) / 2, 6.6])); }
  m.add(union(...steps), (h) => {
    const dim = -Math.min(1, h.p[1] / (N * rise)) * 1.2; // steps fade into the dark stairwell above
    if (h.n[1] > 0.7) return (((h.p[0] - x0 + 40 * run) % run) + run) % run > run - 0.5 ? s(HONEY_WOOD, 0.9 + dim) : s(HONEY_WOOD, 0.4 + dim); // treads, lit nosing
    if (h.n[0] > 0.7) return s(HONEY_WOOD, -0.5 + dim); // risers
    return woodPlanks('y', rise, s(WOOD, -0.2 + dim))(h); // stringer side
  }, 'stairs');
  // hand rail along the open (+z) side, climbing with the steps
  let prev = null;
  for (let k = 1; k <= N; k += 2) {
    const px = x0 - (k - 0.5) * run, b = k * rise;
    m.add(capsule([px, b - 0.2, 6.2], [px, b + 6.4, 6.2], 0.42), WOOD_D, 'rail');
    const top = [px, b + 6.4, 6.2];
    if (prev) m.add(capsule(prev, top, 0.5), s(WOOD, 0.3), 'handrail');
    prev = top;
  }
  m.add(capsule(prev, [prev[0] - run * 1.2, prev[1] + rise * 1.2, 6.2], 0.5), s(WOOD, 0.3), 'handrail');
  return m;
};

D.stairs_down = () => {
  const m = new Model();
  const R = 5.2, RIM = 6.8, DEPTH = 14;
  // everything below the floor is clipped to what can be seen through the opening
  const dir = isoCamera().toWorld([0, 0, -1]);
  const visible = (p) => {
    if (p[1] > -0.05) return true;
    const t = p[1] / dir[1]; // walk back up the view ray to y = 0
    return Math.abs(p[0] - dir[0] * t) < R + 0.05 && Math.abs(p[2] - dir[2] * t) < R + 0.05;
  };
  const clip = (mat) => (h) => (visible(h.p) ? mat(h) : null);
  const deep = (y, ramp) => s(ramp, Math.max(-3.4, -0.3 + y * 0.5));
  const shaft = subtract(box([0, (0.5 - DEPTH) / 2, 0], [RIM, (0.5 + DEPTH) / 2, RIM], 0.1), box([0, 0, 0], [R, 20, R]));
  m.add(shaft, clip((h) => (h.p[1] > -0.1 ? s(HONEY_WOOD, 0.3) : deep(h.p[1] - 1.5, (((h.p[1] + 40) % 3) < 0.45) ? s(STONE, -1) : STONE))), 'shaft');
  // steps leading down from the back edge toward the viewer (the front rim hides the deep end)
  const N = 6, drop = 1.5, run = 2 * R / N;
  const steps = [];
  for (let k = 0; k < N; k++) { const e = -R + (k + 1) * run, top = -0.8 - k * drop; steps.push(box([(e - R) / 2, (top - DEPTH) / 2, 0], [(e + R) / 2, (DEPTH + top) / 2, R])); }
  m.add(union(...steps), clip((h) => {
    if (h.n[1] < 0.7) return deep(h.p[1], s(WOOD, -0.6)); // risers
    const f = (((R - h.p[0]) % run) + run) % run; // position on the tread (0 = nosing)
    return deep(h.p[1], s(HONEY_WOOD, f < 0.6 ? 1.2 : f > run - 0.5 ? -0.6 : 0.4));
  }), 'steps');
  // railing along the upper-left side of the stairwell (the back edge stays open as the way in)
  const c0 = -RIM + 0.5, c1 = RIM - 0.5;
  for (const [a, b] of [[[c1, 0, c0], [c0, 0, c0]]]) {
    for (let i = 0; i <= 2; i++) {
      const t = i / 2, p = [a[0] + (b[0] - a[0]) * t, 0, a[2] + (b[2] - a[2]) * t];
      m.add(capsule([p[0], 0.3, p[2]], [p[0], 6.8, p[2]], 0.42), WOOD_D, 'railpost');
    }
    m.add(capsule([a[0], 6.8, a[2]], [b[0], 6.8, b[2]], 0.5), s(WOOD, 0.3), 'rail');
  }
  return m;
};

D.scroll_shelf = () => {
  const m = new Model();
  const shelves = [0.6, 7.6, 14.2, 20.4];
  const { front } = shelfCarcass(m, ELF_WOOD, 20.4, shelves);
  const fx = front - 2.0;
  // bottom: a pyramid of rolled scrolls, ends toward the viewer
  for (const [z, y] of [[-4.6, 1.9], [-2.3, 1.9], [0, 1.9], [2.3, 1.9], [4.6, 1.9], [-3.45, 4.0], [-1.15, 4.0], [1.15, 4.0], [3.45, 4.0], [-2.3, 6.0], [2.3, 6.0]]) {
    m.add(capsule([fx - 1.6, y, z], [fx + 1.4, y, z], 1.05), (h) => (h.p[0] > fx + 1.9 ? s(PAPER, -0.4) : Math.abs(h.p[0] - fx) < 0.3 ? RAMPS.red : PAPER), 'scroll');
  }
  // middle: potion bottles
  for (const [z, ramp, r] of [[-4.8, s(RAMPS.red, 0.3), 1.35], [-2.2, GLOW_CYAN, 1.1], [0.4, s(RAMPS.green, 0.4), 1.4], [2.9, GLOW_VIOLET, 1.05], [5.0, s(RAMPS.gold, 0), 0.9]]) {
    m.add(sphere([fx, 8.0 + r, z], r), ramp, 'bottle');
    m.add(capsule([fx, 8.0 + r * 1.6, z], [fx, 8.0 + r * 2 + 1.1, z], 0.38), s(SILVER, -0.3), 'neck');
    m.add(sphere([fx, 8.0 + r * 2 + 1.3, z], 0.45), s(RAMPS.wood, 0.3), 'cork');
  }
  // top compartment: standing scrolls, a tome, a silver orb
  for (const [z, tilt] of [[-4.2, 0.18], [-3.0, -0.12], [-1.8, 0.1]]) m.add(capsule([fx, 14.9, z], [fx, 19.0, z + tilt * 4], 0.6), (h) => (Math.abs(h.p[1] - 17) < 0.3 ? RAMPS.blue : PAPER), 'upscroll');
  m.add(box([fx + 0.3, 16.0, 2.2], [1.4, 1.7, 0.5], 0.1, rotX(0.25)), s(RAMPS.violet, 0.3), 'tome');
  m.add(sphere([fx, 15.3, 4.8], 0.9), s(SILVER, 0.2), 'orb');
  // glowing crystal cluster and leaves on top
  const top = 20.4;
  for (const [x, z, hh, lean, r] of [[-4.6, 0.2, 6.2, 0, 1.2], [-3.7, -1.6, 3.8, -0.4, 0.8], [-3.8, 1.9, 4.4, 0.45, 0.85], [-5.4, 1.2, 3.0, 0.2, 0.7]]) {
    m.add(roundCone([x, top, z], [x + lean * 0.4, top + hh, z + lean * hh * 0.5], r, 0.12), { ramp: GLOW_CYAN, bias: 0.4 }, 'crystal');
  }
  m.add(roundCone([-4.2, top, -4.2], [-4.2, top + 2.8, -4.4], 0.7, 0.1), { ramp: GLOW_VIOLET, bias: 0.5 }, 'crystal2');
  for (const [z, a] of [[-6.2, 0.5], [6.2, -0.5], [4.4, 0.2]]) m.add(ellipsoid([-4.4, top + 0.6, z], [0.9, 0.5, 1.8], rotX(a)), s(RAMPS.green, 0.3), 'leaf');
  m.post = (cv, cam) => {
    const [x, y] = cam.project([-4.6, top + 3.2, 0.2]); halo(cv, x, y, 9, P.cyan, 0.8);
    const [bx, by] = cam.project([fx, 9.2, -2.2]); halo(cv, bx, by, 4, P.cyan, 0.6);
  };
  return m;
};

// ---------------------------------------------------------------- temple / pond / jungle props
const BRONZE = [P.darkBrown, P.brown, mix(P.clay, P.greenDark, 0.25), P.tan];
const GOLDEN = [P.brown, P.tan, P.gold, P.yellow];
const LOTUS = [P.purple, P.magenta, P.pink, X.skinPale];
const BAMBOO = [P.greenDeep, P.greenDark, P.green, mix(P.green, P.yellow, 0.45)];
const JUNGLE = [P.ink, P.teal, P.greenDeep, P.greenDark];
const SOIL = [P.ink, P.darkBrown, P.brown, P.clay];
const withA2 = (c, a) => ((c & 0xffffff00) | a) >>> 0;
/** Leafy material with speckled dark/light pixels. */
const foliage = (ramp, seed, k = 1.2) => (h) => {
  const n = hash2(Math.floor(h.p[0] * k + 30), Math.floor(h.p[1] * k + h.p[2] * 0.6 + 30), seed);
  if (n > 0.86) return s(ramp, -0.9);
  if (n < 0.08 && h.lam > 0.1) return s(ramp, 1.5);
  return ramp;
};

D.pillow = () => {
  const m = new Model();
  // round zafu: plump pleated drum, gold piping and a button, tassels hanging at the sides
  const e = ellipsoid([0, 2.6, 0], [5.6, 2.8, 5.6]);
  const body = custom((x, y, z) => e(x, y, z) + 0.12 * Math.cos(Math.atan2(z, x) * 12) * Math.max(0, 1 - Math.abs(y - 2.2) / 2.4), e.b);
  m.add(intersect(body, halfSpace([0, 0.2, 0], [0, 1, 0])), (h) => {
    const r = Math.hypot(h.p[0], h.p[2]), a = Math.atan2(h.p[2], h.p[0]);
    if (h.n[1] > 0.55) {
      if (Math.abs(r - 3.2) < 0.35) return s(RAMPS.gold, 0.4); // embroidered ring
      if (r < 3.2 && Math.cos(a * 8) > 0.8) return s(RAMPS.saffron, -0.9); // gathered folds to the button
      return RAMPS.saffron;
    }
    if (h.n[1] > 0.35) return s(RAMPS.gold, 0.2); // piping
    if (Math.cos(a * 12) < -0.7) return s(RAMPS.red, -1.0); // pleats
    return s(RAMPS.red, 0.3);
  }, 'cushion');
  m.add(sphere([0, 5.1, 0], 0.7), RAMPS.gold, 'button');
  for (const a of [-0.35, 1.92, 3.49, 5.06]) {
    const x = Math.cos(a) * 5.0, z = Math.sin(a) * 5.0;
    m.add(sphere([x, 4.3, z], 0.7), s(RAMPS.gold, 0.5), 'tassel' + a);
    m.add(roundCone([x * 1.16, 3.7, z * 1.16], [x * 1.24, 2.0, z * 1.24], 0.3, 0.75), RAMPS.gold, 'tassel' + a);
  }
  return m;
};

D.incense_burner = () => {
  const m = new Model();
  // bronze ding: round bowl with a flared lip on three curved legs, two loop handles, pierced lid
  for (const a of [0.5, 2.6, 4.7]) {
    const c = Math.cos(a), sn = Math.sin(a);
    m.add(roundCone([c * 2.4, 5.0, sn * 2.4], [c * 3.6, 2.2, sn * 3.6], 0.65, 0.5), BRONZE, 'leg');
    m.add(roundCone([c * 3.6, 2.2, sn * 3.6], [c * 3.3, 0, sn * 3.3], 0.5, 0.75), BRONZE, 'leg');
  }
  m.add(lathe(0, 4.6, (y) => 1.8 + 2.4 * Math.sin((Math.PI * (y + 0.6)) / 6.4), [0, 3.8, 0]), (h) => (Math.abs(h.p[1] - 6.4) < 0.3 ? s(BRONZE, 1) : Math.abs(h.p[1] - 5.2) < 0.4 && Math.sin(Math.atan2(h.p[2], h.p[0]) * 8) > 0 ? s(BRONZE, -1) : BRONZE), 'bowl');
  m.add(lathe(0, 0.6, () => 3.9, [0, 8.3, 0]), s(BRONZE, 0.6), 'lip');
  for (const sd of [-1, 1]) m.add(torusXY(at(sd * 4.2, 9.2), 1.1, 0.35), s(BRONZE, 0.4), 'handle');
  m.add(intersect(sphere([0, 8.6, 0], 3.2), halfSpace([0, 8.8, 0], [0, 1, 0])), (h) => (Math.abs(h.p[1] - 10.2) < 0.3 ? s(BRONZE, -1) : s(BRONZE, 0.2)), 'lid');
  m.add(sphere([0, 12.1, 0], 0.8), s(BRONZE, 0.8), 'knob');
  // thin wisp of smoke curling up from the lid
  m.post = (cv, cam) => {
    const [x0, y0] = cam.project([0, 12.8, 0]);
    for (let i = 0; i < 20; i++) {
      const y = Math.round(y0) - 1 - i;
      const x = Math.round(x0 + Math.sin(i * 0.42) * (1 + i * 0.12));
      const a = Math.round(210 - i * 8);
      cv.blend(x, y, withA2(i < 8 ? P.grey1 : P.white, a));
      if (i > 9 && i % 3 === 0) cv.blend(x + 1, y, withA2(P.grey1, a - 40));
    }
  };
  return m;
};

D.buddha_statue = () => {
  // built facing +z, turned toward the viewer at the end
  const m = new Model();
  const gold = (h) => (hash2(Math.floor(h.p[0] * 1.5 + 40), Math.floor(h.p[1] * 1.5 + h.p[2] + 40), 71) > 0.97 ? s(GOLDEN, -0.8) : GOLDEN);
  // stone drum + lotus throne
  m.add(lathe(0, 3.0, (y) => 6.6 - (y > 2.4 ? (y - 2.4) * 1.2 : 0)), speckle(STONE, 72, 1.3, 0.86), 'base');
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    m.add(ellipsoid([Math.cos(a) * 5.0, 4.6, Math.sin(a) * 5.0], [1.0, 2.3, 1.6], mmul(rotY(-a), rotZ(-0.45))), (h) => (h.p[1] > 5.9 ? s(LOTUS, 0.6) : LOTUS), 'petal');
  }
  for (let i = 0; i < 12; i++) {
    const a = ((i + 0.5) / 12) * Math.PI * 2;
    m.add(ellipsoid([Math.cos(a) * 3.8, 5.6, Math.sin(a) * 3.8], [0.9, 2.0, 1.4], mmul(rotY(-a), rotZ(-0.3))), s(LOTUS, 0.4), 'petal2');
  }
  m.add(lathe(0, 1.0, () => 4.6, [0, 5.4, 0]), s(GOLDEN, -0.6), 'seat');
  // crossed legs, torso, robe
  m.add(ellipsoid([0, 7.9, 0.6], [5.8, 1.8, 3.6]), gold, 'legs');
  for (const sd of [-1, 1]) m.add(ellipsoid([sd * 2.4, 8.6, 3.0], [1.4, 0.7, 1.0]), s(GOLDEN, 0.3), 'foot');
  m.add(roundCone([0, 8.8, 0], [0, 15.8, 0.2], 3.6, 3.2), (h) => (h.p[0] - h.p[1] * 0.5 + 7 > 0 && h.p[0] - h.p[1] * 0.5 + 7 < 0.7 && h.p[2] > 0 ? s(GOLDEN, -0.9) : gold(h)), 'torso');
  for (const sd of [-1, 1]) {
    m.add(sphere([sd * 3.4, 15.4, 0], 1.6), gold, 'shoulder');
    m.add(roundCone([sd * 3.9, 15.0, 0.3], [sd * 3.7, 10.6, 2.2], 1.1, 0.95), gold, 'arm');
    m.add(roundCone([sd * 3.7, 10.6, 2.2], [sd * 0.9, 9.9, 3.2], 0.95, 0.85), gold, 'arm');
  }
  m.add(ellipsoid([0, 10.1, 3.3], [1.8, 0.7, 1.1]), s(GOLDEN, 0.4), 'hands');
  // head: face, long ears, ushnisha
  m.add(lathe(0, 1.4, () => 1.3, [0, 16.2, 0]), gold, 'neck');
  m.add(ellipsoid([0, 19.6, 0.2], [2.7, 3.0, 2.7]), gold, 'head');
  for (const sd of [-1, 1]) m.add(ellipsoid([sd * 2.7, 19.0, 0], [0.55, 1.8, 0.8]), gold, 'ear');
  m.add(intersect(sphere([0, 21.2, -0.2], 2.75), halfSpace([0, 21.4, -0.2], [0, 1, 0])), (h) => ((Math.floor(h.p[0] * 1.6 + 20) + Math.floor(h.p[1] * 1.6)) % 2 ? s(GOLDEN, -1) : s(GOLDEN, -0.3)), 'hair');
  m.add(sphere([0, 23.2, -0.3], 1.4), s(GOLDEN, -0.3), 'ushnisha');
  m.add(sphere([0, 24.5, -0.3], 0.6), s(GOLDEN, 0.8), 'jewel');
  const face = new Model();
  face.merge(m);
  for (const sd of [-1, 1]) face.dot([sd * 1.1, 19.9, 2.7], P.brown, 1, 1, { tol: 3 });
  face.dot([0, 18.3, 2.85], P.brown, 1, 1, { tol: 3 });
  const out = face.transform(DIAG);
  return out;
};

D.stone_lantern = () => {
  const m = new Model();
  const st = speckle(STONE, 73, 1.4, 0.84);
  const moss = (h) => (h.n[1] > 0.5 && hash2(Math.floor(h.p[0] * 1.3 + 20), Math.floor(h.p[2] * 1.3 + 20), 74) > 0.55 ? s(RAMPS.green, -0.2) : st(h));
  // hexagonal foot, pillar, platform, fire box with open windows, curled roof, jewel finial
  const hex = (r, y0, y1, c = [0, 0, 0]) => custom((x, y, z) => {
    const ax = Math.abs(x - c[0]), az = Math.abs(z - c[2]);
    return Math.max(Math.max(az, ax * 0.866 + az * 0.5) - r, y0 - y, y - y1);
  }, [c[0], (y0 + y1) / 2, c[2], Math.hypot(r * 1.2, (y1 - y0) / 2)]);
  m.add(hex(4.4, 0, 1.6), moss, 'foot');
  m.add(lathe(0, 1.0, (y) => 3.2 - y * 0.8, [0, 1.6, 0]), st, 'foot2');
  m.add(lathe(0, 7.5, (y) => 1.6 - y * 0.03, [0, 2.4, 0]), (h) => (Math.abs(h.p[1] - 6) < 0.3 ? s(STONE, -1) : st(h)), 'pillar');
  m.add(hex(3.6, 9.6, 11.2), moss, 'platform');
  const boxS = hex(2.6, 11.2, 15.8);
  m.add(boxS, (h) => {
    const a = Math.atan2(h.p[2], h.p[0]);
    const facet = Math.round(a / (Math.PI / 3));
    const center = facet * (Math.PI / 3);
    const off = Math.abs(a - center);
    if (h.n[1] < 0.5 && off < 0.3 && Math.abs(h.p[1] - 13.5) < 1.4) return { ramp: FLAME, bias: 1.2 };
    return st(h);
  }, 'firebox');
  // roof: wide hex slab curving up at the corners
  m.add(custom((x, y, z) => {
    const ax = Math.abs(x), az = Math.abs(z);
    const hd = Math.max(az, ax * 0.866 + az * 0.5);
    const top = 18.8 - hd * 0.62, bot = 16.0 + Math.max(0, hd - 3.8) * 0.9;
    return Math.max(hd - 5.6, bot - y, y - top) * 0.7;
  }, [0, 17.5, 0, 7]), moss, 'roof');
  m.add(sphere([0, 19.4, 0], 1.3), st, 'finial');
  m.add(roundCone([0, 20.2, 0], [0, 22.0, 0], 0.9, 0.15), st, 'finial');
  m.post = (cv, cam) => { const [x, y] = cam.project([0, 13.5, 0]); halo(cv, x, y, 6, P.yellow, 0.6); };
  return m;
};

D.prayer_flags = () => {
  const m = new Model();
  const pole = at(-7, 0), top = at(-7, 27);
  m.add(lathe(0, 1.2, (y) => 1.5 - y * 0.6, pole), speckle(STONE, 75), 'stone');
  m.add(capsule(pole, top, 0.55), WOOD, 'pole');
  m.add(sphere(top, 0.9), RAMPS.gold, 'finial');
  // rope sags from the pole top to a peg at the far side; flags hang from it, facing the viewer
  const peg = at(7.5, 0.6, 0);
  m.add(roundCone(at(7.5, 0), at(7.5, 2.4), 0.6, 0.4), WOOD_D, 'peg');
  const rope = (t) => {
    const u = -7 + t * 14.5, y = 26.3 + (2.4 - 26.3) * t - Math.sin(t * Math.PI) * 4.5;
    return [u, y];
  };
  const cols = [RAMPS.blue, RAMPS.white, RAMPS.red, RAMPS.green, RAMPS.gold];
  const N = 8;
  for (let i = 0; i < N; i++) {
    const t = (i + 0.7) / (N + 0.6);
    const [u, y] = rope(t);
    m.add(box(at(u, y - 1.8, 0.2 * (i % 2)), [1.3, 1.6, 0.12], 0.05, mmul(DIAG, rotZ(-0.2 + 0.1 * (i % 3)))), s(cols[i % 5], 0.3), 'flag' + i);
  }
  for (let i = 0; i < 16; i++) {
    const [ua, ya] = rope(i / 16), [ub, yb] = rope((i + 1) / 16);
    m.line(at(ua, ya), at(ub, yb), P.sandLight, { bias: 1 });
  }
  void peg;
  return m;
};

D.bamboo = () => {
  const m = new Model();
  const stalks = [[0, 0, 30, 0.12, 0.2], [-3.2, 1.5, 26, -0.18, 0.1], [3.0, 2.2, 23, 0.2, -0.1], [1.4, -3.0, 28, 0.05, -0.15], [-2.0, -2.2, 19, -0.1, -0.2], [3.4, -1.0, 16, 0.25, 0.05], [-0.8, 3.4, 13, -0.05, 0.2]];
  stalks.forEach(([x, z, hgt, lx, lz], k) => {
    const top = [x + lx * hgt * 0.4, hgt, z + lz * hgt * 0.4];
    m.add(capsule([x, 0, z], top, 0.95 - (k > 3 ? 0.2 : 0)), (h) => {
      const t = h.p[1] / hgt;
      const seg = ((h.p[1] + k * 1.3) / 3.4) % 1;
      if (seg < 0.12) return s(BAMBOO, 0.9); // node ring
      if (seg < 0.2) return s(BAMBOO, -0.9);
      return s(BAMBOO, t > 0.6 ? 0.2 : -0.1);
    }, 's' + k);
    // leaf sprays near the top: drooping narrow leaves
    for (let j = 0; j < 4; j++) {
      const a = k * 1.7 + j * 1.6, y = hgt * (0.62 + j * 0.1);
      const px = x + lx * y * 0.4, pz = z + lz * y * 0.4;
      for (let i = 1; i <= 3; i++) {
        const r = i * 1.5, p = [px + Math.cos(a) * r, y - i * i * 0.35, pz + Math.sin(a) * r];
        m.add(ellipsoid(p, [1.1, 0.25, 0.55], rotY(-a)), (h) => (i === 3 ? s(BAMBOO, 0.5) : BAMBOO), 's' + k + 'l' + j);
      }
    }
  });
  return m;
};

D.reeds = () => {
  const m = new Model();
  const REED = [P.teal, P.greenDeep, P.greenDark, mix(P.greenDark, P.sand, 0.4)];
  const CAT = [P.ink, P.darkBrown, P.brown, P.clay];
  const spots = [[0, 0, 12, 1], [-2.4, 1.6, 10, 1], [2.6, 1.0, 11, 0], [1.2, -2.6, 13, 1], [-1.6, -1.8, 8.5, 0], [3.8, -1.6, 9, 0], [-3.8, -0.4, 7.5, 0], [0.6, 3.4, 7, 0], [4.6, 3.2, 6, 0]];
  spots.forEach(([x, z, hgt, cat], k) => {
    const lx = (hash2(k, 1, 76) - 0.5) * 2.5, lz = (hash2(k, 2, 76) - 0.5) * 2.5;
    const top = [x + lx, hgt, z + lz];
    m.add(capsule([x, 0, z], top, 0.32), s(REED, k % 2 ? 0.3 : 0), 'r' + k);
    if (cat) m.add(capsule([x + lx * 0.72, hgt * 0.72, z + lz * 0.72], [x + lx * 0.88, hgt * 0.88, z + lz * 0.88], 0.75), CAT, 'cat' + k);
  });
  // a few arching blades
  for (const [a, len, rise] of [[0.4, 6, 6], [2.3, 5.5, 5], [4.0, 6.5, 7], [5.4, 5, 4.5]]) {
    let prev = [0, 0, 0];
    for (let i = 1; i <= 5; i++) {
      const t = i / 5, p = [Math.cos(a) * len * t, rise * Math.sin(t * Math.PI * 0.75), Math.sin(a) * len * t];
      m.add(roundCone(prev, p, 0.45 * (1 - t * 0.6), 0.45 * (1 - t * 0.8)), s(REED, 0.4), 'blade' + a);
      prev = p;
    }
  }
  return m;
};

D.lily_pad = () => {
  const m = new Model();
  const PAD = [P.teal, P.greenDeep, P.greenDark, P.green];
  const pad = (x, z, r, a, tag) => {
    const disc = custom((px, py, pz) => {
      const dx = px - x, dz = pz - z;
      let ang = Math.atan2(dz, dx) - a; ang = Math.atan2(Math.sin(ang), Math.cos(ang));
      const notch = Math.abs(ang) < 0.28 ? (0.28 - Math.abs(ang)) * 12 : 0;
      return Math.max(Math.hypot(dx, dz) - r + Math.min(notch, r * 0.95) * 0 - 0, Math.abs(py - 0.3) - 0.3, Math.abs(ang) < 0.28 ? Math.hypot(dx, dz) - r * 0.12 : -1e3);
    }, [x, 0.3, z, r + 0.5]);
    m.add(disc, (h) => {
      const dx = h.p[0] - x, dz = h.p[2] - z;
      const ang = Math.atan2(dz, dx) - a;
      if (Math.hypot(dx, dz) > r - 0.6) return s(PAD, -0.4);
      if (Math.abs(Math.sin((ang) * 4)) < 0.12) return s(PAD, -0.6); // veins
      return s(PAD, 0.3);
    }, tag);
  };
  pad(-3.2, 2.6, 3.4, 0.6, 'p0');
  pad(3.4, -2.4, 3.0, 2.4, 'p1');
  pad(3.6, 3.8, 2.2, 4.0, 'p2');
  pad(-3.8, -3.6, 2.0, 5.5, 'p3');
  // lotus flower on the biggest pad
  const fx = 0.6, fz = 0.4;
  pad(fx, fz, 3.2, 1.2, 'p4');
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    m.add(ellipsoid([fx + Math.cos(a) * 1.5, 1.4, fz + Math.sin(a) * 1.5], [0.7, 1.5, 1.0], mmul(rotY(-a), rotZ(-0.6))), (h) => (h.p[1] > 2.2 ? s(LOTUS, 0.8) : s(LOTUS, 0.2)), 'petal');
  }
  for (let i = 0; i < 5; i++) {
    const a = ((i + 0.5) / 5) * Math.PI * 2;
    m.add(ellipsoid([fx + Math.cos(a) * 0.7, 2.2, fz + Math.sin(a) * 0.7], [0.55, 1.3, 0.8], mmul(rotY(-a), rotZ(-0.3))), s(LOTUS, 1), 'petal2');
  }
  m.add(sphere([fx, 2.4, fz], 0.6), s(RAMPS.gold, 0.6), 'core');
  return m;
};

D.jungle_tree = () => {
  const m = new Model();
  const bark = [P.darkBrown, P.brown, mix(P.clay, P.grey2, 0.35), P.grey1];
  const barkM = (h) => (Math.sin(Math.atan2(h.p[2], h.p[0]) * 7 + h.p[1] * 0.2) > 0.55 ? s(bark, -0.9) : s(bark, -0.2));
  m.add(roundCone([0, 0, 0], [0.2, 20, 0.1], 2.2, 1.4), barkM, 'trunk');
  // buttress roots: thin tapering fins
  for (const a of [0.2, 1.4, 2.6, 3.6, 4.9]) {
    const c = Math.cos(a), sn = Math.sin(a);
    const fin = custom((x, y, z) => {
      const r = x * c + z * sn, l = -x * sn + z * c;
      const hgt = 7.5 * Math.max(0, 1 - (r - 1.5) / 5.2) ** 1.4;
      return Math.max(Math.abs(l) - 0.45 - Math.max(0, 1.2 - y) * 0.3, -y, y - hgt, r - 7, 1 - r) * 0.8;
    }, [c * 3.5, 3.5, sn * 3.5, 6]);
    m.add(fin, barkM, 'trunk');
  }
  // branches up into the canopy
  m.add(roundCone([0.2, 16, 0.1], [-5, 22, -1], 0.9, 0.5), s(bark, -0.2), 'branch');
  m.add(roundCone([0.2, 17, 0.1], [5, 23, 1.5], 0.9, 0.5), s(bark, -0.2), 'branch');
  // broad, flat-topped layered canopy
  const blobs = [
    [0, 24, 0, 5.6], [-5.5, 22.5, -0.5, 4.0], [5.5, 23, 1.0, 4.2], [0.5, 22.5, 5.0, 4.0], [-1.0, 23, -5.0, 4.0], [4.0, 22, -4.0, 3.4], [-4.0, 22, 4.2, 3.4],
    [1.5, 27.5, 0.5, 4.2], [-3.0, 26.5, -2.0, 3.4], [4.5, 26.5, 3.5, 3.0], [-2.0, 26.5, 3.0, 3.2],
  ];
  blobs.forEach(([x, y, z, r], i) => m.add(ellipsoid([x, y, z], [r * 1.1, r * 0.72, r * 1.1]), foliage(i > 6 ? LEAF : JUNGLE, 77 + (i % 3)), 'c' + i));
  // hanging lianas with a few leaves
  const lianas = [[-7.5, 20.5, 1.5, 11], [6.5, 20.8, 4.5, 8], [2.8, 20, 7.5, 13], [-3.0, 20.5, 6.2, 9]];
  lianas.forEach(([x, y, z, len], i) => {
    m.add(capsule([x, y, z], [x + 0.3, y - len, z + 0.3], 0.28), s(RAMPS.green, -0.3), 'liana' + i);
    for (let j = 1; j <= 2; j++) m.add(ellipsoid([x + 0.7 * (j % 2 ? 1 : -1), y - len * j * 0.35, z + 0.3], [0.8, 0.35, 0.5]), s(RAMPS.green, 0.3), 'liana' + i);
  });
  return m;
};

D.banana_plant = () => {
  const m = new Model();
  const stem = [P.greenDeep, P.greenDark, mix(P.greenDark, P.sand, 0.4), P.sandLight];
  m.add(roundCone([0, 0, 0], [0.2, 12, 0.1], 1.9, 1.2), (h) => (Math.sin(Math.atan2(h.p[2], h.p[0]) * 5 + h.p[1] * 0.6) > 0.5 ? s(stem, -0.8) : stem), 'stem');
  m.add(roundCone([1.8, 0, 1.5], [2.0, 5, 1.6], 1.1, 0.8), stem, 'sucker');
  // big paddle leaves: midrib + wide blade, arching out and drooping
  const leaves = [[0.3, 8.5, 16.5], [1.6, 9.5, 17.5], [2.9, 8, 16], [4.1, 9, 17], [5.3, 8.5, 18], [2.2, 4.5, 20.5], [4.9, 4, 20]];
  leaves.forEach(([a, len, y0], k) => {
    const c = Math.cos(a), sn = Math.sin(a);
    const leaf = custom((x, y, z) => {
      const r = (x * c + z * sn) - 0.5, l = -x * sn + z * c;
      const t = Math.min(Math.max(r / len, 0), 1);
      const cy = y0 - 12 + 12 + 3.2 * Math.sin(t * Math.PI * 0.8) - t * t * 7.5;
      const w = 2.6 * Math.sin(Math.PI * Math.min(0.97, 0.08 + t * 0.95));
      const tilt = l * 0.35;
      return Math.max(Math.abs(y - cy + tilt * 0) - 0.3, Math.abs(l) - w, -r, r - len) * 0.7;
    }, [c * len / 2, y0, sn * len / 2, len]);
    m.add(leaf, (h) => {
      const l = -h.p[0] * sn + h.p[2] * c;
      if (Math.abs(l) < 0.3) return s(RAMPS.green, 1.0); // midrib
      const r = h.p[0] * c + h.p[2] * sn;
      if ((k % 2) && Math.abs(Math.sin(r * 1.6)) < 0.1 && Math.abs(l) > 1.2) return null; // torn slits
      return foliage(k % 2 ? RAMPS.green : s(RAMPS.green, -0.2), 80 + k, 1.5)(h);
    }, 'leaf' + k);
    m.add(capsule([0.2, 12, 0.1], [c * 0.7, y0, sn * 0.7], 0.4), stem, 'leaf' + k);
  });
  // hanging bunch of bananas with a purple bud below
  const bx = 2.2, bz = 2.3;
  m.add(capsule([0.4, 13, 0.4], [bx, 12, bz], 0.35), stem, 'stalk');
  m.add(capsule([bx, 12, bz], [bx + 0.2, 6.5, bz + 0.2], 0.3), stem, 'stalk');
  for (let tier = 0; tier < 3; tier++) for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + tier * 0.6, y = 11 - tier * 1.5;
    m.add(capsule([bx + Math.cos(a) * 0.6, y, bz + Math.sin(a) * 0.6], [bx + Math.cos(a) * 1.5, y + 1.3, bz + Math.sin(a) * 1.5], 0.5), (h) => (h.p[1] > y + 1.1 ? s(RAMPS.green, -0.3) : [P.greenDark, P.gold, P.yellow, P.yellow]), 'bananas');
  }
  m.add(roundCone([bx + 0.2, 6.6, bz + 0.2], [bx + 0.3, 4.6, bz + 0.3], 0.9, 0.3), RAMPS.violet, 'bud');
  return m;
};

// ---------------------------------------------------------------- puzzles / mirage tower
const RUNE_MARKS = 10;
function pressurePlate(pressed) {
  const m = new Model();
  const glow = pressed ? FLAME : GLOW_CYAN;
  const H = pressed ? 0.45 : 1.6;
  // socket ring flush with the floor, plate inside it
  m.add(subtract(lathe(0, 0.5, () => 6.6), lathe(-1, 2, () => 5.3)), speckle(STONE, 81, 1.3, 0.84), 'socket');
  m.add(lathe(0, H, (y) => 5.1 - Math.max(0, y - H + 0.4) * 0.8), (h) => {
    const r = Math.hypot(h.p[0], h.p[2]), a = Math.atan2(h.p[2], h.p[0]);
    if (h.n[1] < 0.6) return s(STONE, -0.3);
    if (r > 2.8 && r < 3.9) {
      const k = ((a / (Math.PI * 2)) * RUNE_MARKS + 10) % 1;
      if (k > 0.18) return pressed ? (k > 0.5 && k < 0.7 ? P.white : P.yellow) : (k > 0.5 && k < 0.7 ? mix(P.cyan, P.white, 0.5) : P.cyan);
      return s(STONE, -1.2);
    }
    if (r < 1.3) return pressed ? P.yellow : P.cyan;
    if (r < 1.8) return s(STONE, -1);
    return speckle(s(STONE, -0.6), 82, 1.3, 0.86)(h);
  }, 'plate');
  m.post = (cv, cam) => { const [x, y] = cam.project([0, H, 0]); halo(cv, x, y, pressed ? 10 : 7, pressed ? P.yellow : P.cyan, pressed ? 0.6 : 0.35); };
  return m;
}
D.switch_up = () => pressurePlate(false);
D.switch_down = () => pressurePlate(true);

D.gate_bars = () => {
  const m = new Model();
  const sandst = speckle(SANDSTONE, 83, 1.3, 0.86);
  // two sandstone posts on the cell edges (gate along world z), gold caps
  for (const z of [-7.2, 7.2]) {
    m.add(box([0, 11, z], [1.9, 11, 1.9], 0.2), (h) => (Math.abs(h.p[1] - 18) < 0.4 || Math.abs(h.p[1] - 3) < 0.4 ? s(SANDSTONE, -1) : sandst(h)), 'post' + z);
    m.add(box([0, 22.6, z], [2.3, 0.6, 2.3], 0.15), s(SANDSTONE, 0.3), 'cap' + z);
    m.add(cone([0, 0, z], 23.2, 25.6, 1.7, 0.2), RAMPS.gold, 'cap' + z);
  }
  // heavy brass bars with spear tips, two cross rails with rivets
  for (let i = -2; i <= 2; i++) {
    const z = i * 2.5;
    m.add(capsule([0, 0, z], [0, 18.5, z], 0.6), s(RAMPS.gold, -0.2), 'bars');
    m.add(roundCone([0, 18.5, z], [0, 20.6, z], 0.9, 0.1), s(RAMPS.gold, 0.2), 'bars');
  }
  for (const y of [4.5, 15.5]) m.add(box([0, y, 0], [0.55, 0.65, 5.6], 0.15), RAMPS.iron, 'rail');
  for (let i = -2; i <= 2; i++) for (const y of [4.5, 15.5]) m.add(sphere([0.5, y, i * 2.5], 0.4), s(RAMPS.gold, 0.4), 'rail');
  // lock plate
  m.add(box([0.5, 10, 0], [0.5, 1.5, 1.4], 0.1), RAMPS.gold, 'lock');
  m.dot([1.1, 10.2, 0], P.ink, 1, 2, { tol: 2 });
  return m;
};

D.seed_sprout = () => {
  const m = new Model();
  // three freshly dug soil mounds, a sprout (or a seed) in each; loose seeds around
  const mounds = [[-3.2, -2.0, 2.6], [2.8, -1.2, 2.4], [-0.4, 3.4, 2.5]];
  mounds.forEach(([x, z, r], i) => m.add(ellipsoid([x, 0.1, z], [r, 0.8, r * 0.9]), speckle(SOIL, 84 + i, 1.6, 0.7, 0.8), 'mound' + i));
  const sprout = (x, z, hgt, a, tag) => {
    m.add(capsule([x, 0.6, z], [x + 0.2, hgt, z], 0.22), s(RAMPS.green, 0.4), tag);
    for (const sd of [-1, 1]) m.add(ellipsoid([x + Math.cos(a) * sd * 0.9, hgt + 0.2, z + Math.sin(a) * sd * 0.9], [0.9, 0.25, 0.5], mmul(rotY(-a), rotZ(sd * 0.35))), s(RAMPS.green, 0.8), tag);
  };
  sprout(-3.2, -2.0, 2.8, 0.4, 'sp0');
  sprout(-0.4, 3.4, 2.1, 1.9, 'sp2');
  m.add(ellipsoid([2.8, 0.9, -1.2], [0.55, 0.3, 0.8], rotY(0.6)), [P.ink, P.ink, P.darkBrown, P.brown], 'seed');
  for (const [x, z, a] of [[5.0, 2.6, 0.2], [-5.4, 1.8, 1.1], [1.6, -5.2, 2.2]]) m.add(ellipsoid([x, 0.2, z], [0.5, 0.25, 0.75], rotY(a)), [P.ink, P.ink, P.darkBrown, X.sandPale], 'seed');
  return m;
};

D.bramble = () => {
  const m = new Model();
  const BRAM = [P.ink, P.teal, P.greenDeep, mix(P.greenDark, P.brown, 0.35)];
  const CANE = [P.ink, P.darkBrown, P.darkRed, mix(P.darkRed, P.clay, 0.5)];
  const blobs = [[0, 3.8, 0, 4.4], [3.6, 3.0, 1.8, 3.2], [-3.4, 3.0, 1.6, 3.2], [1.2, 3.0, -3.4, 3.4], [-2.4, 2.8, -2.8, 3.0], [-0.8, 7.2, -0.4, 3.0], [2.0, 6.4, 1.6, 2.7], [0.4, 3.0, 3.8, 3.0]];
  blobs.forEach(([x, y, z, r], i) => m.add(sphere([x, y, z], r), foliage(BRAM, 85, 1.6), 'b' + i));
  // thorny canes arching out of the bush
  const canes = [[0.3, 3.6, 10], [1.2, 3.2, 8.5], [2.0, 3.8, 9.5], [2.9, 3.4, 8], [3.8, 3.6, 10.5], [4.7, 3.2, 8.5], [5.5, 3.8, 9.5], [0.8, 2.4, 12], [3.4, 2.4, 11.5]];
  canes.forEach(([a, len, rise], k) => {
    let prev = [Math.cos(a) * 1.5, 3, Math.sin(a) * 1.5];
    for (let i = 1; i <= 5; i++) {
      const t = i / 5, r = 1.5 + t * len + Math.sin(t * Math.PI) * 1.2;
      const p = [Math.cos(a) * r, 3 + (rise - 3) * Math.sin(t * Math.PI * 0.85) - t * t * 2.5, Math.sin(a) * r];
      m.add(capsule(prev, p, 0.36), CANE, 'cane' + k);
      if (i > 1) m.add(roundCone(p, [p[0] + Math.cos(a + 1.3) * 0.8, p[1] + 0.9, p[2] + Math.sin(a + 1.3) * 0.8], 0.28, 0.05), s(CANE, 0.5), 'cane' + k);
      prev = p;
    }
  });
  for (const [bi, dx, dy, dz] of [[0, 0.5, 0.4, 0.6], [1, 0.6, 0.3, 0.5], [2, -0.3, 0.3, 0.8], [7, 0.4, 0.2, 0.8], [5, 0.3, 0.6, 0.6], [6, 0.7, 0.3, 0.5], [3, 0.9, 0.2, 0.2], [7, -0.6, -0.3, 0.7]]) {
    const [x, y, z, r] = blobs[bi], l = Math.hypot(dx, dy, dz);
    m.add(sphere([x + (dx / l) * r, y + (dy / l) * r, z + (dz / l) * r], 0.75), (h) => (h.lam > 0.5 ? P.magenta : h.lam > -0.1 ? P.purple : X.purpleDark), 'berry');
  }
  return m;
};

D.mirage_crystal = () => {
  const m = new Model();
  const sandst = speckle(SANDSTONE, 86, 1.3, 0.86);
  m.add(box([0, 1.2, 0], [5.0, 1.2, 5.0], 0.3), (h) => (h.n[1] > 0.7 && Math.abs(Math.abs(h.p[0]) - 3.8) < 0.4 ? RAMPS.gold : sandst(h)), 'base');
  const shimmer = (ramp2) => (h) => {
    const facet = Math.round(Math.atan2(h.n[2], h.n[0]) / (Math.PI / 3));
    const band = Math.sin(h.p[1] * 0.9 + facet * 1.3);
    if (band > 0.82) return { ramp: GLOW_CYAN, bias: 1.8 };
    return facet % 2 ? { ramp: ramp2, bias: 0.6 } : { ramp: GLOW_CYAN, bias: 0.5 };
  };
  const GOLD_GLOW = [P.tan, P.gold, P.yellow, P.white];
  const prism = (cx, cz, r, y0, y1, tip, rot = 0) => custom((x, y, z) => {
    let px = x - cx, pz = z - cz;
    const cr = Math.cos(rot), sr = Math.sin(rot);
    [px, pz] = [px * cr - pz * sr, px * sr + pz * cr];
    const ax = Math.abs(px), az = Math.abs(pz);
    const hd = Math.max(az, ax * 0.866 + az * 0.5);
    return Math.max(hd - r, y0 - y, (y - (y1 - tip) + (hd / r) * tip - tip) * 0.6);
  }, [cx, (y0 + y1) / 2, cz, Math.hypot(r * 1.2, (y1 - y0) / 2)]);
  m.add(prism(0, 0, 2.6, 2.2, 29, 4.5, 0.3), shimmer(GOLD_GLOW), 'main');
  for (const [x, z, r, hgt, tag] of [[2.9, 2.4, 1.2, 10, 'a'], [-3.0, 1.2, 1.0, 8, 'b'], [1.4, -3.2, 0.95, 7, 'c'], [-2.2, 3.4, 0.8, 5.5, 'd']]) {
    m.add(prism(x, z, r, 2.2, 2.2 + hgt, 2, x), shimmer(GOLD_GLOW), 'small' + tag);
  }
  m.post = (cv, cam) => {
    const [x, y] = cam.project([0, 18, 0]);
    halo(cv, x, y, 13, P.cyan, 0.7);
    for (const [sx, sy, col] of [[-7, -10, P.yellow], [6, -3, P.white], [-5, 6, P.cyan], [7, -14, P.gold]]) {
      const px = Math.round(x + sx), py = Math.round(y + sy);
      if (!cv.alpha(px, py)) { cv.set(px, py, col); cv.set(px - 1, py, withA2(col, 150)); cv.set(px + 1, py, withA2(col, 150)); cv.set(px, py - 1, withA2(col, 150)); cv.set(px, py + 1, withA2(col, 150)); }
    }
  };
  return m;
};

D.pedestal = () => {
  const m = new Model();
  const st = speckle(STONE, 87, 1.3, 0.85);
  m.add(box([0, 0.9, 0], [4.6, 0.9, 4.6], 0.2), st, 'step');
  m.add(box([0, 2.3, 0], [3.6, 0.6, 3.6], 0.2), s(STONE, 0.2), 'step2');
  m.add(box([0, 6.4, 0], [2.4, 3.6, 2.4], 0.15), (h) => {
    const k = Math.abs(h.n[0]) > 0.7 ? h.p[2] : h.p[0];
    if (Math.abs(k) < 1.3 && Math.abs(h.p[1] - 6.4) < 2.2 && Math.abs(Math.abs(k) - 0.9) + Math.abs(h.p[1] - 6.4) * 0.4 < 0.5) return { ramp: GLOW_CYAN, bias: 0.4 };
    return st(h);
  }, 'shaft');
  m.add(box([0, 10.6, 0], [3.8, 0.7, 3.8], 0.25), s(STONE, 0.2), 'top');
  // shallow basin glowing softly
  m.add(lathe(0, 0.3, () => 2.4, [0, 11.2, 0]), (h) => (Math.hypot(h.p[0], h.p[2]) > 1.9 ? s(STONE, -0.4) : { ramp: GLOW_CYAN, bias: 1.3 }), 'basin');
  m.post = (cv, cam) => {
    const [x, y] = cam.project([0, 11.6, 0]);
    halo(cv, x, y, 8, P.cyan, 0.8);
    for (let i = 1; i <= 4; i++) { const py = Math.round(y) - 1 - i * 2; const px = Math.round(x) + (i % 2 ? -2 : 2); if (!cv.alpha(px, py)) cv.set(px, py, withA2(i < 3 ? P.cyan : P.white, 200 - i * 30)); }
  };
  return m;
};

D.dark_brazier = () => {
  const m = new Model();
  const iron = rusty(88);
  for (const a of [0.6, 2.7, 4.8]) {
    const c = Math.cos(a), sn = Math.sin(a);
    m.add(roundCone([c * 1.6, 6.5, sn * 1.6], [c * 3.6, 0.2, sn * 3.6], 0.5, 0.45), iron, 'leg');
    m.add(sphere([c * 3.7, 0.4, sn * 3.7], 0.7), IRON_L, 'leg');
  }
  m.add(torus([0, 3.2, 0], 2.3, 0.3), iron, 'ring');
  m.add(intersect(subtract(sphere([0, 10.5, 0], 4.2), sphere([0, 11.2, 0], 3.7)), halfSpace([0, 10.5, 0], [0, -1, 0])), (h) => (h.n[1] > 0.5 ? [P.ink, P.ink, X.purpleDark, P.purple] : Math.abs(h.p[1] - 8.8) < 0.3 ? RUST_D : iron(h)), 'bowl');
  m.add(torus([0, 10.5, 0], 4.0, 0.45), IRON_L, 'rim');
  m.add(lathe(0, 0.6, () => 3.4, [0, 9.4, 0]), [P.ink, X.purpleDark, P.purple, P.magenta], 'coals');
  // violet flames licking up: separate tongues, dark rim, bright core
  const FL = [X.purpleDark, P.purple, P.magenta, X.purpleLight];
  for (const [x, z, hgt, r, lean] of [[0, 0.4, 8.5, 1.3, 0.5], [2.0, 0.6, 5.6, 1.0, 0.9], [-1.8, 1.4, 6.4, 1.0, -0.8], [0.6, -1.9, 5.0, 0.9, 0.4], [-1.0, -1.2, 4.2, 0.8, -0.5], [1.4, 2.2, 4.2, 0.8, 0.3]]) {
    m.add(roundCone([x, 10.0, z], [x + lean, 10.0 + hgt, z - lean * 0.5], r, 0.12), { ramp: FL, bias: 0.6 }, 'flame' + x);
    m.add(roundCone([x, 10.2, z + 0.5], [x + lean * 0.6, 10.2 + hgt * 0.55, z + 0.5 - lean * 0.3], r * 0.55, 0.1), { ramp: GLOW_VIOLET, bias: 1.4 }, 'flame' + x);
  }
  m.post = (cv, cam) => {
    const [x, y] = cam.project([0, 15, 0]);
    halo(cv, x, y, 10, P.magenta, 0.5);
    for (const [dx, dy] of [[-4, -8], [3, -11], [0, -14]]) { const px = Math.round(x + dx), py = Math.round(y + dy); if (!cv.alpha(px, py)) cv.set(px, py, dy < -12 ? X.purpleLight : P.magenta); }
  };
  return m;
};

D.ship_wheel = () => {
  const m = new Model();
  const wood = woodPlanks('y', 1.6);
  // a stout post with a brass cap, the wheel on an axle in front of it
  m.add(box([0, 5.2, 0], [1.3, 5.2, 1.3], 0.25), wood, 'post');
  m.add(box([0, 0.5, 0], [2.4, 0.5, 2.4], 0.2), s(WOOD, -0.3), 'foot');
  m.add(ellipsoid([0, 10.6, 0], [1.6, 0.6, 1.6]), [P.brown, P.rust, P.gold, P.yellow], 'cap');
  const hub = [0, 9.0, 2.2];
  m.add(capsule([0, 9.0, 0.6], hub, 0.55), s(WOOD, -0.4), 'axle');
  const ring = [P.brown, P.rust, P.clay, P.tan];
  m.add(torusXY(hub, 5.2, 0.6), ring, 'rim');
  m.add(sphere(hub, 1.1), [P.brown, P.rust, P.gold, P.yellow], 'hub');
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4 + 0.2;
    const c = Math.cos(a), sn = Math.sin(a);
    m.add(capsule(hub, [hub[0] + c * 5.2, hub[1] + sn * 5.2, hub[2]], 0.35), s(WOOD, 0.1), 'spoke');
    m.add(roundCone([hub[0] + c * 5.6, hub[1] + sn * 5.6, hub[2]], [hub[0] + c * 7.4, hub[1] + sn * 7.4, hub[2]], 0.55, 0.4), s(WOOD, 0.25), 'handle');
  }
  return m;
};
// directional: the same wheel seen after one, two, three quarter turns of the board
for (let k = 1; k <= 3; k++) D[`ship_wheel_r${k}`] = () => D.ship_wheel().transform(rotY((-k * Math.PI) / 2), [0, 0, 0], [0, 0, 0]);

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
    const m = D[n](), cam = isoCamera();
    const cv = render(m, { w: DECOR_W, h: DECOR_H, cam, inner: 1.2 });
    if (m.post) m.post(cv, cam);
    return cv;
  });
}
export function decorSheet() { return grid(decorFrames(), DECOR_W, DECOR_H, 8); }
