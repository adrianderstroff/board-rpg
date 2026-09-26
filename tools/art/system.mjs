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
// "sensed hidden thing" marker: floating ? above the cell + faint dashed diamond ring
const QMARK = [
  '.YYYY.',
  'YY..YY',
  'YY..YY',
  '....YY',
  '...GG.',
  '..GG..',
  '..GG..',
  '......',
  '..GG..',
  '..GG..',
];
function sensed() {
  const ring = new Canvas(32, 24);
  for (let y = 8; y < 24; y++)
    for (let x = 0; x < 32; x++) {
      if (!inDiamond(x, y, 8)) continue;
      const w = rowHalf(y - 8);
      const edge = x - (16 - w) < 2 || 16 + w - 1 - x < 2;
      if (edge && Math.floor((x + 1) / 3) % 2 === 0) ring.set(x, y, A(P.yellow, 150));
    }
  const q = new Canvas(32, 24);
  QMARK.forEach((row, j) => [...row].forEach((ch, i) => {
    const col = ch === 'Y' ? (j < 2 ? P.yellow : P.gold) : ch === 'G' ? P.gold : ch === 'W' ? P.white : null;
    if (col != null) q.set(13 + i, 1 + j, col);
  }));
  q.set(15, 1, P.white); q.set(14, 1, P.white);
  q.outline(P.ink);
  ring.blit(q, 0, 0);
  return ring;
}
// water puddle: translucent blue sheen, expanding ripple rings, falling droplets
function soaked(f) {
  const c = diamondAt((x, y, u, v) => {
    const n = Math.sin(u * 0.8 + 1) * Math.cos(v * 0.7) * 0.18 + Math.hypot(u - 8, v - 8) / 8;
    if (n > 0.9) return null;
    if (n > 0.8) return A(P.blueDark, 150); // wet rim
    const sheen = Math.sin((u - v) * 0.55 + f * (Math.PI / 2)) > 0.9 && n < 0.7;
    return sheen ? A(mix(P.cyan, P.white, 0.3), 190) : A(n < 0.45 ? P.blue : mix(P.blue, P.blueDark, 0.5), 160);
  });
  // ripple rings (screen-space ellipses, 2:1) growing and fading over the loop
  const ripples = [[12, 15, 0], [20, 18, 2]];
  ripples.forEach(([rx, ry, ph]) => {
    const k = (f + ph) % 4, R = 0.8 + k * 0.9, a = Math.round(235 - k * 40);
    const seen = new Set();
    for (let i = 0; i < 48; i++) {
      const t = (i / 48) * Math.PI * 2;
      const x = Math.round(rx + Math.cos(t) * R * 2), y = Math.round(ry + Math.sin(t) * R);
      if (seen.has(x + ',' + y) || !inDiamond(x, y, 8)) continue;
      seen.add(x + ',' + y);
      c.set(x, y, A(Math.sin(t) < 0 ? P.white : P.cyan, a));
    }
  });
  // droplets: one falling, one splashing
  const drops = [[18, 12], [11, 19], [23, 15], [15, 20]];
  const [dx, dy] = drops[f];
  c.set(dx, dy - 5, A(P.cyan, 220)); c.set(dx, dy - 6, A(P.white, 200));
  c.set(dx - 1, dy - 1, A(P.white, 200)); c.set(dx + 1, dy - 1, A(P.white, 200));
  const [gx, gy] = [[16, 16], [9, 14], [21, 21], [13, 11]][f];
  c.set(gx, gy, P.white); c.set(gx + 1, gy, A(P.white, 160));
  return c;
}
// freshly sown seeds: soil furrows, seeds, tiny sprouts swaying
function seeds(f) {
  const soil = mix(P.brown, P.darkBrown, 0.3);
  const c = diamondAt((x, y, u, v) => {
    const d = Math.hypot(u - 8, v - 8) / 8;
    if (d > 0.92) return null;
    const row = (((u + 1) % 5) + 5) % 5;
    if (row < 1.2) return A(P.darkBrown, 200); // furrow
    return A(soil, d > 0.8 ? 120 : 170);
  });
  const light = mix(P.green, P.yellow, 0.35);
  const spots = [[9, 14], [15, 12], [21, 15], [12, 18], [18, 19], [24, 18], [15, 22]];
  spots.forEach(([x, y], i) => {
    if (i % 3 === 1) { // seed
      c.set(x, y, P.ink); c.set(x + 1, y, P.darkBrown); c.set(x, y - 1, A(X.sandPale, 200));
      return;
    }
    const sway = Math.round(Math.sin((f + i) * (Math.PI / 2)) * 1);
    const h = 2 + (i % 2);
    c.set(x, y, P.greenDark);
    for (let k = 1; k < h; k++) c.set(x + (k === h - 1 ? sway : 0), y - k, P.green);
    const tx = x + sway, ty = y - h;
    c.set(tx - 1, ty, light); c.set(tx + 1, ty, light);
    c.set(tx - 2, ty + (f + i) % 2, A(light, 220)); c.set(tx + 2, ty + (f + i + 1) % 2, A(light, 220));
    c.set(tx, ty, P.greenDark);
  });
  return c;
}
export function fieldEffects() {
  const c = new Canvas(32 * 8, 24 * 7);
  for (let f = 0; f < 4; f++) {
    c.blit(burning(f), f * 32, 0);
    c.blit(poisonous(f), f * 32, 24);
    c.blit(frozen(f), f * 32, 48);
    c.blit(sticky(f), f * 32, 72);
  }
  c.blit(trap(), 0, 96);
  c.blit(sensed(), 32, 96);
  for (let f = 0; f < 4; f++) {
    c.blit(soaked(f), f * 32, 120);
    c.blit(seeds(f), f * 32, 144);
  }
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

// ---------------------------------------------------------------- wall signs (48x14 x2)
// Flat artwork the board paints onto a wall face (isometrically distorted there):
// 0 "INN" in small capitals, 1 a potion bottle (the spell shop).
// Small capitals, 7 rows: [row offset, rows].
const GLYPHS = {
  I: [0, ['###', '.#.', '.#.', '.#.', '.#.', '.#.', '###']],
  N: [0, ['#...#', '##..#', '#.#.#', '#.#.#', '#..##', '#...#', '#...#']],
};
function drawWord(c, word, x0, y0, fill, shade) {
  let x = x0;
  for (const ch of word) {
    const [dy, rows] = GLYPHS[ch];
    rows.forEach((row, y) => [...row].forEach((p, dx) => { if (p === '#') c.set(x + dx, y0 + dy + y, dy + y > 3 ? shade : fill); }));
    x += rows[0].length + 1;
  }
}
const wordWidth = (word) => [...word].reduce((w, ch) => w + GLYPHS[ch][1][0].length + 1, -1);
/** A round potion flask with glowing violet liquid, centred in a W×H frame. */
function potionSign(W, H) {
  const c = new Canvas(W, H);
  const cx = W / 2;
  // cork and neck
  for (let x = -1; x <= 0; x++) c.set(Math.floor(cx) + x, 0, P.tan);
  for (let y = 1; y <= 3; y++) for (let x = -1; x <= 0; x++) c.set(Math.floor(cx) + x, y, x < 0 ? P.grey1 : P.grey2);
  // round body (rows 4..12), liquid below row 7, glass above
  const r = 5, cy = 8.5;
  for (let y = 4; y <= 13; y++)
    for (let x = 0; x < W; x++) {
      const d = Math.hypot(x + 0.5 - cx, (y + 0.5 - cy) * 1.05);
      if (d > r) continue;
      let col = y < 7 ? P.grey1 : d > r - 1.2 ? X.purpleDark : x + 0.5 < cx - 1 ? P.magenta : P.purple;
      if (y === 7 && d < r - 0.5) col = P.pink; // liquid surface
      c.set(x, y, col);
    }
  c.set(Math.floor(cx) - 3, 5, P.white); // glint on the glass
  c.set(Math.floor(cx) - 3, 9, P.pink);
  c.set(Math.floor(cx) - 2, 10, P.pink);
  c.outline(P.ink);
  return c;
}

export function wallSigns() {
  const W = 48, H = 14;
  const out = new Canvas(W * 2, H);
  const inn = new Canvas(W, H);
  drawWord(inn, 'INN', Math.floor((W - wordWidth('INN')) / 2), 3, P.yellow, P.gold);
  inn.outline(P.ink);
  const magic = potionSign(W, H);
  out.blit(inn, 0, 0);
  out.blit(magic, W, 0);
  return out;
}
