// Parameterized humanoid built from SDF parts. A character spec describes
// body build, colors (ramps), clothing, hair/hat, weapon; a pose describes
// leg step, hand positions, lean, etc. Returns an sdf.Model.
import {
  Model, ellipsoid, sphere, capsule, roundCone, box, cone, torus, custom, intersect, subtract, halfSpace, union,
  rotX, rotZ, rotY, mmul, clamp, shade,
} from './sdf.mjs';
import { P, RAMPS } from './palette.mjs';

const I3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
const norm = (v) => { const l = Math.hypot(...v) || 1; return v.map((a) => a / l); };
const addv = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mulv = (a, s) => [a[0] * s, a[1] * s, a[2] * s];

/** Compute skeleton landmarks for a build. */
export function skeleton(build = {}) {
  const leg = build.leg ?? 1, tor = build.torso ?? 1, hd = build.head ?? 1, g = build.girth ?? 1;
  const hipY = 7.3 * leg;
  const torsoH = 6.8 * tor;
  const shoulderY = hipY + torsoH;
  const headR = 4.7 * hd;
  const head = [0, shoulderY + headR * 0.93 + 0.5, 0.2];
  return {
    g, hipY, torsoH, shoulderY, headR, head, arm: build.arm ?? 1,
    shoulderX: 3.7 * g + (build.arm ? (build.arm - 1) * 1.2 : 0),
    hipX: 1.55 * g,
  };
}

/** Default walking pose hand positions etc. */
export function walkPose(step = 0) {
  return { step, swing: step };
}

/**
 * Build a humanoid model.
 * spec: see characters.mjs; pose: { step, swing, handR, handL, lean, bob, weaponDir, lift, detail }
 */
