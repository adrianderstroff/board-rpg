// Hand-shaped 48x48 portrait of Mira (hero_magician) in five different pixel-art styles.
// A shared 2D layout (layered shapes) is rendered by style-specific shaders:
// every pixel knows its topmost shape, and a "pillow" shading value t (0 = lit edge,
// 1 = shadow edge) measured along the style's light direction.
import { Canvas, hex, mix, dither } from './raster.mjs';
import { P } from './palette.mjs';
import { hash2 } from './rng.mjs';

const S = 48;
const H = (s) => hex(s);

// ---------------------------------------------------------------- geometry
/** Shapes in draw order. k = head scale (cute style), pivot (24,36). */
function layout({ k = 1, eyeScale = 1, faceW = 1, eyeSpread = 0 } = {}) {
  const px = 24, py = 36;
  const hs = (pts) => pts.map(([x, y]) => [px + (x - px) * k, py + (y - py) * k]);
  const he = (cx, cy, rx, ry) => [px + (cx - px) * k, py + (cy - py) * k, rx * k, ry * k];
  const shapes = [];
  const poly = (id, pts) => shapes.push({ id, poly: pts });
  const ell = (id, [cx, cy, rx, ry], clip) => shapes.push({ id, ell: [cx, cy, rx, ry], clip });
  ell('hairBack', he(24, 29, 13, 15), (x, y) => y > py + (16 - py) * k);
  poly('robe', [[3, 48], [6, 39], [13, 35], [20, 34], [28, 34], [35, 35], [42, 39], [45, 48]]);
  poly('robeFold', [[23, 37], [25, 37], [27, 48], [21, 48]]);
  ell('sleeve', [9, 44, 6.5, 5.5]);
  ell('lining', [6.5, 45.5, 3.2, 2.4]);
  poly('staff', [[4.2, 48], [6, 48], [6, 15], [4.2, 15]]);
  ell('hand', [6.2, 40.5, 2.4, 2.4]);
  ell('hood', he(24, 22, 13.5, 14.2));
  poly('hood', hs([[12.5, 18], [15, 9], [19, 4], [24, 1], [30, 0], [36, 2], [41, 6], [44, 11], [44.5, 16], [42, 15.5], [39.5, 12.5], [35.5, 11], [32, 12.5], [34, 16]]));
  ell('hoodInner', he(24.5, 24.5, 9.6, 11.2));
  poly('neck', hs([[21.5, 31], [28, 31], [28, 36], [21.5, 36]]));
  ell('face', he(24.8, 25.4, 7.1 * faceW, 8.4));
  poly('hairSide', hs([[17.5, 17], [15.2, 24], [15, 32], [16.8, 36.5], [19.2, 30], [18.6, 24]]));
  poly('hairSide', hs([[31.5, 17], [34.6, 24], [34.4, 31], [32.6, 36.5], [30.9, 30], [31.4, 24]]));
  poly('hair', hs([[15.4, 21], [17, 15.5], [21.5, 13.2], [28, 13.2], [33, 15.8], [34.3, 21], [32, 19.6], [29.5, 17.4], [26.8, 19.8], [25.3, 17.2], [22, 18.4], [19.4, 20.6], [17.2, 23.5]]));
  poly('lock', [[14.8, 31], [19.6, 33.5], [18.8, 40], [17.6, 46], [14.6, 48], [12.4, 46], [14.2, 40]]);
  poly('lock', [[32, 32.5], [35.4, 30.5], [37.4, 38], [38.6, 46], [36.2, 48], [33.4, 44], [34, 38]]);
  ell('orb', [5.1, 11.6, 3.7, 3.7]);
  // facial feature anchors
  const f = (x, y) => [px + (x - px) * k, py + (y - py) * k];
  return { shapes, eyeL: f(21.2 - eyeSpread, 25.2), eyeR: f(28.4 + eyeSpread, 25.2), browL: f(21.2, 22.6), browR: f(28.4, 22.6), nose: f(25.6, 28.2), mouth: f(25, 31.2), k, eyeScale };
}

