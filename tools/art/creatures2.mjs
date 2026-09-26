// Creatures of the Temple Mountain chapter (sentient produce, toad, bosses, phantoms).
// CREATURES2[id] = { charset(): Canvas sheet, battler(): Canvas row, face(): Canvas 48x48 }
// generate.mjs writes charsets/<id>.png, battlers/<id>.png and faces/<id>.png for each entry.
//
// Same pipeline as creatures.mjs: SDF models (sdf.mjs) rendered to palette ramps + ink outline,
// charsets = 3 walk frames x 4 facings (SE, SW = mirrored SE, NE, NW = mirrored NE), battlers =
// one row of 4 frames (idle, idle2, attack, hurt) facing RIGHT; faces are flat portraits
// (flatfaces.mjs style). Glow / sparks / flames / translucency are 2D post effects per frame.
import {
  Model, ellipsoid, sphere, capsule, roundCone, custom, subtract, render, Camera, shade, rotX, rotY, rotZ, mmul,
} from './sdf.mjs';
import { Canvas, sheet, mix, hex, A, withAlpha, BAYER4 } from './raster.mjs';
import { P, X, RAMPS } from './palette.mjs';
import { scaleModel } from './creatures.mjs';
import { bottomAlign, fitOy } from './characters.mjs';
import { FlatPortrait } from './flatfaces.mjs';

const s = shade;
const H = (c) => (typeof c === 'number' ? c : hex(c));
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const lerp = (a, b, t) => a + (b - a) * t;

export const CREATURES2 = {};

// ---------------------------------------------------------------- shared sheet builders
const YAW_SE = 0.62, YAW_NE = Math.PI - 0.62;

/**
 * build(i) -> Model for walk frame i (0 step A, 1 idle, 2 step B).
 * fx(canvas, i, back) -> Canvas: optional 2D post effect (sparks, aura, translucency) before mirroring.
 */
function charsetOf(build, fw, fh, { pitch = 0.4, fixedOy = null, fx = null } = {}) {
  const draw = (yaw, i, oy) => render(build(i), { w: fw, h: fh, cam: new Camera({ yaw, pitch, ox: fw / 2, oy }) });
  const oy = fixedOy ?? fitOy((o) => draw(YAW_SE, 1, o), fh - 1);
  const post = (c, i, back) => (fx ? fx(c, i, back) : c);
  const se = [0, 1, 2].map((i) => post(draw(YAW_SE, i, oy), i, false));
  const ne = [0, 1, 2].map((i) => post(draw(YAW_NE, i, oy), i, true));
  return sheet([se, se.map((f) => f.mirrorX()), ne, ne.map((f) => f.mirrorX())], fw, fh);
}

/** Enemy battler row (faces RIGHT). align 'bottom': lowest pixel on the last row; 'center': fixed oy. */
function battlerOf(models, fw, fh, { yaw = 1.1, pitch = 0.4, align = 'bottom', oy, fx = null } = {}) {
  const frames = models.map((m, i) => {
    const pad = 40;
    const f = render(m, { w: fw, h: fh + pad, cam: new Camera({ yaw, pitch, ox: fw / 2, oy: (oy ?? fh - 2) + (align === 'bottom' ? pad / 2 : 0) }) });
    const c = align === 'bottom' ? bottomAlign(f, fh - 1).crop(0, 0, fw, fh) : f.crop(0, 0, fw, fh);
    return fx ? fx(c, i) : c;
  });
  const out = new Canvas(fw * frames.length, fh);
  frames.forEach((f, i) => out.blit(f, i * fw, 0, { blend: false }));
  return out;
}

/** z of the front surface of an axis-aligned ellipsoid at (x,y) (+ lift), for eyes/lines on a face. */
function front(c, r, x, y, lift = 0.15) {
  const u = ((x - c[0]) / r[0]) ** 2 + ((y - c[1]) / r[1]) ** 2;
  return c[2] + r[2] * Math.sqrt(Math.max(0, 1 - u)) + lift;
}

/** Tiny deterministic hash -> 0..1 */
const hash = (a, b = 0, c = 0) => {
  let h = (a * 374761393 + b * 668265263 + c * 2147483647) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

/** Opaque-pixel mask of a canvas. */
const maskOf = (c) => { const m = new Uint8Array(c.width * c.height); for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) m[y * c.width + x] = c.alpha(x, y) > 0 ? 1 : 0; return m; };

// ---------------------------------------------------------------- 1. tomato
const TOMATO = [P.darkBrown, P.darkRed, P.red, P.pink];
const LEAF = RAMPS.green;
/** pose: { step -1..1, bob, spit 0..1, hurt 0..1, puff 0..1, look (face turned toward +x), small (charset) } */
function tomato(pose = {}) {
  const m = new Model(), f = new Model();
  const st = pose.step ?? 0, spit = pose.spit ?? 0, puff = pose.puff ?? 0.5;
  const C = [0, 6.4 + (pose.bob ?? 0), 0], R = [5.3, 4.5, 5.0];
  // stubby legs
  for (const side of [1, -1]) {
    const fz = side * st * 1.1, lift = Math.max(0, side * st) * 0.8;
    m.add(capsule([side * 1.9, C[1] - 3, 0], [side * 2.1, 1.0 + lift, fz], 0.8), s(LEAF, -0.3), 'leg' + side);
    m.add(ellipsoid([side * 2.1, 0.6 + lift, fz + 0.4], [1.0, 0.6, 1.3]), s(LEAF, -0.1), 'leg' + side);
  }
  // body with shallow lobes (darker grooves radiating from the crown)
  m.add(ellipsoid(C, R), (h) => {
    const a = Math.atan2(h.p[0], h.p[2]), up = (h.p[1] - C[1]) / R[1];
    if (up > 0.55 && Math.cos(a * 5 + 0.3) > 0.9) return s(TOMATO, -0.4);
    return s(TOMATO, 0.35);
  }, 'body');
  // face (built facing +z, then turned by pose.look): puffed cheeks, pursed mouth, angry eyes
  const cy = C[1] - 1.2;
  for (const side of [1, -1]) f.add(sphere([side * 2.4, cy + 0.1, front(C, R, side * 2.4, cy) - 1.0], 1.15 + puff * 0.35), s(TOMATO, 0.9), 'body');
  f.dot([0, cy - 0.2, front(C, R, 0, cy - 0.2)], P.darkBrown, 1, 1 + (spit > 0.5 ? 1 : 0), { tol: 1.6 });
  if (!pose.small) f.dot([0.35, cy - 0.2, front(C, R, 0.35, cy - 0.2)], P.darkBrown, 1, 1, { tol: 1.6 });
  const ey = C[1] + 1.1;
  for (const side of [1, -1]) {
    const ex = side * (pose.small ? 1.6 : 2.0);
    if (pose.hurt) f.line([ex - 0.7, ey, front(C, R, ex, ey)], [ex + 0.7, ey + 0.1, front(C, R, ex, ey)], P.ink);
    else f.dot([ex, ey, front(C, R, ex, ey)], P.ink, 1, pose.small ? 2 : 1, { tol: 1.6 });
    if (!pose.small) f.line([side * 1.0, ey + 1.0, front(C, R, side * 1.0, ey + 1.0)], [side * 2.9, ey + 1.9, front(C, R, side * 2.9, ey + 1.9)], P.ink);
  }
  m.merge(pose.look ? f.transform(rotY(pose.look), C) : f);
  // leaf crown + stem
  const top = C[1] + R[1] - 0.4;
  for (let k = 0; k < 5; k++) {
    const th = (k / 5) * Math.PI * 2 + 0.3;
    const rot = mmul(rotY(th), rotX(-0.25 + (pose.droop ?? 0)));
    m.add(ellipsoid([Math.sin(th) * 1.9, top + 0.1, Math.cos(th) * 1.9], [0.9, 0.35, 2.3], rot), s(LEAF, k % 2 ? 0.2 : 0), 'leaf');
  }
  m.add(capsule([0, top, 0], [0.4, top + 1.7, -0.3], 0.45), s(LEAF, -0.4), 'stem');
  // water jet out of the pursed mouth
  if (spit) {
    const z0 = front(C, R, 0, cy) - 0.6, x0 = Math.sin(pose.look ?? 0) * z0;
    m.add(roundCone([x0, cy - 0.2, z0], [x0 * 0.6, cy - 0.9, z0 + 6 * spit], 0.7, 0.9), RAMPS.blue, 'water');
    for (let j = 0; j < 3; j++) m.add(sphere([(j - 1) * 0.9, cy - 0.6 + (j % 2) * 1.2, z0 + 7.6 + j * 1.3], 0.75 - j * 0.12), s(RAMPS.blue, 0.5), 'water');
  }
  let out = m;
  if (pose.hurt) out = out.transform(rotX(-0.3 * pose.hurt), [0, 0.5, -2], [0, 0, -0.8]);
  return out;
}
CREATURES2.enemy_tomato = {
  charset: () => charsetOf((i) => tomato({ step: [-1, 0, 1][i], bob: i === 1 ? 0 : 0.5, small: true }), 24, 32),
  battler: () => {
    const k = 1.75;
    const L = 0.55, ms = [tomato({ look: L }), tomato({ look: L, bob: -0.4, puff: 1, droop: 0.15 }), tomato({ look: L * 0.6, spit: 1, puff: 1, step: 0.3 }), tomato({ look: L, hurt: 1, puff: 0 })];
    return battlerOf(ms.map((m) => scaleModel(m.translate([0, 0, -2.5]), k)), 40, 40, { yaw: 0.7 });
  },
  face: () => {
    const p = new FlatPortrait({ bg: '124e89', shape: { type: 'disc', color: '0099db', x: 24, y: 28, r: 20 } });
    p.mat('red', 'e43b44', 'a22633', 0.6).mat('cheek', 'f6757a', 'e43b44', 0.7).mat('leaf', '63c74d', '3e8948', 0.55).mat('stem', '265c42').mat('ink', '181425').mat('water', '2ce8f5', '0099db', 0.5);
    p.ell('red', 24, 31, 17, 14.5);
    p.ell('cheek', 15.5, 35, 4.6, 3.8); p.ell('cheek', 32.5, 35, 4.6, 3.8);
    // star-shaped calyx: five pointed sepals around the stem
    for (const [ang, len] of [[0.25, 12], [2.9, 12], [0.95, 8], [2.2, 8], [-1.3, 6], [-1.85, 6]]) {
      const dx = Math.cos(ang), dy = Math.sin(ang), nx = -dy, ny = dx;
      p.poly('leaf', [[24 + nx * 2.4, 18 + ny * 2.4], [24 + dx * len, 18 + dy * len * 0.6], [24 - nx * 2.4, 18 - ny * 2.4]]);
    }
    p.ell('leaf', 24, 18, 4, 2.2);
    p.poly('stem', [[23, 17], [25.6, 17], [27.5, 9.5], [25.6, 9]]);
    p.post((c) => {
      const k = H('181425');
      // angry brows + eyes
      c.line(15, 23, 21, 26, k); c.line(15, 24, 21, 27, k); c.line(33, 23, 27, 26, k); c.line(33, 24, 27, 27, k);
      c.fillRect(18, 28, 2, 3, k); c.fillRect(28, 28, 2, 3, k);
      // pursed "o" mouth + water drop
      c.fillRect(23, 36, 2, 3, H('3e2731')); c.set(22, 37, H('3e2731')); c.set(25, 37, H('3e2731'));
      c.ellipse(24, 43.5, 1.6, 2.2, H('2ce8f5')); c.set(24, 41, H('2ce8f5')); c.set(24, 43, H('ffffff'));
      c.fillRect(13, 27, 3, 2, H('f6757a')); // highlight
    });
    return p.render();
  },
};