export function humanoid(spec, pose = {}) {
  const sk = skeleton(spec.build);
  const { g, hipY, shoulderY, headR: R } = sk;
  const hc = sk.head;
  const m = new Model();
  const step = pose.step ?? 0;
  const detail = !!pose.detail;
  const bob = pose.bob ?? 0;
  const skin = spec.skin ?? RAMPS.skin;

  // ---------------- legs & feet
  const footZ = [1.7 * step, -1.7 * step]; // right, left
  const lift = [step < 0 ? 0.7 : 0, step > 0 ? 0.7 : 0];
  const legRamp = spec.legs ?? spec.bottom ?? RAMPS.leather;
  const bootRamp = spec.boots ?? RAMPS.leather;
  for (const side of [1, -1]) {
    const i = side === 1 ? 0 : 1;
    const fz = (pose.feet ? pose.feet[i] : footZ[i]);
    const ly = pose.feetY ? pose.feetY[i] : lift[i];
    const hip = [side * sk.hipX, hipY - 0.4, 0];
    const ankle = [side * sk.hipX, 1.5 + ly, fz];
    const legMat = spec.wrapsLegs
      ? (h) => (h.p[1] < hipY * 0.45 ? (Math.floor(h.p[1] * 1.6) % 2 ? spec.wrapsLegs : shade(spec.wrapsLegs, -0.6)) : legRamp)
      : legRamp;
    if (spec.baggy) {
      // wide trousers gathered at the ankle by a wrap
      const knee = [side * (sk.hipX + 0.35), hipY * 0.5 + ly * 0.5, fz * 0.55 + 0.3];
      m.add(roundCone(hip, knee, 1.75 * g, 1.8), legMat, 'leg' + i);
      m.add(roundCone(knee, [ankle[0], ankle[1] + 0.9, ankle[2]], 1.8, 1.25), legMat, 'leg' + i);
      m.add(capsule([ankle[0], ankle[1] + 0.2, ankle[2]], [ankle[0], ankle[1] + 0.9, ankle[2]], 1.2), bootRamp, 'leg' + i);
    } else if (spec.bones) {
      // bony leg: thin femur/shin with a knee knob
      const knee = [side * sk.hipX, hipY * 0.5 + ly * 0.5, fz * 0.5 + 0.35];
      m.add(roundCone(hip, knee, 0.75, 0.55), legMat, 'leg' + i);
      m.add(sphere(knee, 0.8), legMat, 'leg' + i);
      m.add(roundCone(knee, ankle, 0.55, 0.5), legMat, 'leg' + i);
    } else m.add(roundCone(hip, ankle, 1.5 * g, 1.2), legMat, 'leg' + i);
    m.add(ellipsoid([side * sk.hipX, 0.95 + ly, fz + 0.45], [1.25, 0.95, 1.75]), bootRamp, 'leg' + i);
  }

  // ---------------- upper body (bob applies)
  const U = (p) => [p[0], p[1] + bob, p[2]];
  const up = new Model();
  const topRamp = spec.top ?? RAMPS.tanCloth;
  const beltY = hipY + 1.2;
  const beltW = spec.beltW ?? 0.65;
  const chestC = [0, hipY + sk.torsoH * 0.7, 0];
  const waistC = [0, hipY + sk.torsoH * 0.28, 0];
  const torsoSdf = spec.bones
    ? union( // ribcage + thin spine
      ellipsoid([chestC[0], chestC[1] + 0.3, chestC[2]], [3.3 * g, 2.7 * (spec.build?.torso ?? 1), 2.3 * g]),
      capsule([0, hipY, -0.6], [0, chestC[1], -0.6], 0.8),
    )
    : union(
      ellipsoid(chestC, [3.6 * g, 2.9 * (spec.build?.torso ?? 1), 2.45 * g]),
      ellipsoid(waistC, [3.05 * g, 2.6 * (spec.build?.torso ?? 1), 2.15 * g]),
    );
  const torsoMat = (h) => {
    const [x, y, z] = h.p;
    if (spec.torsoMat) { const r = spec.torsoMat(x, y, z, sk, h); if (r !== undefined) return r; }
    if (spec.belt && Math.abs(y - beltY) < beltW) return spec.belt;
    if (spec.apron && z > 0.9 && Math.abs(x) < 2.3 * g && y < shoulderY - 0.6) return spec.apron;
    if (spec.apron && z > 0 && Math.abs(Math.abs(x) - 1.9 * g) < 0.5 && y >= shoulderY - 0.8) return shade(spec.apron, -0.5);
    if (spec.vest) return Math.abs(x) < 0.8 + (y - hipY) * 0.08 && z > 0 ? topRamp : spec.vest;
    if (spec.vneck && z > 0.5 && y > shoulderY - 2.4 + Math.abs(x) * 0.9) return skin;
    return topRamp;
  };
  up.add(torsoSdf, torsoMat, 'torso');
  // pelvis / lower
  const bottomRamp = spec.bottom ?? RAMPS.leather;
  up.add(ellipsoid([0, hipY + 0.2, 0], [3.1 * g, 1.8, 2.2 * g]), (h) => {
    if (spec.belt && Math.abs(h.p[1] - beltY) < beltW) return spec.belt;
    return spec.skirt ?? bottomRamp;
  }, 'torso');
  if (spec.skirt) { // short tunic skirt / tassets
    const rag = spec.skirtRagged; // tattered hem: cut-out zigzag of this height
    const skirtMat = rag ? (h) => (h.p[1] < hipY - 2.4 + rag * Math.abs(Math.sin(Math.atan2(h.p[0], h.p[2]) * 3.5)) ? null : spec.skirt) : spec.skirt;
    up.add(cone([0, 0, 0], hipY - 2.4, hipY + 0.8, 3.6 * g, 3.1 * g, 0.78), skirtMat, 'skirt');
  }
  // robe / dress
  if (spec.robe) {
    const hem = spec.robeHem ?? 0.8;
    const sw = pose.robeSway ?? step * 0.08;
    const robeMat = (h) => {
      const [x, y, z] = h.p;
      if (spec.robeMat) { const r = spec.robeMat(x, y, z, h); if (r !== undefined) return r; }
      if (spec.robeTrim && y < hem + 0.9) return spec.robeTrim;
      if (spec.apron && z > 1.2 && Math.abs(x) < 2.3 * g && y > hipY * 0.25) return spec.apron;
      return spec.robe;
    };
    up.add(cone([0, 0, 0], hem, hipY + 2.2, 4.5 * g, 3.1 * g, 0.82, rotX(sw)), robeMat, 'robe');
  } else if (spec.apron) {
    up.add(box([0, hipY - 1.8, 2.25 * g], [2.3 * g, 3.4, 0.28], 0.2, rotX(-0.12)), spec.apron, 'apron');
  }
  // neck
  up.add(capsule([0, shoulderY - 1, 0], [0, shoulderY + 1.2, 0.2], spec.bones ? 0.75 : 1.3), skin, 'torso');

  // ---------------- arms
  const armR = 1.15 * sk.arm;
  const sleeves = spec.sleeves ?? topRamp;
  const forearm = spec.forearm ?? sleeves;
  const gloves = spec.gloves ?? skin;
  const sw = pose.swing ?? step;
  const hands = {
    1: pose.handR ?? [sk.shoulderX + 0.9, hipY + 1.6, -1.5 * sw + 0.3],
    [-1]: pose.handL ?? [-(sk.shoulderX + 0.9), hipY + 1.6, 1.5 * sw + 0.3],
  };
  for (const side of [1, -1]) {
    const sh = [side * sk.shoulderX, shoulderY - 0.7, 0];
    const hd = hands[side];
    const mid = [(sh[0] + hd[0]) / 2 + side * 0.5, (sh[1] + hd[1]) / 2, (sh[2] + hd[2]) / 2 - 0.5];
    const grp = 'arm' + side;
    if (spec.bones) { // thin bones with an elbow knob
      up.add(capsule(sh, mid, 0.6), sleeves, grp);
      up.add(sphere(mid, 0.72), sleeves, grp);
      up.add(capsule(mid, hd, 0.5), forearm, grp);
      up.add(sphere(hd, 0.85), gloves, grp);
      if (spec.pauldrons) up.add(ellipsoid([side * (sk.shoulderX - 0.2), shoulderY - 0.1, 0], [2.0, 1.5, 2.0]), spec.pauldrons, 'paul' + side);
      continue;
    }
    up.add(capsule(sh, mid, armR * 1.05), sleeves, grp);
    const faMat = spec.wraps
      ? (h) => { const t = Math.hypot(h.p[0] - hd[0], h.p[1] - hd[1], h.p[2] - hd[2]); return t < 2.6 ? (Math.floor(t * 1.4) % 2 ? spec.wraps : shade(spec.wraps, -0.7)) : forearm; }
      : forearm;
    if (spec.flaredSleeves) {
      // wide bell sleeve from the elbow, opening around the wrist, darker lining inside the cuff
      const d = norm([hd[0] - mid[0], hd[1] - mid[1], hd[2] - mid[2]]);
      const end = addv(hd, mulv(d, -0.5));
      const lining = spec.sleeveLining ?? shade(sleeves, -1);
      up.add(roundCone(mid, end, armR * 1.05, armR * 1.95), (h) => {
        const t = (h.p[0] - end[0]) * d[0] + (h.p[1] - end[1]) * d[1] + (h.p[2] - end[2]) * d[2];
        return t > -0.45 ? lining : spec.sleeveTrim && t > -1.0 ? spec.sleeveTrim : sleeves;
      }, grp);
      up.add(sphere(addv(hd, mulv(d, 0.35)), armR * 1.0), gloves, grp);
    } else {
      up.add(capsule(mid, hd, armR), faMat, grp);
      up.add(sphere(hd, armR * 1.08), gloves, grp);
    }
    if (spec.pauldrons) up.add(ellipsoid([side * (sk.shoulderX - 0.2), shoulderY - 0.1, 0], [2.0, 1.5, 2.0]), spec.pauldrons, 'paul' + side);
    if (spec.cuffs) up.add(torus(hd.map((v, k) => v + (k === 1 ? 1.4 : 0)), 1.0, 0.45), spec.cuffs, grp);
    if (spec.armFins) { // fish folk: spiky fins sweeping back from the forearm
      const fa = [(mid[0] * 0.55 + hd[0] * 0.45) + side * 0.5, mid[1] * 0.55 + hd[1] * 0.45, mid[2] * 0.55 + hd[2] * 0.45 - 0.5];
      up.add(roundCone(fa, [fa[0] + side * 1.2, fa[1] + 1.4, fa[2] - 2.0], 0.75, 0.12), spec.armFins, grp);
      up.add(roundCone(addv(fa, [0, -1.3, 0.3]), [fa[0] + side * 1.0, fa[1] - 0.4, fa[2] - 1.6], 0.55, 0.1), spec.armFins, grp);
    }
  }

  // ---------------- cape
  if (spec.cape) {
    const top = shoulderY + 0.2, bot = pose.capeBottom ?? 2.2;
    const bot2 = spec.capeBottom ?? bot;
    const flare = pose.capeFlare ?? (spec.capeFlare ?? 0.1) + Math.abs(step) * 0.08;
    const swayX = pose.capeSway ?? step * 0.12; // flows sideways a little while walking
    up.add(custom((x, y, z) => {
      const t = clamp(top - y, 0, top - bot2);
      const hx = 3.3 * g + t * 0.13;
      const zc = -2.5 * g - t * flare;
      const hem = bot2 + (spec.capeRagged ? 0.6 * Math.abs(Math.sin(x * 1.6)) : 0);
      return Math.max(Math.abs(x - t * swayX) - hx, Math.abs(z - zc) - 0.4, y - top, hem - y) * 0.75;
    }, [0, (top + bot2) / 2, -3, 9]), (h) => (h.nc[2] < -0.2 ? shade(spec.cape, -1) : spec.cape), 'cape');
    up.add(ellipsoid([0, shoulderY + 0.2, -0.5], [4.2 * g, 1.3, 2.9 * g]), spec.capeCollar ?? spec.cape, 'collar');
  }
  if (spec.scarf) {
    up.add(torus([0, shoulderY + 0.5, 0.1], 2.1, 1.0, 1.0), spec.scarf, 'scarf');
    up.add(roundCone([0.8, shoulderY + 0.3, -2.2], [1.6 + step * 0.3, shoulderY - 3.5, -3.4], 0.9, 0.6), spec.scarf, 'scarf2');
  }

  // ---------------- lei / bead necklace: a ring of blossoms (or beads) around the neck, draping onto the chest
  if (spec.lei) {
    const lei = spec.lei, n = lei.n ?? 12, fl = lei.flowers ?? [RAMPS.red];
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2, ca = Math.cos(a);
      const p = [Math.sin(a) * (lei.rx ?? 2.7) * g, shoulderY + 0.2 - (lei.drop ?? 1.6) * Math.max(0, ca) ** 1.5, ca * (lei.rz ?? 2.55) * g + 0.15];
      up.add(sphere(p, lei.r ?? 0.7), fl[k % fl.length], 'lei');
    }
  }

  // ---------------- sash tails (hang from the side of the belt, swing while walking)
  if (spec.sashTails) {
    for (const k of [0, 1]) {
      const a = [1.9 * g + k * 0.3, beltY - 0.2, 1.1 - k * 0.9];
      const b = [2.7 * g + k * 0.6 + step * 0.3, hipY - 5.8 + k * 0.9, 0.4 - k * 1.3 - Math.abs(step) * 0.9];
      up.add(roundCone(a, b, 0.75, 0.55), (h) => (h.p[1] < b[1] + 0.9 ? shade(spec.sashTails, -0.6) : spec.sashTails), 'sash' + k);
    }
  }
  // ---------------- tail (animal folk)
  if (spec.tail) {
    const tl = spec.tail;
    const pts = [];
    const n = 6;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      // from the lower back: out behind, dipping, then curling up and to the side
      pts.push([(tl.side ?? -1) * (t * 2.6 + step * 0.9 * t), hipY - 0.6 - 2.6 * t + 3.2 * t * t, -2.2 - 3.4 * t + 0.6 * t * t]);
    }
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      const r = (tl.r ?? 1.5) * (0.55 + 0.75 * Math.sin(Math.min(1, t * 1.05) * Math.PI * 0.85));
      up.add(ellipsoid(pts[i], [r, r, r * 1.1]), t > 0.8 ? (tl.tip ?? RAMPS.white) : tl.ramp, 'tail');
    }
  }

  // ---------------- head
  const eyeCol = spec.eyes ?? P.ink;
  const maskAt = (u, v) => spec.mask && Math.abs(u) < 1.35 && v < -0.18 + Math.abs(u) * 0.06;
  const headMat = (h) => {
    const q = [(h.p[0] - hc[0]) / R, (h.p[1] - hc[1]) / R, (h.p[2] - hc[2]) / R];
    const u = Math.atan2(q[0], q[2]), v = q[1];
    if (maskAt(u, v)) return spec.mask;
    if (spec.animal && spec.cheeks && Math.abs(u) < 1.1 && v < -0.15) return spec.cheeks;
    if (spec.animal && spec.faceFur && Math.abs(u) > 0.9 && v < 0.1) return spec.faceFur;
    if (spec.creases && detail && Math.abs(v + 0.28) < 0.035 && (Math.abs(u - 0.42) < 0.12 || Math.abs(u + 0.42) < 0.12)) return shade(skin, -0.8);
    if (spec.skull && !detail) return skin; // sprite scale: features are dots (below)
    if (spec.skull) {
      const dark = spec.skull.dark ?? P.ink;
      for (const s of [1, -1]) {
        const du = (u - s * 0.4) / 0.3, dv = (v - 0.06) / 0.28;
        if (du * du + dv * dv < 1) return spec.skull.glow && detail && du * du + dv * dv < 0.2 ? spec.skull.glow : dark;
      }
      if (Math.abs(u) < 0.1 * (1 - (v + 0.1) * 2) && v < -0.1 && v > -0.26) return dark; // nasal cavity
      if (Math.abs(u) < 0.5 && v < -0.36 && v > -0.54) return Math.abs(Math.sin(u * 22)) < 0.35 || Math.abs(v + 0.45) < 0.03 ? dark : skin; // teeth
      if (Math.abs(u) > 0.62 && Math.abs(u) < 1.25 && v < -0.2 && v > -0.32) return shade(skin, -1); // cheekbone shadow
      return skin;
    }
    if (!detail) return skin;
    for (const s of [1, -1]) {
      const du = (u - s * 0.4) / 0.2, dv = (v + 0.02) / 0.21;
      if (Math.abs(du) < 1.15 && dv > 0.85 && dv < 1.3 && !spec.closedEyes) return P.ink; // lash line
      if (du * du + dv * dv < 1) {
        if (spec.closedEyes) return Math.abs(dv) < 0.25 ? P.ink : skin;
        const iu = du + s * 0.15, iv = dv + 0.1;
        if (iu * iu + iv * iv < 0.62) {
          if ((iu + 0.3) ** 2 + (iv - 0.35) ** 2 < 0.07) return P.white;
          if (iu * iu + iv * iv < 0.16) return P.ink;
          return iv > 0.1 ? spec.iris?.[1] ?? P.blueDark : spec.iris?.[0] ?? P.navy;
        }
        return P.white;
      }
      const bu = (u - s * 0.42) / 0.26, bv = (v - 0.35) / 0.06;
      if (!spec.noBrows && bu * bu + bv * bv < 1) return spec.brows ?? spec.hair?.ramp?.[0] ?? P.darkBrown;
    }
    if (!spec.beard && Math.abs(u) < 0.13 + (spec.smile ? 0.05 : 0) && Math.abs(v + 0.5 + (spec.smile ? Math.abs(u) * -0.6 : 0)) < 0.045) return skin[0];
    if (spec.blush) for (const s of [1, -1]) if ((u - s * 0.55) ** 2 / 0.02 + (v + 0.3) ** 2 / 0.006 < 1) return shade(spec.blush, 0);
    return skin;
  };
  const hd = new Model();
  hd.add(ellipsoid(hc, [R, R * 0.94, R * 0.96]), headMat, 'head');
  if (spec.skull) {
    // jaw: narrower lower skull
    hd.add(ellipsoid([hc[0], hc[1] - 0.55 * R, hc[2] + 0.25 * R], [0.62 * R, 0.4 * R, 0.62 * R]), headMat, 'head');
    if (!detail) { // big dark sockets (+ glint) and a tooth line that survive at sprite scale
      for (const s of [1, -1]) {
        const a = s * 0.42, p = [hc[0] + Math.sin(a) * R * 0.96, hc[1] + 0.1 * R, hc[2] + Math.cos(a) * R * 0.93];
        hd.dot(p, spec.skull.dark ?? P.ink, s > 0 ? spec.skull.w ?? 1 : 1, 2, { on: 'head', tol: 1.6, ax: s > 0 ? (spec.skull.w ?? 1) - 1 : 0 });
        if (spec.skull.glint) hd.dot(p, spec.skull.glint, 1, 1, { on: 'head', tol: 1.6 });
      }
      hd.dot([hc[0], hc[1] - 0.45 * R, hc[2] + 0.88 * R], spec.skull.dark ?? P.ink, 1, 1, { on: 'head', tol: 1.6 });
    }
  } else if (!detail) {
    for (const s of [1, -1]) {
      const a = s * 0.4, v = -0.04;
      const p = [hc[0] + Math.sin(a) * R * 1.0, hc[1] + v * R, hc[2] + Math.cos(a) * R * 0.97];
      if (spec.fish) continue; // fish eyes: see buildFishHead
      if (spec.closedEyes) hd.dot(p, skin[0], 1, 1, { on: 'head' });
      else hd.dot(p, eyeCol, 1, 2, { on: 'head', tol: 1.6, keep: true });
      if (spec.bushyBrows) hd.dot([p[0] + s * 0.12 * R, p[1] + 0.3 * R, p[2]], spec.bushyBrows, 2, 1, { on: 'head', tol: 1.8, ax: s > 0 ? 1 : 0 });
    }
  } else {
    hd.add(ellipsoid([hc[0], hc[1] - 0.18 * R, hc[2] + 0.93 * R], [0.13 * R, 0.2 * R, 0.14 * R]), skin, 'head');
    for (const s of [1, -1]) hd.add(ellipsoid([hc[0] + s * 0.97 * R, hc[1] - 0.05 * R, hc[2] - 0.05 * R], [0.16 * R, 0.24 * R, 0.16 * R]), skin, 'head');
  }
  // elf ears: long thin points sweeping out, back and up from the sides of the head
  if (spec.elfEars) {
    const er = spec.elfEars === true ? skin : spec.elfEars.ramp ?? skin;
    const len = spec.elfEars.len ?? 1;
    for (const s of [1, -1]) {
      const base = [hc[0] + s * 0.88 * R, hc[1] - 0.02 * R, hc[2] - 0.08 * R];
      const tip = [hc[0] + s * (0.88 + 0.72 * len) * R, hc[1] + (0.02 + 0.5 * len) * R, hc[2] - (0.08 + 0.45 * len) * R];
      hd.add(roundCone(base, tip, 0.24 * R, 0.05 * R), (h) => (detail && h.p[2] - base[2] > 0.02 * R && (h.p[1] - base[1]) / (tip[1] - base[1]) < 0.6 ? shade(er, -0.7) : er), 'ear' + s);
    }
  }
  // animal head features: pointed ears, snout
  if (spec.animal) {
    const an = spec.animal;
    const earR = an.ears ?? skin;
    for (const s of [1, -1]) {
      const base = [hc[0] + s * 0.5 * R, hc[1] + 0.62 * R, hc[2] - 0.05 * R];
      const tip = [hc[0] + s * 0.82 * R, hc[1] + (an.earH ?? 1.5) * R, hc[2] - 0.2 * R];
      hd.add(roundCone(base, tip, 0.42 * R, 0.07 * R), (h) => {
        const t = (h.p[1] - base[1]) / (tip[1] - base[1]);
        if (t > 0.68) return an.earTip ?? RAMPS.ink;
        // inner ear: the side facing forward
        if (detail && h.n && an.earInner && (h.p[2] - base[2]) > 0.18 * R && t < 0.6 && t > 0.1) return an.earInner;
        return earR;
      }, 'ear' + s);
    }
    if (an.snout) {
      const sc = [hc[0], hc[1] - 0.32 * R, hc[2] + 0.8 * R];
      hd.add(ellipsoid(sc, [0.4 * R, 0.3 * R, 0.52 * R], rotX(0.12)), (h) => {
        if (spec.mask) return spec.mask;
        return h.p[1] < sc[1] ? (spec.cheeks ?? RAMPS.white) : skin;
      }, 'head');
      if (!spec.mask) hd.dot([sc[0], sc[1] + 0.12 * R, sc[2] + 0.54 * R], P.ink, 1, 1, { on: 'head', tol: 2 });
    }
  }

  if (spec.fish) buildFishHead(hd, spec, sk, skin);
  buildHair(hd, spec, sk, detail, step);
  buildHat(hd, spec, sk, detail, step);
  buildBeard(hd, spec, sk);
  const turn = pose.headTurn ?? 0;
  up.merge(turn ? hd.transform(rotY(-turn), [0, shoulderY, 0]) : hd);

  // ---------------- weapon
  if (spec.weapon) buildWeapon(up, spec.weapon, hands[1], hands[-1], pose, sk);

  m.merge(bob ? up.translate([0, bob, 0]) : up);
  let out = m;
  if (pose.lean) out = out.transform(rotX(pose.lean), [0, 0, 0]);
  if (pose.tilt) out = out.transform(rotZ(pose.tilt), [0, 0, 0]);
  if (pose.rot) out = out.transform(pose.rot, pose.pivot ?? [0, 0, 0], pose.offset ?? [0, 0, 0]);
  if (spec.recolor) recolorModel(out, spec.recolor);
  return out;
}