/** Rasterize layers: returns id buffer (shape index) and per-shape masks. */
function rasterize(L) {
  const ids = new Int16Array(S * S).fill(-1);
  const masks = L.shapes.map((sh) => {
    const m = new Canvas(S, S);
    if (sh.poly) m.polygon(sh.poly, 0xffffffff);
    else {
      const [cx, cy, rx, ry] = sh.ell;
      m.ellipse(cx, cy, rx, ry, (x, y) => (!sh.clip || sh.clip(x + 0.5, y + 0.5) ? 0xffffffff : null));
    }
    return m;
  });
  L.shapes.forEach((sh, i) => { for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (masks[i].alpha(x, y)) ids[y * S + x] = i; });
  // merge masks by material id (shapes sharing an id shade as one piece)
  const byId = {};
  L.shapes.forEach((sh, i) => { const m = byId[sh.id] ?? (byId[sh.id] = new Canvas(S, S)); m.blit(masks[i], 0, 0); });
  return { ids, byId };
}

/** Pillow shade: 0 at the lit edge, 1 at the far edge along light direction (dx,dy). */
function shadeT(mask, x, y, dx, dy, max = 14) {
  let a = 0, b = 0;
  while (a < max && mask.alpha(Math.round(x - dx * (a + 1)), Math.round(y - dy * (a + 1)))) a++;
  while (b < max && mask.alpha(Math.round(x + dx * (b + 1)), Math.round(y + dy * (b + 1)))) b++;
  return a / Math.max(1, a + b);
}

/** Generic renderer: fn(id, t, x, y, ctx) -> color. */
function paint(L, R, light, fn, bg) {
  const c = new Canvas(S, S);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const i = R.ids[y * S + x];
      if (i < 0) { c.set(x, y, bg(x, y)); continue; }
      const id = L.shapes[i].id;
      const t = shadeT(R.byId[id], x, y, light[0], light[1]);
      c.set(x, y, fn(id, t, x, y));
    }
  return c;
}
const idAt = (L, R, x, y) => (x < 0 || y < 0 || x >= S || y >= S ? null : R.ids[y * S + x] < 0 ? null : L.shapes[R.ids[y * S + x]].id);
const ORDER = ['hairBack', 'robe', 'robeFold', 'sleeve', 'lining', 'staff', 'hand', 'hood', 'hoodInner', 'neck', 'face', 'hairSide', 'hair', 'lock', 'orb'];
const Z = (id) => ORDER.indexOf(id);
const pick = (ramp, t) => ramp[Math.max(0, Math.min(ramp.length - 1, Math.floor(t * ramp.length)))];
const rampT = (ramp, t, x, y, amt = 0.6) => {
  // ordered-dithered ramp lookup (lit end = last color)
  const n = ramp.length, f = (1 - t) * (n - 1);
  const i = Math.floor(f), fr = f - i;
  return dither(x, y, Math.min(1, Math.max(0, (fr - 0.5) * (1 / amt) + 0.5))) ? ramp[Math.min(n - 1, i + 1)] : ramp[i];
};