// ---------------------------------------------------------------- 2D effects
/** Zigzag electric sparks around the silhouette. n sparks, seeded; bolt = [x0,y0,x1,y1] big forked bolt. */
function sparks(c, seed, n = 2, { len = 4, cols = [P.white, P.cyan, P.yellow], floor = null, bolt = null } = {}) {
  const bb = c.bbox();
  if (!bb) return c;
  const cx = (bb.x0 + bb.x1) / 2, cy = (bb.y0 + bb.y1) / 2;
  const maxY = floor ?? bb.y1 - 2;
  const put = (x, y, col) => { if (y <= maxY && x >= 0 && x < c.width && y >= 0) c.set(x, y, col); };
  for (let k = 0; k < n; k++) {
    const a = hash(seed, k, 1) * Math.PI * 2;
    const rx = (bb.x1 - bb.x0) / 2 + 1, ry = (bb.y1 - bb.y0) / 2 + 1;
    let x = Math.round(cx + Math.cos(a) * rx * (0.7 + 0.3 * hash(seed, k, 2))), y = Math.round(cy + Math.sin(a) * ry * (0.7 + 0.3 * hash(seed, k, 3)));
    const dx = Math.cos(a), dy = Math.sin(a);
    const col = cols[k % cols.length];
    // zigzag: advance along (dx,dy), alternating sideways kinks of 1px
    const ax = Math.abs(dx) > Math.abs(dy) ? Math.sign(dx) : 0, ay = ax ? 0 : Math.sign(dy);
    let flip = hash(seed, k, 4) > 0.5 ? 1 : -1;
    put(x, y, col);
    for (let j = 0; j < len; j++) {
      x += ax; y += ay; put(x, y, col);
      x += ax - ay * flip; y += ay + ax * flip; put(x, y, col);
      flip = -flip;
    }
  }
  if (bolt) {
    const [x0, y0, x1, y1] = bolt;
    let px = x0, py = y0;
    const steps = Math.max(3, Math.round(Math.hypot(x1 - x0, y1 - y0) / 3));
    for (let j = 1; j <= steps; j++) {
      const t = j / steps, nx = Math.round(lerp(x0, x1, t)), ny = Math.round(lerp(y0, y1, t) + (j < steps ? (hash(seed, j, 9) - 0.5) * 5 : 0));
      c.line(px, py, nx, ny, (qx, qy) => { c.set(qx, qy + 1, P.cyan); c.set(qx, qy, P.white); return null; });
      px = nx; py = ny;
    }
  }
  return c;
}

/** Flickering flame aura behind the sprite: tongues rise from the top edge, licks at the sides. */
function flameAura(c, seed, { height = 4, side = 1 } = {}) {
  const bb = c.bbox();
  if (!bb) return c;
  const w = c.width, hgt = c.height, m = maskOf(c);
  const aura = new Canvas(w, hgt);
  const ramp = [P.yellow, P.gold, P.orange, P.red];
  for (let x = bb.x0; x <= bb.x1; x++) {
    let top = -1;
    for (let y = 0; y < hgt; y++) if (m[y * w + x]) { top = y; break; }
    if (top < 0) continue;
    const h = Math.round(height * (0.35 + 0.65 * hash(seed, x, 7)) * (0.6 + 0.4 * Math.sin(x * 1.3 + seed)));
    for (let j = 1; j <= h; j++) aura.set(x, top - j, ramp[Math.min(3, Math.floor((j / (h + 1)) * 4))]);
  }
  for (let y = bb.y0; y <= bb.y1 - 3; y++) {
    let l = -1, r = -1;
    for (let x = 0; x < w; x++) if (m[y * w + x]) { if (l < 0) l = x; r = x; }
    if (l < 0) continue;
    const ext = Math.round(side * (1 + 1.4 * hash(seed, y, 5)));
    for (let j = 1; j <= ext; j++) { aura.set(l - j, y - (j > 1 ? 1 : 0), ramp[Math.min(3, j)]); aura.set(r + j, y - (j > 1 ? 1 : 0), ramp[Math.min(3, j)]); }
  }
  aura.blit(c, 0, 0);
  return aura;
}

// ---------------------------------------------------------------- 2. lemon
const LEMON = [P.tan, P.gold, P.yellow, P.yellow];
/** pose: { step, bob, arms: raise 0..1, hurt, look, small } */
function lemon(pose = {}) {
  const m = new Model(), f = new Model();
  const st = pose.step ?? 0, up = pose.arms ?? 0;
  const C = [0, 7.2 + (pose.bob ?? 0), 0], R = [3.9, 5.0, 3.7];
  for (const side of [1, -1]) {
    const fz = side * st * 1.0, lift = Math.max(0, side * st) * 0.8;
    m.add(capsule([side * 1.4, C[1] - 3.6, 0], [side * 1.6, 0.9 + lift, fz], 0.55), s(LEMON, -0.9), 'leg' + side);
    m.add(ellipsoid([side * 1.6, 0.5 + lift, fz + 0.4], [0.8, 0.5, 1.1]), s(LEMON, -0.7), 'leg' + side);
  }
  const peel = (h) => (BAYER4[h.py & 3][h.px & 3] === 5 ? s(LEMON, -0.6) : s(LEMON, 0.1));
  m.add(ellipsoid(C, R), peel, 'body');
  m.add(roundCone([0, C[1] + R[1] - 0.8, 0], [0.2, C[1] + R[1] + 1.0, -0.1], 1.1, 0.5), s(LEMON, 0.1), 'body');
  m.add(roundCone([0, C[1] - R[1] + 0.8, 0], [0, C[1] - R[1] - 0.6, 0.1], 1.0, 0.45), s(LEMON, -0.2), 'body');
  m.add(ellipsoid([1.3, C[1] + R[1] + 0.8, -0.3], [1.4, 0.3, 0.7], rotZ(-0.4)), s(LEAF, 0.1), 'leaf');
  // tiny arms
  for (const side of [1, -1]) {
    const sh = [side * 3.3, C[1] - 0.6, 0.6];
    const hand = [side * (4.8 + up * 0.3), C[1] - 2.0 + up * 4.2, 1.4 + up * 0.8];
    m.add(capsule(sh, hand, 0.45), s(LEMON, -0.5), 'arm' + side);
    m.add(sphere(hand, 0.75), s(LEMON, -0.2), 'arm' + side);
  }
  // face: eyes + big zesty grin
  const ey = C[1] + 1.0;
  for (const side of [1, -1]) {
    const ex = side * (pose.small ? 1.3 : 1.5);
    if (pose.hurt) f.line([ex - 0.6, ey + 0.3, front(C, R, ex, ey)], [ex + 0.6, ey - 0.3, front(C, R, ex, ey)], P.ink);
    else f.dot([ex, ey, front(C, R, ex, ey)], P.ink, 1, pose.small ? 1 : 2, { tol: 1.6 });
  }
  const gy = C[1] - 1.0, gw = pose.small ? 1.6 : 2.2;
  const grin = (t) => [t * gw, gy - (1 - t * t) * (pose.hurt ? -0.3 : 0.9)];
  for (let i = 0; i < 6; i++) {
    const [x0, y0] = grin(-1 + (i / 6) * 2), [x1, y1] = grin(-1 + ((i + 1) / 6) * 2);
    f.line([x0, y0, front(C, R, x0, y0)], [x1, y1, front(C, R, x1, y1)], P.darkBrown);
    if (!pose.small && !pose.hurt && i > 0 && i < 5) f.line([x0, y0 + 0.5, front(C, R, x0, y0 + 0.5)], [x1, y1 + 0.5, front(C, R, x1, y1 + 0.5)], P.white);
  }
  m.merge(pose.look ? f.transform(rotY(pose.look), C) : f);
  let out = m;
  if (pose.hurt) out = out.transform(rotX(-0.3), [0, 0.5, -1.5], [0, 0, -0.6]);
  return out;
}
CREATURES2.enemy_lemon = {
  charset: () => charsetOf((i) => lemon({ step: [-1, 0, 1][i], bob: i === 1 ? 0 : 0.5, arms: i === 1 ? 0 : 0.2, small: true }), 24, 32,
    { fx: (c, i, back) => sparks(c, 11 + i * 7 + (back ? 3 : 0), 2, { len: 3 }) }),
  battler: () => {
    const k = 1.6, L = 0.5;
    const ms = [lemon({ look: L }), lemon({ look: L, bob: 0.4, arms: 0.4 }), lemon({ look: L * 0.6, arms: 1, step: 0.3 }), lemon({ look: L, hurt: 1 })];
    return battlerOf(ms.map((m) => scaleModel(m.translate([0, 0, -2]), k)), 40, 40, {
      yaw: 0.7,
      fx: (c, i) => (i === 3 ? c : sparks(c, 40 + i * 13, i === 2 ? 5 : 3, { len: i === 2 ? 5 : 4, bolt: i === 2 ? [25, 9, 39, 27] : null })),
    });
  },
  face: () => {
    const p = new FlatPortrait({ bg: '262b44', shape: { type: 'diamond', color: '124e89', x: 24, y: 26, r: 22 } });
    p.mat('peel', 'fee761', 'feae34', 0.62).mat('leaf', '63c74d', '3e8948', 0.5).mat('mouth', '3e2731').mat('teeth', 'ffffff');
    p.ell('peel', 24, 29, 15, 16.5);
    p.poly('peel', [[19.5, 15], [24, 9.5], [28.5, 15]]);
    p.poly('peel', [[20, 43], [24, 47.5], [28, 43]]);
    p.ell('leaf', 31, 11.5, 5.5, 2.2);
    p.ell('peel', 8, 38, 2.6); p.ell('peel', 40, 38, 2.6); // tiny fists
    p.poly('mouth', [[14.5, 31], [33.5, 31], [31, 36], [27, 38.6], [21, 38.6], [17, 36]]);
    p.poly('teeth', [[15.8, 31], [32.2, 31], [31.2, 33], [16.8, 33]]);
    p.post((c) => {
      const k = H('181425');
      c.fillRect(18, 23, 2, 4, k); c.fillRect(28, 23, 2, 4, k);
      c.set(18, 23, H('ffffff')); c.set(28, 23, H('ffffff'));
      c.line(16, 21, 20, 20, k); c.line(27, 20, 31, 21, k);
      for (const [x, y] of [[13, 30], [35, 27], [30, 42], [17, 41], [22, 18], [34, 36]]) c.set(x, y, H('feae34')); // pores
      const bolt = (pts, col) => { for (let i = 0; i + 1 < pts.length; i++) c.line(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], H(col)); };
      bolt([[4, 10], [7, 14], [5, 16], [9, 21]], 'ffffff'); bolt([[5, 10], [8, 14], [6, 16], [10, 21]], '2ce8f5');
      bolt([[43, 14], [40, 18], [43, 20], [39, 25]], 'ffffff'); bolt([[44, 14], [41, 18], [44, 20], [40, 25]], '2ce8f5');
      bolt([[3, 30], [6, 28], [7, 32]], 'fee761'); bolt([[45, 44], [41, 42], [43, 46]], '2ce8f5');
    });
    return p.render();
  },
};

