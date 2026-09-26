// Battle backgrounds (480x190) and title background (480x270).
import { Canvas, mix, dither, withAlpha } from './raster.mjs';
import { P, X } from './palette.mjs';
import { mulberry32, fbm, vnoise, hash2 } from './rng.mjs';

const A = withAlpha;

/** Vertical banded gradient through `stops` ([[t, color], ...]) with ordered dither between bands. */
function gradient(c, y0, y1, stops, x0 = 0, x1 = c.width) {
  for (let y = y0; y < y1; y++) {
    const t = (y - y0) / Math.max(1, y1 - y0 - 1);
    let i = 0;
    while (i < stops.length - 2 && t > stops[i + 1][0]) i++;
    const [ta, ca] = stops[i], [tb, cb] = stops[i + 1];
    const k = Math.min(1, Math.max(0, (t - ta) / (tb - ta)));
    for (let x = x0; x < x1; x++) c.set(x, y, dither(x, y, k) ? cb : ca);
  }
}
/** Fill below a height profile h(x) (top y) with color function col(x,y,depth). */
function fillProfile(c, h, col, yMax = c.height) {
  for (let x = 0; x < c.width; x++) {
    const top = Math.round(h(x));
    for (let y = Math.max(0, top); y < yMax; y++) { const cc = col(x, y, y - top); if (cc != null) c.set(x, y, cc); }
  }
}
function sun(c, cx, cy, r, core, glow) {
  for (let y = Math.floor(cy - r * 2.2); y <= cy + r * 2.2; y++)
    for (let x = Math.floor(cx - r * 2.2); x <= cx + r * 2.2; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      if (d < r) c.set(x, y, d < r - 1.5 ? core : glow[0]);
      else if (d < r * 1.5 && dither(x, y, 1 - (d - r) / (r * 0.5))) c.set(x, y, glow[1]);
    }
}
function cloud(c, cx, cy, w, col, shadow) {
  const rnd = mulberry32(cx * 7 + cy);
  for (let i = 0; i < 5; i++) {
    const ox = (i - 2) * w * 0.22 + (rnd() - 0.5) * 4, r = w * (0.18 + rnd() * 0.12);
    c.ellipse(cx + ox, cy - r * 0.3, r, r * 0.45, col);
  }
  for (let x = Math.floor(cx - w * 0.55); x < cx + w * 0.55; x++) c.set(x, Math.round(cy + 1), shadow);
}
function mesas(c, base, seed, colTop, colFace, colShade, heightMul = 1) {
  const rnd = mulberry32(seed);
  let x = -20;
  while (x < c.width + 20) {
    const w = 40 + rnd() * 70, h = (10 + rnd() * 22) * heightMul, slope = 4 + rnd() * 6;
    const top = base - h;
    for (let xx = Math.floor(x); xx < x + w; xx++) {
      if (xx < 0 || xx >= c.width) continue;
      let ty;
      if (xx < x + slope) ty = base - (h * (xx - x)) / slope;
      else if (xx > x + w - slope) ty = base - (h * (x + w - xx)) / slope;
      else ty = top + Math.round(vnoise(xx * 0.15, seed, seed) * 2);
      for (let y = Math.round(ty); y < base; y++) {
        const shade = xx > x + w * 0.62 || xx > x + w - slope;
        const k = y - ty;
        let col = k < 2 ? colTop : shade ? colShade : colFace;
        if (k > 3 && (y - Math.round(base)) % 6 === 0) col = shade ? colTop : colShade; // strata
        c.set(xx, y, col);
      }
    }
    x += w * (0.55 + rnd() * 0.6);
  }
}
function cactusSil(c, x, y, h, col) {
  c.fillRect(x, y - h, 3, h, col);
  c.fillRect(x - 3, y - Math.round(h * 0.6), 3, 2, col); c.fillRect(x - 3, y - Math.round(h * 0.85), 2, Math.round(h * 0.25) + 1, col);
  c.fillRect(x + 3, y - Math.round(h * 0.45), 3, 2, col); c.fillRect(x + 4, y - Math.round(h * 0.7), 2, Math.round(h * 0.25) + 1, col);
}
function palmSil(c, x, y, h, col, lean = 1) {
  for (let i = 0; i < h; i++) { const xx = x + Math.round(Math.sin((i / h) * 1.2) * 5 * lean); c.fillRect(xx, y - i, 3, 1, col); }
  const tx = x + Math.round(Math.sin(1.2) * 5 * lean), ty = y - h;
  for (let k = 0; k < 7; k++) {
    const a = -Math.PI + (k / 6) * Math.PI;
    for (let i = 0; i < 12; i++) {
      const t = i / 12;
      c.fillRect(Math.round(tx + Math.cos(a) * i * 1.1), Math.round(ty + Math.sin(a) * i * 0.6 + t * t * 7), 3, t < 0.7 ? 2 : 1, col);
    }
  }
}

// ---------------------------------------------------------------- desert battleback
export function battlebackDesert() {
  const W = 480, H = 190, c = new Canvas(W, H);
  gradient(c, 0, 100, [[0, P.blueDark], [0.45, P.blue], [0.8, mix(P.blue, P.grey1, 0.55)], [1, P.sandLight]]);
  sun(c, 390, 28, 9, P.white, [P.yellow, mix(P.blue, P.grey1, 0.6)]);
  cloud(c, 90, 30, 50, P.grey1, P.grey2); cloud(c, 250, 18, 36, P.grey1, P.grey2); cloud(c, 330, 52, 28, mix(P.grey1, P.sandLight, 0.5), P.grey2);
  mesas(c, 96, 7, mix(P.clay, P.grey2, 0.55), mix(P.clay, P.grey2, 0.45), mix(P.brown, P.grey3, 0.5), 0.8);
  mesas(c, 102, 11, P.tan, P.clay, P.brown, 1.1);
  // far dunes
  fillProfile(c, (x) => 96 + Math.sin(x * 0.021) * 5 + Math.sin(x * 0.053 + 1) * 3, (x, y, d) => (d < 1 ? P.sandLight : dither(x, y, 0.35) ? P.tan : P.sand), 112);
  // near dunes band
  fillProfile(c, (x) => 104 + Math.sin(x * 0.013 + 2) * 6 + Math.sin(x * 0.041) * 2, (x, y, d) => (d < 1 ? P.sandLight : d < 3 ? P.sand : dither(x, y, 0.25) ? P.tan : P.sand), 118);
  // ground plane with perspective ripples
  for (let y = 112; y < H; y++) {
    const z = (y - 106) / (H - 106); // 0 far .. 1 near
    for (let x = 0; x < W; x++) {
      if (y < 118 && c.alpha(x, y) && y < 104 + Math.sin(x * 0.013 + 2) * 6 + Math.sin(x * 0.041) * 2 + 6) continue;
      const depth = 1 / (0.08 + z);
      const w = Math.sin(depth * 7 + Math.sin(x * 0.018 + depth * 0.7) * 1.4 + Math.sin(x * 0.047) * 0.5);
      let col = P.sand;
      if (w > 0.93) col = P.sandLight;
      else if (w < -0.9 && z > 0.15) col = P.tan;
      else if (w < -0.6 && dither(x, y, 0.3)) col = P.tan;
      const n = fbm(x * 0.02, y * 0.05, 5, 3);
      if (n > 0.62 && dither(x, y, (n - 0.62) * 3)) col = mix(P.sand, P.tan, 0.5) === col ? col : P.tan;
      if (z > 0.75 && dither(x, y, (z - 0.75) * 1.2)) col = col === P.sandLight ? P.sand : col === P.sand ? P.tan : P.clay;
      c.set(x, y, col);
    }
  }
  // props: small rocks, bones, distant cacti
  cactusSil(c, 44, 108, 13, P.greenDeep); cactusSil(c, 418, 110, 10, P.greenDeep);
  const rnd = mulberry32(42);
  for (let i = 0; i < 14; i++) {
    const x = Math.floor(rnd() * W), y = 124 + Math.floor(rnd() * 60), r = 1 + (y - 120) / 22;
    c.ellipse(x, y, r * 1.6, r, P.grey3); c.ellipse(x - 0.5, y - 0.6, r * 1.1, r * 0.55, P.grey2);
    c.fillRect(Math.floor(x - r * 1.6), Math.floor(y + r - 0.5), Math.ceil(r * 3.2), 1, A(P.brown, 160));
  }
  // skull
  c.ellipse(70, 170, 4, 3, P.grey1); c.fillRect(67, 171, 6, 2, P.grey1); c.set(68, 169, P.ink); c.set(71, 169, P.ink);
  return c;
}

// ---------------------------------------------------------------- village battleback
export function battlebackVillage() {
  const W = 480, H = 190, c = new Canvas(W, H);
  gradient(c, 0, 104, [[0, P.blueDark], [0.5, P.blue], [0.85, mix(P.blue, P.grey1, 0.6)], [1, P.sandLight]]);
  cloud(c, 140, 26, 44, P.grey1, P.grey2); cloud(c, 360, 36, 38, P.grey1, P.grey2);
  mesas(c, 88, 5, mix(P.clay, P.grey2, 0.55), mix(P.clay, P.grey2, 0.45), mix(P.brown, P.grey3, 0.5), 0.7);
  // back row of adobe houses
  const rnd = mulberry32(9);
  let x = -10;
  const houses = [];
  while (x < W) { const w = 34 + Math.floor(rnd() * 36), h = 22 + Math.floor(rnd() * 26); houses.push([x, w, h, rnd() > 0.7]); x += w + 4 + Math.floor(rnd() * 16); }
  for (const [hx, w, h, dome] of houses) {
    const base = 108, top = base - h;
    for (let yy = top; yy < base; yy++)
      for (let xx = hx; xx < hx + w; xx++) {
        const side = xx > hx + w - 9;
        c.set(xx, yy, yy === top ? P.sandLight : side ? P.clay : dither(xx, yy, 0.12) ? P.sand : P.tan);
      }
    for (let xx = hx + 3; xx < hx + w - 10; xx += 7) c.fillRect(xx, top - 2, 4, 2, P.tan);
    if (dome) { c.ellipse(hx + w / 2 - 4, top, w * 0.28, w * 0.24, (px, py, nx, ny) => (py > top ? null : nx < 0.2 ? P.sandLight : P.sand)); }
    // windows & door
    for (let k = 0; k < Math.floor((w - 12) / 11); k++) { const wx = hx + 5 + k * 11; c.fillRect(wx, top + 7, 4, 5, P.darkBrown); c.fillRect(wx, top + 7, 4, 1, P.brown); c.fillRect(wx, top + 12, 4, 1, P.sandLight); }
    if (w > 40) { c.fillRect(hx + Math.floor(w / 2) - 4, base - 12, 7, 12, P.brown); c.fillRect(hx + Math.floor(w / 2) - 4, base - 12, 7, 1, P.darkBrown); }
  }
  palmSil(c, 60, 110, 38, P.greenDeep); palmSil(c, 300, 112, 44, P.greenDeep, -1); palmSil(c, 455, 110, 30, P.greenDeep);
  for (const px of [60, 300, 455]) for (let y = 70; y < 112; y++) for (let xx = px - 16; xx < px + 16; xx++) if (c.get(xx, y) === P.greenDeep && c.get(xx - 1, y - 1) !== P.greenDeep) c.set(xx, y, P.greenDark);
  // low wall
  for (let yy = 104; yy < 114; yy++) for (let xx = 0; xx < W; xx++) c.set(xx, yy, yy === 104 ? P.sandLight : yy < 106 ? P.sand : ((xx >> 3) + (yy >> 2)) % 2 ? P.tan : mix(P.tan, P.clay, 0.5));
  // plaza ground: perspective tiles
  for (let y = 114; y < H; y++) {
    const z = (y - 108) / (H - 108);
    const depth = 1 / (0.12 + z);
    for (let xx = 0; xx < W; xx++) {
      const gx = ((xx - W / 2) / W) * 18 / (0.12 + z) * 0.5;
      const gy = depth * 3;
      const lineX = Math.abs(gx - Math.round(gx)) < 0.04 + z * 0.02;
      const lineY = Math.abs(gy - Math.round(gy)) < 0.06 * (1 + z * 2);
      let col = (Math.round(gx) + Math.round(gy)) % 2 ? P.sandLight : mix(P.sandLight, P.skinLight, 0.55);
      if (lineX || lineY) col = P.sand;
      if (z > 0.7 && dither(xx, y, (z - 0.7) * 1.5)) col = col === P.sand ? P.tan : P.sand;
      c.set(xx, y, col);
    }
  }
  // pots and crates near the wall
  const pot = (px, py, s) => { c.ellipse(px, py, 4 * s, 4.5 * s, P.rust); c.ellipse(px - 1, py - 1, 2.5 * s, 3 * s, P.tan); c.fillRect(Math.round(px - 1.5 * s), Math.round(py - 6 * s), Math.round(3 * s), Math.round(2 * s), P.brown); };
  pot(28, 118, 1); pot(38, 120, 0.8); pot(440, 119, 1.1);
  c.fillRect(410, 108, 14, 12, P.clay); c.fillRect(410, 108, 14, 2, P.tan); c.strokeRect(410, 108, 14, 12, P.brown);
  return c;
}

// ---------------------------------------------------------------- shared helpers (harbor, forest, ruins, elvenglade)
// Each backdrop below keeps its walkable ground starting at a fixed row FLOOR (graphics.yaml `floor`),
// with the far wall / horizon above it; battlers stand at rows ~122-182.

/** One step lighter along the palette ramps (used for dithered light: shafts, dapples, glows). */
const LIGHT = new Map();
for (const ramp of [
  [P.ink, P.navy, P.slate, P.grey3, P.grey2, P.grey1, P.white],
  [P.teal, P.greenDeep, P.greenDark, P.green, mix(P.green, P.yellow, 0.5), P.yellow],
  [P.darkBrown, P.brown, P.clay, P.tan, P.sand, P.sandLight, X.sandPale],
  [P.navy, P.blueDark, P.blue, P.cyan],
  [P.darkRed, P.rust, P.orange, P.gold, P.yellow],
]) for (let i = 0; i + 1 < ramp.length; i++) if (!LIGHT.has(ramp[i])) LIGHT.set(ramp[i], ramp[i + 1]);
const lighter = (col) => LIGHT.get(col) ?? mix(col, X.sandPale, 0.3);
const DARK = new Map();
for (const [k, v] of LIGHT) if (!DARK.has(v)) DARK.set(v, k);
const darker = (col) => DARK.get(col) ?? mix(col, P.ink, 0.3);

/** Replace colors via `map` wherever dither(x, y, t(x, y)) holds. */
function tint(c, x0, y0, x1, y1, t, map) {
  for (let y = Math.max(0, y0); y < Math.min(c.height, y1); y++)
    for (let x = Math.max(0, x0); x < Math.min(c.width, x1); x++) {
      const k = t(x, y);
      if (k > 0 && dither(x, y, k)) { const n = map(c.get(x, y)); if (n != null) c.set(x, y, n); }
    }
}
/** Diagonal light shaft from (x0, 0) leaning by `lean` px per row, `w` wide, fading in and out. */
function lightShaft(c, x0, lean, w, strength, y1, map = lighter) {
  tint(c, 0, 0, c.width, y1, (x, y) => {
    const u = Math.abs(x - (x0 + y * lean)) / (w / 2);
    if (u >= 1) return 0;
    const fade = Math.min(1, y / 20) * Math.min(1, (y1 - y) / 30);
    return strength * (1 - u * u) * fade;
  }, map);
}
function gull(c, x, y, col) { for (const [dx, dy] of [[-3, 1], [-2, 0], [-1, 0], [0, 1], [1, 0], [2, 0], [3, 1]]) c.set(x + dx, y + dy, col); }
/** Staggered block masonry color at (x, y) relative to origin (ox, oy). */
function masonry(x, y, ox, oy, seed, cols, mortar, bw = 9, bh = 4) {
  const r = Math.floor((y - oy) / bh), off = ((r % 2) + 2) % 2 ? Math.floor(bw / 2) : 0;
  const bx = Math.floor((x - ox + off) / bw);
  if ((((y - oy) % bh) + bh) % bh === bh - 1 || (((x - ox + off) % bw) + bw) % bw === bw - 1) return mortar;
  return cols[Math.floor(hash2(bx, r, seed) * cols.length)];
}
/** Barrel-tile roof color at (x, y) with rows starting at oy. */
function roofTile(x, y, oy) {
  const r = Math.floor((y - oy) / 3), ry = (y - oy) % 3;
  if (ry === 2) return P.darkRed;
  const k = (((x + r * 2) % 4) + 4) % 4;
  return k === 0 ? P.darkRed : k === 1 ? P.tan : P.rust;
}
/** Leafy mass: fbm threshold that loosens with `density(x,y)`; shaded dark->light toward the top-left. */
function foliage(c, x0, y0, x1, y1, seed, density, cols, holes = true) {
  const [dk, md, lt, hi] = cols;
  const leaf = (x, y) => fbm(x * 0.06, y * 0.09, seed, 4) + density(x, y) > 1;
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) {
      if (!leaf(x, y)) continue;
      const n = fbm(x * 0.18, y * 0.22, seed + 5, 2);
      let col = n > 0.62 ? lt : n < 0.4 ? dk : md;
      if (!leaf(x - 1, y - 1) || !leaf(x, y - 2)) col = hi ?? lt;
      else if (!leaf(x + 1, y + 2)) col = dk;
      if (holes && n > 0.7 && hash2(x, y, seed) > 0.5) col = hi ?? lt;
      c.set(x, y, col);
    }
}
/** Tree trunk (light from the left) with bark streaks and flared roots down to `base`. */
function trunk(c, cx, hw, top, base, ramp, seed, flare = 1) {
  const [d0, d1, d2, d3] = ramp;
  for (let y = top; y < base; y++) {
    const r = Math.max(0, y - (base - 14)) / 14;
    const w = hw + r * r * hw * 1.4 * flare + Math.sin(y * 0.05 + seed) * 0.8;
    for (let x = Math.floor(cx - w); x <= cx + w; x++) {
      const u = (x + 0.5 - cx) / w; // -1..1
      const streak = vnoise(x * 0.7, y * 0.06, seed) - 0.5;
      let s = 0.62 - u * 0.55 + streak * 0.5;
      if (r > 0.3 && Math.abs(Math.sin(u * 5 + seed)) < 0.18) s -= 0.35; // root gaps
      c.set(x, y, s > 0.85 ? d3 : s > 0.55 ? d2 : s > 0.25 ? d1 : d0);
    }
  }
}
/** Perspective grass floor between rows y0..y1. col(x,y,z) may return null to keep. */
function ground(c, y0, y1, col) {
  for (let y = y0; y < y1; y++) { const z = (y - y0) / (y1 - y0); for (let x = 0; x < c.width; x++) { const cc = col(x, y, z); if (cc != null) c.set(x, y, cc); } }
}
/** Calm grass: depth-stretched two-tone patches plus tiny blades. tones = [dark, mid, light]. */
function grassPx(x, y, z, seed, [dk, md, lt]) {
  const n = fbm(x * 0.02, (1 / (0.18 + z)) * 1.2, seed, 3);
  let col = md;
  if (n > 0.56) col = dither(x, y, Math.min(1, (n - 0.56) * 12)) ? lt : md;
  else if (n < 0.42) col = dither(x, y, Math.min(1, (0.42 - n) * 9)) ? dk : md;
  const th = 0.975 - z * 0.025;
  if (hash2(x, y, seed) > th) col = dk;
  else if (hash2(x, y + 1, seed) > th) col = lighter(col);
  return col;
}
function bush(c, bx, by, r, [dk, md, lt, sh]) {
  c.ellipse(bx, by, r * 1.5, r, (x, y, nx, ny) => { const k = nx * -0.6 + ny * -0.8 + (hash2(x, y, 2) - 0.5) * 0.4; return k > 0.55 ? lt : k > -0.1 ? md : dk; });
  c.fillRect(Math.round(bx - r * 1.3), Math.round(by + r - 1), Math.round(r * 2.6), 1, sh);
}
function barrel(c, x, y) {
  c.ellipse(x, y - 6, 5, 7, (px, py, nx) => (nx < -0.4 ? P.tan : nx > 0.45 ? P.brown : P.clay));
  for (const dy of [-10, -3]) c.fillRect(x - 5, y + dy, 11, 1, P.darkBrown);
  c.ellipse(x, y - 12.5, 4, 1.5, P.brown); c.fillRect(x - 5, y, 11, 1, A(P.ink, 120), true);
}
function crate(c, x, y, s) {
  c.fillRect(x, y - s, s, s, P.clay); c.fillRect(x, y - s, s, 2, P.tan); c.strokeRect(x, y - s, s, s, P.darkBrown);
  c.line(x + 1, y - s + 2, x + s - 2, y - 2, P.brown); c.fillRect(x + s - 2, y - s + 2, 1, s - 3, P.brown);
}

