// Enemy creature models (scorpion, condor, emperor scorpion) and their sheets.
import {
  Model, ellipsoid, sphere, capsule, roundCone, box, cone, custom, render, Camera, shade, rotX, rotY, rotZ, mmul,
} from './sdf.mjs';
import { Canvas, sheet } from './raster.mjs';
import { P, RAMPS } from './palette.mjs';
import { portraitBackground, bottomAlign, fitOy } from './characters.mjs';

const s = shade;
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

// ---------------------------------------------------------------- scorpion
/**
 * pose: { legs: phase -1..1, tail: sway 0..1, strike: 0..1 (tail thrust forward),
 *         claws: open 0..1, claw forward reach, recoil }
 * look: { shell, legs, stinger, eyes, spikes (emperor), clawScale }
 */
export function scorpion(look, pose = {}) {
  const m = new Model();
  const shell = look.shell, legR = look.legs ?? s(look.shell, -0.5);
  const ph = pose.legs ?? 0, strike = pose.strike ?? 0, sway = pose.tail ?? 0;
  const cs = look.clawScale ?? 1;
  // prosoma (head/thorax)
  m.add(ellipsoid([0, 2.3, 1.6], [2.6, 1.35, 2.4]), s(shell, 0.2), 'body');
  // mesosoma segments
  for (let i = 0; i < 4; i++) {
    m.add(ellipsoid([0, 2.4 + i * 0.12, -0.9 - i * 1.55], [2.75 - i * 0.18, 1.4, 1.05]), s(shell, i % 2 ? -0.1 : 0.1), 'seg' + i);
  }
  // metasoma (tail): arc in the y-z plane; strike bends it forward
  const base = [0, 2.9, -6.4];
  const tailPts = [];
  const n = 5, r = 4.0 + strike * 0.6, a0 = 0.5;
  const C = [0, base[1] + r * Math.cos(a0), base[2] + r * Math.sin(a0)];
  for (let i = 0; i < n; i++) {
    const t = (i + 1) / n;
    const a = a0 + t * (2.75 + 0.9 * strike + sway * 0.25);
    tailPts.push([Math.sin(t * 2.5) * 0.9 * sway, C[1] - r * Math.cos(a), C[2] - r * Math.sin(a)]);
  }
  let prev = base;
  tailPts.forEach((p, i) => {
    m.add(ellipsoid(p, [1.25 - i * 0.07, 1.15 - i * 0.05, 1.15 - i * 0.05]), s(shell, i % 2 ? -0.15 : 0.1), 'tail' + i);
    m.add(capsule(prev, p, 0.8 - i * 0.05), s(shell, -0.4), 'tail' + i);
    prev = p;
  });
  const last = tailPts[n - 1];
  const dir = [0, last[1] - tailPts[n - 2][1], last[2] - tailPts[n - 2][2]];
  const dl = Math.hypot(...dir) || 1;
  const bulb = add(last, [0, (dir[1] / dl) * 1.6, (dir[2] / dl) * 1.6]);
  m.add(ellipsoid(bulb, [1.0, 1.0, 1.25]), look.stinger ?? s(shell, 0.1), 'sting');
  const tip = add(bulb, [0, -1.6 - strike * 0.4, 1.2 + strike * 0.8]);
  m.add(roundCone(add(bulb, [0, -0.4, 0.5]), tip, 0.55, 0.12), look.stingTip ?? RAMPS.iron, 'sting');
  // pedipalps (claws)
  const open = pose.claws ?? 0.3, reach = pose.reach ?? 0;
  for (const side of [1, -1]) {
    const root = [side * 1.6, 2.2, 3.2];
    const elbow = [side * (3.9 * cs), 2.7, 4.2 + reach * 0.8];
    const hand = [side * (3.4 * cs), 3.0, 6.4 * (0.9 + 0.1 * cs) + reach * 2];
    m.add(capsule(root, elbow, 0.75 * cs), s(shell, -0.2), 'arm' + side);
    m.add(capsule(elbow, hand, 0.7 * cs), s(shell, -0.2), 'arm' + side);
    m.add(ellipsoid(hand, [1.35 * cs, 1.05 * cs, 1.75 * cs], rotY(side * 0.15)), s(shell, 0.2), 'claw' + side);
    const fBase = add(hand, [0, 0, 1.3 * cs]);
    const ang = open * 0.6;
    m.add(roundCone(fBase, add(fBase, [side * (0.1 + ang) * 1.6 * cs, 0.25, 2.3 * cs]), 0.62 * cs, 0.15), s(shell, 0), 'claw' + side);
    m.add(roundCone(add(fBase, [-side * 0.5 * cs, 0, -0.2]), add(fBase, [-side * (0.8 + ang * 1.6) * cs, 0.1, 1.9 * cs]), 0.5 * cs, 0.12), s(shell, -0.2), 'claw' + side);
  }
  // legs (4 pairs)
  for (const side of [1, -1]) {
    for (let i = 0; i < 4; i++) {
      const z = 1.9 - i * 1.25;
      const phase = (i % 2 === 0 ? 1 : -1) * side * ph;
      const spread = (1.5 - i) * 0.9;
      const hip = [side * 2.1, 2.0, z];
      const knee = [side * 4.2, 3.3 + Math.max(0, phase) * 0.6, z + spread * 0.6 + phase * 0.5];
      const foot = [side * 5.3, 0.25, z + spread * 1.4 + phase * 0.7];
      m.add(capsule(hip, knee, 0.5), legR, 'leg' + side + i);
      m.add(roundCone(knee, foot, 0.45, 0.2), legR, 'leg' + side + i);
    }
  }
  // eyes
  for (const side of [1, -1]) m.dot([side * 0.55, 3.62, 2.7], look.eyes ?? P.ink, 1, 1, { tol: 1.4 });
  // emperor crown spikes
  if (look.spikes) {
    const spikes = [[0, 3.2, 2.2, 0, 6.2, 1.2], [1.2, 3.1, 1.6, 2.0, 5.6, 0.6], [-1.2, 3.1, 1.6, -2.0, 5.6, 0.6], [2.0, 2.9, 0.6, 3.2, 4.6, -0.2], [-2.0, 2.9, 0.6, -3.2, 4.6, -0.2]];
    for (const [x, y, z, tx, ty, tz] of spikes) m.add(roundCone([x, y, z], [tx, ty, tz], 0.55, 0.1), (h) => (h.p[1] > y + (ty - y) * 0.62 ? look.spikeTip : look.spikes), 'spike');
    for (let i = 0; i < 4; i++) for (const side of [1, -1])
      m.add(roundCone([side * 1.6, 3.4, -0.9 - i * 1.55], [side * 2.2, 4.5, -1.4 - i * 1.55], 0.38, 0.08), look.spikes, 'sp' + i);
  }
  let out = m;
  if (pose.recoil) out = out.transform(rotX(-pose.recoil), [0, 0, -2], [0, 0, -1.5]);
  if (look.scale && look.scale !== 1) out = scaleModel(out, look.scale);
  return out;
}