// ---------------------------------------------------------------- 3. watermelon
const MELON = [P.teal, P.greenDeep, P.greenDark, P.green];
const MELON_STRIPE = [P.ink, P.teal, P.greenDeep, P.greenDeep];
const RIND = [P.greenDark, P.green, X.sandPale, X.sandPale];
const FLESH = [P.darkRed, P.red, P.pink, P.pink];
/** pose: { step, bob, open 0..1 (mouth), hurt, look, small, lean } */
function watermelon(pose = {}) {
  const m = new Model();
  const st = pose.step ?? 0, open = pose.open ?? 0.25, look = pose.look ?? 0;
  const r = 6.3, C = [0, r + 1.9 + (pose.bob ?? 0), 0];
  for (const side of [1, -1]) {
    const fz = side * st * 1.2, lift = Math.max(0, side * st) * 0.7;
    m.add(capsule([side * 2.6, C[1] - 4, 0], [side * 2.9, 1.0 + lift, fz], 1.0), s(MELON_STRIPE, 0.4), 'leg' + side);
    m.add(ellipsoid([side * 2.9, 0.65 + lift, fz + 0.5], [1.3, 0.65, 1.6]), s(MELON_STRIPE, 0.6), 'leg' + side);
  }
  // body with a wedge "bite" for a mouth, cut in the face frame (turned by look)
  const my = C[1] - 1.2, w = pose.small ? 3.6 : 4.2, zc = 1.2, k = 0.12 + open * 0.55;
  const cl = Math.cos(look), sl = Math.sin(look);
  const ball = sphere(C, r);
  const wedge = custom((x, y, z) => {
    const lx = cl * x - sl * z, lz = sl * x + cl * z;
    const dz = lz - zc;
    return Math.max((Math.abs(y - my) - k * dz) / Math.sqrt(1 + k * k), Math.abs(lx) - w, -dz);
  }, [0, my, r, r + 2]);
  const body = subtract(ball, wedge);
  m.add(body, (h) => {
    const d = Math.hypot(h.p[0] - C[0], h.p[1] - C[1], h.p[2] - C[2]) - r;
    if (d < -0.95) return FLESH;
    if (d < -0.35) return RIND;
    const a = Math.atan2(h.p[0], h.p[2]) + Math.sin((h.p[1] - C[1]) * 0.9) * 0.18;
    return Math.cos(a * 7) > 0.35 ? MELON_STRIPE : MELON;
  }, 'body');
  // seeds on the cut faces (face frame), eyes above the mouth
  const f = new Model();
  const cutZ = (x, dz) => zc + dz;
  for (const [sx, dz, up] of [[-2, 3.2, 1], [0.3, 2.5, 1], [2.2, 3.4, 1], [-1.0, 3.8, -1], [1.3, 3.0, -1]]) {
    if (pose.small && up < 0) continue;
    const z = cutZ(sx, dz), y = my + up * k * dz;
    if (Math.hypot(sx, y - C[1], z) < r - 1.2) f.dot([sx, y, z], P.ink, 1, 1, { tol: 1.0 });
  }
  const ey = C[1] + 2.0;
  for (const side of [1, -1]) {
    const ex = side * 2.1, ez = front(C, [r, r, r], ex, ey);
    if (pose.hurt) f.line([ex - 0.8, ey + 0.4, ez], [ex + 0.8, ey - 0.4, ez], P.ink);
    else f.dot([ex, ey, ez], P.ink, 1, pose.small ? 1 : 2, { tol: 1.6 });
    if (!pose.small) f.line([side * 1.0, ey + 1.1, front(C, [r, r, r], side * 1.0, ey + 1.1)], [side * 3.2, ey + 2.0, front(C, [r, r, r], side * 3.2, ey + 2.0)], P.ink);
  }
  // little curly stem on top
  m.add(capsule([0, C[1] + r - 0.3, -0.5], [0.4, C[1] + r + 1.0, -0.9], 0.45), s(LEAF, -0.3), 'stem');
  m.merge(look ? f.transform(rotY(look), [0, 0, 0]) : f);
  let out = m;
  if (pose.lean) out = out.transform(rotX(pose.lean), [0, 0.5, 0], [0, 0, pose.lean * 3]);
  if (pose.hurt) out = out.transform(rotX(-0.25), [0, 0.5, -3], [0, 0, -0.8]);
  return out;
}
CREATURES2.enemy_watermelon = {
  charset: () => charsetOf((i) => scaleModel(watermelon({ step: [-1, 0, 1][i], bob: i === 1 ? 0 : 0.4, small: true }), 0.95), 24, 32),
  battler: () => {
    const k = 2.05, L = 0.55;
    const ms = [watermelon({ look: L }), watermelon({ look: L, bob: -0.3, open: 0.45 }), watermelon({ look: L * 0.6, open: 1, lean: 0.25, step: 0.4 }), watermelon({ look: L, hurt: 1, open: 0.05 })];
    return battlerOf(ms.map((m) => scaleModel(m.translate([0, 0, -1.5]), k)), 48, 48, { yaw: 0.7 });
  },
  face: () => {
    const p = new FlatPortrait({ bg: 'a22633', shape: { type: 'half', color: 'e43b44', x: 24, y: 48, r: 24 } });
    p.mat('rind', '63c74d', '3e8948', 0.6).mat('stripe', '265c42', '193c3e', 0.6).mat('pale', 'f4e6c8').mat('flesh', 'e43b44', 'a22633', 0.75).mat('seed', '181425').mat('stem', '265c42');
    p.ell('rind', 24, 28, 20, 18);
    for (let i = -3; i <= 3; i++) p.poly('stripe', [[24 + i * 6.2 - 1.6, 10], [24 + i * 5.8 + 1.6, 10], [24 + i * 7 + 2.4 + Math.sign(i) * 1.5, 46], [24 + i * 7 - 2.4 + Math.sign(i) * 1.5, 46]], (x, y) => ((x - 24) / 20) ** 2 + ((y - 28) / 18) ** 2 <= 1);
    // wedge bite: pale rind line + red flesh + seeds
    p.poly('pale', [[8, 30], [40, 30], [35.5, 44.5], [12.5, 44.5]], (x, y) => ((x - 24) / 20) ** 2 + ((y - 28) / 18) ** 2 <= 1);
    p.poly('flesh', [[10, 31.5], [38, 31.5], [34, 43.5], [14, 43.5]], (x, y) => ((x - 24) / 18.5) ** 2 + ((y - 28) / 16.5) ** 2 <= 1);
    p.poly('stem', [[23, 10.5], [25.5, 10.5], [27, 5], [25, 4.5]]);
    p.post((c) => {
      const k = H('181425');
      for (const [x, y] of [[15, 34], [20, 37], [25, 35], [30, 38], [33, 34], [18, 41], [27, 41]]) { c.set(x, y, k); c.set(x, y + 1, k); }
      c.fillRect(17, 22, 3, 3, k); c.fillRect(29, 22, 3, 3, k);
      c.line(14, 18, 20, 21, k); c.line(14, 19, 20, 22, k); c.line(35, 18, 29, 21, k); c.line(35, 19, 29, 22, k);
    });
    return p.render();
  },
};