// ---------------------------------------------------------------- 1. SNES JRPG portrait
function varSnes() {
  const L = layout();
  const R = rasterize(L);
  const pal = {
    hood: ['2b1a3e', '45283c', '68386c', '8a4f8e', 'b55088'].map(H),
    robe: ['2b1a3e', '45283c', '68386c', '8a4f8e', 'b55088'].map(H),
    robeFold: ['1b1030', '2b1a3e', '45283c', '68386c'].map(H),
    sleeve: ['2b1a3e', '45283c', '68386c', '8a4f8e', 'b55088'].map(H),
    lining: ['181425', '1b1030', '2b1a3e'].map(H),
    hoodInner: ['181425', '1b1030', '2b1a3e', '45283c'].map(H),
    hair: ['3a4466', '5a6988', '8b9bb4', 'c0cbdc', 'ffffff'].map(H),
    hairSide: ['3a4466', '5a6988', '8b9bb4', 'c0cbdc', 'ffffff'].map(H),
    hairBack: ['262b44', '3a4466', '5a6988', '8b9bb4'].map(H),
    lock: ['3a4466', '5a6988', '8b9bb4', 'c0cbdc', 'ffffff'].map(H),
    face: ['9a5e4a', 'c28569', 'e8b796', 'f3d0b2'].map(H),
    neck: ['733e39', '9a5e4a', 'c28569'].map(H),
    hand: ['9a5e4a', 'c28569', 'e8b796', 'f3d0b2'].map(H),
    staff: ['3e2731', '733e39', 'b86f50'].map(H),
    orb: ['124e89', '0099db', '2ce8f5', 'ffffff'].map(H),
  };
  const light = [0.7, 0.7]; // from top-left
  const c = paint(L, R, light, (id, t, x, y) => {
    let r = pal[id];
    if (id === 'face' || id === 'hand') t = Math.max(0, (t - 0.45) / 0.55) * 0.8;
    let col = pick([...r].reverse(), t);
    if (['hair', 'hairSide', 'lock', 'hairBack'].includes(id)) {
      // hair strands: diagonal darker lines in the mid tones
      if ((x + Math.floor(y * (id === 'lock' ? 0.25 : 0.6))) % 3 === 0 && t > 0.2 && t < 0.85) col = pick([...r].reverse(), Math.min(0.99, t + 0.25));
    }
    return col;
  }, (x, y) => (dither(x, y, y / 60) ? H('262b44') : H('1b1f36')));
  // selective outline: darkest shade of the upper material where it meets a lower one / background
  const out = c.clone();
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const id = idAt(L, R, x, y);
      if (!id || id === 'orb') continue;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const n = idAt(L, R, x + dx, y + dy);
        const lit = dx < 0 || dy < 0;
        if (n === null || (Z(n) < Z(id) && n !== id && !(id === 'face' && n === 'neck'))) {
          if (id === 'face' && lit && n !== null) continue; // soft lit cheek edge
          out.set(x, y, n === null && !lit ? H('181425') : pal[id][0]);
          break;
        }
      }
    }
  // features
  const [ex, ey] = [Math.round(L.eyeL[0]), Math.round(L.eyeL[1])];
  const [fx, fy] = [Math.round(L.eyeR[0]), Math.round(L.eyeR[1])];
  const eye = (x, y, far) => {
    const w = far ? 3 : 4;
    out.fillRect(x - 1, y - 1, w, 1, H('3e2731')); // lash line
    out.fillRect(x - 1, y, w, 3, H('ffffff'));
    out.fillRect(x, y, 2, 3, H('0099db'));
    out.fillRect(x, y + 2, 2, 1, H('124e89'));
    out.set(x + 1, y + 1, H('181425'));
    out.set(x, y, H('ffffff'));
    out.set(x - 1, y + 2, H('e8b796'));
  };
  eye(ex - 1, ey - 1, false); eye(fx - 1, fy - 1, true);
  out.line(ex - 2, ey - 4, ex + 2, ey - 4, H('8b9bb4')); out.line(fx - 1, fy - 4, fx + 2, fy - 4, H('8b9bb4'));
  out.set(Math.round(L.nose[0]), Math.round(L.nose[1]), H('c28569'));
  out.set(Math.round(L.nose[0]) + 1, Math.round(L.nose[1]) + 1, H('9a5e4a'));
  const [mx, my] = [Math.round(L.mouth[0]), Math.round(L.mouth[1])];
  out.line(mx - 1, my, mx + 1, my, H('9a5e4a')); out.set(mx - 2, my - 1, H('c28569')); out.set(mx + 2, my - 1, H('c28569'));
  out.set(ex - 1, ey + 3, H('f6757a')); out.set(fx + 2, fy + 3, H('f6757a'));
  // smile creases (wise)
  out.set(ex - 3, ey + 1, H('c28569')); out.set(fx + 3, fy + 1, H('c28569'));
  // orb highlight
  out.set(4, 10, H('ffffff')); out.set(3, 11, H('ffffff'));
  return out;
}