/** Map every colour of a model (materials, ramps, lines, dots) through `f`; parts/dots flagged `keep` are left alone. */
function recolorModel(model, f) {
  const memo = new Map();
  const ramp = (r) => { let o = memo.get(r); if (!o) { o = r.map(f); memo.set(r, o); } return o; };
  const res = (v) => (v == null ? v : typeof v === 'number' ? f(v) : Array.isArray(v) ? ramp(v) : v.ramp ? { ramp: ramp(v.ramp), bias: v.bias } : v);
  for (const pt of model.parts) {
    if (pt.keep) continue;
    const m = pt.mat;
    pt.mat = typeof m === 'function' ? (h) => res(m(h)) : res(m);
  }
  for (const l of model.lines) {
    const c = l.color;
    l.color = typeof c === 'function' ? (t, x, y) => res(c(t, x, y)) : res(c);
    if (l.dark != null) l.dark = f(l.dark);
  }
  for (const d of model.dots) if (!d.keep) d.color = f(d.color);
}

/**
 * Fish-folk head (spec.fish = { crest, eyeRamp, pupil, mouth, lips }): lipped jaw jutting forward,
 * big round eyes on the sides of the head, a spiny fin crest over the crown instead of hair, side fins.
 */
function buildFishHead(m, spec, sk, skin) {
  const R = sk.headR, hc = sk.head, f = spec.fish;
  const crest = f.crest ?? RAMPS.red;
  // jutting jaw / lips
  const jc = [hc[0], hc[1] - 0.42 * R, hc[2] + 0.62 * R];
  m.add(ellipsoid(jc, [0.66 * R, 0.34 * R, 0.5 * R], rotX(0.1)), (h) => (h.p[1] < jc[1] - 0.05 * R ? (f.lips ?? shade(skin, 0.6)) : skin), 'head');
  m.dot([jc[0], jc[1] - 0.02 * R, jc[2] + 0.5 * R], f.mouth ?? P.ink, 3, 1, { on: 'head', tol: 2, ax: 1 });
  // crest: a thin fin over the crown and down the back of the head, spiny top edge, darker rays
  const fin = intersect(
    box([hc[0], hc[1] + 0.55 * R, hc[2] - 0.25 * R], [0.13 * R, 0.95 * R, 1.3 * R], 0.05 * R),
    ellipsoid([hc[0], hc[1] + 0.1 * R, hc[2] - 0.2 * R], [0.5 * R, 1.42 * R, 1.3 * R]),
  );
  m.add(fin, (h) => {
    const dz = h.p[2] - hc[2] + 0.2 * R, dy = h.p[1] - hc[1] - 0.1 * R;
    const a = Math.atan2(dz, dy); // angle along the arc
    if (Math.hypot(dz, dy / 1.1) > R * (1.05 + 0.2 * Math.abs(Math.cos(a * 5)))) return null; // spines
    return Math.abs(Math.sin(a * 5)) > 0.8 ? shade(crest, -0.8) : crest;
  }, 'crest');
  // side fins where ears would be
  for (const s of [1, -1]) {
    const b = [hc[0] + s * 0.88 * R, hc[1] - 0.25 * R, hc[2] - 0.25 * R];
    m.add(roundCone(b, [b[0] + s * 0.3 * R, b[1] + 0.12 * R, b[2] - 0.6 * R], 0.18 * R, 0.05 * R), crest, 'ear' + s);
  }
  // big round eyes set on the sides of the head
  for (const s of [1, -1]) {
    const a = s * 0.58, p = [hc[0] + Math.sin(a) * R * 1.02, hc[1] + 0.08 * R, hc[2] + Math.cos(a) * R * 1.0];
    m.add(sphere(p, 0.3 * R), f.eyeRamp ?? [P.grey2, P.grey1, P.white, P.white], 'eye' + s);
    const pp = [p[0] + Math.sin(a) * 0.18 * R, p[1], p[2] + Math.cos(a) * 0.27 * R];
    m.dot(pp, spec.closedEyes ? skin[0] : f.pupil ?? P.ink, 1, spec.closedEyes ? 1 : 2, { on: 'eye' + s, tol: 2, keep: true });
  }
}