// ---------------------------------------------------------------- 4. chili
const CHILI = [P.darkRed, P.red, P.red, P.pink];
/** pose: { step, bob, lunge 0..1, hurt, look, small } */
function chili(pose = {}) {
  const m = new Model(), f = new Model();
  const st = pose.step ?? 0, lunge = pose.lunge ?? 0, b = pose.bob ?? 0;
  for (const side of [1, -1]) {
    const fz = side * st * 1.0, lift = Math.max(0, side * st) * 0.7;
    m.add(capsule([side * 0.9, 4.2 + b, 0], [side * 1.2, 0.8 + lift, fz], 0.45), s(LEAF, -0.3), 'leg' + side);
    m.add(ellipsoid([side * 1.2, 0.45 + lift, fz + 0.4], [0.7, 0.45, 1.0]), s(LEAF, -0.1), 'leg' + side);
  }
  // slim curved pod: fat shoulder under the cap, tapering down and curling back into a tail
  const pts = [[0, 13.2, 0.2, 2.3], [0, 10.6, 0.5, 2.5], [0, 7.6, 0.3, 2.2], [0, 5.2, -0.3, 1.7], [0, 3.6, -1.6, 1.1], [0, 3.1, -3.3, 0.65], [0, 3.9, -4.6, 0.3]];
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i], c = pts[i + 1];
    m.add(roundCone([a[0], a[1] + b, a[2]], [c[0], c[1] + b, c[2]], a[3], c[3]), (h) => (h.p[0] > 0.9 && h.p[2] > 0 ? s(CHILI, 0.3) : CHILI), 'body');
  }
  // green cap + curly stem
  const top = 14.9 + b;
  m.add(ellipsoid([0, top - 0.6, 0.2], [2.6, 0.9, 2.5]), (h) => (Math.cos(Math.atan2(h.p[0], h.p[2]) * 5) > 0.3 ? s(LEAF, 0.2) : s(LEAF, -0.2)), 'cap');
  m.add(capsule([0, top, 0.1], [0, top + 1.3, -0.4], 0.5), s(LEAF, -0.3), 'stem');
  m.add(capsule([0, top + 1.3, -0.4], [0.9, top + 2.0, -1.3], 0.4), s(LEAF, -0.3), 'stem');
  // face: furious eyes under steep brows, gritted teeth
  const FC = [0, 10.6 + b, 0.5], FR = [2.5, 3, 2.5];
  const ey = FC[1] + 0.6;
  for (const side of [1, -1]) {
    const ex = side * (pose.small ? 0.9 : 1.1);
    if (pose.hurt) f.line([ex - 0.5, ey + 0.4, front(FC, FR, ex, ey)], [ex + 0.5, ey - 0.4, front(FC, FR, ex, ey)], P.ink);
    else f.dot([ex, ey, front(FC, FR, ex, ey)], pose.small ? P.ink : P.yellow, 1, 1, { tol: 1.6 });
    if (!pose.small) f.line([side * 0.3, ey + 0.5, front(FC, FR, side * 0.3, ey + 0.5)], [side * 2.0, ey + 1.6, front(FC, FR, side * 2.0, ey + 1.6)], P.ink);
  }
  const my = FC[1] - 1.4;
  if (!pose.small) {
    f.line([-1.0, my, front(FC, FR, -1.0, my)], [1.0, my, front(FC, FR, 1.0, my)], P.white);
    f.line([-1.1, my - 0.5, front(FC, FR, -1.1, my - 0.5)], [1.1, my - 0.5, front(FC, FR, 1.1, my - 0.5)], P.darkBrown);
  } else f.dot([0, my, front(FC, FR, 0, my)], P.darkBrown, 1, 1, { tol: 1.6 });
  m.merge(pose.look ? f.transform(rotY(pose.look), [0, 0, 0]) : f);
  let out = m;
  if (lunge) out = out.transform(rotX(0.35 * lunge), [0, 1, 0], [0, 0, lunge * 2.5]);
  if (pose.hurt) out = out.transform(rotX(-0.3), [0, 0.5, -1], [0, 0, -0.8]);
  return out;
}
CREATURES2.enemy_chili = {
  charset: () => charsetOf((i) => chili({ step: [-1, 0, 1][i], bob: i === 1 ? 0 : 0.4, small: true }), 24, 32,
    { fx: (c, i, back) => flameAura(c, 3 + i * 5 + (back ? 2 : 0), { height: 3 }) }),
  battler: () => {
    const k = 1.7, L = 0.5;
    const ms = [chili({ look: L }), chili({ look: L, bob: 0.3 }), chili({ look: L * 0.6, lunge: 1, step: 0.5 }), chili({ look: L, hurt: 1 })];
    return battlerOf(ms.map((m) => scaleModel(m.translate([0, 0, -1]), k)), 40, 40, {
      yaw: 0.7, fx: (c, i) => (i === 3 ? c : flameAura(c, 20 + i * 9, { height: i === 2 ? 8 : 6, side: i === 2 ? 2 : 1.4 })),
    });
  },
  face: () => {
    const p = new FlatPortrait({ bg: '3e2731', shape: { type: 'sun', color: 'be4a2f', bg: '3e2731', x: 24, y: 24, r: 21 } });
    p.mat('flame', 'feae34', 'f77622', 0.55).mat('flame2', 'fee761').mat('pod', 'e43b44', 'a22633', 0.58).mat('cap', '63c74d', '3e8948', 0.55).mat('stem', '265c42').mat('teeth', 'ffffff').mat('mouth', '3e2731');
    // flame halo behind the head
    p.poly('flame', [[6, 48], [4, 30], [9, 34], [9, 18], [15, 25], [18, 8], [23, 18], [28, 6], [31, 19], [37, 10], [38, 26], [44, 20], [43, 34], [46, 48]]);
    p.poly('flame2', [[12, 48], [11, 34], [15, 37], [17, 24], [22, 31], [26, 20], [29, 30], [34, 23], [35, 36], [38, 33], [37, 48]]);
    p.poly('pod', [[14, 20], [34, 20], [35.5, 32], [32, 42], [28, 47], [24, 48], [18, 48], [14.5, 38], [13, 28]]);
    p.ell('pod', 24, 22, 10.5, 5);
    p.ell('cap', 24, 17.5, 11, 4);
    for (const x of [15, 20, 28, 33]) p.poly('cap', [[x - 2.5, 18], [x, 23.5], [x + 2.5, 18]]);
    p.poly('stem', [[22.5, 15], [25.5, 15], [26, 9], [30, 5.5], [31, 7.5], [28, 10], [27.8, 15]]);
    p.poly('mouth', [[17.5, 34], [30.5, 34], [30, 38.5], [18, 38.5]]);
    p.poly('teeth', [[18.5, 35], [29.5, 35], [29.5, 37.5], [18.5, 37.5]]);
    p.post((c) => {
      const k = H('181425');
      for (let x = 20; x <= 28; x += 3) c.fillRect(x, 35, 1, 3, H('3e2731'));
      c.fillRect(18, 28, 3, 2, H('fee761')); c.fillRect(27, 28, 3, 2, H('fee761'));
      c.set(19, 28, k); c.set(28, 28, k); c.set(19, 29, k); c.set(28, 29, k);
      c.line(16, 24, 22, 27, k); c.line(16, 25, 22, 28, k); c.line(32, 24, 26, 27, k); c.line(32, 25, 26, 28, k);
    });
    return p.render();
  },
};

