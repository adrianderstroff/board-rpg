// UI/system graphics: window skin, cursors, board highlights, field effects,
// exit arrows, shadow.
import { Canvas, mix, dither, withAlpha, hex } from './raster.mjs';
import { P, X } from './palette.mjs';
import { inDiamond, isUpperEdge, diamondUV, rowHalf } from './iso.mjs';
import { mulberry32 } from './rng.mjs';

const A = withAlpha;

// ---------------------------------------------------------------- window skin (48x48, 8px borders)
export function windowSkin() {
  const S = 48, c = new Canvas(S, S);
  const r = 4; // corner radius
  const inside = (x, y, inset) => {
    const lo = inset, hi = S - 1 - inset, rr = Math.max(0, r - inset);
    const cx = x < lo + rr ? lo + rr : x > hi - rr ? hi - rr : x;
    const cy = y < lo + rr ? lo + rr : y > hi - rr ? hi - rr : y;
    if (x < lo || x > hi || y < lo || y > hi) return false;
    return (x - cx) ** 2 + (y - cy) ** 2 <= rr * rr + 0.6 * rr;
  };
  const top = P.blueDark, bot = P.navy;
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      if (!inside(x, y, 0)) continue;
      let col;
      if (!inside(x, y, 1)) col = P.ink;
      else if (!inside(x, y, 2)) col = y < S / 2 && x < S - 3 ? P.yellow : P.gold;
      else if (!inside(x, y, 3)) col = P.tan;
      else if (!inside(x, y, 4)) col = P.ink;
      else {
        // body: vertical gradient blueDark -> navy with ordered dither
        const t = (y - 4) / (S - 9);
        col = dither(x, y, t) ? bot : top;
        if (t < 0.18) col = dither(x, y, t / 0.18) ? top : mix(top, P.blue, 0.35);
      }
      c.set(x, y, col);
    }
  // gold rivets in corners
  for (const [x, y] of [[2, 2], [S - 3, 2], [2, S - 3], [S - 3, S - 3]]) { c.set(x, y, P.white); }
  return c;
}

// ---------------------------------------------------------------- menu cursor: gloved hand pointing right
const HAND = [
  '................',
  '................',
  '.....###........',
  '....#www#.......',
  '....#wwww#######',
  '...#wwwwwwwwwwww#',
  '..#wwwwwwwwwwwww#',
  '..#wwwwwwww#####.',
  '..#wwwwwwwwww#...',
  '..#wwwwwwww##....',
  '..#swwwwwwwww#...',
  '...#swwwww###....',
  '....#sssww#......',
  '.....#####.......',
  '................',
  '................',
];
export function cursor() {
  const c = new Canvas(32, 16);
  for (let f = 0; f < 2; f++)
    HAND.forEach((row, y) => [...row.slice(0, 16)].forEach((ch, x) => {
      const col = ch === '#' ? P.ink : ch === 'w' ? (y < 7 ? P.white : P.grey1) : ch === 's' ? P.grey2 : null;
      if (col != null) c.set(f * 16 + x + f - 1, y, col);
    }));
  return c;
}

// ---------------------------------------------------------------- board cursor (32x24 x2)
export function boardCursor() {
  const c = new Canvas(64, 24);
  for (let f = 0; f < 2; f++) {
    const main = f === 0 ? P.yellow : P.white, sub = f === 0 ? P.gold : P.yellow;
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 32; x++) {
        if (!inDiamond(x, y)) continue;
        const r = y, w = rowHalf(r);
        const edge = x - (16 - w) < 2 || 16 + w - 1 - x < 2 || (r === 0) || (r === 15);
        if (!edge) continue;
        // keep only the corner portions (brackets)
        const nearCorner = Math.min(...[[16, 0], [31.5, 7.5], [16, 15], [0, 7.5]].map(([cx, cy]) => Math.abs(x + 0.5 - cx) + 2 * Math.abs(y + 0.5 - cy))) < 13;
        if (!nearCorner) continue;
        c.set(f * 32 + x, y, (x + y) % 3 === 0 ? sub : main);
      }
  }
  const out = new Canvas(64, 24);
  for (let f = 0; f < 2; f++) out.blit(c.crop(f * 32, 0, 32, 24).outline(A(P.ink, 200)), f * 32, 0);
  return out;
}

// ---------------------------------------------------------------- highlights (32x16 x6)
export const HIGHLIGHTS = [
  ['move', P.blue, P.cyan],
  ['attack', P.red, P.hotRed],
  ['ability', P.greenDark, P.green],
  ['area', P.orange, P.yellow],
  ['path', P.white, P.white],
  ['disabled', P.grey3, P.grey2],
];
export function highlights() {
  const c = new Canvas(32 * HIGHLIGHTS.length, 16);
  HIGHLIGHTS.forEach(([name, fill, edge], i) => {
    const fa = name === 'path' ? 60 : name === 'disabled' ? 110 : 105;
    const ea = name === 'path' ? 150 : 235;
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 32; x++) {
        if (!inDiamond(x, y)) continue;
        const w = rowHalf(y);
        const onEdge = x - (16 - w) < 2 || 16 + w - 1 - x < 2 || y === 0 || y === 15;
        const inner = !onEdge && (x - (16 - w) < 4 || 16 + w - 1 - x < 4);
        let col = onEdge ? A(edge, ea) : inner ? A(mix(fill, edge, 0.4), fa + 30) : A(fill, fa);
        if (name === 'disabled' && !onEdge && (x + y) % 4 === 0) col = A(P.slate, 140);
        c.set(i * 32 + x, y, col);
      }
  });
  return c;
}