// ---------------------------------------------------------------- 2. chunky cute
function varCute() {
  const L = layout({ k: 1.12, faceW: 1.12, eyeSpread: 0.9 });
  const R = rasterize(L);
  const pal = {
    hood: ['8a4f8e', 'b55088'], robe: ['8a4f8e', 'b55088'], robeFold: ['68386c', '8a4f8e'], sleeve: ['8a4f8e', 'b55088'], lining: ['45283c', '45283c'],
    hoodInner: ['45283c', '68386c'], hair: ['c0cbdc', 'ffffff'], hairSide: ['c0cbdc', 'ffffff'], hairBack: ['8b9bb4', 'c0cbdc'], lock: ['c0cbdc', 'ffffff'],
    face: ['e8b796', 'f3d0b2'], neck: ['c28569', 'e8b796'], hand: ['e8b796', 'f3d0b2'], staff: ['b86f50', 'd77643'], orb: ['2ce8f5', 'ffffff'],
  };
  for (const k in pal) pal[k] = pal[k].map(H);
  const light = [0.7, 0.7];
  const c = paint(L, R, light, (id, t, x, y) => (t > 0.62 ? pal[id][0] : pal[id][1]), (x, y) => {
    // pastel backdrop with a soft polka pattern
    const dot = ((x + 2) % 8 === 0 && (y + 2) % 8 === 0) || ((x + 6) % 8 === 0 && (y + 6) % 8 === 0);
    return dot ? H('f6757a') : H('e8b796');
  });
  // thick uniform black outline on every material boundary & silhouette
  const out = c.clone();
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const id = idAt(L, R, x, y);
      if (!id) { if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => idAt(L, R, x + dx, y + dy))) out.set(x, y, H('181425')); continue; }
      for (const [dx, dy] of [[1, 0], [0, 1]]) {
        const n = idAt(L, R, x + dx, y + dy);
        if (n && n !== id && !(id === 'face' && n === 'neck') && !(id === 'neck' && n === 'face') && !['robeFold'].includes(n) && !['robeFold'].includes(id) && !(id === 'hood' && n === 'hoodInner') && !(id === 'lining' || n === 'lining')) {
          out.set(Z(n) > Z(id) ? x : x + dx, Z(n) > Z(id) ? y : y + dy, H('181425'));
        }
      }
    }
  // big sparkly eyes
  const eye = (cx, cy) => {
    const x = Math.round(cx) - 2, y = Math.round(cy) - 3;
    out.fillRect(x, y, 4, 6, H('181425'));
    out.fillRect(x + 1, y + 2, 2, 3, H('68386c'));
    out.fillRect(x + 1, y + 4, 2, 1, H('b55088'));
    out.set(x + 1, y + 1, H('ffffff')); out.set(x + 2, y + 1, H('ffffff')); out.set(x + 1, y + 2, H('ffffff'));
    out.set(x + 2, y + 4, H('ffffff'));
    out.set(x - 1, y, H('181425'));
  };
  eye(L.eyeL[0], L.eyeL[1] + 0.5); eye(L.eyeR[0] + 0.5, L.eyeR[1] + 0.5);
  const [mx, my] = [Math.round(L.mouth[0]), Math.round(L.mouth[1] + 0.5)];
  out.fillRect(mx - 1, my, 3, 2, H('181425')); out.set(mx, my + 1, H('e43b44'));
  out.fillRect(Math.round(L.eyeL[0]) - 4, Math.round(L.eyeL[1]) + 4, 2, 1, H('f6757a'));
  out.fillRect(Math.round(L.eyeR[0]) + 3, Math.round(L.eyeR[1]) + 4, 2, 1, H('f6757a'));
  // sparkle near the orb
  for (const [x, y] of [[10, 5], [11, 4], [11, 6], [12, 5]]) out.set(x, y, H('fee761'));
  out.set(11, 5, H('ffffff'));
  out.set(4, 10, H('ffffff'));
  return out;
}