// ---------------------------------------------------------------- harbor battleback (Saltmere, day)  floor 112
export function battlebackHarbor() {
  const W = 480, H = 190, c = new Canvas(W, H);
  const HOR = 70, FLOOR = 112;
  gradient(c, 0, HOR, [[0, P.blueDark], [0.5, P.blue], [0.88, mix(P.blue, P.grey1, 0.6)], [1, P.grey1]]);
  cloud(c, 64, 20, 46, P.grey1, P.grey2); cloud(c, 236, 34, 30, P.grey1, P.grey2); cloud(c, 440, 14, 40, P.grey1, P.grey2);
  for (const [gx, gy, col] of [[178, 22, P.white], [192, 28, P.white], [262, 14, P.grey1], [120, 44, P.white], [470, 40, P.grey1]]) gull(c, gx, gy, col);
  // far headland with a lighthouse
  const coast = (x) => { const t = (x - 236) / 200; return t <= 0 || t >= 1 ? 0 : Math.sin(t * Math.PI) ** 0.7 * 8 + vnoise(x * 0.09, 3, 3) * 2; };
  for (let x = 0; x < W; x++) { const h = Math.round(coast(x)); for (let y = HOR - h; y < HOR; y++) c.set(x, y, y === HOR - h ? mix(P.greenDark, P.grey1, 0.55) : dither(x, y, 0.3) ? mix(P.greenDeep, P.grey2, 0.5) : mix(P.greenDeep, P.grey2, 0.62)); }
  { const lx = 372, ly = HOR - Math.round(coast(372)); c.fillRect(lx, ly - 12, 3, 12, P.grey1); c.fillRect(lx, ly - 8, 3, 2, P.red); c.fillRect(lx, ly - 4, 3, 2, P.red); c.fillRect(lx - 1, ly - 14, 5, 2, P.slate); c.set(lx + 1, ly - 14, P.yellow); }
  // sea
  gradient(c, HOR, FLOOR, [[0, mix(P.blue, P.grey1, 0.45)], [0.3, P.blue], [1, P.blueDark]]);
  for (let y = HOR; y < FLOOR; y++) {
    const z = (y - HOR) / (FLOOR - HOR), f = 0.3 / (0.25 + z * 1.6);
    for (let x = 0; x < W; x++) {
      const n = vnoise(x * f, y * 0.8, 11);
      if (n > 0.84) c.set(x, y, z < 0.25 ? P.grey1 : n > 0.9 ? P.grey1 : P.cyan);
      else if (n < 0.16 && z > 0.2) c.set(x, y, z > 0.6 ? P.navy : P.blueDark);
    }
  }
  // moored ship (stern left, bow right), waterline 100
  const WL = 100;
  c.polygon([[288, 82], [312, 82], [314, 88], [414, 88], [434, 80], [438, 81], [424, WL], [298, WL]], (x, y) => (y >= WL - 2 ? P.darkBrown : y > 94 ? P.brown : P.darkBrown));
  c.line(288, 82, 312, 82, P.tan); c.line(312, 83, 314, 87, P.tan); c.line(314, 88, 414, 88, P.tan); c.line(414, 88, 434, 80, P.tan);
  c.line(292, 92, 426, 92, P.clay); c.line(294, 93, 424, 93, P.clay);
  for (const wx of [293, 298, 303]) c.fillRect(wx, 85, 2, 2, P.gold);
  for (let wx = 322; wx < 410; wx += 12) c.fillRect(wx, 89, 3, 2, P.ink);
  for (let x = 296; x < 428; x++) for (let y = WL; y < WL + 6; y++) if (dither(x, y, 0.75 - (y - WL) * 0.12) && hash2(x >> 2, y, 5) > 0.25) c.set(x, y, P.navy);
  c.line(434, 81, 466, 68, P.darkBrown); c.line(434, 82, 466, 69, P.brown); // bowsprit
  const masts = [[346, 20, 1], [392, 28, 0.85]];
  for (const [mx, top, s] of masts) {
    c.line(mx - 12, 88, mx, top + 4, P.brown); c.line(mx + 12, 88, mx, top + 4, P.brown); // shrouds
  }
  c.line(346, 22, 466, 68, P.brown); c.line(392, 30, 466, 69, P.brown); c.line(346, 22, 392, 30, P.brown); c.line(346, 22, 290, 82, P.brown);
  for (const [mx, top, s] of masts) {
    c.fillRect(mx - 1, top, 3, 88 - top, P.darkBrown); c.fillRect(mx - 1, top, 1, 88 - top, P.brown);
    for (const [dy, hw] of [[8, 14], [26, 20], [44, 24]]) {
      const yy = top + Math.round(dy * s), w = Math.round(hw * s);
      c.line(mx - w - 1, yy, mx + w + 1, yy, P.darkBrown);
      for (let xx = -w; xx <= w; xx++) {
        const sag = Math.round((1 - (xx / w) ** 2) * 1.6);
        c.set(mx + xx, yy + 1, P.sandLight); c.set(mx + xx, yy + 2, sag > 0 ? P.sandLight : P.sand);
        for (let k = 0; k < sag; k++) c.set(mx + xx, yy + 3 + k, k === sag - 1 ? P.sand : P.sandLight);
        if ((xx + w) % 7 === 3) c.set(mx + xx, yy + 2, P.tan); // gaskets
      }
    }
    c.fillRect(mx - 3, top + Math.round(16 * s), 7, 2, P.brown); // top
    c.polygon([[mx + 2, top - 1], [mx + 12, top + 1], [mx + 2, top + 3]], P.red); c.line(mx + 2, top + 2, mx + 9, top + 1, P.darkRed);
  }
  // pier running out to sea
  const pierL = (y) => 212 + ((y - 92) / (FLOOR - 92)) * -8, pierR = (y) => 238 + ((y - 92) / (FLOOR - 92)) * 22;
  for (let y = 92; y < FLOOR; y++) {
    const z = (y - 92) / (FLOOR - 92), band = Math.floor(1 / (0.15 + z) * 6);
    for (let x = Math.round(pierL(y)); x < pierR(y); x++) c.set(x, y, band % 2 ? P.clay : mix(P.clay, P.tan, 0.5));
    c.set(Math.round(pierL(y)), y, P.brown); c.set(Math.ceil(pierR(y)) - 1, y, P.tan);
  }
  c.fillRect(212, 92, 26, 2, P.darkBrown);
  for (let x = 212; x < 238; x++) for (let y = 94; y < 97; y++) if (dither(x, y, 0.5)) c.set(x, y, P.navy);
  for (const t of [0, 0.3, 0.6]) for (const side of [pierL, pierR]) {
    const y = Math.round(92 + t * (FLOOR - 92)), x = Math.round(side(y)) - (side === pierR ? 1 : 0), h = 4 + Math.round(t * 5);
    c.fillRect(x, y - h, 2, h, P.darkBrown); c.set(x, y - h, P.brown);
  }
  // warehouses along the quay (left)
  const base = FLOOR + 1;
  const stoneCols = [P.grey1, mix(P.grey1, P.sandLight, 0.45), mix(P.grey1, P.grey2, 0.45)];
  const gable = (x0, x1, wallTop, apex, seed) => {
    const mid = (x0 + x1) / 2;
    c.polygon([[x0, base], [x0, wallTop], [mid, apex + 4], [x1, wallTop], [x1, base]], (x, y) => masonry(x, y, x0, base, seed, stoneCols, P.grey2));
    c.polygon([[x0 - 4, wallTop + 2], [mid, apex], [x1 + 4, wallTop + 2], [x1 + 1, wallTop + 2], [mid, apex + 4], [x0 - 1, wallTop + 2]], (x, y) => ((x + y) % 3 ? P.rust : P.darkRed));
    c.line(x0 - 4, wallTop + 2, mid, apex, P.tan); c.line(mid, apex, x1 + 4, wallTop + 2, P.darkRed);
    for (let x = x0; x < x1; x++) { c.set(x, wallTop + 3, P.grey3); }
  };
  const longHouse = (x0, x1, wallTop, roofTop, seed) => {
    c.fillRect(x0, wallTop, x1 - x0, base - wallTop, (x, y) => masonry(x, y, x0, base, seed, stoneCols, P.grey2));
    c.polygon([[x0 - 5, wallTop + 2], [x0 + 8, roofTop], [x1 - 8, roofTop], [x1 + 5, wallTop + 2]], (x, y) => roofTile(x, y, roofTop));
    c.line(x0 + 8, roofTop, x1 - 8, roofTop, P.darkRed); c.line(x0 - 5, wallTop + 2, x1 + 5, wallTop + 2, P.darkRed);
    for (let x = x0; x < x1; x++) { c.set(x, wallTop + 3, P.grey3); c.set(x, wallTop + 4, P.grey2); }
  };
  const door = (x, w, h) => {
    c.fillRect(x, base - h, w, h, (xx) => ((xx - x) % 4 === 3 ? P.darkBrown : P.brown));
    c.ellipse(x + w / 2, base - h, w / 2, 3, (xx, yy) => (yy > base - h ? null : P.brown));
    c.fillRect(x - 1, base - h, 1, h, P.grey3); c.fillRect(x + w, base - h, 1, h, P.grey3);
    c.fillRect(x, base - h + 4, w, 1, P.darkBrown); c.fillRect(x, base - 5, w, 1, P.darkBrown);
  };
  const win = (x, y) => { c.fillRect(x, y, 5, 6, P.navy); c.fillRect(x, y, 5, 1, P.slate); c.fillRect(x - 1, y + 6, 7, 1, P.grey1); c.fillRect(x - 3, y, 2, 6, P.greenDark); c.fillRect(x + 6, y, 2, 6, P.greenDark); };
  longHouse(58, 162, 74, 56, 21);
  for (const wx of [70, 88, 132, 150]) win(wx, 82);
  door(103, 16, 20); c.fillRect(100, 88, 22, 4, P.brown); c.fillRect(101, 89, 20, 2, P.tan); // sign board
  gable(-6, 62, 70, 46, 22); win(10, 80); win(40, 80); door(21, 14, 17); win(26, 58);
  gable(164, 214, 78, 58, 23); door(181, 16, 22); win(184, 66);
  // quay edge
  for (let x = 0; x < W; x++) { c.set(x, FLOOR - 1, P.darkBrown); }
  // wooden dock planks running toward the viewer
  const vx = 240, vy = FLOOR - 70;
  for (let y = FLOOR; y < H; y++) {
    const d = y - vy, z = (y - FLOOR) / (H - FLOOR);
    for (let x = 0; x < W; x++) {
      const gx = ((x - vx) * 5) / d, pi = Math.floor(gx), fx = gx - pi, pw = d / 5;
      const U = (dd) => 380 / dd + hash2(pi, 0, 7) * 2.5, u = U(d), seg = Math.floor(u);
      let col = hash2(pi, seg, 3) < 0.3 ? mix(P.clay, P.brown, 0.3) : P.clay;
      const grain = vnoise(gx * 11, u * 1.5, 9);
      if (grain > 0.7) col = mix(col, P.brown, 0.55); else if (grain < 0.22 && dither(x, y, 0.5)) col = mix(col, P.tan, 0.5);
      if (fx * pw < 1) col = P.darkBrown;
      else if (fx * pw < 2) col = mix(P.clay, P.tan, 0.6);
      else if (Math.floor(U(d - 1)) !== seg && y > FLOOR) col = P.darkBrown;
      else if (Math.floor(U(d - 3)) !== seg && y > FLOOR + 2 && ((fx * pw >= 3 && fx * pw < 4) || ((1 - fx) * pw >= 2 && (1 - fx) * pw < 3))) col = P.darkBrown; // nail heads
      if (y === FLOOR) col = P.tan;
      if (z > 0.72 && dither(x, y, (z - 0.72) * 1.4)) col = darker(col);
      c.set(x, y, col);
    }
  }
  // quay props: bollards, rope, crates, barrels
  const bollard = (x) => { c.fillRect(x - 2, FLOOR - 2, 5, 7, P.slate); c.fillRect(x - 3, FLOOR - 3, 7, 2, P.grey3); c.fillRect(x - 2, FLOOR - 2, 1, 7, P.grey3); };
  bollard(282); bollard(448);
  c.line(282, FLOOR - 2, 300, WL - 4, P.tan); c.line(448, FLOOR - 2, 424, WL - 5, P.tan);
  c.ellipse(300, FLOOR + 6, 6, 2.5, P.tan); c.ellipse(300, FLOOR + 6, 3.5, 1.2, P.clay);
  crate(c, 6, FLOOR + 9, 13); crate(c, 19, FLOOR + 9, 11); crate(c, 11, FLOOR - 4, 10);
  barrel(c, 452, FLOOR + 10); barrel(c, 466, FLOOR + 12);
  return c;
}

// ---------------------------------------------------------------- forest battleback (Greenwood)  floor 112
export function battlebackForest() {
  const W = 480, H = 190, c = new Canvas(W, H);
  const FLOOR = 112;
  const haze0 = mix(P.green, P.grey1, 0.45), haze1 = mix(P.greenDark, P.grey2, 0.35);
  gradient(c, 0, FLOOR, [[0, mix(P.grey1, P.yellow, 0.25)], [0.3, mix(P.green, P.grey1, 0.6)], [0.7, haze0], [1, mix(P.green, P.grey1, 0.35)]]);
  const rnd = mulberry32(31);
  // far trunks + canopy
  const farT = mix(P.greenDark, P.grey2, 0.55), farT2 = mix(P.greenDark, P.grey1, 0.5);
  for (let i = 0; i < 16; i++) { const x = rnd() * W, hw = 1.5 + rnd() * 2; for (let y = 10; y < FLOOR - 6; y++) for (let xx = Math.floor(x - hw); xx <= x + hw; xx++) c.set(xx, y, xx < x - hw * 0.3 ? farT2 : farT); }
  foliage(c, 0, 0, W, 60, 41, (x, y) => 0.75 - y / 55, [farT, farT2, mix(P.green, P.grey1, 0.5), mix(P.green, P.grey1, 0.6)], false);
  fillProfile(c, (x) => FLOOR - 10 + Math.sin(x * 0.05) * 2 + vnoise(x * 0.1, 1, 4) * 3, (x, y) => (dither(x, y, 0.5) ? farT : farT2), FLOOR);
  // mid trunks + canopy
  const midR = [mix(P.greenDeep, P.brown, 0.4), mix(P.greenDark, P.brown, 0.5), mix(P.greenDark, P.clay, 0.45), mix(P.green, P.clay, 0.4)];
  for (const [x, hw] of [[70, 5], [158, 4], [206, 6], [300, 7], [352, 4], [426, 5]]) trunk(c, x, hw, 0, FLOOR - 2 + Math.round(hw / 2), midR, x, 0.6);
  foliage(c, 0, 0, W, 60, 43, (x, y) => 0.74 - y / 50, [P.greenDeep, P.greenDark, mix(P.greenDark, P.green, 0.5), P.green]);
  // river glimpse on the right, behind the near bushes
  const riv = (x) => (x < 250 ? null : [FLOOR - 9 + Math.round(Math.sin(x * 0.02) * 1.5), FLOOR - 1]);
  for (let x = 250; x < W; x++) {
    const [t, b] = riv(x), taper = Math.min(1, (x - 250) / 60), top = Math.round(b - (b - t) * taper);
    for (let y = top; y < b; y++) {
      const n = vnoise(x * 0.3, y * 0.9, 17);
      c.set(x, y, y === top ? P.greenDeep : n > 0.78 ? P.grey1 : n > 0.6 ? P.cyan : dither(x, y, (y - top) / (b - top + 1)) ? P.blueDark : P.blue);
    }
  }
  // grass floor with a winding dirt path
  const pathC = (z) => 240 + Math.sin(z * 4.4 + 0.2) * 34 * (0.35 + z * 0.65) - 6;
  const pathW = (z) => 5 + z * 40;
  ground(c, FLOOR, H, (x, y, z) => {
    let col = grassPx(x, y, z, 51, [P.greenDeep, P.greenDark, P.green]);
    const pd = Math.abs(x - pathC(z)) - pathW(z) * (0.92 + vnoise(y * 0.25, 2, 9) * 0.16);
    if (pd < 0) {
      const m = fbm(x * 0.04, (1 / (0.18 + z)) * 2, 13, 2);
      col = pd > -1.5 - z ? P.brown : m > 0.6 ? (dither(x, y, (m - 0.6) * 8) ? P.tan : P.clay) : P.clay;
      if (hash2(x, y, 7) > 0.985) { col = P.sand; }
      else if (hash2(x, y - 1, 7) > 0.985) col = P.brown;
    } else if (pd < 1.5 && dither(x, y, 0.5)) col = P.greenDeep;
    return col;
  });
  // near trunks framing the scene
  const nearR = [P.darkBrown, P.brown, P.clay, P.tan];
  trunk(c, 14, 15, 0, FLOOR + 14, nearR, 3, 1); trunk(c, 116, 8, 0, FLOOR + 6, nearR, 5, 0.8); trunk(c, 468, 16, 0, FLOOR + 16, nearR, 7, 1);
  // moss on near trunks
  tint(c, 0, 0, W, FLOOR + 16, (x, y) => ((x < 34 || (x > 104 && x < 128) || x > 448) && vnoise(x * 0.12, y * 0.05, 21) + (y > FLOOR - 10 ? 0.15 : 0) > 0.7 ? 0.85 : 0), (col) => (nearR.includes(col) ? (col === P.darkBrown ? P.greenDeep : P.greenDark) : null));
  // bushes along the treeline
  const leafy = [P.greenDeep, P.greenDark, P.green, P.teal];
  const br = mulberry32(8);
  for (let x = -10; x < W + 10; x += 12 + br() * 18) { if (Math.abs(x - pathC(0)) < 16) continue; bush(c, x, FLOOR - 1 + br() * 3, 4 + br() * 4, leafy); }
  bush(c, 40, FLOOR + 10, 8, leafy); bush(c, 452, FLOOR + 12, 7, leafy); bush(c, 150, FLOOR + 4, 5, leafy); bush(c, 340, FLOOR + 3, 5, leafy);
  // dense near canopy + dappled light
  foliage(c, 0, 0, W, 64, 47, (x, y) => { const e = Math.abs(x - 240) / 240; return 0.68 + e * 0.4 - y / (26 + e * 34); }, [P.teal, P.greenDeep, P.greenDark, P.green]);
  lightShaft(c, 150, 0.55, 20, 0.45, H); lightShaft(c, 290, 0.5, 14, 0.4, H); lightShaft(c, 380, 0.6, 10, 0.35, H);
  tint(c, 0, FLOOR, W, H, (x, y) => (fbm(x * 0.035, y * 0.09, 61, 3) > 0.6 ? 0.55 : 0), lighter);
  tint(c, 0, FLOOR, W, H, (x, y) => { const z = (y - FLOOR) / (H - FLOOR); return z > 0.72 ? (z - 0.72) * 1.3 : 0; }, darker);
  // mushrooms & flowers
  for (const [mx, my] of [[36, 126], [444, 132], [160, 118]]) { c.fillRect(mx, my - 2, 1, 3, P.sandLight); c.fillRect(mx - 1, my - 3, 3, 1, P.red); c.set(mx, my - 4, P.red); c.set(mx - 1, my - 3, P.pink); }
  const fr = mulberry32(12);
  for (let i = 0; i < 26; i++) { const x = Math.floor(fr() * W), y = FLOOR + 4 + Math.floor(fr() * 70); if (Math.abs(x - pathC((y - FLOOR) / (H - FLOOR))) < pathW((y - FLOOR) / (H - FLOOR)) + 3) continue; c.set(x, y, fr() > 0.5 ? P.yellow : P.white); }
  return c;
}

// ---------------------------------------------------------------- sunken ruins battleback  floor 106
export function battlebackRuins() {
  const W = 480, H = 190, c = new Canvas(W, H);
  const FLOOR = 106;
  gradient(c, 0, 100, [[0, P.blueDark], [0.3, P.purple], [0.55, P.magenta], [0.75, P.pink], [0.9, P.sand], [1, P.sandLight]]);
  sun(c, 452, 70, 12, X.sandPale, [P.yellow, P.gold]);
  for (const [x, y, w] of [[250, 26, 70], [380, 44, 90], [40, 58, 60], [170, 64, 40]]) {
    const hi = y > 50 ? P.sand : P.pink, lo = y > 50 ? P.pink : P.magenta; c.fillRect(x, y, w, 1, hi); c.fillRect(x + 8, y - 1, w - 22, 1, y > 50 ? P.sandLight : P.pink); c.fillRect(x + 4, y + 1, w - 10, 1, lo);
  }
  mesas(c, 94, 13, mix(P.magenta, P.clay, 0.5), mix(P.purple, P.clay, 0.5), mix(P.purple, P.brown, 0.5), 0.7);
  fillProfile(c, (x) => 92 + Math.sin(x * 0.024 + 1) * 4 + Math.sin(x * 0.061) * 2, (x, y, d) => (d < 1 ? P.sandLight : dither(x, y, 0.3) ? P.tan : P.sand), FLOOR);
  const stoneCols = [P.sand, mix(P.sand, P.sandLight, 0.5), mix(P.sand, P.tan, 0.35), P.sand];
  // temple wall with a broken top and a doorway
  const wx0 = 96, wx1 = 246;
  const wallTop = (x) => { const t = (x - wx0) / (wx1 - wx0); return 34 + Math.floor(vnoise(x * 0.07, 0, 5) * 3) * 5 + (t > 0.7 ? Math.floor((t - 0.7) * 150 / 5) * 5 : 0); };
  for (let x = wx0; x < wx1; x++) {
    const top = wallTop(x);
    for (let y = top; y < FLOOR; y++) {
      let col = masonry(x, y, wx0, FLOOR, 71, stoneCols, P.clay, 12, 5);
      if (y < top + 1) col = P.sandLight;
      if (y >= 48 && y < 54) col = y === 48 || y === 53 ? P.clay : (x + (y % 2) * 3) % 6 < 2 && hash2(x >> 1, y, 3) > 0.3 ? P.tan : P.sand; // carved frieze
      if (x > wx1 - 4) col = P.tan;
      c.set(x, y, col);
    }
  }
  // doorway
  c.fillRect(150, 60, 30, 3, P.sandLight); c.fillRect(148, 63, 34, 4, P.sand); c.fillRect(148, 66, 34, 1, P.clay);
  for (let y = 67; y < FLOOR; y++) for (let x = 154 + Math.floor((FLOOR - y) / 16); x < 176 - Math.floor((FLOOR - y) / 16); x++) c.set(x, y, x < 158 ? P.brown : y < 72 ? P.ink : P.darkBrown);
  // sand drift against the wall (and into the door)
  const drift = (x) => { const a = Math.exp(-(((x - 110) / 42) ** 2)) * 26, b = Math.exp(-(((x - 176) / 22) ** 2)) * 14, e = Math.exp(-(((x - 252) / 20) ** 2)) * 12; return FLOOR - Math.max(a, b, e) - 2; };
  for (let x = 40; x < 300; x++) { const t = Math.round(drift(x)); for (let y = t; y < FLOOR; y++) c.set(x, y, y === t ? P.sandLight : dither(x, y, 0.2 + (y - t) * 0.02) ? P.tan : P.sand); }
  // columns
  const column = (x, top, broken, seed) => {
    const w = 12, base = FLOOR + 1;
    for (let y = top; y < base - 4; y++) {
      for (let i = 0; i < w; i++) {
        const u = i / (w - 1);
        if (broken && y < top + 6) { const cut = top + Math.round(Math.abs(Math.sin(i * 1.7 + seed)) * 5 + (i / w) * 3 * (seed % 2 ? 1 : -1) + 1.5); if (y < cut) continue; }
        let col = u < 0.12 ? P.sand : u < 0.4 ? P.sandLight : u < 0.7 ? P.sand : u < 0.9 ? P.tan : P.clay;
        if (i % 3 === 2 && u > 0.1) col = col === P.sandLight ? P.sand : col === P.sand ? P.tan : P.clay; // flutes
        c.set(x + i, y, col);
      }
    }
    if (broken) for (let i = 0; i < w; i++) for (let y = top; y < top + 8; y++) if (c.get(x + i, y) && c.get(x + i, y - 1) !== c.get(x + i, y) && (y === top || !isCol(c.get(x + i, y - 1)))) { c.set(x + i, y, P.sandLight); break; }
    c.fillRect(x - 2, base - 4, w + 4, 4, P.sand); c.fillRect(x - 2, base - 4, w + 4, 1, P.sandLight); c.fillRect(x + w, base - 4, 2, 4, P.tan);
    if (!broken) { c.fillRect(x - 2, top - 3, w + 4, 3, P.sand); c.fillRect(x - 2, top - 3, w + 4, 1, P.sandLight); c.fillRect(x - 1, top, w + 2, 1, P.tan); }
  };
  const colSet = new Set([P.sand, P.sandLight, P.tan, P.clay]);
  const isCol = (col) => colSet.has(col);
  column(262, 30, false, 1); column(306, 30, false, 2); column(352, 58, true, 3); column(398, 82, true, 4); column(28, 70, true, 5);
  // architrave over the two whole columns, broken on the right
  for (let x = 256; x < 324; x++) { for (let y = 18; y < 27; y++) { if (x > 314 && y < 18 + (x - 314) * 1.5) continue; c.set(x, y, y === 18 ? P.sandLight : y === 26 ? P.clay : y === 22 ? P.tan : masonry(x, y, 256, 18, 9, stoneCols, P.clay, 22, 9)); } }
  // sand drifts at column feet
  for (const [dx, r] of [[268, 14], [312, 12], [358, 16], [404, 18], [34, 16]]) for (let x = dx - r; x < dx + r; x++) { const h = Math.round((1 - ((x - dx) / r) ** 2) * r * 0.35); for (let y = FLOOR + 1 - h; y <= FLOOR; y++) c.set(x, y, y === FLOOR + 1 - h ? P.sandLight : P.sand); }
  // fallen column drum
  const drum = (x, y, len) => { for (let yy = 0; yy < 10; yy++) for (let xx = 0; xx < len; xx++) { const v = yy / 9; c.set(x + xx, y + yy, v < 0.2 ? P.sandLight : v < 0.55 ? P.sand : v < 0.85 ? P.tan : P.clay); } c.ellipse(x + len, y + 5, 3, 5, (px, py, nx) => (nx < 0 ? P.sand : P.sandLight)); c.fillRect(x, y + 10, len + 2, 1, P.clay); };
  drum(424, FLOOR - 4, 34); drum(206, FLOOR - 3, 20);
  // cracked flagstones with sand drifts
  const stone = [P.clay, mix(P.clay, P.sand, 0.45), mix(P.clay, P.tan, 0.5), mix(P.clay, P.sand, 0.3)];
  ground(c, FLOOR, H, (x, y, z) => {
    const depth = 1 / (0.12 + z), gy = depth * 2.2, row = Math.floor(gy);
    const gx = ((x - W / 2) / W) * 7 / (0.12 + z) * 0.5 + hash2(row, 0, 4) * 0.7, cell = Math.floor(gx);
    const lineX = Math.abs(gx - Math.round(gx)) < 0.03 + z * 0.015, lineY = Math.abs(gy - Math.round(gy)) < 0.05 * (1 + z * 2);
    const h = hash2(cell, row, 8);
    let col = stone[Math.floor(h * stone.length)];
    if (Math.abs(gy - Math.floor(gy) - 0.14) < 0.05 * (1 + z * 2)) col = lighter(col) === X.sandPale ? col : mix(col, P.sand, 0.5); // lit near edge
    const crack = h > 0.55 && Math.abs(vnoise(x * 0.06, y * 0.13, cell * 7 + row) - 0.5) < 0.011;
    if (lineX || lineY) col = P.brown; else if (crack) col = P.brown;
    const s = fbm(x * 0.011, depth * 1.4, 77, 3) + (1 - z) * 0.1;
    if (s > 0.6) col = s > 0.63 ? (s > 0.7 ? (dither(x, y, 0.5) ? P.sandLight : P.sand) : P.sand) : dither(x, y, (s - 0.6) * 33) ? P.sand : col;
    if (z > 0.72 && dither(x, y, (z - 0.72) * 1.3)) col = darker(col);
    return col;
  });
  // bones
  const bone = P.grey1, bshade = P.grey2;
  c.ellipse(302, 130, 4, 3, bone); c.fillRect(299, 131, 6, 2, bone); c.set(300, 129, P.ink); c.set(303, 129, P.ink); c.fillRect(300, 133, 4, 1, bshade);
  for (let i = 0; i < 4; i++) { c.line(316 + i * 4, 124, 318 + i * 4, 130, bone); c.set(318 + i * 4, 131, bshade); } c.line(314, 124, 330, 123, bone);
  c.line(20, 150, 30, 146, bone); c.set(19, 150, bone); c.set(19, 151, bone); c.set(31, 145, bone); c.set(31, 147, bone); c.line(20, 151, 30, 147, bshade);
  c.line(452, 178, 466, 174, bone); c.line(452, 179, 466, 175, bshade); c.set(451, 177, bone); c.set(467, 173, bone);
  return c;
}