function hairMat(ramp, detail) {
  return (h) => {
    if (detail && Math.sin(h.p[0] * 2.2 + h.p[1] * 0.7) > 0.75) return shade(ramp, -0.6);
    return shade(ramp, 0.15);
  };
}

function buildHair(m, spec, sk, detail, step) {
  const hair = spec.hair;
  if (!hair || hair.style === 'bald') return;
  const R = sk.headR, hc = sk.head;
  const ramp = hair.ramp;
  const mat = hairMat(ramp, detail);
  const HR = [R * 1.1, R * 1.06, R * 1.08];
  const fr = hair.fringe ?? 0.12;
  const hl = hair.line ?? -0.25; // hairline height (relative)
  const region = (k) => custom((x, y, z) => {
    const ly = (y - hc[1]) / R, lz = (z - hc[2]) / R, lx = (x - hc[0]) / R;
    const fringe = lz > 0.2 ? fr * Math.abs(Math.sin(lx * 5.5)) : 0;
    return -((ly - k * lz) - (hl + fringe)) * R * 0.7;
  }, [hc[0], hc[1], hc[2], 1e6]);
  if (hair.style === 'sides') {
    // bald crown, hair around the back and sides
    m.add(intersect(ellipsoid(hc, HR), custom((x, y, z) => Math.max((y - hc[1]) - 0.2 * R, (z - hc[2]) - 0.25 * R), [0, 0, 0, 1e6])), mat, 'hair');
    return;
  }
  m.add(intersect(ellipsoid(hc, HR), region(0.6)), mat, 'hair');
  if (hair.style === 'long') {
    m.add(intersect(ellipsoid([hc[0], hc[1] - R * 0.55, hc[2] - R * 0.35], [R * 1.05, R * 1.05, R * 0.75]), halfSpace([0, 0, hc[2] + 0.1 * R], [0, 0, -1])), mat, 'hair');
  }
  if (hair.style === 'longfront') {
    // long hair down the back plus two long locks falling over the front of the chest
    m.add(intersect(ellipsoid([hc[0], hc[1] - R * 0.75, hc[2] - R * 0.35], [R * 1.05, R * 1.3, R * 0.75]), halfSpace([0, 0, hc[2] + 0.1 * R], [0, 0, -1])), mat, 'hair');
    for (const s of [1, -1]) {
      const a = [hc[0] + s * 0.78 * R, hc[1] - 0.25 * R, hc[2] + 0.2 * R];
      const b = [hc[0] + s * 0.62 * R + step * 0.1, sk.shoulderY - 4.8, 2.35 * sk.g];
      m.add(roundCone(a, [a[0] * 0.95, sk.shoulderY - 0.2, 2.0 * sk.g], 0.36 * R, 0.33 * R), mat, 'lock' + s);
      m.add(roundCone([a[0] * 0.95, sk.shoulderY - 0.2, 2.0 * sk.g], b, 0.33 * R, 0.14 * R), mat, 'lock' + s);
    }
  }
  if (hair.style === 'bun') m.add(sphere([hc[0], hc[1] + R * 0.55, hc[2] - R * 0.85], R * 0.45), mat, 'hair');
  if (hair.style === 'ponytail') m.add(roundCone([hc[0], hc[1] + R * 0.3, hc[2] - R * 1.0], [hc[0], hc[1] - R * 1.1, hc[2] - R * 1.3 - step * 0.2], R * 0.35, R * 0.22), mat, 'hair');
  if (hair.style === 'spiky') {
    const tips = [[-0.6, 1.1, 0.5], [0.1, 1.28, 0.1], [0.75, 1.05, 0.35], [-0.2, 1.05, -0.7], [0.55, 0.75, -0.8], [-0.95, 0.55, -0.4]];
    for (const [x, y, z] of tips) {
      const base = [hc[0] + x * R * 0.5, hc[1] + y * R * 0.55, hc[2] + z * R * 0.5];
      m.add(roundCone(base, [hc[0] + x * R, hc[1] + y * R, hc[2] + z * R], R * 0.38, R * 0.08), mat, 'hair');
    }
  }
}