// ---------------------------------------------------------------- field effects (32x24, 8 cols)
function diamondAt(fn) {
  // diamond occupies y 8..23 of the 32x24 frame
  const c = new Canvas(32, 24);
  for (let y = 8; y < 24; y++) for (let x = 0; x < 32; x++) if (inDiamond(x, y, 8)) { const [u, v] = diamondUV(x, y, 8); const col = fn(x, y, u, v); if (col != null) c.set(x, y, col); }
  return c;
}
function flameShape(c, cx, by, h, w, cols) {
  // teardrop flame: outer, mid, core
  const layer = (sc, col, a = 255) => {
    const hh = h * sc, ww = w * sc;
    for (let y = Math.floor(by - hh); y <= by; y++) {
      const t = (by - y) / hh; // 0 bottom .. 1 tip
      const half = ww * Math.sqrt(Math.max(0, 1 - t)) * (t < 0.35 ? 0.8 + t : 1);
      for (let x = Math.floor(cx - half); x <= Math.ceil(cx + half - 1); x++) c.blend(x, y, A(col, a));
    }
  };
  layer(1, cols[0], 235); layer(0.72, cols[1]); layer(0.42, cols[2]);
}
function burning(f) {
  const rnd = mulberry32(100 + f);
  const c = diamondAt((x, y, u, v) => {
    const d = Math.hypot(u - 8, v - 8) / 8;
    return d < 1 ? A(mix(P.red, P.orange, 1 - d), Math.round(90 * (1 - d * 0.6))) : null;
  });
  // embers on the ground
  for (let i = 0; i < 6; i++) { const x = 6 + Math.floor(rnd() * 20), y = 12 + Math.floor(rnd() * 9); if (inDiamond(x, y, 8)) c.set(x, y, rnd() > 0.5 ? P.yellow : P.orange); }
  const flames = [[16, 20, 16, 4.5], [9, 17, 10, 3.2], [23, 17, 11, 3.2], [13, 22, 9, 3], [20, 22, 10, 3], [16, 14, 8, 2.6]];
  flames.forEach(([x, y, h, w], i) => {
    const k = Math.sin((f + i * 1.7) * 1.6);
    flameShape(c, x + Math.round(Math.sin(f * 1.3 + i) * 0.8), y, h * (0.8 + 0.2 * k), w, [P.red, P.orange, P.yellow]);
  });
  // sparks
  for (let i = 0; i < 3; i++) { const x = 8 + ((i * 7 + f * 5) % 17), y = 6 - ((f * 3 + i * 4) % 7); c.set(x, y, P.yellow); }
  return c;
}
function poisonous(f) {
  const c = diamondAt((x, y, u, v) => {
    const d = Math.hypot(u - 8, v - 8) / 8;
    if (d >= 1) return null;
    const wob = Math.sin(u * 0.9 + f * 1.5) * Math.cos(v * 0.8 - f) * 0.5 + 0.5;
    return A(wob > 0.6 ? P.magenta : P.purple, Math.round(120 * (1 - d * 0.5)));
  });
  const bubbles = [[10, 18], [17, 15], [22, 19], [14, 21], [19, 11]];
  bubbles.forEach(([bx, by], i) => {
    const ph = (f + i) % 4;
    const y = by - ph * 3, r = 1 + ((i + f) % 2);
    c.ellipse(bx + 0.5, y + 0.5, r + 0.5, r + 0.5, A(X.purpleLight, 220), true);
    c.set(bx - (r > 1 ? 1 : 0), y - (r > 1 ? 1 : 0), A(P.pink, 255));
    if (ph === 3) { c.set(bx - 2, y - 2, A(P.magenta, 200)); c.set(bx + 2, y - 2, A(P.magenta, 200)); }
  });
  return c;
}
function frozen(f) {
  const c = diamondAt((x, y, u, v) => {
    const d = Math.hypot(u - 8, v - 8) / 8;
    if (d >= 1.05) return null;
    const stripe = ((u - v + f * 4) % 16 + 16) % 16;
    if (stripe < 1.2) return A(P.white, 200);
    return A(d > 0.85 ? P.white : P.cyan, d > 0.85 ? 150 : 110);
  });
  const shards = [[9, 16, 5], [22, 15, 6], [15, 20, 4], [18, 12, 4]];
  shards.forEach(([x, y, h]) => {
    c.polygon([[x - 1.5, y], [x, y - h], [x + 1.5, y]], A(mix(P.cyan, P.white, 0.4), 230), true);
    c.line(x, y - h + 1, x, y - 1, A(P.white, 255));
  });
  // twinkle
  const tw = [[12, 12], [20, 18], [16, 9], [25, 14]][f];
  c.set(tw[0], tw[1], P.white); c.set(tw[0] - 1, tw[1], A(P.white, 180)); c.set(tw[0] + 1, tw[1], A(P.white, 180));
  c.set(tw[0], tw[1] - 1, A(P.white, 180)); c.set(tw[0], tw[1] + 1, A(P.white, 180));
  return c;
}
function sticky(f) {
  const goo = mix(P.greenDark, P.brown, 0.45), gooD = mix(P.greenDeep, P.darkBrown, 0.5), gooL = mix(P.green, P.sand, 0.3);
  const c = diamondAt((x, y, u, v) => {
    const n = Math.sin(u * 1.1) * Math.cos(v * 0.9) * 0.3 + Math.hypot(u - 8, v - 8) / 8;
    if (n > 0.9) return null;
    if (n > 0.78) return A(gooD, 220);
    return A(goo, 225);
  });
  const blobs = [[11, 16], [20, 18], [16, 13], [15, 20]];
  blobs.forEach(([x, y], i) => {
    const ph = (f + i) % 4;
    const r = ph === 3 ? 0 : 1 + ph * 0.5;
    if (r) { c.ellipse(x + 0.5, y + 0.5 - ph * 0.5, r + 0.3, r, A(gooL, 240)); c.set(x - 1 + (r > 1 ? 0 : 1), y - ph * 0.5 - (r > 1 ? 1 : 0), A(P.white, 230)); }
    else { c.set(x - 2, y, A(gooL, 220)); c.set(x + 2, y, A(gooL, 220)); c.set(x, y - 2, A(gooL, 220)); }
  });
  return c;
}
function trap() {
  const c = new Canvas(32, 24);
  // metal jaw snare lying on the diamond center (16, 16)
  const cx = 16, cy = 16;
  c.ellipse(cx, cy, 7, 3.5, P.grey3);
  c.ellipse(cx, cy, 5.5, 2.5, P.slate);
  c.ellipse(cx, cy - 0.2, 4.2, 1.8, A(P.darkBrown, 255));
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; const x = cx + Math.cos(a) * 5, y = cy + Math.sin(a) * 2.4; c.set(x, y - 1, P.grey1); c.set(x, y - 2, P.white); }
  c.fillRect(cx - 1, cy - 1, 3, 2, P.grey2);
  c.line(cx + 6, cy + 1, cx + 11, cy + 3, P.grey2); // chain
  c.set(cx + 12, cy + 3, P.grey3);
  c.outline(A(P.ink, 220));
  return c;
}
export function fieldEffects() {
  const c = new Canvas(32 * 8, 24 * 5);
  for (let f = 0; f < 4; f++) {
    c.blit(burning(f), f * 32, 0);
    c.blit(poisonous(f), f * 32, 24);
    c.blit(frozen(f), f * 32, 48);
    c.blit(sticky(f), f * 32, 72);
  }
  c.blit(trap(), 0, 96);
  return c;
}