// ---------------------------------------------------------------- 3. HD-2D painterly
function varPainterly() {
  const L = layout();
  const R = rasterize(L);
  const light = [-0.75, 0.65]; // warm key light from the upper right
  const pal = {
    hood: ['1b1030', '2b1a3e', '45283c', '68386c', '8a4f8e', 'c46d9c'],
    robe: ['1b1030', '2b1a3e', '45283c', '68386c', '8a4f8e'],
    robeFold: ['140c22', '1b1030', '2b1a3e', '45283c'],
    sleeve: ['1b1030', '2b1a3e', '45283c', '68386c', '8a4f8e'],
    lining: ['0e0a16', '140c22', '1b1030'],
    hoodInner: ['0e0a16', '1b1030', '2b1a3e', '45283c'],
    hair: ['3a4466', '5a6988', '8b9bb4', 'c0cbdc', 'e9e3d6', 'fff4e0'],
    hairSide: ['3a4466', '5a6988', '8b9bb4', 'c0cbdc', 'e9e3d6'],
    hairBack: ['1b1f36', '262b44', '3a4466', '5a6988'],
    lock: ['3a4466', '5a6988', '8b9bb4', 'c0cbdc', 'e9e3d6', 'fff4e0'],
    face: ['5e3a3e', '8a5448', 'b87a5e', 'd9a07e', 'f0c49a', 'ffe0b8'],
    neck: ['3e2731', '5e3a3e', '8a5448'],
    hand: ['5e3a3e', '8a5448', 'b87a5e', 'd9a07e'],
    staff: ['1f1418', '3e2731', '733e39'],
    orb: ['0099db', '2ce8f5', 'a8f6fa', 'ffffff'],
  };
  for (const k in pal) pal[k] = pal[k].map(H);
  const orbC = [5.1, 11.6];
  const c = paint(L, R, light, (id, t, x, y) => {
    if (id === 'face' || id === 'hand') t *= 0.75;
    let col = rampT(pal[id], t, x, y, 0.7);
    if (id !== 'orb') {
      // cyan rim light from the orb on surfaces facing it (left edges near the orb)
      const d = Math.hypot(x + 0.5 - orbC[0], y + 0.5 - orbC[1]);
      const mask = R.byId[id];
      let steps = 0; while (steps < 3 && mask.alpha(x - steps - 1, y)) steps++;
      if (steps < 2 && d < 30 && id !== 'staff') col = mix(col, H('2ce8f5'), (1 - d / 30) * (steps === 0 ? 0.85 : 0.45));
      else if (d < 16) col = mix(col, H('2ce8f5'), (1 - d / 16) * 0.25);
    }
    return col;
  }, (x, y) => {
    // moody gradient with a glow around the orb
    const d = Math.hypot(x - orbC[0], y - orbC[1]);
    const g = Math.max(0, 1 - d / 18);
    const base = dither(x, y, y / 48) ? H('1b1030') : H('262b44');
    return g > 0 ? (dither(x, y, g) ? mix(base, H('0099db'), 0.5 * g + 0.2) : base) : base;
  });
  // soft features (no hard outlines)
  const out = c;
  const eye = (cx, cy, far) => {
    const x = Math.round(cx) - 1, y = Math.round(cy) - 1;
    out.fillRect(x - 1, y - 1, far ? 3 : 4, 1, H('3e2731'));
    out.fillRect(x, y, 2, 2, H('2b1a3e'));
    out.set(x + 1, y, H('0099db'));
    out.set(x, y, H('a8f6fa'));
    out.set(x - 1, y + 1, mix(H('d9a07e'), H('ffffff'), 0.3));
  };
  eye(L.eyeL[0], L.eyeL[1], false); eye(L.eyeR[0], L.eyeR[1], true);
  out.line(Math.round(L.browL[0]) - 2, Math.round(L.browL[1]) - 1, Math.round(L.browL[0]) + 1, Math.round(L.browL[1]) - 1, H('8b9bb4'));
  out.line(Math.round(L.browR[0]) - 1, Math.round(L.browR[1]) - 1, Math.round(L.browR[0]) + 2, Math.round(L.browR[1]) - 1, H('8b9bb4'));
  out.set(Math.round(L.nose[0]) + 1, Math.round(L.nose[1]) + 1, H('8a5448'));
  const [mx, my] = [Math.round(L.mouth[0]), Math.round(L.mouth[1])];
  out.line(mx - 1, my, mx + 1, my, H('8a5448')); out.set(mx + 2, my - 1, H('b87a5e'));
  // orb sparkle
  out.set(4, 10, H('ffffff')); out.set(5, 9, H('ffffff'));
  return out;
}