function buildHat(m, spec, sk, detail, step) {
  const hat = spec.hat;
  if (!hat) return;
  const R = sk.headR, hc = sk.head;
  const ramp = hat.ramp, r2 = hat.ramp2 ?? ramp;
  const t = hat.type;
  if (t === 'pointed') {
    const by = hc[1] + R * 0.55;
    m.add(cone([hc[0], 0, hc[2]], by - 0.35, by + 0.35, R * 1.45, R * 1.4), shade(ramp, 0), 'hat');
    const tip = [hc[0] - R * 0.25, by + R * (hat.height ?? 1.25), hc[2] - R * 0.45];
    m.add(roundCone([hc[0], by + 0.2, hc[2]], tip, R * 0.9, R * 0.12), (h) => {
      if (h.p[1] < by + R * 0.3) return r2; // band
      if (hat.stars && isStar(h.p)) return RAMPS.gold;
      return ramp;
    }, 'hat');
  } else if (t === 'turban') {
    const tc = [hc[0], hc[1] + R * 0.38, hc[2] - R * 0.05];
    const tur = intersect(ellipsoid(tc, [R * 1.14, R * 0.75, R * 1.14]), halfSpace([0, hc[1] + R * 0.02, 0], [0, 1, -0.35]));
    m.add(tur, (h) => {
      const a = Math.atan2(h.p[0] - hc[0], h.p[2] - hc[2]);
      const s = Math.sin((h.p[1] - hc[1]) * (detail ? 2.2 : 1.8) / (R / 4.7) + a * 1.0);
      return s > 0.55 ? shade(ramp, -0.7) : ramp;
    }, 'hat');
    m.add(sphere([hc[0], hc[1] + R * 1.0, hc[2] - R * 0.1], R * 0.42), ramp, 'hat');
    if (hat.jewel) m.add(sphere([hc[0], hc[1] + R * 0.62, hc[2] + R * 1.08], R * 0.17), hat.jewel, 'hatj');
    if (hat.tail) m.add(roundCone([hc[0] - R * 0.3, hc[1] + R * 0.2, hc[2] - R * 0.95], [hc[0] - R * 0.4, hc[1] - R * 1.0, hc[2] - R * 1.1], R * 0.3, R * 0.22), shade(ramp, -0.3), 'hat');
  } else if (t === 'hood' || t === 'headscarf') {
    const scarf = t === 'headscarf';
    const HR = [R * 1.1, R * 1.08, R * 1.1];
    const openU = scarf ? 1.2 : 1.05, top = scarf ? 0.42 : 0.36, bot = -1.1;
    const opening = custom((x, y, z) => {
      const u = Math.abs(Math.atan2(x - hc[0], z - hc[2])), ly = (y - hc[1]) / R;
      return Math.max((u - openU) * R, (ly - top) * R, (bot - ly) * R);
    }, [hc[0], hc[1], hc[2], 1e6]);
    const mat = (h) => (hat.stars && isStar(h.p) ? RAMPS.gold : ramp);
    m.add(subtract(ellipsoid(hc, HR), opening), mat, 'hat');
    // capelet over neck/shoulders
    m.add(intersect(cone([hc[0], 0, hc[2] - R * 0.3], hc[1] - R * 1.3, hc[1] - R * 0.45, R * 1.02, R * 0.85, 0.95),
      halfSpace([0, 0, hc[2] + 0.1 * R], [0, 0, -1])), mat, 'hat');
    if (!scarf) m.add(roundCone([hc[0], hc[1] + R * 0.5, hc[2] - R * 0.7], [hc[0] - R * 0.1, hc[1] - R * 0.1, hc[2] - R * 1.55], R * 0.55, R * 0.18), mat, 'hat');
  } else if (t === 'helmet') {
    m.add(intersect(ellipsoid(hc, [R * 1.12, R * 1.1, R * 1.12]), halfSpace([0, hc[1] + R * 0.12, 0], [0, 1, 0.12])), shade(ramp, 0.2), 'hat');
    m.add(torus([hc[0], hc[1] + R * 0.12, hc[2]], R * 1.07, R * 0.16, 1), r2, 'hat');
    if (hat.spike) m.add(roundCone([hc[0], hc[1] + R * 0.9, hc[2]], [hc[0], hc[1] + R * 1.45, hc[2] - R * 0.1], R * 0.25, R * 0.06), r2, 'hat');
  } else if (t === 'knighthelm') {
    // open-faced steel helm: dome + cheek guards, face opening, nose guard, rim ridge, optional plume
    const HR = [R * 1.12, R * 1.1, R * 1.13];
    const opening = custom((x, y, z) => {
      const u = Math.abs(Math.atan2(x - hc[0], z - hc[2])), ly = (y - hc[1]) / R;
      return Math.max((u - (hat.openU ?? 0.62)) * R, (ly - 0.22) * R, (-0.78 - ly) * R);
    }, [hc[0], hc[1], hc[2], 1e6]);
    const helmMat = (h) => {
      const ly = (h.p[1] - hc[1]) / R;
      if (Math.abs(ly - 0.3) < 0.07) return r2; // brow band
      if (Math.abs(h.p[0] - hc[0]) < 0.1 * R && ly > 0.3) return shade(ramp, 0.5); // crest ridge
      return ramp;
    };
    m.add(intersect(subtract(ellipsoid(hc, HR), opening), halfSpace([0, hc[1] - 0.95 * R, 0], [0, 1, 0])), helmMat, 'hat');
    // nose guard
    m.add(box([hc[0], hc[1] + 0.02 * R, hc[2] + 1.07 * R], [0.1 * R, 0.3 * R, 0.08 * R], 0.03 * R, rotX(-0.15)), shade(ramp, 0.3), 'hat');
    // flared neck guard at the back
    m.add(intersect(cone([hc[0], 0, hc[2] - 0.1 * R], hc[1] - 1.0 * R, hc[1] - 0.45 * R, R * 1.22, R * 1.08), halfSpace([0, 0, hc[2] - 0.25 * R], [0, 0, -1])), shade(ramp, -0.3), 'hat');
    if (hat.plume) {
      let prev = [hc[0], hc[1] + 1.02 * R, hc[2] - 0.05 * R];
      for (let i = 1; i <= 4; i++) {
        const t = i / 4;
        const p = [hc[0], hc[1] + (1.02 + 0.35 * Math.sin(t * 2.2)) * R, hc[2] - (0.05 + 1.1 * t) * R - step * 0.1];
        m.add(roundCone(prev, p, (0.3 - t * 0.07) * R, (0.3 - t * 0.12) * R), hat.plume, 'plume');
        prev = p;
      }
    }
  } else if (t === 'wizardhood') {
    // hood around the face + very tall floppy point that bends backward at the tip
    const HR = [R * 1.13, R * 1.1, R * 1.13];
    const opening = custom((x, y, z) => {
      const u = Math.abs(Math.atan2(x - hc[0], z - hc[2])), ly = (y - hc[1]) / R;
      return Math.max((u - 1.08) * R, (ly - 0.34) * R, (-1.1 - ly) * R);
    }, [hc[0], hc[1], hc[2], 1e6]);
    const lining = hat.lining ?? shade(ramp, -1.2);
    m.add(subtract(ellipsoid(hc, HR), opening), (h) => {
      const u = Math.abs(Math.atan2(h.p[0] - hc[0], h.p[2] - hc[2]));
      return u < 1.2 && (h.p[1] - hc[1]) / R < 0.45 ? lining : ramp;
    }, 'hat');
    // drape over the shoulders
    m.add(intersect(cone([hc[0], 0, hc[2] - R * 0.3], hc[1] - R * 1.3, hc[1] - R * 0.45, R * 1.08, R * 0.9, 0.95),
      halfSpace([0, 0, hc[2] + 0.15 * R], [0, 0, -1])), ramp, 'hat');
    const H = hat.height ?? 1.8, flop = hat.flop ?? 1;
    const pts = [
      [hc[0], hc[1] + 0.55 * R, hc[2] - 0.1 * R, 0.9 * R],
      [hc[0], hc[1] + (0.55 + H * 0.45) * R, hc[2] - 0.35 * R, 0.58 * R],
      [hc[0] - 0.05 * R, hc[1] + (0.55 + H * 0.8) * R, hc[2] - 0.75 * R, 0.36 * R],
      [hc[0] - 0.12 * R, hc[1] + (0.55 + H * 0.92) * R, hc[2] - (1.2 + 0.2 * flop) * R, 0.22 * R],
      [hc[0] - 0.2 * R, hc[1] + (0.55 + H * 0.8 - 0.25 * flop) * R, hc[2] - (1.6 + 0.35 * flop) * R + step * 0.1, 0.12 * R],
    ];
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      m.add(roundCone(a.slice(0, 3), b.slice(0, 3), a[3], b[3]), ramp, 'hat');
    }
  } else if (t === 'circlet') {
    m.add(torus([hc[0], hc[1] + R * 0.45, hc[2] + 0.1], R * 1.05, R * 0.12, 1), ramp, 'hat');
    m.add(sphere([hc[0], hc[1] + R * 0.5, hc[2] + R * 1.1], R * 0.16), hat.jewel ?? RAMPS.blue, 'hat');
  } else if (t === 'tricorn') {
    // low crown inside a brim turned up into three walls (triangle, one corner at the front), trimmed top edge
    const cr = hat.crown ?? 1;
    m.add(intersect(ellipsoid([hc[0], hc[1] + 0.5 * R, hc[2] - 0.05 * R], [R * 1.02, R * 0.72 * cr, R * 1.02]), halfSpace([0, hc[1] + 0.2 * R, 0], [0, 1, 0])), shade(ramp, 0), 'hat');
    const by = hc[1] + (hat.y ?? 0.22) * R, hh = (hat.wall ?? 0.62) * R, ap0 = (hat.size ?? 1.0) * R, th = 0.13 * R, lean = hat.lean ?? 0.35;
    const NS = [Math.PI / 3, Math.PI, -Math.PI / 3].map((a) => [Math.sin(a), Math.cos(a)]); // edge normals (corner at a = 0)
    const tri = (x, y, z) => {
      const lx = x - hc[0], lz = z - hc[2] + 0.1 * R, ap = ap0 + Math.max(0, y - by) * lean;
      let d = -Infinity;
      for (const [nx, nz] of NS) d = Math.max(d, nx * lx + nz * lz - ap);
      return Math.max(d, Math.hypot(lx, lz) - ap * 1.75); // rounded corners
    };
    const topAt = (x, z) => by + hh - 0.18 * R * Math.cos(Math.atan2(x - hc[0], z - hc[2]) * 3); // dips at the corners
    m.add(custom((x, y, z) => Math.max(Math.abs(tri(x, y, z) + th) - th, by - y, y - topAt(x, z)) * 0.8, [hc[0], by + hh / 2, hc[2], 2.2 * R]), (h) =>
      (hat.trim && h.p[1] > topAt(h.p[0], h.p[2]) - (detail ? 0.14 : 0.2) * R ? hat.trim : r2), 'hat');
    // flat brim floor under the walls
    m.add(custom((x, y, z) => Math.max(tri(x, by, z), Math.abs(y - by - 0.08 * R) - 0.08 * R) * 0.8, [hc[0], by, hc[2], 2.2 * R]), r2, 'hat');
  } else if (t === 'bandana') {
    // cloth tied tight over the crown, knot + two short tails at the back
    const HR = [R * 1.1, R * 1.07, R * 1.1];
    m.add(intersect(ellipsoid(hc, HR), custom((x, y, z) => -(((y - hc[1]) / R - 0.35 * (z - hc[2]) / R) - (hat.line ?? 0.05)) * R * 0.7, [hc[0], hc[1], hc[2], 1e6])), ramp, 'hat');
    const kn = [hc[0] - 0.15 * R, hc[1] + 0.1 * R, hc[2] - 1.05 * R];
    m.add(sphere(kn, R * 0.26), shade(ramp, -0.3), 'hat');
    for (const k of [1, -1]) m.add(roundCone(kn, [kn[0] + k * 0.35 * R, kn[1] - 0.75 * R, kn[2] - 0.35 * R - step * 0.15], R * 0.2, R * 0.12), shade(ramp, -0.3), 'hat');
  } else if (t === 'flowers') {
    // thin vine circlet with small blossoms
    m.add(torus([hc[0], hc[1] + R * 0.42, hc[2] + 0.1], R * 1.06, R * 0.1, 1), ramp, 'hat');
    for (const a of hat.at ?? [-1.1, -0.4, 0.35, 1.05, 2.2, -2.2]) {
      const p = [hc[0] + Math.sin(a) * R * 1.08, hc[1] + R * (0.42 + 0.05 * Math.cos(a * 3)), hc[2] + 0.1 + Math.cos(a) * R * 1.08];
      m.add(sphere(p, R * (hat.r ?? 0.2)), hat.flower ?? RAMPS.red, 'hatf');
    }
  } else if (t === 'topknot') {
    m.add(sphere([hc[0], hc[1] + R * 1.02, hc[2] - R * 0.25], R * 0.32), ramp, 'hat');
    m.add(roundCone([hc[0], hc[1] + R * 1.15, hc[2] - R * 0.35], [hc[0] - R * 0.1, hc[1] + R * 1.55, hc[2] - R * 0.7], R * 0.22, R * 0.1), ramp, 'hat');
  } else if (t === 'headband') {
    m.add(torus([hc[0], hc[1] + R * 0.3, hc[2] + 0.1], R * 1.02, R * 0.16, 1), ramp, 'hat');
    m.add(roundCone([hc[0] + R * 0.2, hc[1] + R * 0.3, hc[2] - R * 1.0], [hc[0] + R * 0.5, hc[1] - R * 0.5, hc[2] - R * 1.5 - step * 0.2], R * 0.18, R * 0.12), ramp, 'hat');
  }
}