// ---------------------------------------------------------------- 5. toads (bog toad, grave toad boss)
export const BOG_TOAD = {
  skin: [P.darkBrown, P.greenDeep, P.greenDark, mix(P.greenDark, P.sand, 0.45)],
  wart: [P.darkBrown, P.brown, P.clay, P.tan],
  belly: [P.tan, P.gold, P.yellow, P.yellow],
  sac: [P.gold, P.yellow, X.sandPale, P.white],
  eye: [P.tan, P.gold, P.yellow, P.yellow], pupil: P.ink, mouth: [P.darkBrown, P.darkRed, P.red, P.pink],
  sacSize: 1,
};
export const GRAVE_TOAD = {
  skin: [mix(P.teal, P.ink, 0.45), mix(P.greenDeep, P.slate, 0.5), mix(P.greenDark, P.grey3, 0.55), mix(P.greenDark, P.grey2, 0.5)],
  wart: [P.ink, X.purpleDark, mix(P.purple, P.grey3, 0.4), mix(P.purple, P.grey2, 0.4)],
  belly: [mix(P.greenDeep, P.slate, 0.5), mix(P.greenDark, P.grey3, 0.4), mix(P.grey2, P.sand, 0.35), mix(P.grey1, P.sandLight, 0.3)],
  eye: P.green, glow: true, pupil: P.ink, mouth: [P.ink, X.purpleDark, P.darkRed, P.red],
  bone: [P.clay, P.sand, P.sandLight, X.sandPale], rot: [P.ink, P.ink, P.darkBrown, X.purpleDark],
  ribs: true, skulls: true, teeth: true, sacSize: 0, bloat: 1.18, bigHead: 1.08,
};
/** pose: { step -1..1 (hop phase), sac 0..1, open 0..1 (jaw), tongue 0..1, hurt, lunge } */
function toad(look, pose = {}) {
  const m = new Model();
  const st = pose.step ?? 0, open = pose.open ?? 0, bl = look.bloat ?? 1;
  const crouch = st < 0 ? -0.5 : st > 0 ? 0.4 : 0;
  const C = [0, 4.3 * bl + crouch, -0.6], R = [5.0 * bl, 3.7 * bl, 5.4 * bl];
  const skin = (h) => {
    const p = h.p;
    // exposed ribs on the flanks (grave toad)
    if (look.ribs) {
      const side = Math.abs(p[0]) > R[0] * 0.72 && p[1] > C[1] - 1.2 && p[1] < C[1] + 1.9 && p[2] > C[2] - 3.4 && p[2] < C[2] + 1.2 && (p[0] > 0 ? p[2] > C[2] - 1.5 : p[2] < C[2] + 0.2);
      if (side) return ((p[2] - C[2]) * 0.75 + 10) % 1 < 0.36 ? look.bone : look.rot;
      if (p[1] > C[1] + 2.8 && Math.abs(p[0] + 1.3) < 1.1 && p[2] < C[2] - 1 && p[2] > C[2] - 4) return (p[2] * 0.9 + 10) % 1 < 0.45 ? look.bone : look.rot; // spine
    }
    if (p[1] < C[1] - 0.6 * bl && p[2] > C[2] + 1.5) return look.belly;
    return look.skin;
  };
  m.add(ellipsoid(C, R), skin, 'body');
  // head: upper skull hinges up when the maw opens
  const hinge = [0, C[1] + 0.9, C[2] + 2.6 * bl];
  const head = new Model();
  const hb = look.bigHead ?? 1, HC = [0, C[1] + 1.4, C[2] + 4.6 * bl], HR = [4.4 * bl * hb, 2.3 * bl * hb, 3.3 * bl * hb];
  head.add(ellipsoid(HC, HR), look.skin, 'head');
  for (const side of [1, -1]) {
    const ec = [side * 2.4 * bl, HC[1] + 1.9 * bl, HC[2] - 0.2], er = 1.3 * bl;
    head.add(sphere(ec, er), look.glow ? (h) => (h.p[2] > ec[2] - 0.25 * er && h.p[1] > ec[1] - 0.75 * er ? (h.p[1] > ec[1] + 0.35 * er && h.p[0] * side < ec[0] * side ? P.yellow : look.eye) : look.skin) : (h) => (h.p[1] > ec[1] - 0.4 && h.p[2] > ec[2] - 0.1 ? look.eye : look.skin), 'eye' + side);
    const pz = ec[2] + er * 0.93;
    if (pose.hurt) head.line([ec[0] - 0.6, ec[1] + 0.2, pz], [ec[0] + 0.6, ec[1] - 0.3, pz], P.ink, { bias: 0.8 });
    else head.dot([ec[0] + side * 0.15, ec[1] + 0.1, pz], look.pupil, 1, look.glow ? 2 : 1, { tol: 1.8 });
    // brow ridge
    head.add(ellipsoid([ec[0], ec[1] + er * 0.9, ec[2] - 0.45], [er * 1.0, er * 0.32, er * 0.8], rotZ(side * -0.25)), look.skin, 'eye' + side);
  }
  const jaw = new Model();
  const JC = [0, C[1] + 0.1, C[2] + 4.4 * bl], JR = [4.3 * bl, 1.5 * bl, 3.2 * bl];
  jaw.add(ellipsoid(JC, JR), (h) => (h.p[1] < JC[1] - 0.3 ? look.belly : look.skin), 'jaw');
  // mouth interior (visible when open)
  m.add(ellipsoid([0, C[1] + 0.8, C[2] + 4.2 * bl], [3.7 * bl, 1.2 * bl + open * 1.3 * bl, 2.8 * bl]), look.mouth, 'maw');
  if (look.teeth && open > 0.2) for (let i = -3; i <= 3; i++) {
    const a = i * 0.28, tx = Math.sin(a) * 3.4 * bl, tz = C[2] + 4.2 * bl + Math.cos(a) * 2.7 * bl;
    jaw.add(roundCone([tx, JC[1] + 1.0, tz], [tx, JC[1] + 1.9 + (i % 2 ? 0 : 0.4), tz], 0.35, 0.08), look.bone, 'teeth');
    head.add(roundCone([tx * 0.97, HC[1] - 1.7, tz - 0.1], [tx * 0.97, HC[1] - 2.6 - (i % 2 ? 0.4 : 0), tz - 0.1], 0.35, 0.08), look.bone, 'teeth');
  }
  if (!open) {
    // closed: a long dark lip line around the snout
    for (let i = -4; i < 4; i++) {
      const a0 = i * 0.33, a1 = (i + 1) * 0.33;
      const pt = (a) => [Math.sin(a) * 4.35 * bl, C[1] + 0.95 - Math.abs(Math.sin(a)) * 0.3, C[2] + 4.5 * bl + Math.cos(a) * 3.35 * bl];
      m.line(pt(a0), pt(a1), look.pupil === P.ink ? P.darkBrown : P.ink, { bias: 0.9 });
    }
  }
  m.merge(open ? head.transform(rotX(-0.7 * open), hinge) : head);
  m.merge(open ? jaw.transform(rotX(0.4 * open), hinge) : jaw);
  // throat sac
  const sac = (pose.sac ?? 0.2) * (look.sacSize ?? 1);
  if (sac > 0) m.add(sphere([0, C[1] - 1.3 - sac * 0.3, C[2] + 5.6 * bl + sac * 0.4], 1.0 + sac * 1.8), look.sac, 'sac');
  // tongue
  if (pose.tongue) {
    const t0 = [0, C[1] + 0.8, C[2] + 6.2 * bl], t1 = [0, C[1] + 0.8 - pose.tongue * 1.2, C[2] + 6.2 * bl + pose.tongue * 9];
    m.add(capsule(t0, t1, 0.6), s(look.mouth, 0.5), 'tongue');
    m.add(sphere(t1, 1.1), s(look.mouth, 0.7), 'tongue');
  }
  // warts
  for (let i = 0; i < 14; i++) {
    const a = hash(7, i, 1) * Math.PI * 2, e = 0.15 + hash(7, i, 2) * 0.75;
    const p = [C[0] + Math.cos(a) * R[0] * Math.cos(e) * 0.96, C[1] + Math.sin(e) * R[1] * 0.96, C[2] + Math.sin(a) * R[2] * Math.cos(e) * 0.96];
    if (look.ribs && Math.abs(p[0]) > R[0] * 0.6 && p[1] < C[1] + 2) continue;
    m.add(sphere(p, (0.45 + hash(7, i, 3) * 0.35) * bl), s(look.wart, 0.3), 'body');
  }
  // legs: big folded hind legs, front legs planted forward
  const hop = st > 0 ? 0.6 : 0;
  for (const side of [1, -1]) {
    m.add(ellipsoid([side * 4.3 * bl, C[1] - 1.1, C[2] - 2.2 * bl], [1.8 * bl, 2.1 * bl, 3.0 * bl], rotX(0.5)), look.skin, 'thigh' + side);
    m.add(ellipsoid([side * 5.0 * bl, 0.55, C[2] - 0.6 * bl + hop], [1.3 * bl, 0.55, 2.6 * bl], rotY(side * 0.35)), s(look.skin, -0.2), 'thigh' + side);
    const fz = C[2] + 5.5 * bl + (side * st) * 0.8, lift = Math.max(0, side * st) * 0.7;
    m.add(capsule([side * 3.3 * bl, C[1] - 0.5, C[2] + 3.4 * bl], [side * 3.9 * bl, 0.8 + lift, fz], 0.8 * bl), look.skin, 'arm' + side);
    m.add(ellipsoid([side * 4.1 * bl, 0.45 + lift, fz + 0.6], [1.1 * bl, 0.45, 1.3 * bl]), s(look.skin, -0.2), 'arm' + side);
  }
  // necklace of skulls on a cord under the jaw
  if (look.skulls) {
    const ring = (a) => [Math.sin(a) * 4.9 * bl, C[1] - 1.0 * bl + Math.cos(a * 1.2) * 0.4, C[2] + 3.2 * bl + Math.cos(a) * 3.3 * bl];
    for (let i = -6; i < 6; i++) m.add(capsule(ring(i * 0.2), ring((i + 1) * 0.2), 0.22 * bl), s(RAMPS.leather, -0.3), 'cord');
    for (let i = -2; i <= 2; i++) {
      const a = i * 0.45, p = ring(a), out = [Math.sin(a), 0, Math.cos(a)];
      const sc = p.map((v, j) => v + out[j] * 0.55 * bl), sr = 0.95 * bl;
      m.add(sphere(sc, sr), look.bone, 'skull' + i);
      m.add(ellipsoid(add(sc, [0, -0.7 * sr, 0.2 * sr]), [0.6 * sr, 0.45 * sr, 0.6 * sr], rotY(a)), look.bone, 'skull' + i);
      const fz = add(sc, out.map((v) => v * sr * 0.95));
      for (const s2 of [-1, 1]) m.dot(add(fz, [Math.cos(a) * s2 * 0.35 * sr, 0.05, -Math.sin(a) * s2 * 0.35 * sr]), P.ink, 1, 1, { tol: 1.6 * bl });
    }
  }
  let out = m;
  if (pose.lunge) out = out.transform(rotX(0.12 * pose.lunge), [0, 0, C[2]], [0, 0.3, pose.lunge * 2.2]);
  if (pose.hurt) out = out.transform(rotX(-0.18), [0, 0, C[2] - 4], [0, 0, -0.8]);
  return out;
}
CREATURES2.enemy_bog_toad = {
  charset: () => charsetOf((i) => scaleModel(toad(BOG_TOAD, { step: [-1, 0, 1][i], sac: i === 1 ? 0.35 : 0.1 }), 0.95), 24, 32),
  battler: () => {
    const k = 2.0;
    const ms = [toad(BOG_TOAD, { sac: 0.2 }), toad(BOG_TOAD, { sac: 1, step: -1 }), toad(BOG_TOAD, { open: 0.5, tongue: 1, lunge: 0.4 }), toad(BOG_TOAD, { hurt: 1, sac: 0 })];
    return battlerOf(ms.map((m) => scaleModel(m.translate([0, 0, -2]), k)), 48, 40, { yaw: 0.85, pitch: 0.45 });
  },
  face: () => {
    const p = new FlatPortrait({ bg: '193c3e', shape: { type: 'band', color: '265c42', x: 24, y: 40, r: 16 } });
    p.mat('skin', '3e8948', '265c42', 0.6).mat('wart', 'b86f50', '733e39', 0.5).mat('belly', 'feae34', 'f77622', 0.65).mat('sac', 'fee761', 'feae34', 0.6)
      .mat('eye', 'feae34', 'd77643', 0.7).mat('lip', '3e2731').mat('lily', '63c74d', '3e8948', 0.5);
    p.ell('skin', 24, 36, 23, 14);
    p.ell('skin', 24, 27, 17, 10);
    p.ell('sac', 24, 41, 10, 7);
    p.ell('skin', 13, 17.5, 6, 5.5); p.ell('skin', 35, 17.5, 6, 5.5);
    p.ell('eye', 13, 17, 4.2, 4); p.ell('eye', 35, 17, 4.2, 4);
    for (const [x, y, r] of [[8, 30, 1.6], [40, 29, 1.8], [31, 24, 1.3], [18, 23.5, 1.2], [4, 40, 1.6], [44, 38, 1.5], [24, 21, 1.1]]) p.ell('wart', x, y, r);
    p.post((c) => {
      const k = H('181425');
      c.fillRect(11, 16, 5, 2, k); c.fillRect(33, 16, 5, 2, k);
      c.line(8, 31, 14, 33, H('3e2731')); c.line(14, 33, 34, 33, H('3e2731')); c.line(34, 33, 40, 31, H('3e2731'));
      c.set(20, 29, k); c.set(28, 29, k); // nostrils
      c.fillRect(20, 44, 4, 1, H('fee761'));
    });
    return p.render();
  },
};
CREATURES2.enemy_grave_toad = {
  charset: () => charsetOf((i) => scaleModel(toad(GRAVE_TOAD, { step: [-1, 0, 1][i], open: 0 }), 1.25), 32, 32),
  battler: () => {
    const k = 3.6;
    const ms = [toad(GRAVE_TOAD, {}), toad(GRAVE_TOAD, { step: -1, open: 0.25 }), toad(GRAVE_TOAD, { open: 1, lunge: 1 }), toad(GRAVE_TOAD, { hurt: 1 })];
    return battlerOf(ms.map((m) => scaleModel(m.translate([0, 0, -2]), k)), 96, 80, { yaw: 0.85, pitch: 0.45 });
  },
  face: () => {
    const p = new FlatPortrait({ bg: '262b44', shape: { type: 'disc', color: '45283c', x: 24, y: 22, r: 20 } });
    p.mat('skin', '5d7065', '3e5048', 0.6).mat('wart', '68386c', '45283c', 0.5).mat('belly', 'a9b0a6', '8b9bb4', 0.65).mat('maw', '181425').mat('gum', '45283c')
      .mat('bone', 'ead4aa', 'e4a672', 0.62).mat('socket', '181425').mat('cord', '733e39').mat('eye', '63c74d').mat('rot', '3e2731');
    p.ell('skin', 24, 38, 24, 14);
    p.ell('skin', 24, 25, 19, 11);
    p.ell('skin', 12, 15.5, 6.2, 5); p.ell('skin', 36, 15.5, 6.2, 5);
    // wide maw, slightly open with fangs
    p.poly('maw', [[7, 27], [41, 27], [37, 33], [24, 35], [11, 33]]);
    p.poly('gum', [[11, 31.5], [37, 31.5], [35, 33.4], [24, 35], [13, 33.4]]);
    for (let i = 0; i < 6; i++) { const x = 11 + i * 5.2; p.poly('bone', [[x, 27], [x + 2.4, 27], [x + 1.2, 30.2]]); }
    // exposed ribs on the flank
    p.ell('rot', 42, 32, 4.5, 5);
    for (let i = 0; i < 3; i++) p.line('bone', 38.5, 29 + i * 3, 46, 28 + i * 3.2, 1.5);
    // skull necklace
    const cordY = (x) => 40 + Math.cos((x - 24) / 13) * 2.5 - 2.5 + ((x - 24) / 12) ** 2 * -1.5;
    for (let x = 3; x < 45; x += 2) p.line('cord', x, cordY(x) + 1, x + 2, cordY(x + 2) + 1, 1.2);
    for (const x of [8, 16, 24, 32, 40]) {
      const y = cordY(x) + 3;
      p.ell('bone', x, y, 3.4, 3.1);
      p.rect('bone', x - 1.8, y + 1.5, 3.6, 2.6);
      p.ell('socket', x - 1.3, y, 1.0, 1.1); p.ell('socket', x + 1.3, y, 1.0, 1.1);
    }
    p.ell('wart', 20, 20.5, 1.3); p.ell('wart', 31, 21.5, 1.1); p.ell('wart', 4, 34, 1.6);
    p.post((c) => {
      const g = H('63c74d'), gl = H('ffffff'), k = H('181425');
      for (const x of [12, 36]) { c.ellipse(x, 15, 3.3, 2.6, g); c.fillRect(x - 1, 13, 1, 4, k); c.set(x - 2, 14, gl); }
      for (const x of [8, 16, 24, 32, 40]) { const y = Math.round(cordY(x) + 7); c.set(x - 1, y, k); c.set(x + 1, y, k); } // skull teeth gaps
    });
    return p.render();
  },
};