// ---------------------------------------------------------------- elven glade battleback  floor 114
export function battlebackElvenglade() {
  const W = 480, H = 190, c = new Canvas(W, H);
  const FLOOR = 114;
  gradient(c, 0, FLOOR, [[0, mix(P.grey1, P.cyan, 0.35)], [0.35, mix(P.green, P.grey1, 0.55)], [0.8, mix(P.greenDark, P.grey2, 0.35)], [1, mix(P.green, P.grey2, 0.4)]]);
  // far giant trunks and haze canopy
  const far = [mix(P.greenDark, P.grey2, 0.55), mix(P.greenDark, P.grey1, 0.5), mix(P.green, P.grey1, 0.55), mix(P.green, P.grey1, 0.7)];
  for (const [x, hw] of [[150, 13], [236, 9], [352, 12]]) trunk(c, x, hw, 0, FLOOR - 6, far, x, 0.8);
  foliage(c, 0, 0, W, 56, 81, (x, y) => 0.76 - y / 50, far, false);
  // mid trunk with a tree house
  const mid = [mix(P.brown, P.greenDeep, 0.35), mix(P.clay, P.greenDark, 0.35), mix(P.tan, P.green, 0.3), mix(P.sand, P.green, 0.3)];
  trunk(c, 292, 17, 0, FLOOR - 1, mid, 11, 1);
  // giant near trunks
  const bark = [P.darkBrown, P.brown, P.clay, P.tan];
  trunk(c, 44, 30, 0, FLOOR + 10, bark, 2, 1.2); trunk(c, 440, 34, 0, FLOOR + 12, bark, 9, 1.2);
  tint(c, 0, 0, W, FLOOR + 14, (x, y) => ((x < 100 || x > 390) && vnoise(x * 0.15, y * 0.07, 23) + (y > FLOOR - 16 ? 0.2 : 0) > 0.66 ? 0.8 : 0), (col) => (col === P.darkBrown ? P.greenDeep : col === P.brown ? P.greenDark : col === P.clay || col === P.tan ? P.green : null));
  // round houses with leaf roofs
  const house = (cx, base, w, h, roofH, lit) => {
    const hw = w / 2;
    for (let y = base - h; y < base; y++) for (let x = Math.round(cx - hw); x < cx + hw; x++) {
      const u = (x + 0.5 - cx) / hw;
      let col = u < -0.55 ? P.sand : u < 0.2 ? P.sandLight : u < 0.65 ? P.sand : P.tan;
      if ((x - Math.round(cx)) % 5 === 0) col = col === P.sandLight ? P.sand : P.tan;
      c.set(x, y, col);
    }
    c.fillRect(Math.round(cx - hw), base - 1, w, 1, P.clay);
    // door + windows
    const dw = Math.max(5, Math.round(w * 0.2)), dh = Math.round(h * 0.7);
    c.fillRect(Math.round(cx - dw / 2), base - dh, dw, dh, P.brown); c.ellipse(cx, base - dh, dw / 2, 2.5, (x, y) => (y > base - dh ? null : P.brown));
    c.fillRect(Math.round(cx - dw / 2) + 1, base - dh + 1, dw - 2, dh - 1, P.darkBrown);
    if (lit) for (const wx of [cx - hw * 0.6, cx + hw * 0.45]) { c.ellipse(wx, base - h * 0.6, 2, 2.5, P.cyan); c.set(Math.round(wx), Math.round(base - h * 0.6), P.white); }
    // leaf roof: stacked scallop rows, overhanging eaves, pointed tip
    const rw = hw + 5, top = base - h - roofH;
    for (let y = top; y < base - h + 3; y++) {
      const t = (y - top) / (roofH + 3), half = rw * Math.sqrt(Math.min(1, t * 1.15)) ;
      for (let x = Math.round(cx - half); x < cx + half; x++) {
        const row = Math.floor((y - top) / 3), sc = ((x - cx + row * 2) % 5 + 5) % 5;
        let col = (y - top) % 3 === 2 ? P.greenDeep : sc === 0 ? P.greenDeep : x < cx - half * 0.3 ? P.green : x > cx + half * 0.45 ? P.greenDark : sc === 1 ? P.green : P.greenDark;
        if (y === base - h + 2) col = P.teal;
        c.set(x, y, col);
      }
    }
    c.line(cx, top - 4, cx, top, P.greenDark); c.set(Math.round(cx) - 1, top - 1, P.green);
  };
  // tree house on the mid trunk: platform + hut
  const plat = (cx, y, hw) => { c.fillRect(cx - hw, y, hw * 2, 2, P.clay); c.fillRect(cx - hw, y, hw * 2, 1, P.tan); c.fillRect(cx - hw, y + 2, hw * 2, 1, P.brown); for (let x = cx - hw; x <= cx + hw; x += 5) c.fillRect(x, y - 4, 1, 4, P.brown); c.fillRect(cx - hw, y - 4, hw * 2 + 1, 1, P.clay); c.line(cx - hw + 3, y + 3, cx - 4, y + 12, P.brown); c.line(cx + hw - 3, y + 3, cx + 4, y + 12, P.brown); };
  plat(292, 58, 28); house(292, 58, 26, 13, 12, true);
  plat(420, 46, 26); house(410, 46, 24, 12, 11, true);
  // rope bridge between the tree houses
  for (let x = 320; x < 394; x++) { const t = (x - 320) / 74, y = Math.round(58 + (46 - 58) * t + Math.sin(t * Math.PI) * 9); c.set(x, y, x % 3 ? P.clay : P.brown); c.set(x, y + 1, P.brown); const ry = Math.round(y - 6 + Math.sin(t * Math.PI) * -1); c.set(x, ry, P.tan); if (x % 6 === 0) c.line(x, ry, x, y - 1, P.tan); }
  // ground house between the trees
  house(176, FLOOR + 1, 42, 20, 20, true);
  // grass floor, mossy stepping-stone path from the viewer to the door
  const pathC = (z) => 176 + (240 - 176) * z ** 0.8, pathW = (z) => 6 + z * 34;
  const meadow = [P.greenDark, P.green, mix(P.green, P.yellow, 0.3)];
  ground(c, FLOOR, H, (x, y, z) => {
    let col = grassPx(x, y, z, 91, meadow);
    const pd = Math.abs(x - pathC(z)) / pathW(z);
    if (pd < 1.15) {
      const gy = 4.5 * Math.log(0.12 + z) + 20, row = Math.floor(gy), fy = gy - row;
      const off = (row % 2) * 0.5 + (hash2(row, 1, 2) - 0.5) * 0.2, gx = (x - pathC(z)) / pathW(z) * 1.2 + off, cell = Math.floor(gx), fx = gx - cell;
      const r = Math.hypot((fx - 0.5) * 2, (fy - 0.5) * 2.1);
      if (r < 0.8 && Math.abs(gx - off) < 1.35) {
        const m = vnoise(x * 0.25, y * 0.4, cell * 5 + row);
        col = fy > 0.7 ? P.grey3 : fy < 0.3 && fx < 0.75 ? mix(P.grey1, P.green, 0.2) : mix(P.grey2, P.greenDark, 0.2);
        if (m > 0.7 && fy < 0.6) col = P.greenDark; // moss
      } else if (r < 0.98 && fy > 0.45 && Math.abs(gx - off) < 1.45) col = P.greenDeep;
    }
    if (hash2(x, y, 5) > 0.992) col = [P.pink, P.yellow, P.white, P.cyan][Math.floor(hash2(x, y, 6) * 4)];
    if (z > 0.72 && dither(x, y, (z - 0.72) * 1.3)) col = darker(col);
    return col;
  });
  // ferns and bushes along the tree line
  const leafy = [P.greenDeep, P.greenDark, P.green, P.teal];
  const br = mulberry32(19);
  for (let x = -10; x < W + 10; x += 14 + br() * 22) { if (Math.abs(x - 176) < 30) continue; bush(c, x, FLOOR + br() * 2, 3 + br() * 4, leafy); }
  // flower clusters
  const fr = mulberry32(77);
  for (let i = 0; i < 30; i++) {
    const x = Math.floor(fr() * W), y = FLOOR + 3 + Math.floor(fr() * 72), z = (y - FLOOR) / (H - FLOOR);
    if (Math.abs(x - pathC(z)) < pathW(z) + 4) continue;
    const col = [P.pink, P.yellow, P.white, P.magenta][Math.floor(fr() * 4)];
    c.set(x, y + 1, P.greenDeep); c.set(x - 1, y, col); c.set(x + 1, y, col); c.set(x, y - 1, col); c.set(x, y + 1 - 2 + 1, col); c.set(x, y, P.yellow);
  }
  // near canopy, light shafts
  foliage(c, 0, 0, W, 44, 87, (x, y) => { const e = Math.abs(x - 240) / 240; return 0.6 + e * 0.35 - y / (24 + e * 22); }, [P.teal, P.greenDeep, P.greenDark, P.green]);
  lightShaft(c, 150, 0.45, 26, 0.5, H); lightShaft(c, 248, 0.4, 14, 0.4, H); lightShaft(c, 330, 0.5, 20, 0.45, H);
  // glowing lanterns (cyan / green) and fireflies
  const lantern = (x, y, hang, col, glow) => {
    c.line(x, y - hang, x, y - 3, P.brown);
    tint(c, x - 11, y - 11, x + 12, y + 12, (px, py) => { const d = Math.hypot(px - x, py - y); return d < 11 ? 0.75 * (1 - d / 11) + 0.1 : 0; }, glow);
    c.fillRect(x - 1, y - 2, 3, 4, col); c.set(x, y - 1, P.white); c.set(x, y, P.white); c.fillRect(x - 1, y - 3, 3, 1, P.brown); c.fillRect(x - 1, y + 2, 3, 1, P.brown);
  };
  const cyanGlow = (col) => mix(lighter(col), P.cyan, 0.35), greenGlow = (col) => mix(lighter(col), P.yellow, 0.25);
  lantern(341, 72, 6, P.cyan, cyanGlow); lantern(372, 65, 5, P.green, greenGlow);
  lantern(150, 90, 8, P.cyan, cyanGlow); lantern(203, 92, 6, P.green, greenGlow);
  lantern(78, 72, 10, P.green, greenGlow); lantern(400, 86, 8, P.cyan, cyanGlow); lantern(262, 72, 5, P.cyan, cyanGlow);
  c.line(64, 60, 84, 62, P.brown); c.line(390, 76, 410, 74, P.brown);
  const ff = mulberry32(5);
  for (let i = 0; i < 22; i++) { const x = Math.floor(ff() * W), y = 50 + Math.floor(ff() * 90); c.set(x, y, ff() > 0.5 ? P.yellow : mix(P.cyan, P.white, 0.5)); }
  return c;
}

// ---------------------------------------------------------------- interiors: shared helpers
/** Perspective floorboards running toward the viewer (vanishing point (vx, vy)); tones [seam, dark, base, light]. */
function boardFloor(c, y0, y1, vx, vy, seed, [seam, dk, md, lt], boards = 5, lenK = 300) {
  for (let y = y0; y < y1; y++) {
    const d = y - vy, z = (y - y0) / (y1 - y0);
    for (let x = 0; x < c.width; x++) {
      const gx = ((x - vx) * boards) / d, pi = Math.floor(gx), fx = gx - pi, pw = d / boards;
      const U = (dd) => lenK / dd + hash2(pi, 0, seed) * 3, u = U(d), seg = Math.floor(u);
      const tone = hash2(pi, seg, seed + 1);
      let col = tone < 0.3 ? dk : tone > 0.8 ? lt : md;
      const grain = vnoise(gx * 9, u * 1.4, seed + 2);
      if (grain > 0.74) col = col === lt ? md : dk; else if (grain < 0.2 && dither(x, y, 0.5)) col = col === dk ? md : lt;
      if (fx * pw < 1) col = seam;
      else if (fx * pw < 2) col = lt;
      else if (Math.floor(U(d - 1)) !== seg && y > y0) col = seam;
      if (y === y0) col = lt;
      c.set(x, y, col);
    }
  }
}
/** Warm radial glow: lighten pixels within r of (cx, cy) through `map`. */
function glow(c, cx, cy, r, strength, map, sy = 1) {
  tint(c, Math.floor(cx - r), Math.floor(cy - r * sy), Math.ceil(cx + r), Math.ceil(cy + r * sy), (x, y) => {
    const d = Math.hypot(x + 0.5 - cx, (y + 0.5 - cy) / sy) / r;
    return d < 1 ? strength * (1 - d) * (1 - d * 0.3) : 0;
  }, map);
}
const warm = (col) => mix(lighter(col), P.gold, 0.18);
/** Candle: cream stick with a flame and a warm halo. */
function candle(c, x, y, h = 5) {
  glow(c, x + 0.5, y - h - 2, 9, 0.55, warm);
  c.fillRect(x, y - h, 2, h, X.sandPale); c.set(x + 1, y - h + 1, P.sandLight); c.fillRect(x, y - 1, 2, 1, P.sand);
  c.set(x, y - h - 1, P.gold); c.set(x, y - h - 2, P.yellow); c.set(x + 1, y - h - 1, P.yellow); c.set(x, y - h - 3, P.white);
}
/** Hanging lantern on a chain from row `top`, lit body at (x, y). */
function hangLantern(c, x, top, y, body, map) {
  for (let yy = top; yy < y - 4; yy++) c.set(x, yy, yy % 2 ? P.slate : P.grey3);
  glow(c, x + 0.5, y, 22, 0.6, map);
  c.fillRect(x - 2, y - 4, 5, 1, P.navy); c.fillRect(x - 3, y - 3, 7, 1, P.slate);
  c.fillRect(x - 2, y - 2, 5, 6, body); c.fillRect(x - 1, y - 1, 3, 4, P.white); c.set(x, y - 1, P.yellow);
  c.fillRect(x - 2, y - 2, 1, 6, P.slate); c.fillRect(x + 2, y - 2, 1, 6, P.slate);
  c.fillRect(x - 3, y + 4, 7, 1, P.slate); c.set(x, y + 5, P.navy);
}
/** Glass bottle on a shelf (bottom row y). */
function bottle(c, x, y, col, hi, w = 5, h = 6) {
  c.ellipse(x + w / 2, y - h / 2, w / 2, h / 2, (px, py, nx, ny) => (nx < -0.2 && ny < 0 ? hi : ny > 0.5 ? darker(col) : col));
  c.fillRect(Math.round(x + w / 2) - 1, y - h - 2, 2, 3, P.grey2); c.fillRect(Math.round(x + w / 2) - 1, y - h - 3, 2, 1, P.clay);
  c.set(Math.round(x + w / 2) - 1, y - h + 1, P.white);
}
/** Rolled scroll lying on a shelf, end-on view: cream circle with a ribbon. */
function scrollEnd(c, x, y, r, tie) {
  c.ellipse(x, y - r, r, r, (px, py, nx, ny) => (Math.hypot(nx, ny) < 0.35 ? P.sand : nx + ny < -0.4 ? X.sandPale : P.sandLight));
  if (tie) c.fillRect(Math.round(x - r), Math.round(y - r), Math.round(r * 2), 1, tie);
}