// ---------------------------------------------------------------- 4. flat minimal / graphic
function varFlat() {
  const L = layout();
  const R = rasterize(L);
  const C = { bg: H('e4a672'), purple: H('68386c'), dark: H('2b1a3e'), silver: H('dfe6ef'), silverS: H('8b9bb4'), skin: H('e8b796'), cyan: H('2ce8f5'), ink: H('181425') };
  const light = [0.7, 0.7];
  const c = paint(L, R, light, (id, t, x, y) => {
    switch (id) {
      case 'hood': return t > 0.6 ? C.dark : C.purple;
      case 'robe': case 'sleeve': return t > 0.55 ? C.dark : C.purple;
      case 'robeFold': case 'lining': case 'hoodInner': return C.dark;
      case 'hair': case 'hairSide': case 'lock': return t > 0.7 ? C.silverS : C.silver;
      case 'hairBack': return C.silverS;
      case 'face': case 'hand': return C.skin;
      case 'neck': return C.silverS;
      case 'staff': return C.ink;
      case 'orb': return C.cyan;
    }
    return C.ink;
  }, (x, y) => (Math.abs((x - y) % 16) < 1 || y > 44 ? C.bg : C.bg));
  // big flat sun-disc behind the head (geometric accent)
  const out = new Canvas(S, S, C.bg);
  out.ellipse(30, 20, 16, 16, H('d77643'));
  out.blit(c.recolor((col) => (col === C.bg ? 0 : col)), 0, 0);
  // minimal features: eyes as dark dashes, no mouth
  for (const [x, y] of [L.eyeL, L.eyeR]) out.fillRect(Math.round(x) - 1, Math.round(y), 2, 2, C.ink);
  out.set(Math.round(L.nose[0]) + 1, Math.round(L.nose[1]) + 1, C.purple);
  out.ellipse(5.1, 11.6, 2, 2, H('ffffff'));
  return out;
}