// ---------------------------------------------------------------- 6. pumpkin king (boss)
const PUMPKIN = RAMPS.orange;
const VINE = [P.teal, P.greenDeep, P.greenDark, P.green];
const inPoly = (pts, x, y) => {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
};
const scalePoly = (pts, k) => { const cx = pts.reduce((a, p) => a + p[0], 0) / pts.length, cy = pts.reduce((a, p) => a + p[1], 0) / pts.length; return pts.map(([x, y]) => [cx + (x - cx) * k, cy + (y - cy) * k]); };
/** Carved jack-o'-lantern face in face-plane coords (x right, y up, relative to the pumpkin centre). */
function lanternFace(mouthOpen = 0) {
  const eyeL = [[-3.7, 1.0], [-1.0, 0.3], [-1.6, 2.9]], eyeR = eyeL.map(([x, y]) => [-x, y]);
  const nose = [[-0.6, -0.6], [0.6, -0.6], [0, 0.5]];
  const mo = mouthOpen * 0.9;
  const mouth = [[-4.3, -1.3], [-3.2, -1.9], [-2.3, -1.4], [-1.6, -2.1], [-0.7, -1.6], [0, -2.2], [0.7, -1.6], [1.6, -2.1], [2.3, -1.4], [3.2, -1.9], [4.3, -1.3],
    [3.6, -3.1 - mo], [2.4, -3.8 - mo], [1.6, -3.2 - mo], [0.8, -3.9 - mo], [0, -3.3 - mo], [-0.8, -3.9 - mo], [-1.6, -3.2 - mo], [-2.4, -3.8 - mo], [-3.6, -3.1 - mo]];
  const shapes = [eyeL, eyeR, nose, mouth];
  return shapes.map((sh) => ({ core: scalePoly(sh, 0.62), glow: sh, rim: scalePoly(sh, 1.22) }));
}
/** pose: { step, bob, arm: [near, far] 0..1 lash, mouth, hurt, look, small, glow } */
function pumpkinKing(pose = {}) {
  const m = new Model();
  const st = pose.step ?? 0, look = pose.look ?? 0, b = pose.bob ?? 0;
  const C = [0, 5.8 + b, 0];
  const face = lanternFace(pose.mouth ?? 0);
  const cl = Math.cos(look), sl = Math.sin(look);
  const carve = (h) => {
    const x = h.p[0] - C[0], y = h.p[1] - C[1], z = h.p[2] - C[2];
    const lx = cl * x - sl * z, lz = sl * x + cl * z;
    if (lz > 1.5) {
      const fx = lx * 1.0, fy = y * 1.05 + 0.6;
      for (const s2 of face) {
        if (inPoly(s2.core, fx, fy)) return pose.hurt ? P.gold : P.yellow;
        if (inPoly(s2.glow, fx, fy)) return pose.hurt ? P.orange : P.gold;
        if (inPoly(s2.rim, fx, fy)) return P.brown;
      }
    }
    return null;
  };
  // ribbed pumpkin: ring of lobes
  const N = 8;
  for (let i = 0; i < N; i++) {
    const th = (i / N) * Math.PI * 2;
    m.add(ellipsoid([Math.sin(th) * 3.4, C[1], Math.cos(th) * 3.4], [3.6, 4.6, 3.6], rotY(th)), (h) => carve(h) ?? s(PUMPKIN, 0.15), 'body');
  }
  m.add(ellipsoid(C, [6.1, 4.8, 6.1]), (h) => carve(h) ?? s(PUMPKIN, 0.1), 'body');
  const top = C[1] + 4.5;
  // stem + leafy vine crown
  m.add(roundCone([0, top - 0.5, 0], [0.3, top + 2.2, -0.4], 1.1, 0.75), [P.darkBrown, P.brown, P.greenDeep, P.greenDark], 'stem');
  for (let i = 0; i < 7; i++) {
    const th = (i / 7) * Math.PI * 2 + 0.2;
    const rot = mmul(rotY(th), rotX(-0.95));
    m.add(ellipsoid([Math.sin(th) * 2.6, top + 0.9, Math.cos(th) * 2.6], [0.95, 0.35, 2.2], rot), s(VINE, i % 2 ? 0.25 : -0.05), 'crown');
  }
  for (let i = 0; i < 12; i++) {
    const a0 = (i / 12) * Math.PI * 2, a1 = ((i + 1) / 12) * Math.PI * 2, r0 = 3.2;
    m.add(capsule([Math.sin(a0) * r0, top + 0.1 + Math.sin(a0 * 3) * 0.2, Math.cos(a0) * r0], [Math.sin(a1) * r0, top + 0.1 + Math.sin(a1 * 3) * 0.2, Math.cos(a1) * r0], 0.45), s(VINE, -0.3), 'crown');
  }
  // vine arms: shoulder -> elbow -> hand with tendril fingers, leaves along the vine
  const arms = pose.arm ?? [0, 0];
  [1, -1].forEach((side, k) => {
    const a = arms[k], sw = side * st * 0.8;
    const sh = [side * 5.2, C[1] + 1.0, 0.6];
    const el = [side * lerp(8.0, 7.2, a), C[1] + lerp(-0.8, 2.5, a), lerp(1.5 + sw, 5.5, a)];
    const hd = [side * lerp(7.6, 5.5, a), C[1] + lerp(-3.6, 1.5, a), lerp(3.4 + sw, 11.5, a)];
    const pts = [sh, [lerp(sh[0], el[0], 0.5) + side * 0.6, lerp(sh[1], el[1], 0.5) + 0.8, lerp(sh[2], el[2], 0.5)], el, hd];
    for (let i = 0; i + 1 < pts.length; i++) m.add(roundCone(pts[i], pts[i + 1], 0.8 - i * 0.12, 0.7 - i * 0.12), s(VINE, 0.1), 'arm' + side);
    for (let i = 0; i < 3; i++) {
      const p = pts[i + 1];
      m.add(ellipsoid(add(p, [side * 0.8, 0.6, -0.3]), [0.8, 0.3, 1.5], mmul(rotY(side * 1.2), rotX(-0.5))), s(VINE, 0.3), 'leafA' + side + i);
    }
    const dir = [hd[0] - el[0], hd[1] - el[1], hd[2] - el[2]], dl = Math.hypot(...dir);
    const u = dir.map((v) => v / dl);
    for (const [ox, oy] of [[-0.6, 0.3], [0.1, -0.5], [0.7, 0.4]]) {
      const tip = add(hd, [u[0] * 2.0 + side * ox, u[1] * 2.0 + oy, u[2] * 2.0]);
      const curl = add(tip, [side * 0.5, -0.7, -0.2]);
      m.add(capsule(hd, tip, 0.35), s(VINE, 0.2), 'arm' + side);
      m.add(capsule(tip, curl, 0.25), s(VINE, 0.2), 'arm' + side);
    }
  });
  // root feet: tendrils spreading on the ground
  for (let i = 0; i < 6; i++) {
    const th = (i / 6) * Math.PI * 2 + 0.5, ph = (i % 2 ? 1 : -1) * st;
    const r0 = [Math.sin(th) * 3.5, C[1] - 4.0, Math.cos(th) * 3.5];
    const r1 = [Math.sin(th) * 5.4, 0.9 + Math.max(0, ph) * 0.7, Math.cos(th) * 5.4 + ph * 0.7];
    const r2 = [Math.sin(th + 0.25) * 6.8, 0.35, Math.cos(th + 0.25) * 6.8 + ph * 0.7];
    m.add(roundCone(r0, r1, 0.8, 0.55), s(VINE, -0.3), 'root' + i);
    m.add(roundCone(r1, r2, 0.55, 0.3), s(VINE, -0.3), 'root' + i);
  }
  let out = m;
  if (pose.hurt) out = out.transform(rotX(-0.2), [0, 0, -3], [0, 0, -0.8]);
  return out;
}
CREATURES2.enemy_pumpkin_king = {
  charset: () => charsetOf((i) => scaleModel(pumpkinKing({ step: [-1, 0, 1][i], bob: i === 1 ? 0 : 0.3, small: true }), 1.2), 32, 32),
  battler: () => {
    const k = 3.7, L = 0.45;
    const ms = [pumpkinKing({ look: L }), pumpkinKing({ look: L, bob: 0.3, arm: [0.2, 0.15], mouth: 0.4 }), pumpkinKing({ look: L, arm: [0.1, 1], mouth: 1, step: 0.5 }), pumpkinKing({ look: L, hurt: 1, arm: [0.1, 0], mouth: 0.2 })];
    return battlerOf(ms.map((m) => scaleModel(m.translate([0, 0, -2.5]), k)), 96, 80, { yaw: 0.8, pitch: 0.4 });
  },
  face: () => {
    const p = new FlatPortrait({ bg: '262b44', shape: { type: 'disc', color: '45283c', x: 34, y: 12, r: 10 } });
    p.mat('lobe', 'f77622', 'be4a2f', 0.6).mat('lobe2', 'feae34', 'f77622', 0.6).mat('glow', 'fee761').mat('glow2', 'feae34').mat('rim', '733e39')
      .mat('vine', '63c74d', '3e8948', 0.55).mat('stem', '3e8948', '265c42', 0.5);
    for (const [x, rx, mat] of [[8, 9, 'lobe'], [40, 9, 'lobe'], [15, 10, 'lobe2'], [33, 10, 'lobe2'], [24, 11, 'lobe']]) p.ell(mat, x, 33, rx, 15.5 - Math.abs(x - 24) * 0.12);
    // leafy vine crown following the top of the pumpkin
    const topY = (x) => 18.5 + ((x - 24) / 20) ** 2 * 7;
    p.poly('stem', [[21.5, 20], [26.5, 20], [27.5, 9], [23, 10]]);
    for (const [x, h, lean] of [[8, 8, -3], [14, 11, -2], [20, 13, -1], [28, 13, 1], [34, 11, 2], [40, 8, 3]]) p.poly('vine', [[x - 3.2, topY(x - 3.2) + 1], [x + lean, topY(x) - h], [x + 3.2, topY(x + 3.2) + 1]]);
    for (let x = 4; x < 44; x += 2) p.line('vine', x, topY(x), x + 2, topY(x + 2), 3);
    // carved face
    const F = [[[10, 29], [19, 31], [16, 24]], [[38, 29], [29, 31], [32, 24]], [[22.5, 35], [25.5, 35], [24, 32]],
      [[9, 37], [13, 36], [15, 38.5], [18, 37], [21, 39], [24, 37.5], [27, 39], [30, 37], [33, 38.5], [35, 36], [39, 37], [37, 42], [33, 44], [30, 42.5], [27, 44.5], [24, 43], [21, 44.5], [18, 42.5], [15, 44], [11, 42]]];
    for (const sh of F) { p.poly('rim', scalePoly(sh, 1.18)); p.poly('glow2', sh); p.poly('glow', scalePoly(sh, 0.6)); }
    return p.render();
  },
};