function isStar(p) {
  // sparse "stars" pattern on a surface (deterministic)
  const gx = Math.floor(p[0] * 0.55 + 20), gy = Math.floor(p[1] * 0.45 + 20), gz = Math.floor(p[2] * 0.55 + 20);
  const hsh = ((gx * 73856093) ^ (gy * 19349663) ^ (gz * 83492791)) >>> 0;
  if (hsh % 5 !== 0) return false;
  const fx = p[0] * 0.55 + 20 - gx - 0.5, fy = p[1] * 0.45 + 20 - gy - 0.5;
  return Math.abs(fx) < 0.22 && Math.abs(fy) < 0.28;
}
export { isStar };

function buildBeard(m, spec, sk) {
  if (!spec.beard) return;
  const R = sk.headR, hc = sk.head;
  const long = spec.beard.long;
  const ramp = spec.beard.ramp;
  const bc = long ? [hc[0], hc[1] - R * 0.8, hc[2] + R * 0.55] : [hc[0], hc[1] - R * 0.58, hc[2] + R * 0.5];
  const br = long ? [R * 0.62, R * 0.9, R * 0.48] : [R * 0.72, R * 0.55, R * 0.5];
  m.add(intersect(ellipsoid(bc, br), halfSpace([0, hc[1] - R * 0.28, 0], [0, -1, 0])), shade(ramp, 0.2), 'beard');
  m.add(ellipsoid([hc[0], hc[1] - R * 0.3, hc[2] + R * 0.93], [R * 0.45, R * 0.13, R * 0.2]), shade(ramp, 0.3), 'beard');
}