// ---------------------------------------------------------------- inn / house interior  floor 118
export function battlebackInterior() {
  const W = 480, H = 190, c = new Canvas(W, H);
  const FLOOR = 118, WAIN = FLOOR - 26;
  // plaster wall with a soft mottle
  c.fillRect(0, 0, W, FLOOR, (x, y) => {
    const n = fbm(x * 0.03, y * 0.05, 101, 3);
    if (n > 0.6 && dither(x, y, (n - 0.6) * 3)) return X.sandPale;
    if (n < 0.36 && dither(x, y, (0.36 - n) * 3)) return mix(P.sandLight, P.sand, 0.35);
    return P.sandLight;
  });
  // a few hairline cracks
  for (const [x0, y0, len] of [[128, 30, 9], [372, 58, 7], [236, 26, 6]]) { let x = x0, y = y0; for (let i = 0; i < len; i++) { c.set(x, y, mix(P.sand, P.clay, 0.4)); x += hash2(i, x0, 3) > 0.5 ? 1 : 0; y++; } }
  // ceiling beam with joist ends
  c.fillRect(0, 0, W, 14, (x, y) => (y === 13 ? P.ink : y === 12 ? P.darkBrown : y < 2 ? P.ink : vnoise(x * 0.2, y * 0.8, 5) > 0.7 ? P.brown : P.darkBrown));
  for (let x = 8; x < W; x += 40) { c.fillRect(x, 14, 9, 6, P.darkBrown); c.fillRect(x, 14, 9, 1, P.brown); c.fillRect(x + 8, 14, 1, 6, P.ink); c.fillRect(x, 20, 9, 1, P.ink); }
  tint(c, 0, 14, W, 22, (x, y) => (c.get(x, y) === P.sandLight || c.get(x, y) === X.sandPale ? 0.6 - (y - 14) * 0.08 : 0), darker);
  // wainscot panelling + rail + baseboard
  for (let y = WAIN; y < FLOOR; y++) for (let x = 0; x < W; x++) {
    const px = x % 24;
    let col = px === 0 ? P.darkBrown : px === 1 ? P.tan : (y - WAIN) === 5 || (y - WAIN) === 21 ? P.darkBrown : vnoise(x * 0.9, y * 0.12, 7) > 0.68 ? P.brown : P.clay;
    if (y < WAIN + 3) col = y === WAIN ? P.tan : y === WAIN + 1 ? P.clay : P.darkBrown; // rail
    if (y >= FLOOR - 3) col = y === FLOOR - 3 ? P.brown : P.darkBrown; // baseboard
    c.set(x, y, col);
  }
  // timber posts
  const post = (x0, w) => c.fillRect(x0, 14, w, FLOOR - 14, (x, y) => (x === x0 ? P.brown : x === x0 + 1 ? P.clay : x === x0 + w - 1 ? P.ink : vnoise(x * 0.8, y * 0.1, x0) > 0.7 ? P.brown : P.darkBrown));
  post(0, 12); post(142, 10); post(368, 10); post(470, 10);
  // window with daylight (left)
  const wx = 52, wy = 30, ww = 56, wh = 44;
  gradient(c, wy, wy + wh, [[0, P.blue], [0.6, mix(P.blue, P.grey1, 0.5)], [1, P.grey1]], wx, wx + ww);
  cloud(c, wx + 18, wy + 12, 20, P.white, P.grey1);
  for (let x = wx; x < wx + ww; x++) { const t = Math.round(wy + wh - 8 - Math.sin(x * 0.12) * 3 - vnoise(x * 0.2, 1, 4) * 3); for (let y = t; y < wy + wh; y++) c.set(x, y, y === t ? P.green : P.greenDark); }
  c.strokeRect(wx - 3, wy - 3, ww + 6, wh + 6, P.darkBrown); c.strokeRect(wx - 2, wy - 2, ww + 4, wh + 4, P.brown); c.strokeRect(wx - 1, wy - 1, ww + 2, wh + 2, P.clay);
  c.fillRect(wx + ww / 2 - 1, wy, 3, wh, P.brown); c.fillRect(wx, wy + wh / 2 - 1, ww, 3, P.brown);
  c.fillRect(wx + ww / 2 - 1, wy, 1, wh, P.clay); c.fillRect(wx, wy + wh / 2 - 1, ww, 1, P.clay);
  c.fillRect(wx - 6, wy + wh + 3, ww + 12, 3, P.tan); c.fillRect(wx - 6, wy + wh + 5, ww + 12, 1, P.brown);
  // curtains
  for (const [cx0, dir] of [[wx - 8, 1], [wx + ww - 1, -1]]) for (let y = wy - 6; y < wy + wh + 2; y++) for (let i = 0; i < 9; i++) {
    const pull = y > wy + wh * 0.55 ? Math.round((y - wy - wh * 0.55) * 0.12) : 0, xx = cx0 + i - (dir > 0 ? 0 : pull) + (dir > 0 ? 0 : 0);
    if (i >= 9 - pull) continue;
    c.set(dir > 0 ? xx : xx + pull, y, i % 3 === 0 ? P.darkRed : i % 3 === 1 ? P.red : mix(P.red, P.darkRed, 0.4));
  }
  c.fillRect(wx - 10, wy - 7, ww + 20, 2, P.darkBrown);
  // pot plant on the sill
  c.fillRect(wx + 40, wy + wh - 3, 7, 6, P.rust); c.fillRect(wx + 40, wy + wh - 3, 7, 1, P.tan);
  bush(c, wx + 43.5, wy + wh - 6, 3, [P.greenDeep, P.greenDark, P.green, P.greenDeep]);
  // shelves with crockery (centre-left)
  const shelf = (x0, x1, y) => { c.fillRect(x0, y, x1 - x0, 2, P.clay); c.fillRect(x0, y, x1 - x0, 1, P.tan); c.fillRect(x0, y + 2, x1 - x0, 1, P.darkBrown); for (const bx of [x0 + 3, x1 - 5]) { c.fillRect(bx, y + 3, 2, 4, P.brown); c.set(bx + 1, y + 6, P.darkBrown); } };
  shelf(166, 232, 46); shelf(166, 232, 70);
  for (const [px, r] of [[172, 5], [185, 6], [198, 5]]) { c.ellipse(px, 40, r, r, (x, y, nx, ny) => (Math.hypot(nx, ny) < 0.55 ? (nx + ny < 0 ? P.white : P.grey1) : Math.hypot(nx, ny) < 0.75 ? P.blue : P.grey1)); c.fillRect(px - r, 45, r * 2, 1, A(P.ink, 90), true); }
  for (const [jx, col] of [[208, P.rust], [217, P.greenDark], [225, P.tan]]) { c.fillRect(jx, 38, 6, 8, col); c.fillRect(jx + 1, 36, 4, 2, P.brown); c.fillRect(jx, 38, 1, 8, lighter(col)); c.fillRect(jx + 1, 41, 4, 2, P.sandLight); }
  for (const mx of [170, 180, 190]) { c.fillRect(mx, 63, 6, 7, P.grey2); c.fillRect(mx, 63, 1, 7, P.grey1); c.fillRect(mx + 6, 65, 2, 1, P.grey3); c.fillRect(mx + 7, 66, 1, 2, P.grey3); c.fillRect(mx + 6, 67, 2, 1, P.grey3); c.fillRect(mx, 64, 6, 1, P.grey3); }
  c.fillRect(204, 60, 24, 10, P.brown); for (let i = 0; i < 6; i++) c.fillRect(205 + i * 4, 61, 3, 9, [P.darkRed, P.blueDark, P.greenDeep, P.gold, P.purple, P.rust][i]);
  // small framed painting behind the centre
  c.fillRect(243, 36, 30, 22, P.gold); c.strokeRect(243, 36, 30, 22, P.brown);
  gradient(c, 38, 56, [[0, mix(P.blue, P.grey1, 0.4)], [1, P.sandLight]], 245, 271);
  fillProfile(c, (x) => (x < 245 || x > 270 ? 999 : 48 + Math.sin(x * 0.4) * 2), (x, y) => (y < 56 ? (y < 50 ? P.clay : P.tan) : null), 56);
  c.fillRect(256, 44, 3, 5, P.greenDeep);
  // stone fireplace (right of centre)
  const fx0 = 286, fx1 = 356, ftop = 42;
  c.fillRect(fx0, ftop, fx1 - fx0, FLOOR - ftop, (x, y) => masonry(x, y, fx0, FLOOR, 41, [P.grey2, mix(P.grey2, P.grey1, 0.4), mix(P.grey2, P.sand, 0.25)], P.grey3, 10, 5));
  c.fillRect(fx0 - 4, ftop - 4, fx1 - fx0 + 8, 5, P.brown); c.fillRect(fx0 - 4, ftop - 4, fx1 - fx0 + 8, 1, P.tan); c.fillRect(fx0 - 4, ftop + 1, fx1 - fx0 + 8, 1, P.darkBrown); // mantel
  const ox0 = 298, ox1 = 344, otop = 74;
  for (let y = otop - 8; y < FLOOR; y++) for (let x = ox0; x < ox1; x++) {
    const ay = otop - Math.sqrt(Math.max(0, 1 - ((x + 0.5 - (ox0 + ox1) / 2) / ((ox1 - ox0) / 2)) ** 2)) * 8;
    if (y < ay) continue;
    c.set(x, y, y < ay + 1 ? P.slate : y < otop + 6 ? P.ink : P.navy);
  }
  // fire: logs + flames
  c.fillRect(304, FLOOR - 5, 34, 3, P.darkBrown); c.fillRect(308, FLOOR - 7, 26, 3, P.brown); c.fillRect(308, FLOOR - 7, 26, 1, P.clay);
  for (let x = 306; x < 336; x++) {
    const hgt = 10 + Math.round(Math.abs(Math.sin(x * 0.55)) * 11 + vnoise(x * 0.4, 2, 6) * 6) - Math.round(Math.abs(x - 321) * 0.35);
    for (let k = 0; k < hgt; k++) { const y = FLOOR - 7 - k, t = k / hgt; c.set(x, y, t < 0.35 ? P.yellow : t < 0.65 ? P.gold : t < 0.88 ? P.orange : P.rust); }
  }
  for (const [x, y] of [[315, 98], [322, 94], [328, 100]]) c.set(x, y, P.white);
  glow(c, 321, FLOOR - 12, 60, 0.7, warm, 0.8);
  // mantel candles and a jug
  candle(c, 294, ftop - 4, 6); candle(c, 348, ftop - 4, 5);
  c.ellipse(321, ftop - 9, 5, 5, (x, y, nx) => (nx < -0.3 ? P.tan : P.rust)); c.fillRect(319, ftop - 16, 4, 3, P.rust); c.fillRect(326, ftop - 11, 2, 4, P.rust);
  // right: tall shelf with barrels, a door
  const dx0 = 392, dx1 = 428;
  c.fillRect(dx0 - 3, 44, dx1 - dx0 + 6, FLOOR - 44, P.darkBrown); c.fillRect(dx0 - 3, 44, dx1 - dx0 + 6, 1, P.clay);
  c.fillRect(dx0, 47, dx1 - dx0, FLOOR - 47, (x) => ((x - dx0) % 6 === 5 ? P.darkBrown : (x - dx0) % 6 === 0 ? P.clay : P.brown));
  for (const y of [58, 100]) c.fillRect(dx0, y, dx1 - dx0, 3, P.darkBrown);
  c.fillRect(dx1 - 7, 80, 3, 3, P.gold); c.set(dx1 - 7, 80, P.yellow);
  barrel(c, 446, FLOOR + 4); barrel(c, 458, FLOOR + 6); crate(c, 438, FLOOR - 7, 12);
  // hanging lanterns + window light
  hangLantern(c, 132, 20, 36, P.gold, warm); hangLantern(c, 262, 20, 30, P.gold, warm);
  // floor: honey boards, a rug in the middle
  boardFloor(c, FLOOR, H, 240, FLOOR - 70, 111, [P.brown, P.clay, mix(P.tan, P.sand, 0.35), P.sand], 7);
  const rug = (y) => { const z = (y - FLOOR) / (H - FLOOR); return [240 - 70 - z * 60, 240 + 70 + z * 60]; };
  for (let y = FLOOR + 10; y < FLOOR + 50; y++) {
    const [a, b] = rug(y), e0 = y - (FLOOR + 10), e1 = FLOOR + 49 - y;
    for (let x = Math.round(a); x < b; x++) {
      const ex = Math.min(x - a, b - x) / (1 + (y - FLOOR) / 30), e = Math.min(ex, e0 * 1.4, e1 * 1.4);
      let col = e < 1.2 ? P.darkRed : e < 4 ? (Math.floor((x - 240) / (5 + (y - FLOOR) / 10) + (y >> 1)) % 3 === 0 ? P.darkRed : mix(P.gold, P.tan, 0.45)) : e < 5.2 ? P.darkRed : (x + y) % 2 ? P.red : mix(P.red, P.darkRed, 0.35);
      const cm = Math.abs(x - 240) / (1 + (y - FLOOR) / 30) + Math.abs(y - (FLOOR + 29.5)) * 2.2;
      if (cm < 10) col = cm < 4 ? P.navy : cm < 7 ? P.gold : mix(P.gold, P.tan, 0.45);
      c.set(x, y, col);
    }
    for (const x of [Math.round(a) - 1, Math.round(a) - 2, Math.ceil(b), Math.ceil(b) + 1]) if (y % 2) c.set(x, y, X.sandPale);
  }
  tint(c, 0, FLOOR, W, H, (x, y) => { const z = (y - FLOOR) / (H - FLOOR); return z > 0.72 ? (z - 0.72) * 1.3 : 0; }, darker);
  // daylight from the window falling onto the floor
  tint(c, 0, wy, W, H, (x, y) => {
    const t = (y - wy) / (H - wy), cx = wx + ww / 2 + t * 150, hw = ww / 2 + t * 30;
    const u = Math.abs(x + 0.5 - cx) / hw;
    return u < 1 && !(x >= wx && x < wx + ww && y < wy + wh) ? 0.32 * (1 - u * u) * Math.min(1, (y - wy - wh) / 20 + 0.2) : 0;
  }, lighter);
  glow(c, 321, FLOOR + 6, 70, 0.4, warm, 0.35);
  return c;
}

// ---------------------------------------------------------------- elven magic shop interior  floor 116
export function battlebackElfShop() {
  const W = 480, H = 190, c = new Canvas(W, H);
  const FLOOR = 116;
  // living-wood wall: warm vertical grain with knots
  c.fillRect(0, 0, W, FLOOR, (x, y) => {
    const warp = vnoise(y * 0.03, x * 0.01, 201) * 18;
    const g = Math.sin((x + warp) * 0.55 + vnoise(x * 0.05, y * 0.02, 202) * 4);
    const n = fbm(x * 0.02, y * 0.03, 203, 3);
    let col = n > 0.58 ? P.clay : n < 0.4 ? mix(P.brown, P.darkBrown, 0.4) : P.brown;
    if (g > 0.86) col = darker(col); else if (g < -0.9) col = lighter(col);
    return col;
  });
  // arching tree-trunk columns
  const bark = [P.darkBrown, P.brown, P.clay, P.tan];
  trunk(c, 14, 20, 0, FLOOR + 6, bark, 3, 1.1); trunk(c, 466, 22, 0, FLOOR + 8, bark, 5, 1.1);
  trunk(c, 134, 9, 0, FLOOR + 2, bark, 7, 0.9); trunk(c, 346, 9, 0, FLOOR + 2, bark, 9, 0.9);
  // round window with daylight + leafy lattice (centre)
  const rx = 240, ry = 50, rr = 30;
  for (let y = ry - rr - 5; y <= ry + rr + 5; y++) for (let x = rx - rr - 5; x <= rx + rr + 5; x++) {
    const d = Math.hypot(x + 0.5 - rx, y + 0.5 - ry);
    if (d < rr) {
      const t = (y - (ry - rr)) / (2 * rr);
      let col = t < 0.45 ? mix(P.grey1, P.cyan, 0.3) : t < 0.7 ? mix(P.green, P.grey1, 0.45) : mix(P.greenDark, P.grey2, 0.3);
      if (t > 0.5 && vnoise(x * 0.12, y * 0.2, 9) > 0.55) col = mix(P.greenDark, P.grey2, 0.25);
      c.set(x, y, col);
    } else if (d < rr + 2) c.set(x, y, d < rr + 1 ? P.sandLight : P.sand);
    else if (d < rr + 5) c.set(x, y, d < rr + 3.5 ? P.clay : P.darkBrown);
  }
  // lattice: curved silver vines
  for (let a = 0; a < Math.PI * 2; a += 0.01) {
    for (const k of [0, 1, 2]) { const r = rr * 0.55 * Math.abs(Math.sin(a * 2 + k * 1.05)); const x = Math.round(rx + Math.cos(a) * r), y = Math.round(ry + Math.sin(a) * r); if (Math.hypot(x - rx, y - ry) < rr) c.set(x, y, P.grey1); }
  }
  c.ellipse(rx, ry, 3, 3, P.cyan); c.set(rx, ry, P.white);
  // canopy of leaves along the ceiling with hanging vines
  foliage(c, 0, 0, W, 34, 211, (x, y) => 0.8 - y / 26 + (Math.abs(x - 240) < 60 ? -0.1 : 0), [P.teal, P.greenDeep, P.greenDark, P.green]);
  const vr = mulberry32(213);
  for (let i = 0; i < 16; i++) {
    const x0 = Math.floor(vr() * W), len = 12 + Math.floor(vr() * 40);
    for (let k = 0; k < len; k++) { const x = x0 + Math.round(Math.sin(k * 0.25 + i) * 1.5), y = 14 + k; c.set(x, y, k % 5 === 0 ? P.green : P.greenDeep); if (k % 6 === 3) { c.set(x + 1, y, P.greenDark); c.set(x + 2, y - 1, P.green); } if (k % 6 === 0) { c.set(x - 1, y, P.greenDark); c.set(x - 2, y - 1, P.green); } }
    if (vr() > 0.6) { c.set(x0, 14 + len, P.pink); c.set(x0 + 1, 14 + len, P.white); }
  }
  // arched alcoves with shelves
  const alcove = (x0, x1, top, seed, fill) => {
    const cx = (x0 + x1) / 2, hw = (x1 - x0) / 2;
    for (let y = top; y < FLOOR - 4; y++) for (let x = x0 - 3; x < x1 + 3; x++) {
      const ay = top + hw - Math.sqrt(Math.max(0, hw * hw - (x + 0.5 - cx) ** 2));
      const ay2 = top + hw + 3 - Math.sqrt(Math.max(0, (hw + 3) ** 2 - (x + 0.5 - cx) ** 2));
      if (x >= x0 && x < x1 && y >= ay) c.set(x, y, x < x0 + 3 ? P.ink : y < ay + 2 ? P.ink : mix(P.darkBrown, P.ink, 0.35));
      else if (y >= ay2 && (x < x0 || x >= x1 || y < ay)) c.set(x, y, x < cx ? P.tan : P.clay); // pale wooden rim
    }
    const shelves = [];
    for (let y = top + hw + 10; y < FLOOR - 6; y += 20) { c.fillRect(x0, y, x1 - x0, 2, P.sand); c.fillRect(x0, y, x1 - x0, 1, P.sandLight); c.fillRect(x0, y + 2, x1 - x0, 1, P.ink); shelves.push(y); }
    fill(shelves, x0, x1);
  };
  const potionCols = [[P.red, P.pink], [P.blue, P.cyan], [P.greenDark, P.green], [P.purple, P.magenta], [P.gold, P.yellow]];
  alcove(46, 110, 26, 1, (sh, x0, x1) => {
    // top: crystal on a stand; then scrolls; then bottles
    const cy = sh[0];
    glow(c, 78, cy - 10, 20, 0.7, (col) => mix(lighter(col), P.cyan, 0.4));
    c.polygon([[74, cy], [76, cy - 14], [78, cy - 18], [80, cy - 14], [82, cy]], (x, y) => (x < 77 ? P.white : x < 79 ? mix(P.cyan, P.white, 0.5) : P.cyan));
    c.polygon([[68, cy], [70, cy - 8], [73, cy]], P.cyan); c.polygon([[83, cy], [86, cy - 9], [88, cy]], mix(P.cyan, P.blue, 0.4));
    c.fillRect(66, cy - 1, 24, 1, P.grey2);
    if (sh[1]) for (let i = 0; i < 7; i++) scrollEnd(c, 52 + i * 8 + (i > 3 ? 0 : 0), sh[1], 3.5, i % 2 ? P.red : P.blueDark);
    if (sh[1]) for (let i = 0; i < 3; i++) scrollEnd(c, 60 + i * 12, sh[1] - 7, 3.5, P.red);
    if (sh[2]) for (let i = 0; i < 6; i++) { const [a, b] = potionCols[i % 5]; bottle(c, 50 + i * 10, sh[2], a, b, 5 + (i % 2), 6 + (i % 3)); }
  });
  alcove(370, 434, 26, 2, (sh, x0, x1) => {
    const cy = sh[0];
    glow(c, 402, cy - 9, 18, 0.7, (col) => mix(lighter(col), P.magenta, 0.35));
    c.ellipse(402, cy - 7, 6, 6, (x, y, nx, ny) => (nx + ny < -0.6 ? P.white : Math.hypot(nx, ny) < 0.5 ? mix(P.magenta, P.white, 0.4) : P.magenta));
    c.fillRect(397, cy - 2, 11, 2, P.grey2); c.fillRect(398, cy - 1, 9, 1, P.grey3);
    if (sh[1]) for (let i = 0; i < 6; i++) { const [a, b] = potionCols[(i + 2) % 5]; bottle(c, 374 + i * 10, sh[1], a, b, 5, 6 + (i % 2) * 2); }
    if (sh[2]) { c.fillRect(374, sh[2] - 12, 30, 12, P.brown); for (let i = 0; i < 8; i++) c.fillRect(375 + i * 4, sh[2] - 11 + (i % 3 === 0 ? 1 : 0), 3, 11 - (i % 3 === 0 ? 1 : 0), [P.darkRed, P.blueDark, P.greenDeep, P.purple, P.teal, P.gold, P.darkRed, P.navy][i]); for (let i = 0; i < 3; i++) scrollEnd(c, 412 + i * 8, sh[2], 3.5, P.gold); }
  });
  // low counter with an open spellbook and crystal ball (centre, behind the villager)
  const kx0 = 186, kx1 = 294, ktop = 94;
  c.fillRect(kx0, ktop, kx1 - kx0, FLOOR - ktop, (x, y) => ((x - kx0) % 18 === 0 ? P.brown : y < ktop + 3 ? P.sandLight : vnoise(x * 0.3, y * 0.2, 17) > 0.62 ? P.sandLight : P.sand));
  c.fillRect(kx0 - 3, ktop - 3, kx1 - kx0 + 6, 3, P.sandLight); c.fillRect(kx0 - 3, ktop - 3, kx1 - kx0 + 6, 1, X.sandPale); c.fillRect(kx0 - 3, ktop, kx1 - kx0 + 6, 1, P.clay);
  for (let x = kx0; x < kx1; x += 18) { c.ellipse(x + 9, ktop + 11, 3, 4, P.greenDark); c.set(x + 8, ktop + 9, P.green); }
  // spellbook
  c.polygon([[200, ktop - 3], [204, ktop - 8], [216, ktop - 7], [218, ktop - 3]], X.sandPale); c.polygon([[218, ktop - 3], [220, ktop - 7], [232, ktop - 8], [236, ktop - 3]], P.sandLight);
  c.line(205, ktop - 6, 214, ktop - 6, P.purple); c.line(222, ktop - 6, 231, ktop - 6, P.purple); c.line(206, ktop - 4, 215, ktop - 4, P.purple);
  c.fillRect(199, ktop - 3, 38, 1, P.darkRed);
  // crystal ball on a stand
  glow(c, 270, ktop - 10, 22, 0.75, (col) => mix(lighter(col), P.cyan, 0.4));
  c.ellipse(270, ktop - 10, 7, 7, (x, y, nx, ny) => (nx + ny < -0.8 ? P.white : Math.hypot(nx + 0.2, ny + 0.2) < 0.45 ? mix(P.cyan, P.white, 0.6) : ny > 0.5 ? P.blue : P.cyan));
  c.fillRect(265, ktop - 3, 11, 3, P.grey2); c.fillRect(265, ktop - 3, 11, 1, P.grey1);
  // hanging leaf-lanterns + fireflies / motes
  const cyanGlow = (col) => mix(lighter(col), P.cyan, 0.35), greenGlow = (col) => mix(lighter(col), P.yellow, 0.25), violetGlow = (col) => mix(lighter(col), P.magenta, 0.3);
  hangLantern(c, 170, 22, 48, P.cyan, cyanGlow); hangLantern(c, 312, 20, 40, P.green, greenGlow); hangLantern(c, 450, 24, 60, P.magenta, violetGlow); hangLantern(c, 30, 26, 64, P.cyan, cyanGlow);
  // floor: pale boards overgrown with moss at the wall and in patches
  boardFloor(c, FLOOR, H, 240, FLOOR - 64, 221, [P.brown, P.clay, mix(P.sand, P.clay, 0.3), P.sand], 6);
  tint(c, 0, FLOOR, W, H, (x, y) => {
    const z = (y - FLOOR) / (H - FLOOR), n = fbm(x * 0.03, (1 / (0.2 + z)) * 1.3, 223, 3);
    return (n > 0.58 ? (n - 0.58) * 9 : 0) + (z < 0.08 ? (0.08 - z) * 12 : 0);
  }, (col) => (col === P.brown ? P.greenDeep : col === P.clay ? P.greenDark : col === P.sand || col === mix(P.sand, P.clay, 0.3) ? mix(P.greenDark, P.sand, 0.3) : null));
  // roots creeping from the trunks across the floor
  for (const [x0, dir, len] of [[26, 1, 60], [40, 1, 38], [454, -1, 64], [440, -1, 40], [140, 1, 26], [340, -1, 26]]) {
    for (let k = 0; k < len; k++) { const x = x0 + dir * k * 1.6, y = FLOOR + 1 + k * 0.45 + Math.sin(k * 0.3) * 1.5, w = Math.max(1, 3 - k / 20); c.fillRect(Math.round(x), Math.round(y), 2, Math.round(w), P.brown); c.set(Math.round(x), Math.round(y), P.tan); }
  }
  // glowing mushrooms by the walls
  for (const [mx, my, col] of [[30, 124, P.cyan], [38, 127, P.cyan], [446, 128, P.magenta], [456, 125, P.magenta], [120, 119, P.green], [360, 119, P.cyan]]) {
    glow(c, mx, my - 3, 8, 0.6, (cc) => mix(lighter(cc), col, 0.35));
    c.fillRect(mx, my - 2, 1, 3, P.sandLight); c.fillRect(mx - 1, my - 4, 3, 2, col); c.set(mx, my - 4, P.white);
  }
  tint(c, 0, FLOOR, W, H, (x, y) => { const z = (y - FLOOR) / (H - FLOOR); return z > 0.72 ? (z - 0.72) * 1.3 : 0; }, darker);
  // motes of light
  const ff = mulberry32(229);
  for (let i = 0; i < 26; i++) { const x = Math.floor(ff() * W), y = 30 + Math.floor(ff() * 100); c.set(x, y, ff() > 0.5 ? mix(P.cyan, P.white, 0.5) : P.yellow); }
  lightShaft(c, 226, 0.25, 22, 0.35, H);
  return c;
}