// ---------------------------------------------------------------- 7. mirage djinn (boss)
const DJINN_SKIN = [P.brown, P.clay, P.tan, P.sand];
const DJINN_SAND = [P.clay, P.sand, P.sandLight, X.sandPale];
const GOLD = RAMPS.gold;
/** pose: { bob, swirl (tail phase), arms: 'cross' | 'raise' | 'thrust' | 'limp', hurt, look } */
function djinn(pose = {}) {
  const m = new Model(), f = new Model();
  const b = pose.bob ?? 0, ph = pose.swirl ?? 0;
  const Y = 9 + b; // waist height
  const swirlMat = (base) => (h) => {
    const a = Math.atan2(h.p[0], h.p[2]);
    const v = Math.sin(a * 2 + h.p[1] * 1.3 + ph * 2);
    return v > 0.55 ? s(base, 0.5) : v < -0.6 ? s(base, -0.4) : base;
  };
  // whirling sand tail: tapering spiral down to a point
  const N = 9, pts = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const r = 1.6 * (1 - t) * Math.sin(t * Math.PI * 0.9 + 0.2);
    pts.push([Math.sin(t * 7 + ph) * r, Y - 1 - t * 8.0, Math.cos(t * 7 + ph) * r * 0.8 - t * t * 3.0, lerp(2.1, 0.2, Math.pow(t, 0.7))]);
  }
  for (let i = 0; i < N; i++) m.add(roundCone(pts[i].slice(0, 3), pts[i + 1].slice(0, 3), pts[i][3], pts[i + 1][3]), swirlMat(DJINN_SAND), 'tail');
  // sand streams whirling around the tail
  for (let j = 0; j < 2; j++) {
    let prev = null;
    for (let i = 0; i <= 14; i++) {
      const t = i / 14, a = t * 9 + ph * 1.5 + j * Math.PI;
      const c = pts[Math.min(N, Math.round(t * N))], rr = c[3] + 0.9 * (1 - t) + 0.3;
      const p = [c[0] + Math.sin(a) * rr, c[1] + 0.4, c[2] + Math.cos(a) * rr];
      if (prev) m.add(capsule(prev, p, 0.28 * (1 - t) + 0.1), s(DJINN_SAND, 0.6), 'stream' + j);
      prev = p;
    }
  }
  // torso
  const skin = swirlMat(DJINN_SKIN);
  m.add(ellipsoid([0, Y + 1.4, 0.1], [2.0, 2.0, 1.6]), skin, 'body');
  m.add(ellipsoid([0, Y + 4.3, 0.1], [3.9, 2.3, 2.1]), skin, 'body');
  for (const side of [1, -1]) m.add(ellipsoid([side * 1.5, Y + 4.5, 1.1], [1.7, 1.2, 1.1]), s(DJINN_SKIN, 0.2), 'body');
  for (const yy of [1.0, 2.1]) m.line([-0.9, Y + yy, 1.62], [0.9, Y + yy, 1.62], P.brown, { bias: 0.6 });
  // sash + belt
  m.add(ellipsoid([0, Y + 0.1, 0.1], [2.8, 0.8, 2.1]), [X.purpleDark, P.purple, P.magenta, P.pink], 'sash');
  m.add(sphere([0, Y + 0.2, 2.1], 0.55), RAMPS.blue, 'gem');
  // head
  const HC = [0, Y + 7.8, 0.4];
  m.add(sphere(HC, 1.75), DJINN_SKIN, 'head');
  m.add(roundCone(add(HC, [0, -1.2, 1.2]), add(HC, [0, -2.6, 1.3]), 0.55, 0.15), s(DJINN_SAND, -0.2), 'head'); // goatee
  m.add(roundCone(add(HC, [0, 1.4, -0.9]), add(HC, [0, 2.4, -1.9]), 0.55, 0.3), DJINN_SAND, 'hair'); // topknot
  m.add(roundCone(add(HC, [0, 2.4, -1.9]), add(HC, [0.3, 2.5, -3.6]), 0.3, 0.1), DJINN_SAND, 'hair');
  m.add(ellipsoid(add(HC, [0, 1.25, -0.3]), [0.9, 0.4, 0.9]), GOLD, 'crown');
  for (const side of [1, -1]) m.add(sphere(add(HC, [side * 1.75, -0.6, 0]), 0.45), GOLD, 'ear' + side);
  // glowing turquoise eyes
  for (const side of [1, -1]) {
    const ep = [side * 0.65, HC[1] + 0.15, front(HC, [1.75, 1.75, 1.75], side * 0.65, HC[1] + 0.15, 0.1)];
    if (pose.hurt) f.line(add(ep, [-0.4, 0.2, 0]), add(ep, [0.4, -0.2, 0]), P.ink);
    else f.dot(ep, P.cyan, 1, 1, { tol: 1.6 });
    f.line(add(ep, [-side * 0.1, 0.55, 0]), add(ep, [side * 0.6, 0.75, -0.2]), P.darkBrown);
  }
  m.merge(pose.look ? f.transform(rotY(pose.look), HC) : f);
  // necklace
  for (let i = 0; i < 10; i++) {
    const a0 = -1.3 + (i / 10) * 2.6, a1 = -1.3 + ((i + 1) / 10) * 2.6;
    const pt = (a) => [Math.sin(a) * 2.0, Y + 5.6 - Math.cos(a) * 1.1, Math.cos(a) * 1.9 + 0.25];
    m.add(capsule(pt(a0), pt(a1), 0.28), GOLD, 'neck');
  }
  m.add(sphere([0, Y + 4.4, 2.2], 0.5), RAMPS.blue, 'neck');
  // arms
  const mode = pose.arms ?? 'cross';
  for (const side of [1, -1]) {
    const sh = [side * 3.6, Y + 5.2, 0];
    let el, hd;
    if (mode === 'cross') { el = [side * 4.4, Y + 2.6, 1.2]; hd = [-side * 1.4, Y + 3.4 + (side > 0 ? 0.35 : 0), 3.0]; }
    else if (mode === 'raise') { el = [side * 5.6, Y + 6.2, 0.4]; hd = [side * 5.2, Y + 9.2, 1.0]; }
    else if (mode === 'thrust') {
      if (side > 0) { el = [4.4, Y + 5.6, 3.4]; hd = [3.6, Y + 6.4, 7.6]; }
      else { el = [-5.2, Y + 3.2, -1.0]; hd = [-5.4, Y + 5.6, -2.8]; }
    } else { el = [side * 4.6, Y + 2.4, -0.6]; hd = [side * 4.8, Y - 0.2, 0.4]; }
    m.add(sphere(sh, 1.65), skin, 'arm' + side);
    m.add(roundCone(sh, el, 1.3, 0.95), skin, 'arm' + side);
    m.add(roundCone(el, hd, 1.05, 0.75), skin, 'arm' + side);
    m.add(sphere(hd, 0.85), DJINN_SKIN, 'hand' + side);
    if (mode === 'thrust' && side > 0) { // sand-wind orb in the open palm
      m.add(sphere(add(hd, [0, 0.2, 2.0]), 1.5), [P.blueDark, P.blue, P.cyan, P.white], 'orb');
      for (let i = 0; i < 3; i++) { const a = i * 2.1; m.add(capsule(add(hd, [Math.sin(a) * 2.2, Math.cos(a) * 2.2, 2.0]), add(hd, [Math.sin(a + 1) * 2.2, Math.cos(a + 1) * 2.2, 2.6]), 0.25), s(DJINN_SAND, 0.6), 'orb'); }
    }
    // gold armband + bracer
    const ab = [lerp(sh[0], el[0], 0.45), lerp(sh[1], el[1], 0.45), lerp(sh[2], el[2], 0.45)];
    m.add(capsule(ab, [lerp(sh[0], el[0], 0.58), lerp(sh[1], el[1], 0.58), lerp(sh[2], el[2], 0.58)], 1.18), GOLD, 'band' + side);
    m.add(capsule([lerp(el[0], hd[0], 0.55), lerp(el[1], hd[1], 0.55), lerp(el[2], hd[2], 0.55)], [lerp(el[0], hd[0], 0.85), lerp(el[1], hd[1], 0.85), lerp(el[2], hd[2], 0.85)], 0.95), GOLD, 'bracer' + side);
  }
  let out = m;
  if (pose.hurt) out = out.transform(rotX(-0.25), [0, Y, 0], [0, 0, -1]);
  return out;
}
/** Loose sand grains swirling around the tail. */
function sandGrains(c, seed, n, { x0, x1, y0, y1 }) {
  for (let i = 0; i < n; i++) {
    const x = Math.round(lerp(x0, x1, hash(seed, i, 1))), y = Math.round(lerp(y0, y1, hash(seed, i, 2)));
    if (c.alpha(x, y)) continue;
    c.set(x, y, hash(seed, i, 3) > 0.5 ? P.sandLight : P.sand);
    if (hash(seed, i, 4) > 0.6) c.set(x + 1, y, P.sand);
  }
  return c;
}
CREATURES2.enemy_mirage_djinn = {
  charset: () => charsetOf((i) => scaleModel(djinn({ bob: [0.3, 0, -0.3][i], swirl: i * 0.9 }), 1.15).translate([0, 2, 0]), 32, 32, {
    fixedOy: 31, fx: (c, i, back) => sandGrains(c, 5 + i + (back ? 9 : 0), 5, { x0: 9, x1: 23, y0: 18, y1: 29 }),
  }),
  battler: () => {
    const k = 3.9, L = 0.4;
    const ms = [djinn({ look: L }), djinn({ look: L, bob: 0.5, swirl: 1.2, arms: 'raise' }), djinn({ look: L * 0.5, swirl: 2.2, arms: 'thrust' }), djinn({ look: L, swirl: 0.6, arms: 'limp', hurt: 1 })];
    return battlerOf(ms.map((m) => scaleModel(m.translate([0, 0, -1]), k)), 96, 96, {
      yaw: 0.85, pitch: 0.3, align: 'center', oy: 86,
      fx: (c, i) => sandGrains(c, 30 + i * 7, 16, { x0: 26, x1: 70, y0: 50, y1: 92 }),
    });
  },
  face: () => {
    const p = new FlatPortrait({ bg: '124e89', shape: { type: 'sun', color: 'feae34', bg: '124e89', x: 24, y: 30, r: 20 } });
    p.mat('skin', 'd77643', 'b86f50', 0.6).mat('sand', 'ead4aa', 'e4a672', 0.6).mat('gold', 'fee761', 'feae34', 0.6).mat('gem', '2ce8f5', '0099db', 0.5).mat('sash', 'b55088').mat('ink', '181425').mat('brow', '733e39');
    // swirling sand tail/body behind
    p.poly('sand', [[4, 48], [9, 40], [16, 37], [32, 37], [39, 40], [44, 48]]);
    p.poly('skin', [[2, 48], [5, 39], [13, 34.5], [35, 34.5], [43, 39], [46, 48]]);
    p.ell('skin', 16, 41, 6.5, 4.5); p.ell('skin', 32, 41, 6.5, 4.5); // pecs
    // gold collar necklace with gem
    p.poly('gold', [[14, 34], [34, 34], [30, 39.5], [24, 41.5], [18, 39.5]]);
    p.poly('skin', [[17, 34], [31, 34], [28.5, 37.5], [24, 38.8], [19.5, 37.5]]);
    p.ell('gem', 24, 40.5, 1.8, 2);
    p.rect('skin', 21, 30, 6, 5);
    p.ell('skin', 24.4, 23.8, 7.3, 8.6);
    p.ell('gold', 16.8, 28, 1.4, 1.8); p.ell('gold', 32, 28, 1.4, 1.8); // earrings
    p.poly('sand', [[21.8, 31], [27, 31], [24.4, 37]]); // goatee
    p.ell('gold', 24.4, 15.8, 4.2, 1.8);
    p.poly('sand', [[22, 15], [23, 10], [26, 7.5], [31, 7], [34, 5], [33, 9], [29, 10.5], [27, 15]]); // swept topknot
    p.post((c) => {
      const cy = H('2ce8f5'), w = H('ffffff'), k = H('733e39');
      c.fillRect(19, 24, 3, 2, cy); c.fillRect(27, 24, 3, 2, cy); c.set(20, 24, w); c.set(28, 24, w);
      c.line(18, 21, 22, 22, k); c.line(31, 21, 27, 22, k);
      c.fillRect(22, 29, 5, 1, H('b86f50'));
    });
    return p.render();
  },
};