// ---------------------------------------------------------------- 5. dark fantasy woodcut
function varWoodcut() {
  const L = layout();
  const R = rasterize(L);
  const light = [-0.8, 0.6]; // hard light from upper right
  const INK = H('0e0a12');
  const lit = {
    hood: H('68386c'), robe: H('45283c'), robeFold: INK, sleeve: H('45283c'), lining: INK, hoodInner: INK,
    hair: H('c0cbdc'), hairSide: H('8b9bb4'), hairBack: H('3a4466'), lock: H('c0cbdc'),
    face: H('c9a38c'), neck: H('5e4a44'), hand: H('a8866f'), staff: H('3e2731'), orb: H('2ce8f5'),
  };
  const mid = {
    hood: H('45283c'), robe: H('2b1a3e'), sleeve: H('2b1a3e'), hair: H('5a6988'), hairSide: H('5a6988'), lock: H('5a6988'), hairBack: H('262b44'),
    face: H('7a5c52'), hand: H('5e4a44'), orb: H('0099db'),
  };
  const orbC = [5.1, 11.6];
  const c = paint(L, R, light, (id, t, x, y) => {
    if (id === 'orb') return t < 0.45 ? H('ffffff') : t < 0.8 ? H('2ce8f5') : H('0099db');
    const n = hash2(x, y, 77);
    // cyan spill from the orb
    const d = Math.hypot(x - orbC[0], y - orbC[1]);
    if (d < 11 && t > 0.3 && (x + 2 * y) % 4 === 0 && id !== 'staff') return H('124e89');
    const lt = id === 'face' || id === 'hand' ? 0.58 : 0.42, ht = id === 'face' ? 0.8 : 0.68;
    if (t < lt) return n > 0.93 ? (mid[id] ?? INK) : lit[id]; // gritty light
    if (t < ht) {
      // cross-hatching band: diagonal engraved lines
      const line = (x + y) % 3 === 0 || (t > (lt + ht) / 2 && (x - y + 48) % 3 === 0);
      return line ? INK : (mid[id] ?? lit[id]);
    }
    return n > 0.97 ? (mid[id] ?? INK) : INK;
  }, (x, y) => {
    const n = hash2(x, y, 5);
    const d = Math.hypot(x - orbC[0], y - orbC[1]);
    if (d < 8 && (x + y) % 4 === 0) return H('193c3e');
    return n > 0.96 ? H('262b44') : n > 0.9 ? H('1b1f36') : INK;
  });
  const out = c;
  // stark but gentle face: carved eyelid lines with a pale glint, cut nose shadow, thin smile
  for (const [x, y] of [L.eyeL, L.eyeR]) {
    const ex = Math.round(x), ey = Math.round(y);
    out.fillRect(ex - 2, ey - 1, 4, 1, INK);
    out.fillRect(ex - 1, ey, 2, 1, INK);
    out.set(ex, ey, H('2ce8f5'));
  }
  out.line(Math.round(L.browL[0]) - 2, Math.round(L.browL[1]), Math.round(L.browL[0]) + 1, Math.round(L.browL[1]) - 1, H('c0cbdc'));
  out.line(Math.round(L.browR[0]) - 1, Math.round(L.browR[1]) - 1, Math.round(L.browR[0]) + 2, Math.round(L.browR[1]), H('c0cbdc'));
  out.set(Math.round(L.nose[0]) + 1, Math.round(L.nose[1]), INK); out.set(Math.round(L.nose[0]), Math.round(L.nose[1]) + 1, INK);
  out.line(Math.round(L.mouth[0]) - 1, Math.round(L.mouth[1]), Math.round(L.mouth[0]) + 1, Math.round(L.mouth[1]), INK);
  out.set(Math.round(L.mouth[0]) - 2, Math.round(L.mouth[1]) - 1, INK); out.set(Math.round(L.mouth[0]) + 2, Math.round(L.mouth[1]) - 1, INK);
  out.set(4, 10, H('ffffff'));
  // rough outer frame edge (woodcut border)
  for (let i = 0; i < S; i++) for (const [x, y] of [[i, 0], [i, S - 1], [0, i], [S - 1, i]]) out.set(x, y, INK);
  return out;
}

export const MAGICIAN_VARIANTS = [
  ['SNES JRPG', varSnes],
  ['chunky cute', varCute],
  ['HD-2D painterly', varPainterly],
  ['flat graphic', varFlat],
  ['woodcut dark', varWoodcut],
];

export { varFlat };