/** Uniform scale of a whole model about the origin. */
export function scaleModel(model, k) {
  const out = new Model();
  for (const p of model.parts) {
    const f = p.sdf, prevLocal = p.toLocal;
    const sdf = (x, y, z) => f(x / k, y / k, z / k) * k;
    sdf.b = [f.b[0] * k, f.b[1] * k, f.b[2] * k, f.b[3] * k];
    out.parts.push({ ...p, sdf, toLocal: (q) => { const r = [q[0] / k, q[1] / k, q[2] / k]; return prevLocal ? prevLocal(r) : r; } });
  }
  for (const l of model.lines) out.lines.push({ ...l, a: l.a.map((v) => v * k), b: l.b.map((v) => v * k) });
  for (const d of model.dots) out.dots.push({ ...d, p: d.p.map((v) => v * k), w: Math.max(1, Math.round(d.w * (k > 1.5 ? 2 : 1))), h: Math.max(1, Math.round(d.h * (k > 1.5 ? 2 : 1))), tol: (d.tol ?? 1.2) * k });
  return out;
}

export const SCORPION = { shell: RAMPS.scorpion, legs: s(RAMPS.scorpion, -0.6), stinger: s(RAMPS.scorpion, 0), stingTip: [P.ink, P.darkBrown, P.brown, P.clay], eyes: P.ink };
export const EMPEROR = {
  shell: s(RAMPS.emperor, -0.85), legs: s(RAMPS.emperor, -1.0), stinger: s(RAMPS.red, -0.3), stingTip: [P.ink, P.ink, P.navy, P.slate],
  eyes: P.yellow, spikes: s(RAMPS.emperor, -0.4), spikeTip: RAMPS.gold, clawScale: 1.3,
};