// ---------------------------------------------------------------- exit arrows (32x16 x8)
// Directions: 0 NE (grid -y), 1 SE (grid +x), 2 SW (grid +y), 3 NW (grid -x); 4-7 disabled.
const uvToScreen = (u, v) => [16 + (u - v), (u + v) / 2];
export function exitArrows() {
  const c = new Canvas(32 * 8, 16);
  // arrow in "direction space": along +d (forward) with lateral l; converted per direction to (u,v)
  const shape = [[-5.5, -1.3], [0.2, -1.3], [0.2, -4.2], [5.8, 0], [0.2, 4.2], [0.2, 1.3], [-5.5, 1.3]];
  const dirs = [[0, -1], [1, 0], [0, 1], [-1, 0]]; // (du, dv) for NE,SE,SW,NW  (u = grid x, v = grid y)
  for (let i = 0; i < 8; i++) {
    const [du, dv] = dirs[i % 4];
    const enabled = i < 4;
    const f = new Canvas(32, 16);
    const toPt = ([d, l], s = 1) => { const u = 8 + (du * d - dv * l) * s, v = 8 + (dv * d + du * l) * s; return uvToScreen(u, v); };
    const pts = shape.map((p) => toPt(p, 1.35));
    f.polygon(pts, enabled ? P.gold : A(P.grey2, 170));
    f.polygon(shape.map((p) => toPt([p[0] * 0.75 - 0.3, p[1] * 0.45], 1.35)), enabled ? P.yellow : A(P.grey1, 150));
    f.outline(enabled ? P.ink : A(P.ink, 150));
    c.blit(f, i * 32, 0);
  }
  return c;
}

// ---------------------------------------------------------------- shadow (16x8)
export function shadow() {
  const c = new Canvas(16, 8);
  for (let y = 0; y < 8; y++)
    for (let x = 0; x < 16; x++) {
      const d = Math.hypot((x + 0.5 - 8) / 7.5, (y + 0.5 - 4) / 3.6);
      if (d < 1) c.set(x, y, A(P.ink, Math.round(d < 0.6 ? 120 : 120 - (d - 0.6) * 200)));
    }
  return c;
}