// ---------------------------------------------------------------- title: desert sunset/night with caravan
function camel(c, x, y, s, col, facing = 1) {
  const f = (dx) => x + dx * facing * s;
  // body & hump
  c.ellipse(f(0), y - 9 * s, 7 * s, 3.6 * s, col);
  c.ellipse(f(-1), y - 12 * s, 3.8 * s, 3.2 * s, col);
  // neck & head
  c.polygon([[f(5), y - 10 * s], [f(8), y - 16 * s], [f(10), y - 16.5 * s], [f(9.5), y - 14.5 * s], [f(7), y - 8 * s]], col);
  c.ellipse(f(10.5), y - 16 * s, 2.4 * s, 1.3 * s, col);
  // legs
  for (const dx of [-5, -3.5, 3.5, 5]) c.line(f(dx), y - 8 * s, f(dx + (dx > 0 ? 0.5 : -0.5)), y, col);
  // tail
  c.line(f(-7), y - 10 * s, f(-8), y - 6 * s, col);
  // rider
  c.ellipse(f(-1), y - 17 * s, 1.7 * s, 2.8 * s, col);
  c.ellipse(f(-1), y - 20.8 * s, 1.3 * s, 1.3 * s, col);
  c.polygon([[f(-3), y - 16 * s], [f(-6), y - 13 * s], [f(-2), y - 15 * s]], col); // cloak tail
}
export function titleBackground() {
  const W = 480, H = 270, c = new Canvas(W, H);
  gradient(c, 0, 182, [[0, P.ink], [0.3, P.navy], [0.52, X.purpleDark], [0.68, P.purple], [0.8, P.magenta], [0.9, P.pink], [0.97, P.orange], [1, P.gold]]);
  // stars
  const rnd = mulberry32(2024);
  for (let i = 0; i < 170; i++) {
    const x = Math.floor(rnd() * W), y = Math.floor(rnd() * rnd() * 110);
    const b = rnd();
    c.set(x, y, b > 0.85 ? P.white : b > 0.5 ? P.grey1 : P.grey3);
    if (b > 0.96) { c.set(x - 1, y, P.grey2); c.set(x + 1, y, P.grey2); c.set(x, y - 1, P.grey2); c.set(x, y + 1, P.grey2); }
  }
  // crescent moon
  c.ellipse(96, 44, 13, 13, P.sandLight);
  c.ellipse(90, 40, 12, 12, null);
  for (let y = 26; y < 60; y++) for (let x = 76; x < 112; x++) if ((x + 0.5 - 101) ** 2 + (y + 0.5 - 39) ** 2 < 132) { const cc = c.get(x, y); if (cc === P.sandLight) c.set(x, y, dither(x, y, 0.5) ? P.navy : P.ink); }
  for (let y = 26; y < 62; y++) for (let x = 76; x < 112; x++) if (c.get(x, y) === P.sandLight && (x + 0.5 - 96) ** 2 + (y + 0.5 - 44) ** 2 > 110) c.set(x, y, P.yellow);
  // setting sun glow on horizon
  sun(c, 330, 160, 17, P.yellow, [P.gold, P.orange]);
  // distant mesas
  mesas(c, 172, 3, X.purpleDark, X.purpleDark, P.ink, 0.9);
  for (let x = 0; x < W; x++) for (let y = 130; y < 172; y++) if (c.get(x, y) === X.purpleDark && c.get(x, y - 1) !== X.purpleDark) c.set(x, y, P.purple);
  // dune layers
  const layer = (base, amp, f1, f2, ph, top, body) => fillProfile(c, (x) => base + Math.sin(x * f1 + ph) * amp + Math.sin(x * f2 + ph * 2) * amp * 0.4, (x, y, d) => (d < 1 ? top : body(x, y, d)));
  layer(176, 6, 0.012, 0.037, 1, P.magenta, (x, y) => (dither(x, y, 0.4) ? P.purple : X.purpleDark));
  layer(196, 10, 0.009, 0.029, 2.3, P.purple, () => X.purpleDark);
  // caravan on the crest of the middle dune
  const crest = (x) => 196 + Math.sin(x * 0.009 + 2.3) * 10 + Math.sin(x * 0.029 + 4.6) * 4;
  for (const [x, s] of [[250, 1.0], [285, 0.95], [318, 0.92], [350, 0.88]]) camel(c, x, Math.round(crest(x)) + 1, s, P.ink, 1);
  // foreground dune (dark) with palm silhouettes
  layer(226, 12, 0.007, 0.021, 4.1, P.darkBrown, (x, y, d) => (d < 3 && dither(x, y, 0.5) ? P.darkBrown : P.ink));
  palmSil(c, 36, 236, 58, P.ink, 1); palmSil(c, 60, 240, 42, P.ink, -1); palmSil(c, 452, 238, 50, P.ink, -1);
  return c;
}

// ---------------------------------------------------------------- shared helpers (mountain, temple, pond, mirage, jungle, fear)
/** 4-tone ramp pick for a lighting value k (light from the top-left ~ positive). */
const ramp4 = (k, [d0, d1, d2, d3]) => (k > 0.6 ? d3 : k > 0.15 ? d2 : k > -0.35 ? d1 : d0);
/** Lighting value for an ellipse normal (nx, ny) lit from the top-left. */
const litK = (nx, ny) => -0.6 * nx - 0.75 * ny;
/** Perspective slab grid on a floor (z = 0 far .. 1 near): row/cell ids and joint flags. */
function slab(x, z, W, across, rows, seed, stagger = 0.7) {
  const depth = 1 / (0.12 + z), gy = depth * rows, row = Math.floor(gy);
  const gx = ((x - W / 2) / W) * across / (0.12 + z) * 0.5 + hash2(row, 0, seed) * stagger, cell = Math.floor(gx);
  return { gx, gy, row, cell, fy: gy - row, lineX: Math.abs(gx - Math.round(gx)) < 0.03 + z * 0.015, lineY: Math.abs(gy - Math.round(gy)) < 0.05 * (1 + z * 2) };
}
/** Darken the nearest rows of a floor (same falloff as the other backdrops). */
const nearShade = (c, FLOOR) => tint(c, 0, FLOOR, c.width, c.height, (x, y) => { const z = (y - FLOOR) / (c.height - FLOOR); return z > 0.72 ? (z - 0.72) * 1.3 : 0; }, darker);
/** Conifer: stacked jagged tiers, lit from the left. cols = [dark, mid, light]. */
function pine(c, x, base, h, [dk, md, lt], trunkCol, seed = 1) {
  c.fillRect(x - 1, base - Math.max(2, Math.round(h * 0.22)), 2, Math.max(2, Math.round(h * 0.22)), trunkCol);
  const tiers = Math.max(3, Math.round(h / 7));
  for (let i = 0; i < tiers; i++) {
    const t = i / tiers, bot = base - h * 0.16 - t * h * 0.72, th = (h * 0.84) / tiers * 1.9, tw = (1 - t * 0.8) * h * 0.26 + 1.5;
    for (let y = Math.round(bot - th); y <= bot; y++) {
      const hw = tw * ((y - (bot - th)) / th);
      for (let xx = Math.floor(x - hw); xx <= x + hw; xx++) {
        const u = (xx + 0.5 - x) / Math.max(1, hw);
        if (Math.abs(u) > 0.7 && hash2(xx, y, seed) > 0.6) continue; // ragged needles
        c.set(xx, y, y >= bot - 1 ? dk : u < -0.35 ? lt : u > 0.35 ? dk : md);
      }
    }
  }
}
/** Rough rock face: jittered facets, each lit by its own tilt, dark cracks along the facet borders. ramp = [dk, md, lt, hi]. */
function rockPx(x, y, seed, [dk, md, lt, hi], fw = 13, fh = 12) {
  const facet = (xx, yy) => {
    const sx = xx + yy * 0.45 + vnoise(yy * 0.07, 0, seed) * 12, cx = Math.floor(sx / fw);
    const jy = yy - xx * 0.25 + vnoise(xx * 0.08, cx, seed + 1) * 10 + hash2(cx, 0, seed) * fh, cy = Math.floor(jy / fh);
    return [cx, cy, sx / fw - cx, jy / fh - cy];
  };
  const [cx, cy, fx, fy] = facet(x, y), k = hash2(cx, cy, seed + 2);
  let col = k > 0.6 ? lt : k > 0.18 ? md : dk;
  if (fx < 0.18 && fy > 0.1) col = col === dk ? md : lt; // lit left flank of each shard
  if (fy < 0.1) col = hi;
  else if (fx > 0.85) col = col === lt ? md : dk; // shadowed right flank
  const [ax] = facet(x + 1, y), [, by] = facet(x, y + 1);
  if (ax !== cx || by !== cy) col = dk;
  if (col === md && hash2(x, y, seed + 3) > 0.94) col = dk;
  return col;
}
/** Reed blade from (x, base): curving line `h` tall, leaning by `lean` px at the tip. */
function reed(c, x, base, h, lean, col, tip) {
  for (let i = 0; i < h; i++) { const t = i / h, xx = Math.round(x + lean * t * t); c.set(xx, base - i, t > 0.8 ? tip : col); if (t < 0.3) c.set(xx + 1, base - i, col); }
}
/** Cattail: stalk plus a brown velvet head. */
function cattail(c, x, base, h, lean, stalk) {
  const tipX = (t) => Math.round(x + lean * t * t);
  for (let i = 0; i < h; i++) c.set(tipX(i / h), base - i, stalk);
  const hx = tipX(0.8), hy = base - Math.round(h * 0.8);
  c.fillRect(hx - 1, hy - 7, 3, 8, P.brown); c.fillRect(hx - 1, hy - 7, 1, 8, P.clay); c.set(hx + 1, hy - 7, P.darkBrown); c.set(hx + 1, hy, P.darkBrown);
  c.set(hx - 1, hy - 7, P.brown); c.set(hx, hy - 8, P.brown);
  for (let k = 9; k < 13; k++) c.set(hx, hy - k, stalk);
}
/** Big (tropical) leaf from its stem (x0, y0) along angle a; droop bends the tip toward +v. cols [dk, md, lt, rib]. */
function bigLeaf(c, x0, y0, a, len, wid, droop, [dk, md, lt, rib], slits = false) {
  const ca = Math.cos(a), sa = Math.sin(a), R = len + wid + Math.abs(droop) + 2;
  for (let y = Math.floor(y0 - R); y <= y0 + R; y++) for (let x = Math.floor(x0 - R); x <= x0 + R; x++) {
    const dx = x + 0.5 - x0, dy = y + 0.5 - y0, u = dx * ca + dy * sa, t = u / len;
    if (t < 0 || t > 1) continue;
    const v = -dx * sa + dy * ca - droop * t * t;
    const hw = wid * Math.sin(Math.PI * Math.pow(t, 0.75)) ** 0.7;
    if (Math.abs(v) > hw) continue;
    const av = Math.abs(v) / Math.max(0.5, hw);
    if (slits && av > 0.3 && ((t * 7 + av * 0.9) % 1) < 0.13) continue;
    let col = v < 0 ? lt : md;
    if (((t * 9 - av * 1.6) % 1 + 1) % 1 < 0.14 && av > 0.15) col = col === lt ? md : dk;
    if (Math.abs(v) < 0.7) col = rib;
    else if (av > 0.86) col = dk;
    c.set(x, y, col);
  }
}
/** Tiered pagoda roof stack (distant), base centre (cx, base). */
function pagoda(c, cx, base, tiers, s, { roof, roofHi, wall, dark }) {
  let y = base;
  for (let i = 0; i < tiers; i++) {
    const bw = Math.round((9 - i * 2) * s), wh = Math.max(2, Math.round((i === 0 ? 6 : 4) * s)), rw = bw + Math.round(4 * s), rh = Math.max(2, Math.round(3 * s));
    c.fillRect(cx - bw, y - wh, bw * 2 + 1, wh, (x) => (x === cx - bw || x === cx + bw || (x - cx) % 3 === 0 ? dark : wall));
    y -= wh;
    c.polygon([[cx - rw, y + 1], [cx + rw + 1, y + 1], [cx + bw - 1, y - rh], [cx - bw + 2, y - rh]], roof);
    c.line(cx - rw, y, cx + rw, y, roofHi); c.line(cx - rw, y + 1, cx + rw, y + 1, dark);
    c.set(cx - rw - 1, y - 1, roofHi); c.set(cx + rw + 1, y - 1, roofHi);
    y -= rh;
  }
  c.line(cx, y, cx, y - Math.round(5 * s), dark); c.set(cx, y - Math.round(3 * s), roofHi);
}