// ---------------------------------------------------------------- condor
/** pose: { flap: -1 (down) .. 1 (up), perch: bool, dive: 0..1, hurt } */
export function condor(pose = {}) {
  const m = new Model();
  const flap = pose.flap ?? 0;
  const body = s(RAMPS.condor, -1.5);
  const hoverY = pose.perch ? 0 : 0;
  m.add(ellipsoid([0, 6.2, 0], [2.4, 2.4, 3.9], rotX(0.25)), s(body, 0.1), 'body');
  // white ruff
  m.add(ellipsoid([0, 7.4, 2.6], [2.1, 1.5, 1.4], rotX(-0.3)), s(RAMPS.white, -0.6), 'ruff');
  // head & neck
  m.add(capsule([0, 7.8, 2.8], [0, 9.2, 4.0], 0.9), RAMPS.condorHead, 'head');
  m.add(ellipsoid([0, 9.5, 4.3], [1.25, 1.2, 1.5]), s(RAMPS.condorHead, 0.1), 'head');
  m.add(roundCone([0, 9.5, 5.3], [0, 8.8, 6.9], 0.62, 0.22), [P.grey3, P.grey2, P.grey1, P.white], 'beak');
  m.add(roundCone([0, 9.9, 4.9], [0, 10.4, 4.2], 0.45, 0.2), s(RAMPS.red, 0), 'head'); // wattle/comb
  for (const side of [1, -1]) m.dot([side * 0.95, 9.85, 4.9], P.ink, 1, 1, { tol: 1.4 });
  // tail fan
  m.add(box([0, 5.5, -4.6], [1.9, 0.3, 1.8], 0.25, rotX(-0.35)), s(body, -0.2), 'tail');
  // legs / talons
  if (pose.perch || pose.talons) {
    const fz = pose.talons ? 3 : 0.8;
    for (const side of [1, -1]) {
      m.add(capsule([side * 1.2, 4.6, 0.3], [side * 1.3, 1.2 + (pose.talons ? 1.5 : 0), fz], 0.45), [P.grey3, P.grey2, P.grey1, P.white], 'leg');
      m.add(ellipsoid([side * 1.3, 0.8 + (pose.talons ? 1.5 : 0), fz + 0.6], [0.8, 0.45, 1.2]), RAMPS.iron, 'leg');
    }
  }
  // wings
  for (const side of [1, -1]) {
    const w = new Model();
    const sh = [side * 1.8, 7.3, 0.8];
    const span = 9.8;
    const wingSdf = custom((x, y, z) => {
      const t = side * (x - sh[0]);
      const u = Math.min(Math.max(t / span, 0), 1);
      const hc = 2.5 - 1.1 * u; // half chord
      const cz = sh[2] - 0.8 + 0.5 * u;
      const droop = -u * u * 0.8;
      return Math.max(-t, t - span, Math.abs(z - cz) - hc, Math.abs(y - sh[1] - droop) - 0.38) * 0.8;
    }, [sh[0] + side * span / 2, sh[1], sh[2], span / 2 + 3]);
    const wingMat = (h) => {
      const along = side * (h.p[0] - sh[0]) / span; // 0 root .. 1 tip
      const chord = h.p[2] - (sh[2] - 0.8 + 0.5 * along); // + leading edge
      if (along > 0.15 && along < 0.8 && chord < -0.6 && h.p[1] > sh[1] - 0.1 - along * along * 0.8) return s(RAMPS.white, -0.7); // white upper-wing band
      if (chord > 1.2 - along) return s(body, 0.3); // leading edge
      return s(body, 0);
    };
    w.add(wingSdf, wingMat, 'wing' + side);
    // primary "finger" feathers
    for (let k = 0; k < 5; k++) {
      const root = [sh[0] + side * span * 0.85, sh[1] - 0.8, sh[2] + 0.6 - k * 0.7];
      const tip = [sh[0] + side * (span + 2.4 - k * 0.35), sh[1] - 0.9 - 0.25 * k, sh[2] + 1.1 - k * 1.05];
      w.add(capsule(root, tip, 0.38), s(body, -0.2), 'wing' + side);
    }
    const ang = side * (flap * 0.75);
    m.merge(w.transform(mmul(rotZ(ang), [1, 0, 0, 0, 1, 0, 0, 0, 1]), sh));
  }
  let out = m;
  if (pose.dive) out = out.transform(rotX(pose.dive * 0.5), [0, 6, 0]);
  if (pose.hurt) out = out.transform(rotX(-0.35), [0, 6, 0], [0, 0, -1.5]);
  if (pose.scale) out = scaleModel(out, pose.scale);
  return out;
}

// ---------------------------------------------------------------- sheets
const YAW_SE = 0.62, YAW_NE = Math.PI - 0.62;

function creatureCharset(build, fw, fh, { pitch = 0.4, fixedOy = null } = {}) {
  const draw = (yaw, i, oy) => render(build(i), { w: fw, h: fh, cam: new Camera({ yaw, pitch, ox: fw / 2, oy }) });
  const oy = fixedOy ?? fitOy((o) => draw(YAW_SE, 1, o));
  const se = [0, 1, 2].map((i) => draw(YAW_SE, i, oy));
  const ne = [0, 1, 2].map((i) => draw(YAW_NE, i, oy));
  return sheet([se, se.map((f) => f.mirrorX()), ne, ne.map((f) => f.mirrorX())], fw, fh);
}

