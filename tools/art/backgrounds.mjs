// Battle backgrounds (480x190) and title background (480x270).
import { Canvas, mix, dither, withAlpha } from './raster.mjs';
import { P, X } from './palette.mjs';
import { mulberry32, fbm, vnoise } from './rng.mjs';

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