// ---------------------------------------------------------------- 8. mirage phantom
const PHANTOM = [mix(P.teal, P.cyan, 0.3), mix(P.cyan, P.grey2, 0.5), mix(P.cyan, P.white, 0.45), mix(P.cyan, P.white, 0.8)];
/** pose: { bob, sway, reach 0..1, hurt, look } */
function phantom(pose = {}) {
  const m = new Model(), f = new Model();
  const b = pose.bob ?? 0, sw = pose.sway ?? 0, r = pose.reach ?? 0;
  const HC = [0, 11.4 + b, 0.3];
  m.add(sphere(HC, 2.5), PHANTOM, 'head');
  m.add(roundCone([0, 8.4 + b, 0], [0, 5 + b, -0.5], 2.1, 2.9), PHANTOM, 'body');
  m.add(ellipsoid([0, 8.6 + b, 0], [3.1, 1.2, 2.0]), s(PHANTOM, 0.2), 'body'); // shoulders / shawl
  // wisps trailing to points
  for (const [x, z, k] of [[-1.6, 0.4, 0], [0.2, -1.0, 1], [1.7, 0.2, 2]]) {
    const sway = Math.sin(sw * 2 + k * 2.1) * 0.9;
    const mid = [x * 1.1 + sway * 0.5, 3.3 + b, z - 1.2];
    const tip = [x * 0.8 + sway, 0.6 + b + (k === 1 ? 0 : 0.8), z - 2.8 + (k === 1 ? -0.6 : 0)];
    m.add(roundCone([x * 0.8, 5.2 + b, z - 0.4], mid, 1.5, 0.9), s(PHANTOM, -0.2), 'body');
    m.add(roundCone(mid, tip, 0.9, 0.15), s(PHANTOM, -0.35), 'body');
  }
  // drifting sleeves
  for (const side of [1, -1]) {
    const sh = [side * 2.4, 8.6 + b, 0.3];
    const hd = [side * lerp(3.4, 2.2, r), lerp(6.3, 8.8, r) + b, lerp(2.4, 5.8, r)];
    m.add(roundCone(sh, hd, 1.0, 0.75), s(PHANTOM, 0.15), 'arm' + side);
    m.add(roundCone(hd, add(hd, [side * 0.2, -0.9, 0.9]), 0.55, 0.2), s(PHANTOM, 0.3), 'arm' + side);
  }
  // gold circlet + veil clasp
  for (let i = 0; i < 12; i++) {
    const a0 = (i / 12) * Math.PI * 2, a1 = ((i + 1) / 12) * Math.PI * 2;
    const pt = (a) => [Math.sin(a) * 2.45, HC[1] + 0.9 + Math.cos(a) * 0.35, HC[2] + Math.cos(a) * 2.45];
    m.add(capsule(pt(a0), pt(a1), 0.28), GOLD, 'circlet');
  }
  m.add(sphere([0, HC[1] + 1.3, HC[2] + 2.5], 0.5), GOLD, 'circlet');
  m.add(sphere([0, 8.2 + b, 2.4], 0.55), GOLD, 'clasp');
  // hollow eyes + mouth
  for (const side of [1, -1]) {
    const ep = [side * 0.95, HC[1] - 0.1, front(HC, [2.5, 2.5, 2.5], side * 0.95, HC[1] - 0.1)];
    f.dot(ep, P.ink, 1, pose.hurt ? 1 : 2, { tol: 1.6 });
  }
  f.dot([0, HC[1] - 1.3, front(HC, [2.5, 2.5, 2.5], 0, HC[1] - 1.3)], P.ink, 1, pose.hurt ? 2 : 1, { tol: 1.6 });
  m.merge(pose.look ? f.transform(rotY(pose.look), HC) : f);
  let out = m;
  if (pose.hurt) out = out.transform(rotX(-0.3), [0, 6, 0], [0, 0, -1]);
  return out;
}
/** Make a ghost translucent: body at alpha ~65%, outline softened to teal, wisps fade out, heat-haze row shimmer. */
function ghostly(c, phase, { haze = 1, fadeFrom = null } = {}) {
  const bb = c.bbox();
  if (!bb) return c;
  const out = new Canvas(c.width, c.height);
  const f0 = fadeFrom ?? Math.round(lerp(bb.y0, bb.y1, 0.62));
  const keep = new Set([P.ink >>> 0, P.gold >>> 0, P.yellow >>> 0, P.tan >>> 0, P.brown >>> 0]);
  for (let y = 0; y < c.height; y++) {
    const dx = haze ? Math.round(Math.sin(y * 0.55 + phase) * haze * (y > f0 - 4 ? 1 : 0.5)) : 0;
    for (let x = 0; x < c.width; x++) {
      const col = c.get(x - dx, y);
      if (!A(col)) continue;
      const isOutline = col >>> 0 === P.ink >>> 0 && !c.alpha(x - dx - 1, y) + !c.alpha(x - dx + 1, y) + !c.alpha(x - dx, y - 1) + !c.alpha(x - dx, y + 1) > 0;
      let a = keep.has(col >>> 0) ? 235 : 175;
      let cc = col;
      if (isOutline) { cc = P.teal; a = 210; }
      if (y > f0) a = Math.round(a * Math.max(0.15, 1 - (y - f0) / Math.max(1, bb.y1 - f0 + 1)));
      if (y > f0 && dither(x, y, (y - f0) / (bb.y1 - f0 + 1) * 0.6)) continue;
      out.set(x, y, withAlpha(cc, a));
    }
  }
  return out;
}
const dither = (x, y, t) => t * 16 > BAYER4[((y % 4) + 4) % 4][((x % 4) + 4) % 4] + 0.5;
CREATURES2.enemy_mirage_phantom = {
  charset: () => charsetOf((i) => phantom({ bob: [0.4, 0, -0.4][i], sway: i }).translate([0, 3, 0]), 24, 32, {
    fixedOy: 31, fx: (c, i, back) => ghostly(c, i * 2.1 + (back ? 1 : 0), { haze: 1 }),
  }),
  battler: () => {
    const k = 2.75, L = 0.45;
    const ms = [phantom({ look: L }), phantom({ look: L, bob: 0.5, sway: 1.3 }), phantom({ look: L * 0.6, reach: 1, sway: 2.2 }), phantom({ look: L, hurt: 1, sway: 0.6 })];
    return battlerOf(ms.map((m) => scaleModel(m.translate([0, -7.9, -0.5]), k)), 48, 48, {
      yaw: 0.85, pitch: 0.3, align: 'center', oy: 24, fx: (c, i) => ghostly(c, i * 1.7, { haze: 1 }),
    });
  },
  face: () => {
    const p = new FlatPortrait({ bg: 'e4a672', shape: { type: 'sun', color: 'feae34', bg: 'e4a672', x: 24, y: 26, r: 19 } });
    p.mat('ghost', 'b8f0ee', '6fc6cc', 0.6).mat('ghost2', '8fdcdc').mat('hole', '193c3e').mat('gold', 'fee761', 'feae34', 0.6);
    p.poly('ghost', [[8, 48], [10, 38], [15, 33], [33, 33], [38, 38], [40, 48]]);
    p.ell('ghost', 24, 24, 10, 11.5);
    p.poly('ghost2', [[13, 30], [8, 36], [5, 44], [9, 41], [11, 46], [14, 38]]);
    p.poly('ghost2', [[35, 30], [40, 36], [43, 44], [39, 41], [37, 46], [34, 38]]);
    p.poly('gold', [[14, 20], [34, 20], [34, 22], [14, 22]], (x, y) => ((x - 24) / 10) ** 2 + ((y - 24) / 11.5) ** 2 <= 1);
    p.ell('gold', 24, 19.5, 2, 2.2);
    p.ell('hole', 19.8, 26, 2.6, 3.4); p.ell('hole', 28.2, 26, 2.6, 3.4);
    p.ell('hole', 24, 32, 1.6, 2.2);
    p.ell('gold', 24, 38, 1.8);
    p.post((c) => {
      // heat haze: shimmer the lower rows sideways, translucent over the background
      const src = c.clone();
      for (let y = 30; y < 48; y++) { const dx = Math.round(Math.sin(y * 0.8) * 1.2); for (let x = 0; x < 48; x++) c.set(x, y, src.get(Math.min(47, Math.max(0, x - dx)), y)); }
      const bg = H('e4a672');
      for (let y = 36; y < 48; y++) for (let x = 0; x < 48; x++) if (c.get(x, y) !== bg && dither(x, y, (y - 36) / 16)) c.set(x, y, mix(c.get(x, y), bg, 0.5));
      c.set(19, 25, H('feae34')); c.set(27, 25, H('feae34'));
    });
    return p.render();
  },
};