export function scorpionCharset() {
  return creatureCharset((i) => scaleModel(scorpion(SCORPION, { legs: [-1, 0, 1][i], tail: [0.3, 0, -0.3][i], claws: 0.3 }), 1.0), 24, 32);
}
export function emperorCharset() {
  return creatureCharset((i) => scaleModel(scorpion(EMPEROR, { legs: [-1, 0, 1][i], tail: [0.3, 0, -0.3][i], claws: 0.4 }), 1.3), 32, 32);
}
export function condorCharset() {
  // hovering bird: bottom of the frame is the ground point; bird floats ~5px above.
  return creatureCharset((i) => scaleModel(condor({ flap: [0.9, 0.1, -0.7][i] }), 0.9).translate([0, 4, 0]), 24, 32, { pitch: 0.4, fixedOy: 31 });
}

/** Enemy battlers face RIGHT. */
function battler(models, fw, fh, { yaw = 1.15, pitch = 0.3, align = 'bottom', oy } = {}) {
  return models.map((m) => {
    const pad = 40;
    const f = render(m, { w: fw, h: fh + pad, cam: new Camera({ yaw, pitch, ox: fw / 2, oy: (oy ?? fh - 2) + (align === 'bottom' ? pad / 2 : 0) }) });
    return align === 'bottom' ? bottomAlign(f, fh - 1).crop(0, 0, fw, fh) : f.crop(0, 0, fw, fh);
  });
}
export function scorpionBattler() {
  const k = 1.75;
  const ms = [
    scaleModel(scorpion(SCORPION, { legs: 0, tail: 0, claws: 0.3 }), k),
    scaleModel(scorpion(SCORPION, { legs: 0.6, tail: 0.5, claws: 0.8 }), k),
    scaleModel(scorpion(SCORPION, { legs: -0.6, strike: 1, claws: 1, reach: 0.8 }), k),
    scaleModel(scorpion(SCORPION, { legs: 0.3, tail: -0.4, claws: 0.1, recoil: 0.3 }), k),
  ];
  return battler(ms.map((m) => m.translate([0, 0, -1.5])), 48, 40, { yaw: 1.1, pitch: 0.45 });
}
export function emperorBattler() {
  const k = 3.9;
  const ms = [
    scaleModel(scorpion(EMPEROR, { legs: 0, tail: 0, claws: 0.3 }), k),
    scaleModel(scorpion(EMPEROR, { legs: 0.6, tail: 0.5, claws: 0.8 }), k),
    scaleModel(scorpion(EMPEROR, { legs: -0.6, strike: 1, claws: 1, reach: 0.8 }), k),
    scaleModel(scorpion(EMPEROR, { legs: 0.3, tail: -0.4, claws: 0.1, recoil: 0.3 }), k),
  ];
  return battler(ms.map((m) => m.translate([0, 0, -3])), 96, 72, { yaw: 1.1, pitch: 0.45 });
}
export function condorBattler() {
  const k = 2.2;
  const ms = [
    condor({ flap: 0.8, scale: k }),
    condor({ flap: -0.6, scale: k }),
    condor({ flap: 0.3, dive: 1, talons: true, scale: k }),
    condor({ flap: 0.2, hurt: true, scale: k }),
  ];
  return battler(ms, 48, 48, { yaw: 0.75, pitch: 0.6, align: 'center', oy: 36 });
}

export function creatureFace(kind) {
  const bgTheme = kind === 'condor' ? RAMPS.condor : kind === 'emperor' ? RAMPS.emperor : RAMPS.tanCloth;
  const bg = portraitBackground(bgTheme);
  let f;
  if (kind === 'scorpion') {
    f = render(scaleModel(scorpion(SCORPION, { claws: 0.6, tail: 0 }), 2.2), { w: 48, h: 48, cam: new Camera({ yaw: 0.45, pitch: 0.45, ox: 25, oy: 40 }), dither: 0.4 });
  } else if (kind === 'emperor') {
    f = render(scaleModel(scorpion(EMPEROR, { claws: 0.6, tail: 0 }), 2.3), { w: 48, h: 48, cam: new Camera({ yaw: 0.4, pitch: 0.4, ox: 25, oy: 42 }), dither: 0.4 });
  } else {
    f = render(condor({ flap: 0.9, scale: 2.4 }), { w: 48, h: 48, cam: new Camera({ yaw: 0.6, pitch: 0.15, ox: 20, oy: 42 }), dither: 0.4 });
  }
  bg.blit(f, 0, 0);
  return bg;
}