function buildWeapon(m, w, hr, hl, pose, sk) {
  const t = w.type;
  const dir = norm(pose.weaponDir ?? w.dir ?? [0.1, 1, 0.5]);
  const blade = [P.white, P.grey1, P.grey1, P.grey2];
  if (t === 'sword') {
    const L = w.len ?? 8.5;
    const g0 = addv(hr, mulv(dir, 1.3));
    const tip = addv(hr, mulv(dir, L));
    m.line(g0, tip, w.blade ?? [P.white, P.grey1, P.grey1, P.grey1, P.grey2]);
    // crossguard perpendicular (lateral)
    const side = norm([dir[2] * 0.2 + 1, 0, -dir[0]]);
    m.line(addv(g0, mulv(side, -1.6)), addv(g0, mulv(side, 1.6)), w.guard ?? P.gold, { bias: 0.6 });
    m.line(hr, addv(hr, mulv(dir, -1.4)), P.brown);
  } else if (t === 'dagger') {
    const tip = addv(hr, mulv(dir, 4));
    m.line(addv(hr, mulv(dir, 0.9)), tip, [P.white, P.grey1]);
    m.line(hr, addv(hr, mulv(dir, -1)), P.brown);
  } else if (t === 'staff') {
    const top = addv(hr, mulv(dir, w.len ?? 9));
    const bot = addv(hr, mulv(dir, -(w.below ?? 6)));
    if (w.gnarled) {
      // twisted shaft: two interleaved lines with knots, and claw-like prongs cradling the orb
      const side = norm([dir[1], -dir[0] + 0.001, 0.3]);
      const wob = (t) => mulv(side, Math.sin(t * 9) * 0.35);
      const N = 8;
      for (let i = 0; i < N; i++) {
        const a = addv(addv(bot, mulv(dir, ((w.len ?? 9) + (w.below ?? 6)) * (i / N))), wob(i / N));
        const b = addv(addv(bot, mulv(dir, ((w.len ?? 9) + (w.below ?? 6)) * ((i + 1) / N))), wob((i + 1) / N));
        m.line(a, b, i % 3 === 1 ? P.darkBrown : i % 2 ? P.clay : P.brown);
      }
      const orbC = addv(top, mulv(dir, 1.4));
      for (const s of [1, -1]) m.line(addv(top, mulv(side, 0.3 * s)), addv(orbC, addv(mulv(side, 1.5 * s), mulv(dir, 0.9))), P.brown, { bias: 0.8 });
      const glow = pose.glow;
      m.add(sphere(orbC, glow ? 1.7 : 1.35), glow ? [P.cyan, P.cyan, P.white, P.white] : (w.orb ?? RAMPS.blue), 'orb');
      if (glow) {
        // sparkle rays around the glowing orb
        for (const [dx, dy] of [[0, 1], [1, 0.3], [-1, 0.3], [0.7, -0.7], [-0.7, -0.7]]) {
          const d2 = addv(mulv(side, dx), mulv(dir, dy));
          m.line(addv(orbC, mulv(d2, 2.6)), addv(orbC, mulv(d2, 3.4)), P.cyan, { bias: 20 });
        }
      }
    } else {
      m.line(bot, top, w.shaft ?? [P.brown, P.clay, P.clay, P.tan, P.clay]);
      if (w.skull) { // bone staff crowned by a (glowing) skull: cranium, jaw, dark sockets
        const glow = pose.glow;
        const sc = addv(top, mulv(dir, 1.2));
        m.add(sphere(sc, glow ? 1.45 : 1.25), w.skull, 'orb');
        m.add(sphere(addv(sc, [0, -0.75, 0.45]), 0.8), w.skull, 'orb');
        for (const s of [1, -1]) m.dot(addv(sc, [s * 0.5, 0.05, 1.1]), w.skullEyes ?? P.ink, 1, 1, { on: 'orb', tol: 2.5 });
        if (glow) {
          for (const [dx, dy] of [[0, 1], [1, 0.3], [-1, 0.3], [0.7, -0.7], [-0.7, -0.7]]) {
            const d2 = norm([dx, dy, 0]);
            m.line(addv(sc, mulv(d2, 2.4)), addv(sc, mulv(d2, 3.2)), w.skull[w.skull.length - 1], { bias: 20 });
          }
        }
      } else if (w.leaf) { // leaf sprouting from the staff head instead of an orb
        const side = norm([1, 0, -dir[0] * 0.3]);
        m.add(ellipsoid(addv(addv(top, mulv(dir, 1.1)), mulv(side, 0.6)), [0.8, 1.5, 0.45], rotZ(-0.5)), w.leaf, 'orb');
        m.line(addv(top, mulv(dir, -0.2)), addv(addv(top, mulv(dir, 0.8)), mulv(side, -1.2)), P.brown);
      } else m.add(sphere(addv(top, mulv(dir, 0.9)), 1.25), w.orb ?? RAMPS.blue, 'orb');
    }
  } else if (t === 'spear') {
    const top = addv(hr, mulv(dir, w.len ?? 13));
    const bot = addv(hr, mulv(dir, -(w.below ?? 8)));
    m.line(bot, top, w.shaft ?? [P.brown, P.clay, P.clay, P.clay]);
    if (w.coral) {
      // branching coral head: a central prong and two side branches with knobby tips
      const side = norm([dir[1], -dir[0] + 0.001, 0.3]);
      const tip = addv(top, mulv(dir, 3.0));
      m.line(top, tip, w.coral[2], { bias: 0.8 });
      m.add(sphere(tip, 0.55), w.coral, 'spearhead');
      for (const s of [1, -1]) {
        const a = addv(top, mulv(dir, s > 0 ? 0.6 : 1.4));
        const b = addv(addv(a, mulv(side, 1.4 * s)), mulv(dir, 1.3));
        m.line(a, b, w.coral[1], { bias: 0.8 });
        m.add(sphere(b, 0.45), w.coral, 'spearhead');
      }
    } else {
      const tip = addv(top, mulv(dir, 2.6));
      m.line(top, tip, P.white, { bias: 0.8 });
      m.add(ellipsoid(addv(top, mulv(dir, 1.1)), [0.7, 1.3, 0.7]), RAMPS.steel, 'spearhead');
    }
  } else if (t === 'hammer') {
    const L = w.len ?? 5.5;
    const end = addv(hr, mulv(dir, L));
    m.line(addv(hr, mulv(dir, -1)), end, P.brown);
    const side = norm([1, 0, 0]);
    m.add(box(end, [1.0, 1.1, 1.8], 0.25, w.rot ?? null), RAMPS.iron, 'hammer');
  } else if (t === 'cane') {
    const bot = pose.caneBottom ?? [hr[0] + 0.5, 0.2, hr[2] + 1.5];
    m.line(bot, addv(hr, [0, 1.6, 0]), [P.brown, P.clay, P.clay]);
    m.line(addv(hr, [0, 1.6, 0]), addv(hr, [0, 2.2, 1.2]), P.clay);
  } else if (t === 'claw') {
    for (const d of [-0.5, 0, 0.5]) m.line(addv(hr, [d, 0, 0.8]), addv(hr, [d, 0.3 + 0.2, 3.0]), P.grey1, { bias: 0.6 });
  }
}