// ---------------------------------------------------------------- mountain slope (temple peaks)  floor 118
export function battlebackMountain() {
  const W = 480, H = 190, c = new Canvas(W, H);
  const FLOOR = 118;
  gradient(c, 0, 100, [[0, P.blueDark], [0.45, P.blue], [0.8, mix(P.blue, P.grey1, 0.55)], [1, P.grey1]]);
  cloud(c, 60, 16, 40, P.grey1, P.grey2); cloud(c, 210, 26, 30, P.white, P.grey1); cloud(c, 420, 12, 46, P.grey1, P.grey2);
  // far snowy range
  const peaks = [[20, 34], [118, 22], [206, 40], [296, 28], [390, 18], [470, 36]];
  const farTop = (x) => { let best = 1e9, pk = 0; for (const [px, py] of peaks) { const t = py + Math.abs(x - px) * 0.62; if (t < best) { best = t; pk = px; } } return [best + vnoise(x * 0.15, 1, 3) * 3, pk]; };
  const farLit = mix(P.grey2, P.blue, 0.3), farSh = mix(P.grey3, P.blue, 0.3), snowLit = P.white, snowSh = mix(P.grey1, P.blue, 0.3);
  for (let x = 0; x < W; x++) {
    const [top, pk] = farTop(x), t0 = Math.round(top);
    for (let y = t0; y < 96; y++) {
      const shade = x > pk + (y - t0) * 0.2, snowy = y - t0 < 8 + vnoise(x * 0.3, 2, 5) * 6 && y < 66;
      let col = snowy ? (shade ? snowSh : snowLit) : shade ? farSh : farLit;
      if (!snowy && vnoise(x * 0.2, y * 0.25, 7) > 0.72) col = shade ? farLit : snowSh; // snow streaks
      c.set(x, y, col);
    }
  }
  tint(c, 0, 50, W, 100, (x, y) => (y - 50) / 60, (col) => mix(col, P.grey1, 0.45));
  // mid crags rising from the cloud sea, one crowned by the temple
  const haze = [mix(P.slate, P.blue, 0.3), mix(P.grey3, P.blue, 0.25), mix(P.grey2, P.blue, 0.2), mix(P.grey1, P.blue, 0.2)];
  const crag = (cx, top, hw, seed) => {
    for (let x = cx - hw - 20; x < cx + hw + 20; x++) {
      const e = Math.abs(x - cx) / hw, t = top + (e < 1 ? e * e * 14 : 14 + (e - 1) * 60) + vnoise(x * 0.25, 3, seed) * 4;
      for (let y = Math.round(t); y < 104; y++) {
        const lit = x < cx - hw * 0.1 + (y - top) * 0.1;
        let col = rockPx(x, y, seed + 60, haze, 10, 6);
        if (!lit) col = col === haze[3] ? haze[2] : col === haze[2] ? haze[1] : haze[0];
        if (y < t + 1.5) col = haze[3];
        c.set(x, y, col);
      }
    }
  };
  crag(312, 62, 22, 3); crag(176, 76, 16, 4); crag(420, 72, 18, 5);
  const hazePine = [mix(P.greenDeep, P.blue, 0.35), mix(P.greenDark, P.blue, 0.35), mix(P.green, P.grey1, 0.45)];
  for (const [px, h] of [[164, 12], [172, 16], [186, 11], [296, 10], [330, 13], [410, 12], [428, 15]]) {
    let y = 60; while (y < 104 && !(c.get(px, y) !== c.get(px, y - 1) && y > 60)) y++;
    pine(c, px, y + 3, h, hazePine, mix(P.brown, P.grey3, 0.5), px);
  }
  // temple on the crag: platform, stairs, tiered roofs
  c.fillRect(298, 62, 29, 3, mix(P.grey1, P.sandLight, 0.4)); c.fillRect(298, 64, 29, 1, mix(P.grey3, P.blue, 0.2));
  pagoda(c, 312, 62, 4, 1.15, { roof: mix(P.darkRed, P.grey3, 0.25), roofHi: mix(P.rust, P.grey1, 0.3), wall: mix(P.sandLight, P.grey1, 0.4), dark: mix(P.darkBrown, P.grey3, 0.35) });
  c.fillRect(292, 60, 1, 5, P.darkRed); c.fillRect(332, 60, 1, 5, P.darkRed); c.fillRect(290, 59, 5, 1, P.darkRed); c.fillRect(330, 59, 5, 1, P.darkRed); // little torii
  // sea of clouds, three puffy layers
  const layer = (base, amp, f, ph, seed) => fillProfile(c, (x) => base - Math.abs(Math.sin(x * f + ph)) * amp - Math.abs(Math.sin(x * f * 2.3 + ph * 3)) * amp * 0.4 + vnoise(x * 0.2, seed, seed) * 1.5, (x, y, d) => (d < 2 ? P.white : d < 3 ? (dither(x, y, 0.5) ? P.white : P.grey1) : d < 7 ? P.grey1 : d < 10 ? (dither(x, y, (d - 6) * 0.2) ? mix(P.grey1, P.grey2, 0.45) : P.grey1) : mix(P.grey1, P.grey2, 0.45)), FLOOR);
  layer(88, 6, 0.045, 0.3, 1); layer(98, 7, 0.036, 1.7, 2); layer(108, 8, 0.03, 2.9, 3);
  // near cliffs framing the scene
  const rock = [P.slate, P.grey3, P.grey2, P.grey1];
  const cliffL = (x) => (x > 142 ? 999 : 2 + Math.pow(x / 142, 1.9) * (FLOOR - 2) + vnoise(x * 0.12, 7, 9) * 7 - (x < 60 ? 0 : Math.max(0, Math.sin(x * 0.11)) * 5));
  const cliffR = (x) => (x < 352 ? 999 : 6 + Math.pow((W - x) / 128, 1.7) * (FLOOR - 6) + vnoise(x * 0.12, 8, 9) * 7);
  for (let x = 0; x < W; x++) {
    const t = Math.round(Math.min(cliffL(x), cliffR(x)));
    for (let y = Math.max(0, t); y < FLOOR + 4; y++) {
      let col = rockPx(x, y, x < 240 ? 21 : 22, rock);
      if (col === P.grey1 && vnoise(x * 0.2, y * 0.2, 31) > 0.6) col = P.greenDark; // moss on the ledges
      if (y < t + 1) col = P.grey1; else if (y < t + 3) col = dither(x, y, 0.5) ? P.greenDark : P.greenDeep; // grassy rim
      if (y > FLOOR - 16 && dither(x, y, (y - FLOOR + 16) / 30)) col = darker(col);
      c.set(x, y, col);
    }
  }
  const pineN = [P.teal, P.greenDeep, P.greenDark];
  for (const [px, h] of [[18, 34], [40, 26], [72, 22], [104, 16], [126, 12], [376, 14], [404, 22], [440, 30], [466, 38]]) pine(c, px, Math.round(Math.min(cliffL(px), cliffR(px))) + 3, h, pineN, P.darkBrown, px);
  // mist wisps drifting past the cliffs
  for (const [mx, my, w] of [[70, 84, 80], [420, 70, 60]]) tint(c, mx - w, my - 12, mx + w, my + 12, (x, y) => { const u = (x - mx) / w, v = (y - my + Math.sin(x * 0.08) * 3) / 9; const d = u * u + v * v; return d < 1 ? 0.5 * (1 - d) * (0.6 + vnoise(x * 0.1, y * 0.2, 5) * 0.8) : 0; }, (col) => mix(col, P.white, 0.55));
  // ground: rocky ledge with alpine grass, a stone-stepped path to the edge
  const vy = FLOOR - 60, pathHW = (z) => 16 + z * 64;
  ground(c, FLOOR, H, (x, y, z) => {
    const n = fbm(x * 0.02, (1 / (0.18 + z)) * 1.2, 41, 3);
    let col;
    if (n > 0.4) col = grassPx(x, y, z, 43, [P.greenDeep, P.greenDark, mix(P.greenDark, P.green, 0.5)]);
    else { const m = fbm(x * 0.05, (1 / (0.18 + z)) * 3, 45, 2); col = n > 0.38 ? P.greenDeep : n > 0.36 ? P.grey2 : m > 0.55 ? P.grey3 : dither(x, y, 0.4) ? P.slate : P.grey3; if (hash2(x, y, 46) > 0.975) col = P.slate; }
    const px = Math.abs(x - 240) - pathHW(z) * (0.95 + vnoise(y * 0.3, 1, 47) * 0.1);
    if (px < 0) {
      const d = y - vy, u = 900 / d, s = Math.floor(u), fu = u - s;
      const gx = ((x - 240) * 3.2) / d + hash2(s, 0, 48) * 0.6, cell = Math.floor(gx), pw = d / 3.2;
      const tone = hash2(cell, s, 49);
      col = fu < 0.26 ? P.grey3 : fu < 0.34 ? P.grey1 : tone > 0.7 ? mix(P.grey1, P.grey2, 0.5) : tone < 0.25 ? mix(P.grey2, P.sand, 0.25) : P.grey2;
      if ((gx - cell) * pw < 1 && fu >= 0.26) col = P.slate;
      if (fu < 0.08) col = P.slate;
      if (fu >= 0.34 && vnoise(x * 0.3, y * 0.5, s) > 0.78) col = P.greenDark; // moss in the cracks
    } else if (px < 2) col = dither(x, y, 0.5) ? P.slate : P.grey3;
    if (y === FLOOR) col = x > 142 && x < 352 ? P.grey1 : col;
    return col;
  });
  // boulders + stone lanterns by the path
  const boulder = (bx, by, r) => { c.ellipse(bx, by, r * 1.4, r, (x, y, nx, ny) => ramp4(litK(nx, ny) + (hash2(x, y, 3) - 0.5) * 0.3, rock)); c.fillRect(Math.round(bx - r * 1.2), Math.round(by + r - 1), Math.round(r * 2.4), 1, P.slate); };
  boulder(60, 140, 7); boulder(80, 148, 4); boulder(430, 150, 8); boulder(406, 132, 4); boulder(150, 124, 3); boulder(346, 126, 3);
  const toro = (x, base) => { c.fillRect(x - 2, base - 12, 5, 12, P.grey2); c.fillRect(x - 2, base - 12, 1, 12, P.grey1); c.fillRect(x - 5, base - 16, 11, 4, P.grey1); c.fillRect(x - 5, base - 13, 11, 1, P.grey3); c.fillRect(x - 3, base - 15, 7, 2, P.gold); c.set(x, base - 15, P.yellow); c.fillRect(x - 6, base - 18, 13, 2, P.grey2); c.fillRect(x - 6, base - 18, 13, 1, P.grey1); c.fillRect(x - 1, base - 20, 3, 2, P.grey2); c.fillRect(x - 4, base, 9, 1, P.slate); };
  toro(160, 134); toro(322, 134);
  // flowers
  const fr = mulberry32(55);
  for (let i = 0; i < 24; i++) { const x = Math.floor(fr() * W), y = FLOOR + 4 + Math.floor(fr() * 70), z = (y - FLOOR) / (H - FLOOR); if (Math.abs(x - 240) < pathHW(z) + 3) continue; if (c.get(x, y) === P.greenDark || c.get(x, y) === P.greenDeep) c.set(x, y, fr() > 0.5 ? P.white : P.pink); }
  nearShade(c, FLOOR);
  return c;
}
// ---------------------------------------------------------------- temple hall (golden Buddha)  floor 120
export function battlebackTemple() {
  const W = 480, H = 190, c = new Canvas(W, H);
  const FLOOR = 120, DAIS = FLOOR - 12;
  const gold = [P.brown, P.tan, P.gold, P.yellow];
  // back wall: dark lacquered panels
  c.fillRect(0, 0, W, FLOOR, (x, y) => {
    const px = x % 40, py = (y - 18) % 34;
    if (px < 2 || py < 2) return px === 0 || py === 0 ? P.ink : P.darkBrown;
    return vnoise(x * 0.4, y * 0.05, 3) > 0.72 ? mix(P.darkBrown, P.darkRed, 0.35) : P.darkBrown;
  });
  // shoji screens (lit paper lattice) between the outer pillars
  const shoji = (x0, x1, y0, y1) => {
    c.fillRect(x0, y0, x1 - x0, y1 - y0, (x, y) => {
      const lx = (x - x0) % 9, ly = (y - y0) % 11;
      if (lx === 0 || ly === 0) return P.brown;
      const t = (y - y0) / (y1 - y0);
      return dither(x, y, 0.3 + t * 0.5) ? P.sand : P.sandLight;
    });
    c.strokeRect(x0 - 1, y0 - 1, x1 - x0 + 2, y1 - y0 + 2, P.darkBrown); c.strokeRect(x0 - 2, y0 - 2, x1 - x0 + 4, y1 - y0 + 4, P.ink);
    // bamboo shadows on the paper
    for (let x = x0; x < x1; x++) for (let y = y0; y < y1; y++) { const b = Math.abs(x - x0 - 14 - (y - y0) * 0.1) < 1 || (Math.abs(y - y0 - 30 - (x - x0) * 0.35) < 1.5 && x - x0 > 14 && x - x0 < 40); if (b && c.get(x, y) !== P.brown) c.set(x, y, P.sand); }
  };
  shoji(56, 116, 30, FLOOR - 6); shoji(364, 424, 30, FLOOR - 6);
  // ceiling: beams with gilded brackets
  c.fillRect(0, 0, W, 12, (x, y) => (y === 11 ? P.ink : y === 10 ? P.darkRed : y < 3 ? P.ink : vnoise(x * 0.2, y, 5) > 0.7 ? P.darkRed : mix(P.darkRed, P.darkBrown, 0.5)));
  for (let x = 4; x < W; x += 24) { c.fillRect(x, 12, 12, 4, P.darkRed); c.fillRect(x, 12, 12, 1, P.gold); c.fillRect(x + 3, 16, 6, 3, P.darkRed); c.fillRect(x + 3, 16, 6, 1, P.tan); c.fillRect(x, 15, 12, 1, P.ink); }
  c.fillRect(0, 19, W, 2, P.ink); for (let x = 0; x < W; x += 6) c.set(x + 2, 19, P.brown);
  // mandorla: flame halo behind the Buddha
  const bx = 240;
  glow(c, bx, 60, 90, 0.4, warm, 0.7);
  for (let y = 14; y < DAIS; y++) for (let x = bx - 50; x <= bx + 50; x++) {
    const nx = (x + 0.5 - bx) / 46, ny = (y + 0.5 - 60) / 50, d = Math.hypot(nx, ny);
    const flame = 0.07 * Math.sin(Math.atan2(ny, nx) * 22) + 0.03 * Math.sin(Math.atan2(ny, nx) * 9 + 1);
    if (d < 1 + flame) c.set(x, y, d > 0.92 + flame ? (d > 0.97 + flame ? P.rust : P.orange) : d > 0.86 ? P.gold : d > 0.82 ? P.darkRed : dither(x, y, 0.35 + d * 0.3) ? P.darkRed : mix(P.darkRed, P.darkBrown, 0.6));
  }
  for (let y = 22; y < 68; y++) for (let x = bx - 22; x <= bx + 22; x++) { const d = Math.hypot(x + 0.5 - bx, y + 0.5 - 44) / 20; if (d < 1) c.set(x, y, d > 0.9 ? P.gold : d > 0.84 ? P.yellow : d > 0.78 ? P.gold : dither(x, y, 0.5) ? P.rust : P.darkRed); }
  // lotus throne
  for (let i = 0; i < 9; i++) { const px = bx - 36 + i * 9; c.ellipse(px, DAIS - 7, 5, 6, (x, y, nx, ny) => (ny < -0.5 ? P.white : nx < -0.2 ? P.pink : ny > 0.4 ? P.magenta : mix(P.pink, P.magenta, 0.4))); c.set(px, DAIS - 13, P.white); }
  for (let i = 0; i < 8; i++) { const px = bx - 32 + i * 9; c.ellipse(px, DAIS - 3, 5, 4, (x, y, nx, ny) => (ny < -0.3 ? P.pink : nx > 0.3 ? P.purple : P.magenta)); }
  // seated body: crossed legs, torso, robe folds, hands
  c.ellipse(bx, DAIS - 16, 38, 8, (x, y, nx, ny) => ramp4(litK(nx, ny) * 0.9 + 0.3, gold));
  for (const k of [-1, 1]) c.line(bx + k * 6, DAIS - 16, bx + k * 32, DAIS - 19, P.tan);
  c.ellipse(bx, 76, 23, 22, (x, y, nx, ny) => ramp4(litK(nx, ny) + 0.35, gold));
  c.polygon([[bx - 25, 90], [bx - 20, 60], [bx - 10, 58], [bx - 18, 92]], (x, y) => (x < bx - 21 ? P.gold : P.tan)); // left arm
  c.polygon([[bx + 25, 90], [bx + 20, 60], [bx + 10, 58], [bx + 18, 92]], (x, y) => (x > bx + 21 ? P.brown : P.tan)); // right arm
  c.line(bx - 12, 58, bx + 12, 86, P.tan); c.line(bx - 11, 58, bx + 13, 86, P.yellow); c.line(bx + 6, 66, bx + 18, 76, P.tan); // robe sash
  c.ellipse(bx, 90, 11, 4, (x, y, nx, ny) => ramp4(litK(nx, ny) + 0.4, gold)); c.line(bx - 6, 89, bx + 6, 89, P.tan); c.set(bx - 1, 88, P.white); c.set(bx + 1, 88, P.white); // hands in dhyana mudra
  c.fillRect(bx - 4, 53, 9, 5, P.tan); c.fillRect(bx - 4, 53, 3, 5, P.gold); // neck
  // head: face, curls, ushnisha, long ears
  for (const k of [-1, 1]) { c.ellipse(bx + k * 9.5, 47.5, 3, 7, P.brown); c.ellipse(bx + k * 9.5, 47, 2, 6, k < 0 ? P.gold : P.tan); }
  c.ellipse(bx, 44, 10, 11.5, P.brown);
  c.ellipse(bx, 44, 9, 10.5, (x, y, nx, ny) => {
    if (ny < -0.5) return (x + y) % 2 ? P.brown : ((x >> 1) + (y >> 1)) % 2 ? P.tan : P.gold; // curls
    return ramp4(litK(nx, ny) * 0.8 + 0.5, gold);
  });
  c.ellipse(bx, 33, 4.5, 3.5, (x, y) => ((x + y) % 2 ? P.brown : P.tan)); c.set(bx, 30, P.gold);
  c.line(bx - 6, 46, bx - 3, 47, P.brown); c.line(bx + 3, 47, bx + 6, 46, P.brown); // closed eyes
  c.set(bx, 42, P.yellow); c.set(bx, 43, P.white); // urna
  c.fillRect(bx, 48, 1, 3, P.tan); c.line(bx - 2, 52, bx + 2, 52, P.brown); c.set(bx - 5, 44, P.yellow); c.set(bx - 6, 45, P.white);
  // dais with carved front
  c.fillRect(bx - 70, DAIS, 141, FLOOR - DAIS, (x, y) => (y === DAIS ? P.gold : y === DAIS + 1 ? P.tan : y === FLOOR - 1 ? P.ink : (x - bx + 70) % 20 < 2 ? P.darkBrown : (y - DAIS) > 3 && (y - DAIS) < 9 && (x - bx + 70) % 20 > 5 && (x - bx + 70) % 20 < 15 ? P.darkRed : mix(P.darkRed, P.darkBrown, 0.45)));
  for (let x = bx - 64; x < bx + 64; x += 20) { c.set(x + 10, DAIS + 6, P.gold); }
  // candles and incense burner on the dais
  for (const [x, h] of [[bx - 58, 8], [bx - 48, 6], [bx + 48, 6], [bx + 58, 8]]) { c.fillRect(x - 2, DAIS - 1, 6, 2, P.gold); candle(c, x, DAIS - 1, h); }
  // censer (bronze) + smoke
  const cx = bx, cy = DAIS - 1;
  const smoke = (x0, y0, len, ph) => { for (let i = 0; i < len; i++) { const y = y0 - i, x = Math.round(x0 + Math.sin(i * 0.12 + ph) * (2 + i * 0.12)); const a = 1 - i / len; if (dither(x, y, 0.35 + a * 0.5)) c.set(x, y, a > 0.5 ? P.grey1 : P.grey2); if (dither(x + 1, y, a * 0.6)) c.set(x + 1, y, P.grey2); } };
  smoke(cx - 2, cy - 12, 30, 0); smoke(cx + 2, cy - 12, 24, 2.1); smoke(bx - 58, DAIS - 14, 22, 1); smoke(bx + 58, DAIS - 14, 26, 4);
  c.ellipse(cx, cy - 6, 9, 6, (x, y, nx, ny) => (ny < -0.6 ? null : ramp4(litK(nx, ny) - 0.2, [P.darkBrown, P.brown, P.clay, P.tan])));
  c.fillRect(cx - 10, cy - 10, 21, 2, P.tan); c.fillRect(cx - 10, cy - 9, 21, 1, P.brown); for (const k of [-6, 6]) c.fillRect(cx + k - 1, cy - 1, 3, 2, P.darkBrown);
  for (const k of [-3, 0, 3]) { c.fillRect(cx + k, cy - 16, 1, 6, P.darkRed); c.set(cx + k, cy - 17, P.orange); }
  // red lacquered pillars
  const pillar = (x0, w) => {
    for (let y = 12; y < FLOOR + 2; y++) for (let x = x0; x < x0 + w; x++) {
      const u = (x - x0 + 0.5) / w;
      let col = u < 0.14 ? P.red : u < 0.36 ? P.pink : u < 0.7 ? P.red : u < 0.9 ? P.darkRed : P.ink;
      if (u >= 0.14 && u < 0.36 && dither(x, y, 0.5)) col = P.red;
      if ((y > 20 && y < 26) || (y > FLOOR - 12 && y < FLOOR - 6)) col = u < 0.3 ? P.yellow : u < 0.7 ? P.gold : u < 0.9 ? P.tan : P.brown;
      if (y === 22 || y === FLOOR - 9) col = u < 0.9 ? P.brown : P.ink;
      c.set(x, y, col);
    }
    c.fillRect(x0 - 3, FLOOR - 4, w + 6, 6, P.grey2); c.fillRect(x0 - 3, FLOOR - 4, w + 6, 1, P.grey1); c.fillRect(x0 + w + 1, FLOOR - 4, 2, 6, P.grey3); // stone base
  };
  pillar(30, 16); pillar(136, 14); pillar(330, 14); pillar(434, 16);
  // hanging paper lanterns
  const lantern = (x, y, r, cord) => {
    for (let yy = 12; yy < y - r; yy++) c.set(x, yy, P.ink);
    glow(c, x + 0.5, y, r * 3.2, 0.6, warm);
    c.ellipse(x + 0.5, y, r, r * 1.15, (px, py, nx, ny) => { const rib = Math.abs(Math.sin(ny * 5.5)) < 0.22; const k = litK(nx, ny); return rib ? P.darkRed : k > 0.5 ? P.orange : k > -0.3 ? P.red : P.darkRed; });
    c.ellipse(x + 0.5, y + 1, r * 0.35, r * 0.7, (px, py) => (dither(px, py, 0.5) ? P.gold : null));
    c.fillRect(x - Math.floor(r * 0.45), y - Math.round(r * 1.15) - 1, Math.round(r * 0.9) + 1, 2, P.ink); c.fillRect(x - Math.floor(r * 0.45), y + Math.round(r * 1.15) - 1, Math.round(r * 0.9) + 1, 2, P.ink);
    for (let k = 0; k < cord; k++) c.set(x + (k % 2), y + Math.round(r * 1.15) + 1 + k, P.gold);
  };
  lantern(86, 44, 7, 6); lantern(186, 34, 6, 5); lantern(294, 34, 6, 5); lantern(394, 44, 7, 6);
  // floor: polished boards before the dais, tatami beyond
  const mat = mix(P.sandLight, P.greenDark, 0.2), matLt = mix(P.sandLight, P.green, 0.12), matDk = mix(P.sand, P.greenDark, 0.3);
  ground(c, FLOOR, H, (x, y, z) => {
    if (y < FLOOR + 5) return y === FLOOR ? P.brown : y === FLOOR + 4 ? P.ink : y === FLOOR + 1 ? P.clay : vnoise(x * 0.2, y, 3) > 0.6 ? P.brown : P.darkBrown;
    const zz = (y - FLOOR - 5) / (H - FLOOR - 5);
    const { gx, gy } = slab(x, zz, W, 6, 1.3, 71, 0);
    const row = Math.floor(gy), gx2 = gx + (row % 2 ? 0.5 : 0), cell = Math.floor(gx2);
    const lx = Math.abs(gx2 - Math.round(gx2)) < 0.02 + zz * 0.012, lineY = Math.abs(gy - Math.round(gy)) < 0.03 * (1 + zz * 1.5);
    if (lineY || lx) return P.greenDeep; // cloth borders
    const weave = Math.floor((gy - row) * (22 + zz * 10)) % 2;
    let col = weave ? mat : matLt;
    if (hash2(cell, row, 72) > 0.6 && dither(x, y, 0.35)) col = matDk;
    return col;
  });
  glow(c, bx, FLOOR + 8, 90, 0.35, warm, 0.25);
  nearShade(c, FLOOR);
  return c;
}
// ---------------------------------------------------------------- reedy pond (misty morning)  floor 112
export function battlebackPond() {
  const W = 480, H = 190, c = new Canvas(W, H);
  const FLOOR = 112, BANK = 88;
  gradient(c, 0, BANK, [[0, mix(P.grey1, P.blue, 0.35)], [0.5, mix(P.grey1, P.cyan, 0.2)], [1, P.grey1]]);
  sun(c, 330, 34, 8, X.sandPale, [P.sandLight, mix(P.grey1, P.sandLight, 0.5)]);
  // misty tree lines: far (very hazy) and mid
  const crowns = (x, base, amp, f, ph) => base - Math.abs(Math.sin(x * f + ph)) * amp - Math.abs(Math.sin(x * f * 2.7 + ph * 2)) * amp * 0.35;
  const far = [mix(P.greenDark, P.grey1, 0.55), mix(P.greenDark, P.grey1, 0.62), mix(P.green, P.grey1, 0.62), mix(P.green, P.grey1, 0.72)];
  foliage(c, 0, 10, W, BANK, 301, (x, y) => 0.55 + (y - crowns(x, 52, 18, 0.03, 0.4)) * 0.06, far, false);
  for (const tx of [60, 128, 214, 262, 350, 436]) for (let y = 60; y < BANK; y++) c.fillRect(tx, y, 2, 1, far[0]);
  const mid = [mix(P.greenDeep, P.grey2, 0.35), mix(P.greenDark, P.grey2, 0.35), mix(P.greenDark, P.grey1, 0.4), mix(P.green, P.grey1, 0.45)];
  foliage(c, 0, 20, W, BANK, 303, (x, y) => 0.5 + (y - crowns(x, 70, 24, 0.022, 2.2) - (Math.abs(x - 250) < 70 ? 14 : 0)) * 0.06, mid);
  for (const [tx, hw] of [[40, 3], [160, 2], [396, 3], [460, 2]]) trunk(c, tx, hw, 56, BANK, [mix(P.slate, P.grey2, 0.3), mix(P.grey3, P.greenDeep, 0.3), mix(P.grey3, P.grey2, 0.5), mix(P.grey2, P.grey1, 0.4)], tx, 0.4);
  // far bank strip
  for (let x = 0; x < W; x++) { const t = BANK - 2 + Math.round(vnoise(x * 0.2, 1, 305) * 2); for (let y = t; y < BANK + 1; y++) c.set(x, y, y === t ? mix(P.green, P.grey1, 0.3) : mix(P.greenDark, P.grey2, 0.3)); }
  // mist lying on the water
  tint(c, 0, 40, W, BANK + 4, (x, y) => { const k = 1 - Math.abs(y - (BANK - 6)) / 30; return k > 0 ? k * (0.4 + fbm(x * 0.02, y * 0.08, 307, 2) * 0.6) : 0; }, (col) => mix(col, P.grey1, 0.55));
  // open water with the mirrored tree line
  for (let y = BANK + 1; y < FLOOR; y++) {
    const z = (y - BANK) / (FLOOR - BANK);
    for (let x = 0; x < W; x++) {
      const wob = Math.round(Math.sin(y * 1.3 + x * 0.05) * (0.5 + z * 1.5));
      const sy = Math.max(0, 2 * BANK - y + wob);
      let col = mix(c.get(x + wob, sy), P.blueDark, 0.25 + z * 0.25);
      const n = vnoise(x * (0.08 / (0.3 + z)), y * 0.9, 309);
      if (n > 0.9) col = P.grey1; else if (n > 0.84 && dither(x, y, 0.5)) col = mix(P.grey1, P.blue, 0.3); else if (n < 0.1) col = mix(P.blueDark, P.teal, 0.5);
      c.set(x, y, col);
    }
  }
  // floor: muddy bank and shallow water
  const bias = (x, z) => Math.exp(-(((x - 240) / 110) ** 2)) * 0.2 * (1 - z * 0.6) - (z < 0.12 ? (0.12 - z) * 1.2 : 0);
  const waterA = mix(P.teal, P.blueDark, 0.35), waterB = mix(P.blueDark, P.grey2, 0.35), waterHi = mix(P.grey1, P.cyan, 0.15);
  ground(c, FLOOR, H, (x, y, z) => {
    const depth = 1 / (0.18 + z), n = fbm(x * 0.016, depth * 1.1, 311, 3) + bias(x, z) - z * 0.06;
    if (n > 0.5) {
      const m = fbm(x * 0.05, depth * 3, 313, 2);
      const mud = mix(P.brown, P.darkBrown, 0.35);
      let col = n < 0.52 ? P.darkBrown : m > 0.62 ? (dither(x, y, 0.5) ? mix(P.clay, P.brown, 0.5) : P.brown) : m < 0.42 ? (dither(x, y, 0.5) ? P.darkBrown : mud) : mud;
      if (n > 0.52 && n < 0.56 && hash2(x, y, 318) > 0.8) col = mix(P.brown, P.grey2, 0.4); // wet sheen
      const g = fbm(x * 0.03, depth * 2, 316, 2) + (n - 0.5) * 0.8;
      if (hash2(x, y, 317) > 0.985) col = P.tan; // pebbles
      if (g > 0.7) col = grassPx(x, y, z, 315, [P.greenDeep, P.greenDark, mix(P.greenDark, P.green, 0.5)]);
      else if (g > 0.66 && dither(x, y, (g - 0.66) * 25)) col = P.greenDeep;
      return col;
    }
    const w = Math.sin(depth * 8 + Math.sin(x * 0.02 + depth) * 1.2);
    let col = dither(x, y, 0.4 + z * 0.4) ? waterA : waterB;
    if (w > 0.9) col = waterHi; else if (w < -0.85) col = mix(P.teal, P.navy, 0.3);
    if (n > 0.47) col = dither(x, y, 0.5) ? P.brown : waterA; // silty rim
    return col;
  });
  // lily pads with blossoms
  const pad = (px, py, r, flower) => {
    c.ellipse(px, py, r * 1.6, r * 0.6, (x, y, nx, ny) => (Math.abs(nx - 0.45) < 0.12 && ny < 0 ? null : ny < -0.3 ? P.green : nx > 0.5 ? P.greenDeep : P.greenDark));
    c.fillRect(Math.round(px - r * 1.3), Math.round(py + r * 0.6), Math.round(r * 2.6), 1, mix(P.teal, P.navy, 0.3));
    if (flower) { c.fillRect(px - 2, Math.round(py - 3), 5, 2, P.pink); c.set(px - 1, Math.round(py - 4), P.white); c.set(px + 1, Math.round(py - 4), P.pink); c.set(px, Math.round(py - 5), P.white); c.set(px, Math.round(py - 3), P.yellow); }
  };
  for (const [px, py, r, f] of [[120, 96, 2.5, 0], [140, 100, 3, 1], [300, 94, 2, 0], [330, 101, 3, 0], [372, 98, 2.5, 1], [210, 106, 3, 0]]) pad(px, py, r, f);
  const pr = mulberry32(319);
  for (let i = 0; i < 40; i++) {
    const x = Math.floor(pr() * W), y = FLOOR + 6 + Math.floor(pr() * 72), z = (y - FLOOR) / (H - FLOOR), f = pr() > 0.8;
    const cc = c.get(x, y);
    if (cc === waterA || cc === waterB || cc === waterHi) pad(x, y, 2.5 + z * 4, f);
  }
  // reeds and cattails: far-bank tufts, mid clumps and big foreground clusters
  const reedCols = [P.greenDark, mix(P.greenDark, P.tan, 0.35), P.green, mix(P.green, P.sand, 0.4)];
  const clump = (cx, base, n, h, spread, seed, cat = 0.3, cols = reedCols) => {
    const r = mulberry32(seed);
    for (let i = 0; i < n; i++) {
      const x = cx + (r() - 0.5) * spread, hh = h * (0.55 + r() * 0.5), lean = (x - cx) * 0.35 + (r() - 0.5) * 8;
      if (r() < cat) cattail(c, Math.round(x), base + Math.round(r() * 3), Math.round(hh * 1.1), lean * 0.4, cols[0]);
      else reed(c, Math.round(x), base + Math.round(r() * 3), Math.round(hh), lean, cols[Math.floor(r() * 3)], cols[3]);
    }
  };
  const farReed = [mix(P.greenDark, P.grey2, 0.35), mix(P.greenDark, P.grey1, 0.35), mix(P.green, P.grey1, 0.4), mix(P.green, P.grey1, 0.55)];
  for (const [cx, n] of [[30, 10], [90, 7], [178, 6], [284, 8], [420, 12], [470, 8]]) clump(cx, BANK + 1, n, 14, 20, cx, 0.2, farReed);
  clump(96, FLOOR + 2, 12, 28, 26, 321, 0.3); clump(370, FLOOR + 1, 10, 24, 24, 323, 0.3);
  clump(22, FLOOR + 40, 26, 64, 50, 325, 0.3); clump(64, FLOOR + 62, 16, 52, 40, 327, 0.35);
  clump(452, FLOOR + 46, 26, 66, 52, 329, 0.3); clump(418, FLOOR + 68, 12, 50, 30, 331, 0.35);
  // dragonflies
  for (const [dx, dy] of [[150, 80], [318, 70], [206, 124]]) { c.fillRect(dx, dy, 4, 1, P.blueDark); c.set(dx + 4, dy, P.cyan); c.set(dx + 1, dy - 1, P.grey1); c.set(dx + 2, dy - 1, P.grey1); c.set(dx + 1, dy + 1, P.grey1); c.set(dx + 2, dy + 1, P.grey1); }
  nearShade(c, FLOOR);
  return c;
}
// ---------------------------------------------------------------- mirage tower interior  floor 116
const GLYPHS = [
  ['.###.', '#...#', '#.#.#', '#...#', '.###.', '..#..', '.###.'], // sun disc
  ['..#..', '.#.#.', '..#..', '#####', '..#..', '..#..', '..#..'], // ankh
  ['.##..', '#..#.', '.##..', '..##.', '..#.#', '.#...', '#....'], // bird
  ['#.#.#', '.#.#.', '.....', '#.#.#', '.#.#.', '.....', '#.#.#'], // water
  ['.###.', '#.#.#', '#####', '.....', '..#..', '.###.', '#####'], // eye over altar
  ['..#..', '..#..', '.###.', '..#..', '.#.#.', '#...#', '#...#'], // figure
  ['#....', '##...', '#.#..', '#..#.', '#...#', '#....', '#....'], // reed
  ['.....', '#####', '#...#', '#.#.#', '#...#', '#####', '.....'], // house
];
function glyph(c, x, y, k, col) { const g = GLYPHS[k % GLYPHS.length]; for (let j = 0; j < 7; j++) for (let i = 0; i < 5; i++) if (g[j][i] === '#') c.set(x + i, y + j, col); }
/** Shift each row sideways by a sine (heat shimmer) between y0 and y1 within x0..x1. */
function shimmer(c, x0, x1, y0, y1, amp, seed) {
  const src = c.clone();
  for (let y = y0; y < y1; y++) {
    const a = amp(y), off = Math.round(Math.sin(y * 0.9 + seed) * a + Math.sin(y * 0.37 + seed * 2) * a * 0.5);
    if (!off) continue;
    for (let x = x0; x < x1; x++) c.set(x, y, src.get(Math.min(x1 - 1, Math.max(x0, x - off)), y));
  }
}
export function battlebackMirage() {
  const W = 480, H = 190, c = new Canvas(W, H);
  const FLOOR = 116;
  const lapis = (x, y) => (hash2(x, y, 401) > 0.93 ? P.gold : hash2(x >> 1, y, 402) > 0.8 ? P.blue : P.blueDark);
  const stone = [P.sand, mix(P.sand, P.sandLight, 0.5), mix(P.sand, P.tan, 0.3), P.sand];
  c.fillRect(0, 0, W, FLOOR, (x, y) => masonry(x, y, 0, FLOOR, 403, stone, mix(P.tan, P.clay, 0.4), 22, 10));
  // starry ceiling
  c.fillRect(0, 0, W, 12, (x, y) => (y === 11 ? P.gold : y === 10 ? P.brown : P.navy));
  for (let i = 0; i < 40; i++) { const x = Math.floor(hash2(i, 1, 404) * W), y = 2 + Math.floor(hash2(i, 2, 404) * 6); c.set(x, y, P.gold); c.set(x - 1, y, P.tan); c.set(x + 1, y, P.tan); c.set(x, y - 1, P.tan); c.set(x, y + 1, P.tan); }
  // lapis band, glyph frieze, gold band
  c.fillRect(0, 12, W, 8, (x, y) => (y === 12 || y === 19 ? P.gold : lapis(x, y)));
  c.fillRect(0, 20, W, 16, (x, y) => (y === 35 ? P.tan : P.sandLight));
  for (let x = 2, k = 0; x < W - 5; x += 9, k++) glyph(c, x, 24, Math.floor(hash2(k, 0, 405) * 8), hash2(k, 1, 405) > 0.7 ? P.darkRed : P.blueDark);
  c.fillRect(0, 36, W, 3, (x, y) => (y === 37 ? P.yellow : P.gold));
  for (let x = 0; x < W; x += 8) { c.fillRect(x, 39, 4, 3, P.blueDark); c.fillRect(x + 4, 39, 4, 3, P.darkRed); c.fillRect(x, 42, 8, 1, P.gold); } // painted chequer
  // lower lapis dado with a lotus band
  c.fillRect(0, FLOOR - 22, W, 22, (x, y) => {
    const yy = y - (FLOOR - 22);
    if (yy === 0 || yy === 7) return P.gold;
    if (yy < 7) { const u = (x % 12) - 6; return Math.abs(u) < 7 - yy ? ((x % 12) === 6 ? P.cyan : P.greenDark) : lapis(x, y); }
    return yy === 21 ? P.brown : masonry(x, y, 0, FLOOR, 406, [P.tan, mix(P.tan, P.sand, 0.4)], P.clay, 16, 7);
  });
  // central doorway to the blinding heart of the mirage
  const dx = 240, dw = 40, dtop = 48;
  const doorIn = (x, y) => { const u = (x + 0.5 - dx) / dw; if (Math.abs(u) >= 1) return false; return y >= dtop + (1 - Math.sqrt(1 - u * u)) * 20 - 20 + 20; };
  for (let y = dtop - 6; y < FLOOR; y++) for (let x = dx - dw - 6; x < dx + dw + 6; x++) {
    const u = (x + 0.5 - dx) / (dw + 6), ay = dtop + 14 - Math.sqrt(Math.max(0, 1 - u * u)) * 20;
    if (Math.abs(u) >= 1 || y < ay) continue;
    if (doorIn(x, y)) {
      const r = Math.hypot((x - dx) / dw, (y - 86) / 50);
      c.set(x, y, r < 0.35 ? P.white : r < 0.6 ? (dither(x, y, (r - 0.35) * 4) ? X.sandPale : P.white) : r < 0.85 ? (dither(x, y, (r - 0.6) * 4) ? P.yellow : X.sandPale) : P.yellow);
    } else c.set(x, y, Math.abs(u) > 0.94 || y < ay + 1 ? P.brown : (Math.floor(y / 3) + Math.floor(x / 3)) % 2 ? P.gold : P.blueDark);
  }
  // radiant rays from the door
  for (let k = -5; k <= 5; k++) { const a = k * 0.28; for (let i = 18; i < 70; i++) { const x = Math.round(dx + Math.sin(a) * i * 1.6), y = Math.round(84 - Math.cos(a) * i * 0.9); if (!doorIn(x, y) && y > 12 && dither(x, y, 0.55 * (1 - i / 70))) c.set(x, y, lighter(c.get(x, y))); } }
  // sandstone columns with papyrus capitals
  const column = (x0, w) => {
    for (let y = 14; y < FLOOR + 2; y++) {
      const flare = y < 30 ? Math.round((30 - y) * 0.35) : 0;
      for (let x = x0 - flare; x < x0 + w + flare; x++) {
        const u = (x - (x0 - flare) + 0.5) / (w + flare * 2);
        let col = u < 0.12 ? P.sand : u < 0.4 ? P.sandLight : u < 0.72 ? P.sand : u < 0.9 ? P.tan : P.clay;
        if (y < 30) col = (y + (x & 3 ? 0 : 1)) % 4 < 2 ? (u < 0.5 ? P.green : P.greenDark) : u < 0.5 ? P.gold : P.tan; // capital: painted papyrus
        if (y === 30 || y === 31 || (y >= 60 && y <= 62) || (y >= FLOOR - 30 && y <= FLOOR - 28)) col = y === 30 || y === 60 || y === FLOOR - 30 ? P.gold : u < 0.9 ? P.blueDark : P.navy;
        c.set(x, y, col);
      }
    }
    c.fillRect(x0 - 3, 12, w + 6, 3, P.gold); c.fillRect(x0 - 3, 14, w + 6, 1, P.brown);
    for (let y = 36; y < 56; y += 9) glyph(c, x0 + Math.floor(w / 2) - 2, y, Math.floor(hash2(x0, y, 407) * 8), P.darkRed);
    for (let y = 66; y < FLOOR - 36; y += 9) glyph(c, x0 + Math.floor(w / 2) - 2, y, Math.floor(hash2(x0, y, 408) * 8), P.blueDark);
    c.fillRect(x0 - 3, FLOOR - 4, w + 6, 6, P.sand); c.fillRect(x0 - 3, FLOOR - 4, w + 6, 1, P.sandLight); c.fillRect(x0 + w + 1, FLOOR - 4, 2, 6, P.tan);
  };
  column(46, 18); column(150, 16); column(314, 16); column(416, 18);
  // hanging brass lamps
  hangLantern(c, 110, 12, 56, P.gold, warm); hangLantern(c, 370, 12, 56, P.gold, warm);
  // tiled floor: sandstone chequer, lapis runner toward the door
  ground(c, FLOOR, H, (x, y, z) => {
    const { gx, gy, lineX, lineY } = slab(x, z, W, 14, 2.4, 409, 0);
    const cx = Math.floor(gx + 0.5), cy = Math.floor(gy);
    let col = (cx + cy) % 2 ? P.sandLight : mix(P.sand, P.sandLight, 0.4);
    const run = Math.abs(x - dx) / (26 + z * 70);
    if (run < 1) col = run > 0.9 ? P.gold : (cx + cy) % 2 ? P.blueDark : mix(P.blueDark, P.navy, 0.3);
    if (lineX || lineY) col = run < 0.9 ? P.navy : P.tan;
    if (z > 0.2 && Math.abs(gx - Math.round(gx)) < 0.06 && Math.abs(gy - Math.round(gy)) < 0.1 * (1 + z) && run >= 1) col = P.blueDark; // lapis studs
    if (y === FLOOR) col = P.tan;
    return col;
  });
  // door light spilling onto the floor
  glow(c, dx, FLOOR + 4, 120, 0.6, (col) => mix(lighter(col), P.yellow, 0.2), 0.45);
  glow(c, dx, 80, 110, 0.35, (col) => mix(lighter(col), P.yellow, 0.2), 0.8);
  // heat haze over the whole hall, strongest near the floor and the door
  shimmer(c, 0, W, 40, H, (y) => (y < FLOOR ? 0.4 + (y - 40) / (FLOOR - 40) * 0.8 : 1.2), 3);
  // pale haze bands
  tint(c, 0, 44, W, FLOOR + 10, (x, y) => { const b = Math.sin(y * 0.35 + Math.sin(x * 0.03) * 2); return b > 0.85 ? 0.35 : 0; }, (col) => mix(lighter(col), P.sandLight, 0.3));
  nearShade(c, FLOOR);
  // floating light motes
  const mr = mulberry32(411);
  for (let i = 0; i < 34; i++) {
    const x = Math.floor(mr() * W), y = 30 + Math.floor(mr() * 130), big = mr() > 0.7;
    if (big) { glow(c, x + 0.5, y + 0.5, 6, 0.6, (col) => mix(lighter(col), P.yellow, 0.3)); c.set(x - 1, y, P.yellow); c.set(x + 1, y, P.yellow); c.set(x, y - 1, P.yellow); c.set(x, y + 1, P.yellow); }
    c.set(x, y, big ? P.white : mr() > 0.5 ? P.yellow : X.sandPale);
  }
  return c;
}
// ---------------------------------------------------------------- rainforest  floor 114
/** Hanging liana: catenary from (x0, y0) to (x1, y1) sagging by `sag`, with little leaves. */
function liana(c, x0, y0, x1, y1, sag, [dk, md, lt], seed) {
  const n = Math.ceil(Math.abs(x1 - x0) * 1.2);
  for (let i = 0; i <= n; i++) {
    const t = i / n, x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t + Math.sin(t * Math.PI) * sag;
    c.set(x, y, md); c.set(x, y + 1, dk); if (i % 7 === 0) c.set(x, y - 1, lt);
    if (hash2(i, 0, seed) > 0.86) { const s = hash2(i, 1, seed) > 0.5 ? 1 : -1; c.set(x + s, y + 2, lt); c.set(x + s * 2, y + 2, md); c.set(x + s, y + 3, md); }
  }
}
function vine(c, x0, y0, len, [dk, md, lt], seed) {
  for (let k = 0; k < len; k++) {
    const x = x0 + Math.round(Math.sin(k * 0.12 + seed) * 2), y = y0 + k;
    c.set(x, y, k % 4 === 0 ? md : dk);
    if (k % 5 === 2) { c.set(x + 1, y, md); c.set(x + 2, y - 1, lt); c.set(x + 2, y, md); }
    if (k % 5 === 4) { c.set(x - 1, y, md); c.set(x - 2, y - 1, lt); c.set(x - 2, y, md); }
  }
}
function hibiscus(c, x, y, petal, dark) {
  for (const [dx, dy] of [[0, -2], [-2, -1], [2, -1], [-1, 1], [1, 1]]) { c.set(x + dx, y + dy, petal); c.set(x + dx + (dx > 0 ? 1 : dx < 0 ? -1 : 0), y + dy, dx === 0 ? petal : dark); }
  c.set(x, y - 1, petal); c.set(x - 1, y, petal); c.set(x + 1, y, petal); c.set(x, y + 1, dark);
  c.set(x, y, P.yellow); c.set(x + 1, y - 1, P.yellow);
}
function heliconia(c, x, base, h, n) {
  for (let i = 0; i < h; i++) c.set(x, base - i, P.greenDark);
  for (let i = 0; i < n; i++) {
    const y = base - h + 4 + i * 5, s = i % 2 ? 1 : -1;
    for (let k = 0; k < 5; k++) { c.set(x + s * k, y - Math.round(k * 0.6), k < 4 ? P.red : P.yellow); c.set(x + s * k, y + 1 - Math.round(k * 0.6), k < 2 ? P.darkRed : P.red); }
    c.set(x + s * 4, y - 3, P.yellow); c.set(x + s * 5, y - 3, P.greenDark);
  }
}
export function battlebackJungle() {
  const W = 480, H = 190, c = new Canvas(W, H);
  const FLOOR = 114;
  gradient(c, 0, FLOOR, [[0, mix(P.yellow, P.grey1, 0.45)], [0.3, mix(P.green, P.yellow, 0.45)], [0.7, mix(P.green, P.grey1, 0.3)], [1, mix(P.greenDark, P.green, 0.5)]]);
  // hazy far forest
  const far = [mix(P.greenDark, P.grey1, 0.35), mix(P.green, P.grey1, 0.4), mix(P.green, P.yellow, 0.4), mix(P.green, P.yellow, 0.6)];
  const fr = mulberry32(501);
  for (let i = 0; i < 14; i++) { const x = fr() * W, hw = 2 + fr() * 3; trunk(c, x, hw, 10, FLOOR - 8, [far[0], far[0], far[1], far[1]], i, 1.4); }
  foliage(c, 0, 0, W, 70, 503, (x, y) => 0.8 - y / 60, far, false);
  fillProfile(c, (x) => FLOOR - 16 + Math.sin(x * 0.07) * 3 + vnoise(x * 0.12, 1, 505) * 5, (x, y) => (dither(x, y, 0.5) ? far[0] : far[1]), FLOOR);
  // huge mid trunks with buttress roots
  const midBark = [mix(P.darkBrown, P.greenDeep, 0.35), mix(P.brown, P.greenDark, 0.35), mix(P.clay, P.greenDark, 0.3), mix(P.tan, P.green, 0.3)];
  trunk(c, 110, 11, 0, FLOOR - 2, midBark, 11, 2.2); trunk(c, 356, 13, 0, FLOOR - 1, midBark, 13, 2.2); trunk(c, 236, 5, 0, FLOOR - 10, [far[0], midBark[0], midBark[1], midBark[2]], 17, 1.2);
  foliage(c, 0, 0, W, 62, 507, (x, y) => 0.76 - y / 48, [P.greenDeep, P.greenDark, P.green, mix(P.green, P.yellow, 0.4)]);
  // near giant trunks, mossy
  const bark = [P.darkBrown, P.brown, P.clay, P.tan];
  trunk(c, 16, 22, 0, FLOOR + 14, bark, 3, 1.8); trunk(c, 464, 24, 0, FLOOR + 16, bark, 7, 1.8);
  tint(c, 0, 0, W, FLOOR + 18, (x, y) => ((x < 48 || x > 432) && vnoise(x * 0.14, y * 0.05, 509) + (y > FLOOR - 20 ? 0.15 : 0) > 0.6 ? 0.9 : 0), (col) => (bark.includes(col) ? (col === P.darkBrown ? P.greenDeep : col === P.tan ? P.green : P.greenDark) : null));
  // lianas swinging between the trees and vines hanging from the canopy
  const vc = [P.greenDeep, P.greenDark, P.green];
  liana(c, 36, 30, 110, 44, 20, vc, 1); liana(c, 110, 36, 356, 28, 46, vc, 2); liana(c, 118, 20, 350, 44, 30, vc, 3); liana(c, 356, 40, 450, 22, 24, vc, 4);
  for (const [x, len] of [[70, 50], [150, 64], [196, 38], [282, 46], [318, 70], [400, 56], [430, 34]]) vine(c, x, 24, len, vc, x);
  // orchids on the trunks
  for (const [x, y] of [[26, 70], [360, 58], [456, 84], [116, 90]]) { hibiscus(c, x, y, P.pink, P.magenta); }
  // floor: mossy garden clearing, dark humus and leaf litter toward the edges
  const humus = [P.darkBrown, mix(P.brown, P.darkBrown, 0.4), P.brown];
  ground(c, FLOOR, H, (x, y, z) => {
    const depth = 1 / (0.18 + z), n = fbm(x * 0.018, depth * 1.1, 511, 3) + Math.exp(-(((x - 240) / (100 + z * 80)) ** 2)) * 0.25;
    let col;
    if (n > 0.55) col = grassPx(x, y, z, 513, [P.greenDeep, P.greenDark, P.green]);
    else {
      const m = fbm(x * 0.06, depth * 3, 515, 2);
      col = m > 0.6 ? humus[2] : m < 0.4 ? humus[0] : humus[1];
      const h = hash2(x >> 1, y, 517);
      if (h > 0.96) col = [P.rust, P.tan, P.gold, P.clay][Math.floor(hash2(x, y, 518) * 4)]; // fallen leaves
      if (n > 0.52 && dither(x, y, (n - 0.52) * 30)) col = P.greenDeep;
    }
    return col;
  });
  // big leaves: understory clumps along the tree line and foreground framing
  const leafC = [P.greenDeep, P.greenDark, P.green, mix(P.green, P.yellow, 0.5)], leafD = [P.teal, P.greenDeep, P.greenDark, P.green];
  const clump = (x, y, s, seed, cols, slits) => {
    const r = mulberry32(seed);
    for (let i = 0; i < 7; i++) { const a = -Math.PI / 2 + (i - 3) * 0.42 + (r() - 0.5) * 0.3; bigLeaf(c, x, y, a, s * (0.7 + r() * 0.5), s * 0.28, (i - 3) * s * 0.05, cols, slits && r() > 0.4); }
  };
  clump(160, FLOOR + 3, 26, 521, leafC, false); clump(318, FLOOR + 2, 24, 523, leafC, true); clump(72, FLOOR + 4, 34, 525, leafC, true); clump(412, FLOOR + 6, 36, 527, leafC, false);
  heliconia(c, 190, FLOOR + 2, 28, 4); heliconia(c, 288, FLOOR + 1, 24, 3);
  // flowering bushes
  for (const [x, y, r] of [[128, FLOOR + 4, 6], [352, FLOOR + 5, 7], [214, FLOOR, 4]]) bush(c, x, y, r, [P.greenDeep, P.greenDark, P.green, P.teal]);
  const bloom = (x, y, col, dk) => { c.ellipse(x, y, 3, 2.5, (px, py, nx, ny) => (Math.hypot(nx, ny) < 0.35 ? P.yellow : ny > 0.3 ? dk : col)); c.set(x - 1, y - 2, lighter(col)); };
  for (const [x, y, col, dk] of [[146, 100, P.red, P.darkRed], [176, 104, P.orange, P.rust], [60, 96, P.pink, P.magenta], [330, 102, P.red, P.darkRed], [404, 94, P.pink, P.magenta], [426, 104, P.orange, P.rust]]) bloom(x, y, col, dk);
  const hr = mulberry32(529);
  for (let i = 0; i < 16; i++) { const x = 100 + Math.floor(hr() * 280), y = FLOOR - 4 + Math.floor(hr() * 12); if (c.get(x, y) === P.greenDark || c.get(x, y) === P.green) hibiscus(c, x, y, hr() > 0.5 ? P.red : P.orange, P.darkRed); }
  // near canopy and humid light
  foliage(c, 0, 0, W, 46, 531, (x, y) => { const e = Math.abs(x - 240) / 240; return 0.64 + e * 0.35 - y / (24 + e * 24); }, [P.teal, P.greenDeep, P.greenDark, P.green]);
  for (const [x, len] of [[92, 40], [262, 30], [372, 44]]) vine(c, x, 10, len, [P.teal, P.greenDeep, P.greenDark], x);
  lightShaft(c, 140, 0.5, 28, 0.55, H); lightShaft(c, 260, 0.42, 16, 0.45, H); lightShaft(c, 350, 0.55, 22, 0.5, H);
  // foreground giant leaves (framing the corners)
  bigLeaf(c, -6, H + 4, -1.0, 84, 24, -12, leafD, true); bigLeaf(c, 24, H + 4, -1.35, 70, 18, 8, leafD, false); bigLeaf(c, -4, H - 30, -0.45, 64, 16, 12, leafD, false);
  bigLeaf(c, W + 6, H + 4, -2.15, 86, 24, 12, leafD, true); bigLeaf(c, W - 22, H + 4, -1.8, 68, 17, -8, leafD, false); bigLeaf(c, W + 4, H - 34, -2.7, 60, 15, -12, leafD, false);
  hibiscus(c, 60, 150, P.red, P.darkRed); hibiscus(c, 424, 156, P.pink, P.magenta); heliconia(c, 452, 178, 30, 3);
  nearShade(c, FLOOR);
  // butterflies + humid motes
  for (const [x, y, col] of [[206, 70, P.blue], [296, 92, P.cyan], [150, 128, P.orange]]) { c.set(x - 1, y, col); c.set(x + 1, y, col); c.set(x - 2, y - 1, col); c.set(x + 2, y - 1, col); c.set(x - 1, y + 1, darker(col)); c.set(x + 1, y + 1, darker(col)); c.set(x, y, P.ink); }
  const mr = mulberry32(533);
  for (let i = 0; i < 24; i++) c.set(Math.floor(mr() * W), 40 + Math.floor(mr() * 100), mr() > 0.5 ? P.yellow : X.sandPale);
  return c;
}
// ---------------------------------------------------------------- hall of fears  floor 118
const violet = (col) => mix(lighter(col), P.magenta, 0.3);
/** Translucent wraith: rounded head, body tapering into a wavy tail; pixels recolored through map. */
function wraith(c, cx, top, h, w, sway, map, eyes = P.ink) {
  for (let y = top; y < top + h; y++) {
    const t = (y - top) / h;
    const hw = t < 0.22 ? w * Math.sqrt(Math.max(0, 1 - ((0.22 - t) / 0.22) ** 2)) : w * (1 + Math.sin(t * 3) * 0.15) * (1 - (t - 0.22) * 0.8);
    const mx = cx + Math.sin(t * 4 + sway) * 3 * t;
    for (let x = Math.floor(mx - hw); x <= mx + hw; x++) {
      const u = Math.abs(x + 0.5 - mx) / Math.max(1, hw);
      const a = (1 - Math.max(0, t - 0.35) * 1.4) * (1 - u * u * 0.7);
      if (a > 0 && dither(x, y, Math.min(1, a))) { const n = map(c.get(x, y)); if (n != null) c.set(x, y, n); }
    }
  }
  const ey = top + Math.round(h * 0.13), ex = Math.round(w * 0.38);
  c.fillRect(cx - ex - 1, ey, 2, 3, eyes); c.fillRect(cx + ex, ey, 2, 3, eyes); c.ellipse(cx + 0.5, ey + 6, 1.5, 2, eyes);
}
function brazier(c, x, base, [f0, f1, f2, f3], glowMap) {
  glow(c, x + 0.5, base - 26, 70, 0.8, glowMap, 0.9); glow(c, x + 0.5, base - 26, 30, 0.6, glowMap, 1);
  for (const [a, b] of [[-7, -3], [7, 3], [0, 0]]) c.line(x + a, base, x + b, base - 12, a === 0 ? P.navy : P.slate);
  c.polygon([[x - 10, base - 19], [x + 11, base - 19], [x + 6, base - 12], [x - 5, base - 12]], (px) => (px < x - 3 ? P.grey3 : px > x + 5 ? P.navy : P.slate));
  c.fillRect(x - 11, base - 20, 23, 2, P.grey3); c.fillRect(x - 11, base - 20, 23, 1, X.purpleLight);
  for (let dx = -8; dx <= 8; dx++) {
    const h = 12 + Math.round(Math.abs(Math.sin(dx * 0.7 + x)) * 10 + vnoise(dx * 0.5, x, 3) * 6) - Math.round(Math.abs(dx) * 1.2);
    for (let k = 0; k < h; k++) { const t = k / h; const yy = base - 21 - k, xx = x + dx + Math.round(Math.sin(k * 0.4 + dx) * t * 1.5); c.set(xx, yy, t < 0.14 && Math.abs(dx) < 5 ? f3 : t < 0.4 ? f2 : t < 0.75 ? f1 : f0); }
  }
  for (const [ex, ey] of [[x - 3, base - 44], [x + 4, base - 50], [x + 1, base - 40]]) c.set(ex, ey, f2);
}
export function battlebackFear() {
  const W = 480, H = 190, c = new Canvas(W, H);
  const FLOOR = 118;
  gradient(c, 0, FLOOR, [[0, P.ink], [0.6, P.ink], [0.85, mix(P.ink, X.purpleDark, 0.5)], [1, X.purpleDark]]);
  // violet mist rolling through the void
  tint(c, 0, 0, W, FLOOR, (x, y) => { const n = fbm(x * 0.012, y * 0.035, 601, 3); const k = (n - 0.52) * 2 + (y / FLOOR) * 0.25; return k > 0 ? Math.min(0.7, k) : 0; }, (col) => (col === P.ink ? X.purpleDark : mix(col, P.purple, 0.5)));
  // distant floating debris
  const dr = mulberry32(603);
  for (let i = 0; i < 18; i++) { const x = dr() * W, y = 10 + dr() * 80, r = 1 + dr() * 4; c.ellipse(x, y, r * 1.4, r, (px, py, nx, ny) => (ny < -0.4 ? X.purpleDark : P.ink)); }
  // far broken colonnade (silhouettes)
  const farPillar = (x, top, w) => { for (let y = top; y < FLOOR; y++) for (let xx = x; xx < x + w; xx++) { const cut = top + Math.abs(Math.sin(xx * 1.3 + x)) * 4; if (y < cut) continue; c.set(xx, y, xx === x ? mix(X.purpleDark, P.purple, 0.5) : X.purpleDark); } };
  for (const [x, top, w] of [[20, 30, 8], [96, 54, 7], [208, 40, 6], [262, 62, 6], [380, 36, 8], [452, 58, 7]]) farPillar(x, top, w);
  // ghosts drifting behind the pillars
  const ghostMap = (col) => mix(lighter(lighter(col)), P.grey2, 0.35);
  wraith(c, 128, 40, 50, 11, 0.5, ghostMap); wraith(c, 250, 22, 44, 9, 2.1, ghostMap); wraith(c, 362, 46, 56, 12, 4, ghostMap); wraith(c, 44, 70, 34, 7, 1, ghostMap);
  // watching eyes in the dark
  for (const [ex, ey] of [[178, 30], [314, 20], [418, 88], [70, 24], [236, 84]]) { c.set(ex, ey, P.magenta); c.set(ex + 4, ey, P.magenta); c.set(ex, ey - 1, P.purple); c.set(ex + 4, ey - 1, P.purple); }
  // broken pillars (dark stone, violet rim light)
  const stoneR = [P.ink, P.navy, P.slate, P.grey3];
  const pillar = (x0, w, top, lean, seed) => {
    for (let y = top; y < FLOOR + 2; y++) {
      const off = Math.round((FLOOR - y) * lean);
      for (let i = 0; i < w; i++) {
        const cut = top + Math.abs(Math.sin(i * 1.4 + seed)) * 6 + (i / w) * 4 * (seed % 2 ? 1 : -1);
        if (y < cut) continue;
        const u = (i + 0.5) / w;
        let col = u < 0.1 ? X.purpleLight : u < 0.3 ? P.slate : u < 0.75 ? P.navy : P.ink;
        if (i % 4 === 2 && u > 0.2 && u < 0.85) col = darker(col); // flutes
        if (y < cut + 1.5) col = P.grey3;
        if (vnoise(i * 0.8, y * 0.2, seed) > 0.8) col = P.ink; // cracks
        c.set(x0 + i + off, y, col);
      }
    }
    c.fillRect(x0 - 3, FLOOR - 4, w + 6, 6, P.navy); c.fillRect(x0 - 3, FLOOR - 4, w + 6, 1, P.slate); c.fillRect(x0 - 3, FLOOR - 4, 2, 6, X.purpleLight);
  };
  pillar(58, 18, 26, 0.02, 1); pillar(142, 14, 72, 0, 2); pillar(326, 15, 44, -0.03, 3); pillar(414, 18, 14, 0, 4);
  // floating shards above the broken tops
  const shard = (x, y, w, h) => { c.polygon([[x, y], [x + w, y + 1], [x + w - 2, y + h], [x + 2, y + h - 1]], (px, py) => (py < y + 2 ? P.grey3 : px < x + 3 ? X.purpleLight : P.navy)); };
  shard(62, 12, 12, 7); shard(146, 56, 9, 6); shard(334, 30, 10, 6); shard(344, 20, 6, 4);
  // floor: dark cracked flagstones
  const floorC = [P.navy, mix(P.navy, P.slate, 0.4), mix(P.navy, P.purple, 0.25), P.navy];
  ground(c, FLOOR, H, (x, y, z) => {
    const { gy, row, cell, lineX, lineY } = slab(x, z, W, 7, 2.2, 605);
    const h = hash2(cell, row, 606);
    let col = floorC[Math.floor(h * floorC.length)];
    if (Math.abs(gy - row - 0.14) < 0.05 * (1 + z * 2)) col = P.slate;
    const crack = h > 0.5 && Math.abs(vnoise(x * 0.06, y * 0.13, cell * 7 + row) - 0.5) < 0.012;
    if (lineX || lineY || crack) col = P.ink;
    if (y === FLOOR) col = P.slate;
    return col;
  });
  // low mist over the floor near the horizon
  tint(c, 0, FLOOR - 10, W, FLOOR + 40, (x, y) => { const k = 1 - Math.abs(y - FLOOR - 4) / 24; return k > 0 ? k * (0.3 + fbm(x * 0.03, y * 0.1, 607, 2) * 0.6) : 0; }, (col) => mix(col, P.purple, 0.45));
  nearShade(c, FLOOR);
  // violet braziers flanking the centre
  const fire = [X.purpleLight, P.magenta, mix(P.magenta, P.white, 0.45), P.white];
  brazier(c, 184, FLOOR + 10, fire, violet); brazier(c, 296, FLOOR + 10, fire, violet);
  brazier(c, 34, FLOOR + 34, fire, violet); brazier(c, 446, FLOOR + 36, fire, violet);
  // bright flame cores
  return c;
}
// ---------------------------------------------------------------- boss lair cavern (poison mist)  floor 116
const toxic = (col) => mix(lighter(col), P.green, 0.3);
function skull(c, x, y, s = 1, [dk, md, lt] = [P.grey3, P.grey2, P.grey1]) {
  c.ellipse(x, y, 3.2 * s, 2.8 * s, (px, py, nx, ny) => (nx + ny < -0.5 ? lt : nx > 0.5 || ny > 0.5 ? dk : md));
  c.fillRect(Math.round(x - 2 * s), Math.round(y + 2 * s), Math.round(4 * s) + 1, Math.max(1, Math.round(1.5 * s)), md); // jaw
  c.fillRect(Math.round(x - 1.6 * s), Math.round(y), Math.max(1, Math.round(s)), Math.max(1, Math.round(1.2 * s)), P.ink);
  c.fillRect(Math.round(x + 0.6 * s), Math.round(y), Math.max(1, Math.round(s)), Math.max(1, Math.round(1.2 * s)), P.ink);
  c.set(Math.round(x), Math.round(y + 1.5 * s), dk);
}
function bone(c, x0, y0, x1, y1, [dk, md, lt] = [P.grey3, P.grey2, P.grey1]) {
  c.line(x0, y0, x1, y1, md); c.line(x0, y0 - 1, x1, y1 - 1, lt);
  for (const [x, y] of [[x0, y0], [x1, y1]]) { c.set(x - 1, y - 1, lt); c.set(x + 1, y - 1, lt); c.set(x - 1, y, md); c.set(x + 1, y, dk); }
}
/** Mound of bones and skulls centred at (x, base), `w` wide. */
function bonePile(c, x, base, w, h, seed, cols) {
  const r = mulberry32(seed);
  const top = (xx) => base - h * Math.max(0, 1 - ((xx - x) / (w / 2)) ** 2);
  for (let i = 0; i < w * h * 0.05; i++) {
    const xx = x + (r() - 0.5) * w, t = top(xx), yy = t + r() * (base - t);
    if (r() < 0.3) skull(c, xx, yy, 1.1 + r() * 0.6, cols);
    else { const a = r() * Math.PI, l = 5 + r() * 6; bone(c, xx - Math.cos(a) * l, yy - Math.sin(a) * l * 0.4, xx + Math.cos(a) * l, yy + Math.sin(a) * l * 0.4, cols); }
  }
}
export function battlebackCave() {
  const W = 480, H = 190, c = new Canvas(W, H);
  const FLOOR = 116;
  const rock = [P.ink, P.navy, P.slate, P.grey3];
  // cavern wall
  const cn = (x, y) => fbm(x * 0.025, y * 0.045, 701, 4) + vnoise(x * 0.008, y * 0.01, 702) * 0.3;
  c.fillRect(0, 0, W, FLOOR, (x, y) => {
    const n = cn(x, y), k = (n - cn(x + 2, y + 2)) * 18 + (hash2(x, y, 704) - 0.5) * 0.25;
    let col = ramp4(k, rock);
    const band = (n * 14) % 1;
    if (band < 0.1) col = P.ink; else if (band < 0.18 && col !== P.ink) col = lighter(col) === P.grey2 ? P.grey3 : lighter(col); // strata ridges
    return col;
  });
  tint(c, 0, 0, W, FLOOR, (x, y) => 0.35 + (1 - Math.abs(y - 60) / 60) * 0.1, darker);
  // deep opening in the back, glowing green from below
  const hole = (x) => { const u = (x - 240) / 80; return Math.abs(u) >= 1 ? 999 : 34 + (1 - Math.sqrt(1 - u * u)) * 60 + vnoise(x * 0.2, 1, 703) * 6; };
  for (let x = 160; x < 320; x++) {
    const t = Math.round(hole(x));
    for (let y = t; y < FLOOR; y++) { const k = (y - t) / (FLOOR - t + 1); c.set(x, y, y === t ? P.slate : k < 0.45 ? P.ink : dither(x, y, (k - 0.45) * 2) ? P.teal : P.ink); }
  }
  // far ledges inside the opening
  fillProfile(c, (x) => (x < 170 || x > 310 ? 999 : FLOOR - 16 + Math.sin(x * 0.09) * 4 + vnoise(x * 0.3, 2, 705) * 3), (x, y, d) => (d < 1 ? P.greenDeep : dither(x, y, 0.5) ? P.teal : P.ink), FLOOR);
  glow(c, 240, FLOOR - 6, 110, 0.55, toxic, 0.6);
  // stalactites from the ceiling
  const sr = mulberry32(707);
  const drip = (x, len, w) => {
    for (let y = 0; y < len; y++) {
      const hw = w * (1 - y / len) ** 0.8;
      for (let xx = Math.floor(x - hw); xx <= x + hw; xx++) { const u = (xx + 0.5 - x) / Math.max(0.6, hw); c.set(xx, y, u < -0.4 ? P.grey3 : u < 0.3 ? P.slate : P.navy); }
      if (hw > 1) c.set(Math.round(x + hw), y, P.ink);
    }
    if (sr() > 0.6) c.set(Math.round(x), len + 2 + Math.floor(sr() * 6), P.green);
  };
  c.fillRect(0, 0, W, 6, (x, y) => (y < 4 ? P.ink : P.navy));
  for (let x = 4; x < W; x += 8 + sr() * 20) { const big = sr() > 0.7; drip(x, (big ? 20 : 6) + sr() * (Math.abs(x - 240) < 80 ? 20 : 36), big ? 6 + sr() * 4 : 2 + sr() * 3); }
  // stalagmites at the sides
  const mite = (x, base, h, w) => { for (let y = base - h; y < base; y++) { const hw = w * ((y - base + h) / h) ** 0.7; for (let xx = Math.floor(x - hw); xx <= x + hw; xx++) { const u = (xx + 0.5 - x) / Math.max(0.6, hw); c.set(xx, y, u < -0.45 ? P.grey3 : u < 0.35 ? P.slate : P.navy); } } c.set(x, base - h, P.grey2); };
  mite(40, FLOOR + 2, 46, 9); mite(62, FLOOR + 1, 26, 6); mite(128, FLOOR, 18, 5); mite(356, FLOOR, 22, 5); mite(420, FLOOR + 2, 50, 10); mite(446, FLOOR + 1, 30, 7);
  // glowing fungi on the walls
  for (const [fx, fy] of [[96, 96], [104, 100], [388, 92], [398, 98], [150, 60], [330, 70]]) { glow(c, fx, fy, 10, 0.6, toxic); c.fillRect(fx - 1, fy, 3, 1, P.green); c.set(fx, fy + 1, P.greenDark); c.set(fx, fy - 1, mix(P.green, P.yellow, 0.5)); }
  // stone floor: uneven, worn rock
  ground(c, FLOOR, H, (x, y, z) => {
    const depth = 1 / (0.15 + z), fn = (xx, dd) => fbm(xx * 0.022, dd * 1.6, 709, 3);
    const n = fn(x, depth), k = (n - fn(x + 3, depth * 0.97)) * 14, band = (n * 11) % 1;
    let col = n > 0.62 ? P.slate : n > 0.47 ? (dither(x, y, (n - 0.47) * 6) ? P.slate : P.navy) : n < 0.36 ? (dither(x, y, 0.5) ? P.ink : P.navy) : P.navy;
    if (band < 0.07) col = P.ink; else if (band < 0.13 && k > -0.1) col = n > 0.55 ? P.grey3 : P.slate;
    if (hash2(x, y, 710) > 0.985) col = P.grey3;
    if (y === FLOOR) col = P.slate;
    return col;
  });
  // murky pool (right) with a sickly glow and bubbles
  const px = 372, py = FLOOR + 22, prx = 74, pry = 13;
  glow(c, px, py - 4, 100, 0.45, toxic, 0.45);
  for (let y = py - pry - 1; y <= py + pry + 1; y++) for (let x = px - prx - 2; x <= px + prx + 2; x++) {
    const d = Math.hypot((x + 0.5 - px) / prx, (y + 0.5 - py) / pry) + vnoise(x * 0.1, y * 0.2, 711) * 0.12;
    if (d > 1.08) continue;
    if (d > 0.97) { c.set(x, y, y < py ? P.grey3 : P.ink); continue; }
    const n = vnoise(x * 0.08, y * 0.6, 713);
    c.set(x, y, n > 0.86 ? P.green : n > 0.72 ? P.greenDark : d < 0.6 ? (dither(x, y, 0.6 - d) ? P.greenDeep : P.teal) : d > 0.85 ? mix(P.teal, P.ink, 0.4) : P.teal);
  }
  for (const [bx, by] of [[346, FLOOR + 18], [390, FLOOR + 24], [410, FLOOR + 17], [356, FLOOR + 27]]) { c.set(bx, by, mix(P.green, P.yellow, 0.4)); c.set(bx - 1, by, P.greenDark); c.set(bx + 1, by, P.greenDark); c.set(bx, by - 1, P.greenDark); }
  // bone piles and scattered skulls
  const boneC = [mix(P.grey3, P.greenDeep, 0.35), mix(P.grey2, P.sand, 0.2), mix(P.grey1, P.sandLight, 0.3)];
  bonePile(c, 70, FLOOR + 26, 90, 20, 715, boneC); bonePile(c, 150, FLOOR + 5, 40, 8, 717, boneC); bonePile(c, 452, FLOOR + 52, 70, 16, 719, boneC); bonePile(c, 300, FLOOR + 4, 30, 6, 721, boneC);
  skull(c, 206, FLOOR + 30, 1.5, boneC); bone(c, 196, FLOOR + 36, 212, FLOOR + 38, boneC); skull(c, 120, FLOOR + 58, 2, boneC); bone(c, 132, FLOOR + 66, 150, FLOOR + 62, boneC);
  skull(c, 286, FLOOR + 50, 1.6, boneC); bone(c, 20, FLOOR + 62, 40, FLOOR + 66, boneC);
  // poisonous green mist drifting low and in the air
  tint(c, 0, 20, W, H, (x, y) => { const n = fbm(x * 0.015, y * 0.04, 723, 3); const k = (n - 0.5) * 2 + (1 - Math.abs(y - FLOOR - 6) / 50) * 0.35; return k > 0 ? Math.min(0.75, k) : 0; }, (col) => mix(col, P.greenDark, 0.45));
  nearShade(c, FLOOR);
  // floating spores
  const mr = mulberry32(725);
  for (let i = 0; i < 26; i++) c.set(Math.floor(mr() * W), 30 + Math.floor(mr() * 120), mr() > 0.5 ? P.green : mix(P.green, P.yellow, 0.5));
  return c;
}
