// Flat graphic portrait style (the chosen "var4" look): ~8 flat colours per portrait,
// hard-edged two-tone shapes (lit/shadow along a top-left light), no outlines,
// simple dot eyes, strong silhouette, flat background with a big geometric shape.
//
// Usage: const p = new FlatPortrait({ bg, shape }); p.mat('skin', lit, shadow|null); p.ell(...)/p.poly(...);
// p.post((c) => ...); p.render() -> 48x48 Canvas. Shared part helpers below build busts,
// heads, hair, hats, beards and features on the standard head layout, so new characters
// are a few lines each.
import { Canvas, hex } from './raster.mjs';
import { varFlat } from './portraits.mjs';

const S = 48;
const H = (s) => (typeof s === 'number' ? s : hex(s));

// ---------------------------------------------------------------- core
export class FlatPortrait {
  /** bg: colour; shape: { type: disc|ring|diamond|square|half|band|sun, color, x, y, r } */
  constructor({ bg, shape }) { this.bg = H(bg); this.shape = shape; this.layers = []; this.mats = {}; this.posts = []; }
  /** lit/shadow colours; shadow null = flat. thr = shadow threshold along the light (0..1). */
  mat(name, lit, shadow = null, thr = 0.6) { this.mats[name] = { lit: lit == null ? null : H(lit), sh: shadow == null ? null : H(shadow), thr }; return this; }
  poly(mat, pts, clip = null) { this.layers.push({ mat, poly: pts, clip }); return this; }
  ell(mat, cx, cy, rx, ry = rx, clip = null) { this.layers.push({ mat, ell: [cx, cy, rx, ry], clip }); return this; }
  rect(mat, x, y, w, h, clip = null) { return this.poly(mat, [[x, y], [x + w, y], [x + w, y + h], [x, y + h]], clip); }
  line(mat, x0, y0, x1, y1, w = 1.6) {
    const dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy) || 1, nx = (-dy / l) * w / 2, ny = (dx / l) * w / 2;
    return this.poly(mat, [[x0 + nx, y0 + ny], [x1 + nx, y1 + ny], [x1 - nx, y1 - ny], [x0 - nx, y0 - ny]]);
  }
  post(fn) { this.posts.push(fn); return this; }
  render() {
    const c = new Canvas(S, S, this.bg);
    drawShape(c, this.shape);
    const ids = new Int16Array(S * S).fill(-1);
    const byMat = {};
    this.layers.forEach((L, i) => {
      const m = new Canvas(S, S);
      const clip = L.clip;
      const col = (x, y) => (!clip || clip(x + 0.5, y + 0.5) ? 0xffffffff : null);
      if (L.poly) m.polygon(L.poly, col);
      else m.ellipse(L.ell[0], L.ell[1], L.ell[2], L.ell[3], col);
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (m.alpha(x, y)) ids[y * S + x] = i;
      (byMat[L.mat] ??= new Canvas(S, S)).blit(m, 0, 0);
    });
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++) {
        const i = ids[y * S + x];
        if (i < 0) continue;
        const name = this.layers[i].mat, M = this.mats[name];
        if (!M) throw new Error('unknown material ' + name);
        if (M.lit == null) continue; // cut-out: background shows through
        let col = M.lit;
        if (M.sh != null && shadeT(byMat[name], x, y, 0.7, 0.7) > M.thr) col = M.sh;
        c.set(x, y, col);
      }
    for (const fn of this.posts) fn(c, this);
    return c;
  }
}
function shadeT(mask, x, y, dx, dy, max = 14) {
  let a = 0, b = 0;
  while (a < max && mask.alpha(Math.round(x - dx * (a + 1)), Math.round(y - dy * (a + 1)))) a++;
  while (b < max && mask.alpha(Math.round(x + dx * (b + 1)), Math.round(y + dy * (b + 1)))) b++;
  return a / Math.max(1, a + b);
}
function drawShape(c, s) {
  if (!s) return;
  const col = H(s.color), { x = 30, y = 20, r = 16 } = s;
  if (s.type === 'disc') c.ellipse(x, y, r, r, col);
  else if (s.type === 'ring') c.ellipse(x, y, r, r, (px, py) => (Math.hypot(px + 0.5 - x, py + 0.5 - y) > r - (s.w ?? 4) ? col : null));
  else if (s.type === 'diamond') c.polygon([[x, y - r], [x + r, y], [x, y + r], [x - r, y]], col);
  else if (s.type === 'square') c.polygon([[x - r * 0.75, y - r * 0.75], [x + r * 0.75, y - r * 0.75], [x + r * 0.75, y + r * 0.75], [x - r * 0.75, y + r * 0.75]], col);
  else if (s.type === 'half') c.ellipse(x, y, r, r, (px, py) => (py + 0.5 < y ? col : null));
  else if (s.type === 'band') c.polygon([[0, y - r * 0.4], [S, y - r * 0.4 - 10], [S, y + r * 0.4 - 10], [0, y + r * 0.4]], col);
  else if (s.type === 'sun') { c.ellipse(x, y, r, r, col); for (let k = 0; k < 3; k++) c.fillRect(0, Math.round(y + 3 + k * 4), S, 1 + (k === 2 ? 1 : 0), H(s.bg)); }
}

// ---------------------------------------------------------------- standard layout & part helpers
export const HEAD = { x: 24.8, y: 25.4, rx: 7.1, ry: 8.4 };
export const EYES = [[20, 25], [27, 25]]; // top-left pixel of each 2x2 dot eye
const inEll = (cx, cy, rx, ry) => (x, y) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;

export const parts = {
  /** shoulders / upper robe */
  bust(p, mat, w = 1) {
    const X = (x) => 24 + (x - 24) * w;
    p.poly(mat, [[X(3), 48], [X(6), 39], [X(13), 35], [X(20), 34], [X(28), 34], [X(35), 35], [X(42), 39], [X(45), 48]]);
  },
  cape(p, mat) { p.poly(mat, [[0, 48], [3, 38], [12, 32.5], [37, 32.5], [46, 38], [48, 48]]); },
  neck(p, mat) { p.poly(mat, [[21.5, 30], [28, 30], [28, 36], [21.5, 36]]); },
  face(p, mat, o = {}) { p.ell(mat, o.x ?? HEAD.x, o.y ?? HEAD.y, o.rx ?? HEAD.rx, o.ry ?? HEAD.ry); },
  ears(p, mat) { p.ell(mat, 17.4, 26, 1.7, 2.6); p.ell(mat, 32.3, 26, 1.7, 2.6); },
  vneck(p, mat) { p.poly(mat, [[20.5, 34], [29, 34], [24.8, 40.5]]); },
  hairBack(p, mat, long = false) {
    if (long) p.ell(mat, 24.8, 31, 10, 12.5, (x, y) => y > 20);
    p.ell(mat, 24.8, 23.5, 8.3, 9.2);
  },
  bangs(p, mat) {
    p.poly(mat, [[16.6, 23], [17.3, 17.5], [21, 15.4], [28.5, 15.4], [32.3, 17.5], [33, 23], [30.8, 19.6], [27.4, 18.6], [24.6, 20], [21.6, 18.8], [18.8, 20.8]]);
  },
  cap(p, mat) { p.ell(mat, 24.8, 21.2, 7.8, 5.9, (x, y) => y < 21.6); }, // short hair cap on top of the head
  turban(p, mat, band = null) {
    p.ell(mat, 24.8, 18.8, 9.4, 6.4);
    p.ell(mat, 24.8, 12.8, 4.2, 3.1);
    if (band) p.poly(band, [[15, 21], [33.5, 14.5], [34.5, 17.2], [16, 23.6]], inEll(24.8, 18.8, 9.4, 6.4));
  },
  hood(p, mat, inner, peak = true) {
    p.ell(mat, 24.8, 23.8, 11, 12);
    if (peak) p.poly(mat, [[16.5, 16.5], [24.8, 8], [33, 16.5]]);
    p.ell(inner, 24.8, 26.2, 8.4, 9.6);
  },
  beard(p, mat, long = false) {
    if (long) p.poly(mat, [[17.4, 27], [32.4, 27], [33, 33], [29.3, 42], [24.8, 46.5], [20.3, 42], [16.7, 33]]);
    else p.poly(mat, [[17.8, 27.5], [31.8, 27.5], [31.4, 32], [27.6, 35], [22, 35], [18.4, 32]]);
    p.ell(mat, 24.8, 29.6, 4.4, 1.5); // moustache
  },
  eyes(p, color = '181425', { h = 2, dy = 0, lid = null } = {}) {
    p.post((c) => EYES.forEach(([x, y]) => { c.fillRect(x, y + dy, 2, h, H(color)); if (lid) c.fillRect(x - 1, y + dy - 1, 3, 1, H(lid)); }));
  },
  brows(p, color, dy = -3, w = 3) { p.post((c) => { c.fillRect(19, 25 + dy, w, 1, H(color)); c.fillRect(27, 25 + dy, w, 1, H(color)); }); },
  mouth(p, color, smile = false) {
    p.post((c) => { if (smile) { c.set(23, 31, H(color)); c.fillRect(24, 32, 2, 1, H(color)); c.set(26, 31, H(color)); } else c.fillRect(24, 31, 2, 1, H(color)); });
  },
  nose(p, color) { p.post((c) => c.set(26, 29, H(color))); },
  blush(p, color) { p.post((c) => { c.fillRect(18, 28, 2, 1, H(color)); c.fillRect(29, 28, 2, 1, H(color)); }); },
  /** little plus-shaped sparkles (stars on cloth etc.) */
  stars(p, color, pts) { p.post((c) => pts.forEach(([x, y]) => { c.set(x, y, H(color)); c.set(x - 1, y, H(color)); c.set(x + 1, y, H(color)); c.set(x, y - 1, H(color)); c.set(x, y + 1, H(color)); })); },
};
const P_ = parts;

// ---------------------------------------------------------------- characters
const F = {};
const SKIN = ['e8b796', 'c28569'], TAN = ['c28569', '733e39'];

F.hero_knight = () => {
  const p = new FlatPortrait({ bg: 'feae34', shape: { type: 'disc', color: 'f77622' } });
  p.mat('cape', '0099db', '124e89').mat('steel', 'dfe6ef', '8b9bb4', 0.55).mat('steelD', '8b9bb4').mat('blue', '0099db', '124e89')
    .mat('skin', SKIN[0]).mat('plume', '0099db', '124e89', 0.5);
  P_.cape(p, 'cape'); P_.bust(p, 'steel');
  p.poly('blue', [[20.5, 36], [29, 36], [30, 48], [19.5, 48]]);
  p.ell('steel', 9.5, 39, 6.8, 4.6); p.ell('steel', 40, 39, 6.8, 4.6);
  p.poly('steelD', [[19.5, 30.5], [30, 30.5], [30.5, 36], [19, 36]]);
  p.poly('plume', [[22, 15.5], [26, 11.5], [32, 9.5], [38.5, 10.5], [43, 15], [39.5, 15.3], [34.5, 13.8], [28.5, 16.2]]);
  p.ell('steel', 24.8, 23.6, 9.6, 10.4);
  p.ell('skin', 24.8, 26.8, 5.9, 6.2);
  p.poly('steelD', [[15.2, 20], [34.4, 20], [34.4, 22], [15.2, 22]], inEll(24.8, 23.6, 9.6, 10.4));
  p.rect('steelD', 24.2, 20, 1.8, 8.2);
  P_.eyes(p, '181425');
  return p;
};

F.hero_thief = () => {
  const p = new FlatPortrait({ bg: 'ead4aa', shape: { type: 'band', color: 'e4a672', y: 30, r: 26 } });
  p.mat('cape', '3e8948', '265c42').mat('leather', 'b86f50', '733e39').mat('fur', 'f77622', 'be4a2f', 0.62).mat('white', 'ffffff')
    .mat('mask', '3a4466', '262b44', 0.7).mat('tip', '181425');
  P_.cape(p, 'cape'); P_.bust(p, 'leather', 0.9);
  p.poly('white', [[20, 34], [29.6, 34], [24.8, 42]]);
  p.poly('mask', [[17.5, 31], [32, 31], [33, 36], [16.5, 36]]); // scarf round the neck
  // ears
  p.poly('fur', [[15.4, 21], [16.6, 6.5], [23.5, 16]]); p.poly('fur', [[26.1, 16], [33, 6.5], [34.2, 21]]);
  p.poly('tip', [[16.1, 12.2], [16.6, 6.5], [19.6, 9.9]]); p.poly('tip', [[30, 9.9], [33, 6.5], [33.5, 12.2]]);
  p.poly('white', [[17.8, 17.5], [18, 11.8], [21.4, 15.8]]); p.poly('white', [[28.2, 15.8], [31.6, 11.8], [31.8, 17.5]]);
  p.ell('fur', 24.8, 24.5, 8.4, 8);
  p.ell('white', 16.9, 28, 2.3, 3.2); p.ell('white', 32.7, 28, 2.3, 3.2);
  // bandit mask over the muzzle
  p.poly('mask', [[16.6, 26.4], [33, 26.4], [34.4, 29], [31, 33.2], [24.8, 34.6], [18.6, 33.2], [15.3, 29]]);
  p.post((c) => { for (const [x, y] of [[19, 22], [27, 22]]) { c.fillRect(x, y, 3, 1, H('181425')); c.fillRect(x + 1, y + 1, 2, 1, H('fee761')); } });
  return p;
};

F.hero_monk = () => {
  const p = new FlatPortrait({ bg: '5a6988', shape: { type: 'half', color: '3a4466', x: 24, y: 32, r: 22 } });
  p.mat('cream', 'ead4aa', 'e4a672', 0.55).mat('trim', 'b86f50').mat('skin', TAN[0], '9a5e4a', 0.72).mat('sash', 'a22633', '733e39').mat('tail', 'f77622');
  P_.bust(p, 'cream');
  P_.vneck(p, 'skin');
  p.poly('trim', [[19.4, 34], [22.4, 34], [28.4, 42.5], [28.4, 48], [25.4, 48], [25.4, 43.5]]);
  p.poly('trim', [[27.4, 34], [30, 34], [26.4, 39.2], [25, 37.6]]);
  p.poly('sash', [[3.6, 45], [44.4, 45], [45, 48], [3, 48]]);
  p.poly('tail', [[31, 45], [35, 45], [37.5, 48], [30, 48]]);
  P_.neck(p, 'skin'); P_.ears(p, 'skin');
  P_.face(p, 'skin', { y: 24.8, rx: 7.3, ry: 8.9 });
  P_.brows(p, '3e2731', -2);
  P_.eyes(p, '3e2731', { h: 1, dy: 0.5 });
  P_.mouth(p, '733e39');
  P_.nose(p, '9a5e4a');
  return p;
};

F.hero_magician = () => ({ render: () => varFlat() });

F.elder = () => {
  const p = new FlatPortrait({ bg: '124e89', shape: { type: 'ring', color: '0099db', x: 26, y: 22, r: 18 } });
  p.mat('robe', 'b86f50', '733e39').mat('trim', 'd77643').mat('skin', SKIN[0]).mat('white', 'ffffff', 'c0cbdc', 0.7);
  P_.bust(p, 'robe');
  p.poly('trim', [[19, 34], [30.6, 34], [24.8, 42]]);
  P_.neck(p, 'skin');
  p.ell('white', 17.3, 26.5, 2.8, 4.6); p.ell('white', 32.3, 26.5, 2.8, 4.6);
  P_.face(p, 'skin');
  P_.beard(p, 'white', true);
  p.post((c) => { c.fillRect(19, 22, 4, 2, H('ffffff')); c.fillRect(27, 22, 4, 2, H('ffffff')); });
  P_.eyes(p, '181425', { h: 1, dy: 0.6 });
  P_.nose(p, 'c28569');
  return p;
};

F.smith = () => {
  const p = new FlatPortrait({ bg: 'fee761', shape: { type: 'square', color: 'feae34', x: 30, y: 19, r: 17 } });
  p.mat('skin', TAN[0], TAN[1], 0.62).mat('shirt', '3a4466', '262b44').mat('apron', 'e43b44', 'a22633').mat('hair', '262b44').mat('beard', '733e39', '3e2731', 0.7)
    .mat('iron', '5a6988', '3a4466').mat('wood', 'b86f50');
  // hammer over the shoulder (behind)
  p.line('wood', 41, 47, 36, 18, 2); p.poly('iron', [[31.5, 14.5], [41.5, 16.5], [40.5, 21.5], [30.5, 19.5]]);
  p.poly('skin', [[0, 48], [2, 37.5], [10, 33.5], [15, 36], [13, 48]]); p.poly('skin', [[48, 48], [46, 37.5], [38, 33.5], [33, 36], [35, 48]]);
  p.poly('shirt', [[11, 48], [12.6, 37], [18, 34], [31, 34], [36.4, 37], [38, 48]]);
  p.poly('apron', [[15.6, 38], [33.6, 38], [34.6, 48], [14.6, 48]]);
  p.rect('apron', 17, 34, 2.4, 4.5); p.rect('apron', 30.2, 34, 2.4, 4.5);
  P_.neck(p, 'skin'); P_.ears(p, 'skin');
  P_.face(p, 'skin');
  P_.cap(p, 'hair');
  P_.beard(p, 'beard');
  P_.brows(p, '181425', -2);
  P_.eyes(p);
  return p;
};

F.merchant = () => {
  const p = new FlatPortrait({ bg: 'f6757a', shape: { type: 'disc', color: 'e43b44', x: 24, y: 20, r: 17 } });
  p.mat('green', '63c74d', '3e8948', 0.58).mat('cream', 'ead4aa', 'e4a672').mat('skin', SKIN[0]).mat('hair', '262b44').mat('gold', 'feae34');
  p.ell('hair', 24.8, 31, 9.6, 11.2, (x, y) => y > 24);
  P_.bust(p, 'cream');
  p.poly('green', [[3, 48], [6, 39], [13, 35], [20.4, 34], [21.6, 48]]); p.poly('green', [[28.2, 34], [35, 35], [42, 39], [45, 48], [27.8, 48]]);
  P_.neck(p, 'skin');
  P_.face(p, 'skin');
  p.poly('green', [[31.5, 20], [35.4, 20], [37, 33], [33.4, 32]]);
  P_.turban(p, 'green');
  p.ell('gold', 24.8, 17.6, 1.7, 1.9);
  P_.eyes(p); P_.blush(p, 'f6757a'); P_.mouth(p, 'a22633', true);
  return p;
};

F.mage = () => {
  const p = new FlatPortrait({ bg: '2ce8f5', shape: { type: 'diamond', color: '0099db', x: 26, y: 22, r: 20 } });
  p.mat('robe', '8a4f8e', '45283c', 0.55).mat('inner', '45283c').mat('skin', SKIN[0]).mat('white', 'ffffff', 'c0cbdc', 0.7).mat('wood', '733e39').mat('gold', 'feae34');
  p.line('wood', 5.2, 48, 5.2, 14, 2); p.ell('gold', 5.2, 11.5, 3.4);
  P_.bust(p, 'robe');
  P_.hood(p, 'robe', 'inner');
  P_.face(p, 'skin', { y: 26.2, rx: 6.4, ry: 7.6 });
  P_.beard(p, 'white', true);
  p.post((c) => { c.fillRect(19, 23, 4, 1, H('ffffff')); c.fillRect(27, 23, 4, 1, H('ffffff')); });
  P_.eyes(p, '181425', { dy: 0.5 });
  P_.stars(p, 'feae34', [[13, 20], [37, 25], [10, 43], [39, 44], [30, 13]]);
  p.post((c) => c.set(4, 10, H('ffffff')));
  return p;
};

F.innkeeper = () => {
  const p = new FlatPortrait({ bg: 'b55088', shape: { type: 'disc', color: '68386c', x: 30, y: 21, r: 16 } });
  p.mat('hair', 'b86f50', '733e39', 0.65).mat('dress', 'ead4aa', 'e4a672').mat('apron', '0099db', '124e89').mat('skin', SKIN[0]);
  p.ell('hair', 24.8, 13.4, 4.8, 3.9);
  P_.hairBack(p, 'hair');
  P_.bust(p, 'dress', 1.05);
  p.poly('apron', [[17.6, 38], [32, 38], [33, 48], [16.6, 48]]); p.rect('apron', 18.5, 34, 2.2, 4.5); p.rect('apron', 29, 34, 2.2, 4.5);
  P_.neck(p, 'skin');
  P_.face(p, 'skin');
  P_.bangs(p, 'hair');
  P_.eyes(p); P_.blush(p, 'f6757a'); P_.mouth(p, 'a22633', true);
  return p;
};

F.child = () => {
  const p = new FlatPortrait({ bg: '63c74d', shape: { type: 'half', color: '3e8948', x: 24, y: 40, r: 26 } });
  p.mat('hair', 'b86f50', '733e39', 0.6).mat('dress', 'feae34', 'd77643').mat('skin', SKIN[0]).mat('ribbon', 'e43b44');
  p.ell('hair', 35, 28, 3.4, 6.5);
  P_.hairBack(p, 'hair');
  P_.bust(p, 'dress', 0.8);
  p.poly('ribbon', [[21, 34.5], [28.6, 34.5], [24.8, 38]]);
  P_.neck(p, 'skin');
  P_.face(p, 'skin', { y: 25.8, rx: 7.4, ry: 8.1 });
  P_.bangs(p, 'hair');
  p.ell('ribbon', 33, 18.5, 2.2, 1.8);
  P_.eyes(p); P_.blush(p, 'f6757a'); P_.mouth(p, 'a22633', true);
  return p;
};

F.guard = () => {
  const p = new FlatPortrait({ bg: 'be4a2f', shape: { type: 'square', color: 'a22633', x: 24, y: 22, r: 18 } });
  p.mat('steel', 'c0cbdc', '8b9bb4', 0.55).mat('gold', 'feae34').mat('skin', TAN[0]).mat('beard', '262b44').mat('leather', 'b86f50', '733e39').mat('tan', 'e4a672', 'd77643').mat('wood', '733e39');
  p.line('wood', 42.5, 48, 42.5, 8, 1.8); p.poly('steel', [[40.8, 9], [42.5, 1.5], [44.2, 9]]);
  P_.bust(p, 'tan');
  p.poly('leather', [[12.5, 36.5], [37, 36.5], [38, 48], [11.5, 48]]);
  P_.neck(p, 'skin'); P_.ears(p, 'skin');
  P_.face(p, 'skin');
  P_.beard(p, 'beard');
  p.ell('steel', 24.8, 21, 9, 7, (x, y) => y < 21.6);
  p.poly('gold', [[15.4, 20.2], [34.2, 20.2], [34.2, 22.4], [15.4, 22.4]]);
  p.poly('gold', [[22.9, 14.8], [24.8, 8.8], [26.7, 14.8]]);
  P_.eyes(p);
  return p;
};

F.villager_m = () => {
  const p = new FlatPortrait({ bg: 'b86f50', shape: { type: 'disc', color: 'd77643', x: 24, y: 19, r: 17 } });
  p.mat('cream', 'ead4aa', 'e4a672').mat('skin', TAN[0]).mat('turban', 'ffffff', 'c0cbdc', 0.6).mat('band', 'c0cbdc').mat('belt', '733e39');
  P_.bust(p, 'cream');
  p.poly('belt', [[4, 45.5], [44, 45.5], [44.6, 48], [3.4, 48]]);
  P_.vneck(p, 'skin');
  P_.neck(p, 'skin'); P_.ears(p, 'skin');
  P_.face(p, 'skin');
  P_.turban(p, 'turban', 'band');
  P_.brows(p, '262b44', -2);
  P_.eyes(p); P_.mouth(p, '733e39');
  return p;
};

F.villager_f = () => {
  const p = new FlatPortrait({ bg: 'c0cbdc', shape: { type: 'disc', color: '8b9bb4', x: 30, y: 21, r: 16 } });
  p.mat('scarf', 'e43b44', 'a22633', 0.58).mat('dress', 'e4a672', 'b86f50').mat('skin', SKIN[0]).mat('hair', '733e39');
  p.ell('scarf', 24.8, 25, 10.4, 11.6);
  P_.bust(p, 'dress', 0.95);
  p.poly('scarf', [[13.5, 29], [36, 29], [39.5, 40], [10, 40]]);
  P_.neck(p, 'skin');
  P_.face(p, 'skin');
  p.poly('hair', [[18, 22.5], [20, 19.5], [29.6, 19.5], [31.6, 22.5], [28, 21.2], [21.6, 21.2]]);
  p.ell('scarf', 24.8, 19.3, 8.9, 5, (x, y) => y < 20.4);
  P_.eyes(p); P_.blush(p, 'f6757a'); P_.mouth(p, 'a22633', true);
  return p;
};

F.generic = () => {
  const p = new FlatPortrait({ bg: '3a4466', shape: { type: 'disc', color: '262b44', x: 24, y: 24, r: 18 } });
  p.mat('cloak', '733e39', '3e2731', 0.55).mat('dark', '181425');
  P_.bust(p, 'cloak');
  P_.hood(p, 'cloak', 'dark');
  p.post((c) => { c.fillRect(20, 26, 2, 1, H('fee761')); c.fillRect(27, 26, 2, 1, H('fee761')); });
  return p;
};

// ---------------------------------------------------------------- creatures
function scorpionFace(look) {
  const p = new FlatPortrait({ bg: look.bg, shape: look.shape });
  p.mat('shell', look.lit, look.sh, 0.62).mat('seg', look.lit).mat('seg2', look.sh).mat('dark', look.dark).mat('sting', look.sting).mat('cut', null);
  const k = look.claw ?? 1;
  // segmented tail arcing over the back (alternating flat tones so segments read)
  const tail = [[31, 36, 4], [36, 30.5, 3.9], [38.2, 23.8, 3.7], [36.4, 17.2, 3.5], [31.6, 12.8, 3.3], [25.8, 11, 3]];
  tail.forEach(([x, y, r], i) => p.ell(i % 2 ? 'seg2' : 'seg', x, y, r));
  p.ell('sting', 21.2, 12, 2.6, 2.2);
  p.poly('sting', [[19.4, 12.8], [15, 17.8], [19, 15.2]]);
  // legs
  for (const s2 of [-1, 1]) for (let i = 0; i < 3; i++) p.line('dark', 24 + s2 * 8, 42 + i, 24 + s2 * (15 + i * 2), 47.5, 1.6);
  // big pincers raised at the sides
  for (const s2 of [-1, 1]) {
    const cx = 24 + s2 * 15 * k, cy = 25;
    p.line('dark', 24 + s2 * 7, 37, cx - s2 * 0.5, cy + 5, 2.6);
    p.ell('shell', cx, cy, 5.6 * k, 5 * k);
    p.poly('cut', [[cx, cy - 0.6 * k], [cx + s2 * 2 * k, cy - 6 * k], [cx + s2 * 6.5 * k, cy - 6 * k], [cx + s2 * 6.5 * k, cy - 1.6 * k]]); // pincer gap
  }
  p.ell('shell', 24, 41, 12, 6.5);
  p.ell('shell', 24, 37.6, 7.6, 5);
  if (look.crown) for (const [x, h] of [[19.5, 5], [24, 6.5], [28.5, 5]]) p.poly('sting', [[x - 1.6, 35], [x, 35 - h], [x + 1.6, 35]]);
  p.post((c) => { c.fillRect(21, 36, 2, 1, H(look.eyes)); c.fillRect(26, 36, 2, 1, H(look.eyes)); });
  return p;
}
F.enemy_scorpion = () => scorpionFace({ bg: '193c3e', shape: { type: 'half', color: '265c42', x: 24, y: 46, r: 21 }, lit: 'e4a672', sh: 'b86f50', dark: '733e39', sting: '3e2731', eyes: '181425' });
F.enemy_emperor_scorpion = () => scorpionFace({ bg: '68386c', shape: { type: 'half', color: 'b55088', x: 24, y: 46, r: 22 }, lit: 'e43b44', sh: 'a22633', dark: '181425', sting: 'feae34', eyes: 'fee761', crown: true, claw: 1.08 });

F.enemy_condor = () => {
  const p = new FlatPortrait({ bg: '0099db', shape: { type: 'disc', color: 'feae34', x: 36, y: 12, r: 9 } });
  p.mat('feather', '733e39', '3e2731', 0.55).mat('white', 'ffffff', 'c0cbdc', 0.7).mat('head', 'f6757a', 'be4a2f', 0.62).mat('beak', 'c0cbdc', '8b9bb4').mat('ink', '181425').mat('comb', 'a22633');
  p.poly('feather', [[0, 18], [9, 24], [18, 33], [14, 44], [5, 42], [2, 36], [0, 34]]);
  p.poly('feather', [[48, 18], [39, 24], [30, 33], [34, 44], [43, 42], [46, 36], [48, 34]]);
  for (const s of [-1, 1]) for (let i = 0; i < 3; i++) p.line('feather', 24 + s * 20, 22 + i * 5, 24 + s * 24.5, 17 + i * 6, 2.2);
  p.poly('feather', [[7, 48], [11, 38], [19, 33], [30, 33], [38, 38], [42, 48]]);
  p.ell('white', 24.8, 33.2, 8.4, 4.4);
  p.rect('head', 22, 26, 5.6, 6);
  p.ell('head', 24.8, 23, 6.4, 7);
  p.ell('comb', 23.4, 16.8, 3.2, 1.7);
  p.poly('beak', [[28.4, 21.4], [35.4, 23], [36.6, 27.6], [34, 26.2], [28.8, 27.2]]);
  p.poly('ink', [[34.2, 24.2], [36.6, 27.6], [34.8, 27]]);
  p.post((c) => { c.fillRect(25, 21, 2, 2, H('181425')); c.set(25, 21, H('ffffff')); });
  return p;
};

// ---------------------------------------------------------------- harbor folk
/** recolour pixels of the given colours in horizontal bands (striped cloth) */
const stripes = (from, to, y0, period, h, yMax = S) => (c) => {
  const map = new Map(from.map((f, i) => [H(f) >>> 0, H(to[i])]));
  for (let y = y0; y < yMax; y++) if ((y - y0) % period < h) for (let x = 0; x < S; x++) { const t = map.get(c.get(x, y) >>> 0); if (t != null) c.set(x, y, t); }
};

F.captain = () => {
  const p = new FlatPortrait({ bg: '124e89', shape: { type: 'disc', color: '0099db', x: 25, y: 22, r: 17 } });
  p.mat('coat', '3a4466', '262b44', 0.55).mat('gold', 'feae34').mat('shirt', 'ffffff', 'c0cbdc', 0.65).mat('skin', SKIN[0])
    .mat('hair', 'be4a2f', 'a22633', 0.6).mat('hat', '3a4466', '262b44', 0.6).mat('hatD', '181425');
  p.poly('hair', [[31, 26], [36.5, 27], [38.5, 36], [36, 43], [33, 38], [33, 30]]); // ponytail over the shoulder
  P_.hairBack(p, 'hair');
  P_.bust(p, 'coat');
  p.poly('shirt', [[19.2, 34], [30.4, 34], [28.2, 48], [21.4, 48]]);
  p.line('gold', 19.2, 34, 21.6, 48, 1.8); p.line('gold', 30.4, 34, 28, 48, 1.8);
  p.poly('shirt', [[21, 34], [24.8, 38.5], [28.6, 34], [26.8, 32], [22.8, 32]]); // collar
  P_.neck(p, 'skin');
  P_.face(p, 'skin');
  p.poly('hair', [[17, 24], [17.6, 19.5], [21.5, 17.6], [29, 17.6], [32.4, 19.5], [32.8, 24], [30.2, 20.8], [24, 21.8], [19.6, 20.6]]);
  // tricorn: crown + upturned brim, front corner pointing down at the centre
  p.ell('hat', 24.8, 13.8, 8, 5.4);
  p.poly('hat', [[7.2, 19.6], [11, 12.6], [17.5, 14.6], [24.8, 13.4], [32, 14.6], [38.6, 12.6], [42.4, 19.6], [33.6, 18.4], [24.8, 23], [16, 18.4]]);
  p.poly('gold', [[7.2, 19.6], [16, 18.4], [24.8, 23], [33.6, 18.4], [42.4, 19.6], [33.8, 19.8], [24.8, 24.6], [15.8, 19.8]]);
  p.poly('hatD', [[16.6, 16.2], [24.8, 15.2], [33, 16.2], [33.4, 17.4], [24.8, 20.4], [16.2, 17.4]]); // shadowed inside of the front brim
  p.post((c) => { for (const [x, y] of [[16, 39], [15, 43], [33, 39], [34, 43]]) c.fillRect(x, y, 2, 2, H('feae34')); });
  P_.brows(p, 'a22633', -2);
  P_.eyes(p); P_.mouth(p, 'a22633', true); P_.nose(p, 'c28569');
  return p;
};

F.sailor = () => {
  const p = new FlatPortrait({ bg: 'fee761', shape: { type: 'disc', color: 'feae34', x: 30, y: 20, r: 16 } });
  p.mat('shirt', 'ffffff', 'c0cbdc', 0.6).mat('skin', TAN[0]).mat('band', 'e43b44', 'a22633', 0.6).mat('hair', '262b44').mat('knot', 'a22633');
  P_.bust(p, 'shirt');
  p.poly('skin', [[20, 34], [29.6, 34], [27.8, 36.4], [21.8, 36.4]]); // boat neck
  P_.neck(p, 'skin'); P_.ears(p, 'skin');
  p.ell('hair', 17.6, 25, 1.9, 4); p.ell('hair', 32, 25, 1.9, 4);
  P_.face(p, 'skin');
  // bandana: tight over the crown, knot + tails at the side
  p.ell('band', 24.8, 21.4, 8.6, 6.9, (x, y) => y < 22.4);
  p.poly('band', [[16.4, 21], [33.2, 21], [33, 22.8], [16.6, 22.8]]);
  p.ell('knot', 34.6, 20.5, 2.4, 2.2);
  p.poly('band', [[35, 21], [40.4, 27.5], [37.6, 28.6], [34.2, 22.6]]); p.poly('knot', [[35.6, 21.4], [38.6, 29.6], [36.6, 30], [34.6, 22.6]]);
  p.post(stripes(['ffffff', 'c0cbdc'], ['0099db', '124e89'], 37, 4, 2));
  P_.brows(p, '262b44', -2);
  P_.eyes(p); P_.mouth(p, '733e39', true); P_.nose(p, '9a5e4a');
  p.post((c) => { for (const [x, y] of [[21, 33], [23, 34], [26, 34], [28, 33]]) c.set(x, y, H('9a5e4a')); }); // stubble
  return p;
};

F.sailor_b = () => {
  const p = new FlatPortrait({ bg: '193c3e', shape: { type: 'ring', color: '265c42', x: 25, y: 22, r: 18 } });
  p.mat('shirt', 'ead4aa', 'e4a672').mat('vest', 'b86f50', '733e39', 0.55).mat('skin', TAN[0], TAN[1], 0.66).mat('grey', 'c0cbdc', '8b9bb4', 0.66)
    .mat('cap', '5a6988', '3a4466', 0.6).mat('rim', '8b9bb4', '5a6988', 0.6).mat('dark', '3e2731');
  P_.bust(p, 'shirt', 1.05);
  p.poly('vest', [[2.6, 48], [5.8, 38.6], [13, 34.6], [20, 34], [21.2, 48]]); p.poly('vest', [[28.8, 34], [36, 34.6], [43.4, 38.6], [46.6, 48], [28.2, 48]]);
  p.post((c) => { c.fillRect(19, 40, 1, 1, H('3e2731')); c.fillRect(19, 44, 1, 1, H('3e2731')); });
  P_.neck(p, 'skin'); P_.ears(p, 'skin');
  P_.face(p, 'skin');
  p.ell('grey', 17.8, 24.4, 1.8, 3.2); p.ell('grey', 31.8, 24.4, 1.8, 3.2);
  P_.beard(p, 'grey');
  // knit cap with a rolled rim
  p.ell('cap', 24.8, 19.8, 8.6, 8.2, (x, y) => y < 20);
  p.poly('rim', [[16, 18], [33.6, 18], [33.8, 21.8], [15.8, 21.8]]);
  p.post((c) => { for (let x = 18; x < 33; x += 3) c.fillRect(x, 13, 1, 4, H('3a4466')); }); // knit ribs
  p.post((c) => { c.fillRect(19, 23, 4, 1, H('c0cbdc')); c.fillRect(27, 23, 4, 1, H('c0cbdc')); });
  P_.eyes(p, '181425', { h: 1, dy: 0.6 });
  P_.nose(p, '9a5e4a');
  return p;
};

// ---------------------------------------------------------------- elves (long pointed ears)
function elfEars(p, mat, inner, { y = 25, len = 1 } = {}) {
  p.poly(mat, [[18.4, y - 2.4], [18 - 10 * len, y - 9 * len], [18.6, y + 3.6]]);
  p.poly(mat, [[31.2, y - 2.4], [31.6 + 10 * len, y - 9 * len], [31, y + 3.6]]);
  if (inner) { p.poly(inner, [[18, y - 0.8], [15 - 4 * len, y - 4.8 * len], [18.2, y + 1.8]]); p.poly(inner, [[31.6, y - 0.8], [34.6 + 4 * len, y - 4.8 * len], [31.4, y + 1.8]]); }
}

F.elf = () => {
  const p = new FlatPortrait({ bg: '193c3e', shape: { type: 'disc', color: '265c42', x: 26, y: 21, r: 17 } });
  p.mat('tunic', '63c74d', '3e8948', 0.58).mat('cape', '3e8948', '265c42', 0.55).mat('skin', SKIN[0]).mat('earIn', 'c28569')
    .mat('hair', 'feae34', 'd77643', 0.62).mat('belt', '733e39');
  P_.cape(p, 'cape');
  P_.bust(p, 'tunic', 0.86);
  p.poly('cape', [[14, 33], [24.8, 40], [35.6, 33], [33, 31.5], [24.8, 36], [16.6, 31.5]]); // leaf collar
  p.poly('cape', [[17, 35], [20.6, 39.4], [16, 39]]); p.poly('cape', [[32.6, 35], [29, 39.4], [33.6, 39]]);
  p.poly('belt', [[8.5, 45.5], [41, 45.5], [41.6, 48], [8, 48]]);
  P_.hairBack(p, 'hair');
  P_.neck(p, 'skin');
  elfEars(p, 'skin', 'earIn');
  P_.face(p, 'skin', { y: 25.8, rx: 7.3, ry: 8.1 });
  P_.bangs(p, 'hair');
  P_.eyes(p); P_.mouth(p, 'a22633', true); P_.blush(p, 'f6757a');
  return p;
};

F.elf_b = () => {
  const p = new FlatPortrait({ bg: '8a4f8e', shape: { type: 'ring', color: 'b55088', x: 25, y: 23, r: 18 } });
  p.mat('dress', 'b55088', '68386c', 0.58).mat('trim', 'f6757a').mat('skin', SKIN[0]).mat('earIn', 'c28569')
    .mat('hair', 'ffffff', 'c0cbdc', 0.62).mat('vine', '3e8948').mat('flower', 'f6757a').mat('flowerW', 'ffffff');
  P_.hairBack(p, 'hair', true);
  P_.bust(p, 'dress', 0.9);
  p.poly('trim', [[20.4, 34], [29.2, 34], [24.8, 39.5]]);
  P_.neck(p, 'skin');
  elfEars(p, 'skin', 'earIn');
  P_.face(p, 'skin');
  P_.bangs(p, 'hair');
  // flower circlet
  p.poly('vine', [[16.6, 18.8], [24.8, 16.4], [33, 18.8], [33, 20], [24.8, 17.8], [16.6, 20]]);
  for (const [x, y, m] of [[18, 18.6, 'flower'], [22.4, 17, 'flowerW'], [27.2, 17, 'flower'], [31.6, 18.6, 'flowerW']]) p.ell(m, x, y, 1.9, 1.7);
  p.post((c) => { for (const [x, y] of [[18, 18], [22, 16], [27, 16], [31, 18]]) c.set(x, y, H('feae34')); });
  P_.eyes(p, '68386c'); P_.mouth(p, 'a22633', true); P_.blush(p, 'f6757a');
  return p;
};

F.elf_elder = () => {
  const p = new FlatPortrait({ bg: '265c42', shape: { type: 'ring', color: 'feae34', x: 25, y: 22, r: 18, w: 3 } });
  p.mat('robe', '7fd1c7', '3d8f8a', 0.55).mat('gold', 'feae34').mat('skin', SKIN[0]).mat('earIn', 'c28569')
    .mat('hair', 'ffffff', 'c0cbdc', 0.78).mat('hairF', 'ffffff').mat('wood', '733e39').mat('leaf', '63c74d', '3e8948', 0.5).mat('gem', '63c74d');
  p.line('wood', 42.6, 48, 42.6, 11, 2);
  p.poly('leaf', [[42.6, 11.5], [38.4, 6.6], [39.6, 2.6], [43.4, 6]]); p.poly('leaf', [[43, 13], [47.6, 9.6], [46.4, 14.6]]);
  P_.hairBack(p, 'hair', true);
  P_.bust(p, 'robe');
  p.poly('gold', [[19.2, 34], [30.4, 34], [24.8, 42.5]]);
  p.poly('robe', [[21.6, 34], [28, 34], [24.8, 39]]);
  P_.neck(p, 'skin');
  elfEars(p, 'skin', 'earIn', { len: 1.05 });
  P_.face(p, 'skin');
  p.poly('hairF', [[17, 23.4], [17.6, 18.6], [21.4, 16.4], [28.2, 16.4], [32, 18.6], [32.6, 23.4], [30.8, 20.2], [24.8, 19.4], [18.8, 20.2]]);
  p.poly('gold', [[16.8, 19.4], [24.8, 17.2], [32.8, 19.4], [32.8, 20.8], [24.8, 18.6], [16.8, 20.8]]);
  p.ell('gem', 24.8, 18.4, 1.5, 1.5);
  p.post((c) => { c.fillRect(19, 23, 4, 1, H('ffffff')); c.fillRect(27, 23, 4, 1, H('ffffff')); c.set(19, 31, H('c28569')); c.set(30, 31, H('c28569')); });
  P_.eyes(p, '265c42', { h: 1, dy: 0.6 });
  P_.mouth(p, 'c28569'); P_.nose(p, 'c28569');
  return p;
};

F.elf_mage = () => {
  const p = new FlatPortrait({ bg: '181425', shape: { type: 'diamond', color: '262b44', x: 25, y: 23, r: 20 } });
  p.mat('robe', '124e89', '262b44', 0.55).mat('inner', '181425').mat('skin', SKIN[0]).mat('earIn', 'c28569')
    .mat('hair', 'c0cbdc', '8b9bb4', 0.65).mat('wood', '733e39').mat('orb', '2ce8f5', '0099db', 0.55).mat('gold', 'feae34');
  p.line('wood', 5.6, 48, 5.6, 15, 2); p.ell('orb', 5.6, 11.6, 3.5);
  P_.bust(p, 'robe', 0.92);
  p.poly('gold', [[19.6, 34], [30, 34], [24.8, 41]]); p.poly('robe', [[21.8, 34], [27.8, 34], [24.8, 38]]);
  P_.hood(p, 'robe', 'inner');
  elfEars(p, 'skin', 'earIn', { y: 26, len: 0.95 }); // poking out through slits in the hood
  P_.face(p, 'skin', { y: 26.2, rx: 6.4, ry: 7.6 });
  p.poly('hair', [[18.4, 25], [19.2, 20], [22.4, 18.4], [27.4, 18.4], [30.6, 20], [31.4, 25], [29.4, 21.8], [26, 21.2], [24.2, 22.6], [21.2, 21.6]]);
  P_.stars(p, 'feae34', [[14, 19], [36, 20], [11, 43], [38, 44], [24, 12]]);
  p.post((c) => { c.set(4, 10, H('ffffff')); c.set(5, 10, H('ffffff')); });
  P_.eyes(p, '124e89', { dy: 0.5 }); P_.mouth(p, 'a22633');
  return p;
};

// ---------------------------------------------------------------- undead
F.enemy_skeleton = () => {
  const p = new FlatPortrait({ bg: '45283c', shape: { type: 'half', color: '68386c', x: 24, y: 44, r: 24 } });
  p.mat('bone', 'f4e6c8', 'c0cbdc', 0.62).mat('boneD', '8b9bb4').mat('void', '181425').mat('rust', 'be4a2f', '733e39', 0.55).mat('rag', '3e2731');
  // ragged cloak scraps + bony shoulders, collarbones and ribs
  p.poly('rag', [[2, 48], [5, 40], [12, 36], [37, 36], [44, 40], [47, 48], [42, 45], [38, 48], [33, 44], [29, 48], [20, 48], [16, 44], [11, 48], [7, 45]]);
  p.ell('bone', 9.6, 39.6, 4.2, 3.6); p.ell('bone', 40, 39.6, 4.2, 3.6);
  p.line('bone', 24.8, 36, 11, 37.2, 1.8); p.line('bone', 24.8, 36, 38.6, 37.2, 1.8);
  p.rect('bone', 23.6, 34, 2.4, 14);
  for (let i = 0; i < 3; i++) { const y = 39.6 + i * 3; p.line('bone', 24.8, y, 16 + i, y + 2.4, 1.6); p.line('bone', 24.8, y, 33.6 - i, y + 2.4, 1.6); }
  // skull: cranium + narrower jaw
  p.poly('bone', [[17.6, 27], [32, 27], [31, 33.5], [27.6, 36], [22, 36], [18.6, 33.5]]);
  p.ell('bone', 24.8, 22.8, 9, 9.2);
  p.ell('boneD', 17.8, 29.4, 1.2, 1.8); p.ell('boneD', 31.8, 29.4, 1.2, 1.8); // cheekbone hollows
  p.ell('void', 20.6, 25.6, 2.9, 3.1); p.ell('void', 29, 25.6, 2.9, 3.1);
  p.poly('void', [[23.8, 29], [25.8, 29], [24.8, 31.4]]);
  // dented rusty helmet fragment
  p.ell('rust', 24.8, 22.4, 9.6, 9.6, (x, y) => y < 17.2 + (x - 16) * 0.12 && x > 15.5 && x < 31);
  p.post((c) => {
    const V = H('181425'), G = H('ff0044'), Y = H('fee761');
    c.fillRect(20, 33, 10, 1, V); for (let x = 21; x < 30; x += 2) c.fillRect(x, 32, 1, 3, V); // teeth
    c.set(33, 17, V); c.set(32, 18, V); c.set(32, 19, V); c.set(31, 20, V); // crack
    for (const x of [20, 28]) { c.fillRect(x, 25, 2, 2, G); c.set(x + (x < 24 ? 0 : 1), 25, Y); } // eerie glow
  });
  return p;
};

// ---------------------------------------------------------------- Temple Mountain monks
/** prayer-bead / lei loop hanging around the neck: dots along the lower half of an ellipse */
function neckLoop(cx = 24.8, cy = 32.5, rx = 7.2, ry = 7.4, n = 11) {
  const pts = [];
  for (let i = 0; i < n; i++) { const a = Math.PI * (0.08 + 0.84 * (i / (n - 1))); pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]); }
  return pts;
}
function monkFace({ bg, shape, outer, under, skin, bust = 1, eyes = { h: 1, dy: 0.5 }, smile = false }) {
  const p = new FlatPortrait({ bg, shape });
  p.mat('under', under[0], under[1], 0.58).mat('outer', outer[0], outer[1], 0.58).mat('edge', outer[1]).mat('skin', skin[0], skin[1], 0.72);
  P_.bust(p, 'under', bust);
  // outer robe draped over the (viewer's right) shoulder, running diagonally across the chest; folded edge
  const X = (x) => 24 + (x - 24) * bust;
  p.poly('outer', [[X(45), 48], [X(42), 39], [X(35), 35], [X(28), 34], [25, 36.5], [13.5, 48]]);
  p.line('edge', 25.4, 36.4, 14.2, 48, 1.3);
  P_.neck(p, 'skin'); P_.ears(p, 'skin');
  P_.face(p, 'skin', { y: 24.8, rx: 7.3, ry: 8.9 });
  p.post((c) => neckLoop(24.8, 32.5, 7.4, 7.6, 8).forEach(([x, y]) => { c.fillRect(Math.round(x - 1), Math.round(y - 1), 2, 2, H('b86f50')); c.set(Math.round(x), Math.round(y), H('3e2731')); })); // prayer beads
  P_.eyes(p, '3e2731', eyes);
  P_.mouth(p, '733e39', smile);
  P_.nose(p, skin[1]);
  return p;
}
F.monk = () => {
  const p = monkFace({ bg: '3e8948', shape: { type: 'disc', color: '63c74d', x: 30, y: 20, r: 16 }, outer: ['f77622', 'be4a2f'], under: ['a22633', '733e39'], skin: [TAN[0], '9a5e4a'] });
  P_.brows(p, '3e2731', -2);
  return p;
};
F.monk_b = () => {
  const p = monkFace({ bg: '124e89', shape: { type: 'ring', color: '0099db', x: 25, y: 22, r: 18 }, outer: ['a22633', '733e39'], under: ['feae34', 'd77643'], skin: [SKIN[0], 'c28569'], bust: 0.9, eyes: {}, smile: true });
  P_.brows(p, '733e39', -3, 2);
  return p;
};
F.monk_old = () => {
  const p = new FlatPortrait({ bg: 'a22633', shape: { type: 'ring', color: 'feae34', x: 25, y: 22, r: 18, w: 3 } });
  p.mat('robe', 'feae34', 'd77643', 0.58).mat('drape', 'e43b44', 'a22633', 0.58).mat('skin', SKIN[0], 'c28569', 0.75).mat('white', 'ffffff', 'c0cbdc', 0.7)
    .mat('wood', '733e39').mat('knob', 'b86f50', '733e39', 0.5);
  p.line('wood', 42.6, 48, 42.6, 10, 2); p.ell('knob', 42.6, 9, 2.6, 2.4);
  P_.bust(p, 'robe');
  p.poly('drape', [[45, 48], [42, 39], [35, 35], [28, 34], [25, 36.5], [13.5, 48]]);
  P_.neck(p, 'skin'); P_.ears(p, 'skin');
  P_.face(p, 'skin', { y: 24.8, rx: 7.3, ry: 8.9 });
  P_.beard(p, 'white', true);
  // long white eyebrows drooping past the eyes
  p.poly('white', [[18.6, 22], [23.2, 21.8], [22.6, 23.2], [18.4, 24], [15.6, 27.4], [15.8, 24.6]]);
  p.poly('white', [[31, 22], [26.4, 21.8], [27, 23.2], [31.2, 24], [34, 27.4], [33.8, 24.6]]);
  p.post((c) => { c.fillRect(21, 18, 7, 1, H('c28569')); c.fillRect(22, 20, 5, 1, H('c28569')); }); // forehead creases
  P_.eyes(p, '3e2731', { h: 1, dy: 0.8 });
  P_.nose(p, 'c28569');
  return p;
};

// ---------------------------------------------------------------- island folk
F.islander = () => {
  const p = new FlatPortrait({ bg: '0099db', shape: { type: 'sun', color: 'fee761', x: 31, y: 21, r: 15, bg: '0099db' } });
  p.mat('dress', '3e8948', '265c42', 0.58).mat('zig', 'f77622').mat('skin', 'b86f50', '733e39', 0.7).mat('hair', 'c0cbdc', '8b9bb4', 0.6)
    .mat('pink', 'f6757a').mat('whiteF', 'ffffff').mat('yellowF', 'feae34').mat('bud', 'e43b44');
  p.ell('hair', 24.8, 12.8, 5, 4); // bun
  P_.hairBack(p, 'hair');
  P_.bust(p, 'dress', 1.02);
  for (const y of [39.5, 44.5]) p.poly('zig', Array.from({ length: 11 }, (_, i) => [3 + i * 4.3, y + (i % 2 ? -1.6 : 1.6)]).concat(Array.from({ length: 11 }, (_, i) => [3 + (10 - i) * 4.3, y + 1.4 + ((10 - i) % 2 ? -1.6 : 1.6)])),
    (x, y) => y > 34 + Math.max(0, Math.abs(x - 24) - 10) * 0.6);
  P_.neck(p, 'skin'); P_.ears(p, 'skin');
  P_.face(p, 'skin');
  p.poly('hair', [[17, 23.4], [17.6, 18.8], [21.4, 16.6], [28.2, 16.6], [32, 18.8], [32.6, 23.4], [30.4, 19.8], [24.8, 18.8], [19.2, 19.8]]); // hair pulled back
  // flower lei round the neck
  const fl = ['pink', 'whiteF', 'yellowF'];
  neckLoop(24.8, 31.8, 8.6, 6.8, 8).forEach(([x, y], i) => p.ell(fl[i % 3], x, y, 2.1, 1.8));
  p.post((c) => neckLoop(24.8, 31.8, 8.6, 6.8, 8).forEach(([x, y]) => c.set(Math.round(x - 0.5), Math.round(y - 0.5), H('e43b44'))));
  P_.brows(p, '8b9bb4', -2);
  P_.eyes(p, '3e2731', { h: 1, dy: 0.5 });
  P_.mouth(p, '3e2731', true); P_.nose(p, '733e39');
  p.post((c) => { c.set(18, 27, H('733e39')); c.set(31, 27, H('733e39')); c.set(21, 32, H('9a5e4a')); c.set(28, 32, H('9a5e4a')); }); // crow's feet, smile lines
  return p;
};

// ---------------------------------------------------------------- sea creatures
F.enemy_fishfolk = () => {
  const p = new FlatPortrait({ bg: '193c3e', shape: { type: 'disc', color: '124e89', x: 24, y: 26, r: 19 } });
  p.mat('scale', '2a9d8f', '1d5f6b', 0.55).mat('belly', 'a8e4c8', '6cc0a4', 0.6).mat('fin', 'f77622', 'be4a2f', 0.55).mat('ray', 'be4a2f')
    .mat('eye', 'ffffff', 'c0cbdc', 0.7).mat('lip', '8fd3b8').mat('mouth', '181425').mat('kelp', '3e8948', '265c42', 0.5)
    .mat('wood', '733e39').mat('coral', 'f6757a', 'e43b44', 0.55);
  // coral-tipped spear
  p.line('wood', 42.6, 48, 42.6, 12, 2);
  p.line('coral', 42.6, 13, 42.6, 3, 2); p.line('coral', 42.6, 11, 38.6, 5.6, 1.8); p.line('coral', 42.6, 9, 46.4, 4.6, 1.8);
  p.ell('coral', 42.6, 2.6, 1.6); p.ell('coral', 38.4, 5.2, 1.4); p.ell('coral', 46.6, 4.2, 1.4);
  // shoulders with spiky fins, pale belly, kelp strands over the shoulder
  p.poly('fin', [[3, 40], [0.5, 31], [6, 36.5], [5, 29.5], [10, 35.5]]); p.poly('fin', [[45, 40], [47.5, 31], [42, 36.5], [43, 29.5], [38, 35.5]]);
  P_.bust(p, 'scale');
  p.ell('belly', 24.8, 44, 7.4, 8.6);
  p.poly('kelp', [[33, 34.5], [36, 34.5], [30, 48], [26.6, 48]]);
  // crest: spiny fin over the crown, dark rays
  p.poly('fin', [[16.4, 22], [15.4, 13.4], [18.6, 16.8], [19.4, 9.6], [22.4, 14.4], [24.8, 6.4], [27.2, 14.4], [30.2, 9.6], [31, 16.8], [34.2, 13.4], [33.2, 22]]);
  for (const x of [19.4, 24.8, 30.2]) p.line('ray', x, 19, x, x === 24.8 ? 8.6 : 11.6, 1);
  // gill fins at the sides of the head
  p.poly('fin', [[16.5, 26], [10.5, 24], [12, 29.6], [16.8, 31]]); p.poly('fin', [[33.1, 26], [39.1, 24], [37.6, 29.6], [32.8, 31]]);
  // broad fish head, wide lipped mouth, big round eyes set far apart
  p.ell('scale', 24.8, 25.6, 9, 9.2);
  p.ell('belly', 24.8, 31.4, 6.6, 3.6);
  p.poly('lip', [[17.8, 29.4], [31.8, 29.4], [30, 32.2], [19.6, 32.2]]);
  p.poly('mouth', [[18.6, 30.2], [31, 30.2], [29.6, 31.3], [20, 31.3]]);
  p.ell('eye', 18.2, 23.4, 3.6, 3.8); p.ell('eye', 31.4, 23.4, 3.6, 3.8);
  p.post((c) => {
    const I = H('181425'), sh = H('1d5f6b');
    for (const x of [18, 30]) { c.fillRect(x, 23, 2, 3, I); c.set(x + (x < 24 ? 0 : 1), 23, H('ffffff')); }
    for (const [x, y] of [[20, 35], [28, 35], [16, 39], [32, 39], [12, 42], [36, 42]]) c.fillRect(x, y, 2, 1, sh); // scale marks
    for (const [x, y] of [[4, 20], [8, 12], [6, 5], [38, 23]]) { c.set(x, y, H('2ce8f5')); c.set(x + 1, y - 1, H('2ce8f5')); } // bubbles
  });
  return p;
};

// ---------------------------------------------------------------- undead (final boss servants)
F.enemy_bone_acolyte = () => {
  const p = new FlatPortrait({ bg: '181425', shape: { type: 'disc', color: '193c3e', x: 24, y: 24, r: 19 } });
  p.mat('robe', '265c42', '193c3e', 0.55).mat('inner', '181425').mat('bone', 'f4e6c8', 'c0cbdc', 0.62).mat('boneD', '8b9bb4').mat('void', '181425')
    .mat('staff', 'c0cbdc', '8b9bb4', 0.5).mat('ghost', 'b6f5a0', '63c74d', 0.5).mat('ghostV', '265c42');
  // bone staff with a glowing green skull
  p.line('staff', 5.4, 48, 5.4, 15, 2); p.ell('staff', 5.4, 15.6, 1.8, 1.2);
  p.ell('ghost', 5.6, 9.6, 4.2, 4); p.rect('ghost', 3.4, 11.6, 4.6, 3.2);
  p.ell('ghostV', 4, 9.8, 1.1, 1.2); p.ell('ghostV', 7.4, 9.8, 1.1, 1.2);
  // tattered hooded robe
  p.poly('robe', [[2, 48], [5, 39], [12, 35], [37, 35], [44, 39], [47, 48], [43, 45], [39, 48], [35, 44.5], [30, 48], [19, 48], [15, 44.5], [10, 48], [6, 45]]);
  P_.hood(p, 'robe', 'inner');
  // skull inside the hood
  p.poly('bone', [[19, 27.5], [30.6, 27.5], [29.8, 32.8], [27.2, 35], [22.4, 35], [19.8, 32.8]]);
  p.ell('bone', 24.8, 24.4, 7, 7.4);
  p.ell('boneD', 19.2, 29.4, 1, 1.6); p.ell('boneD', 30.4, 29.4, 1, 1.6);
  p.ell('void', 21.6, 26.2, 2.3, 2.5); p.ell('void', 28, 26.2, 2.3, 2.5);
  p.poly('void', [[24, 29.2], [25.6, 29.2], [24.8, 31.2]]);
  p.post((c) => {
    const V = H('181425'), G = H('63c74d'), W = H('b6f5a0');
    c.fillRect(21, 33, 8, 1, V); for (let x = 22; x < 29; x += 2) c.fillRect(x, 32, 1, 3, V); // teeth
    for (const x of [21, 27]) { c.fillRect(x, 26, 2, 2, G); c.set(x + (x < 24 ? 0 : 1), 26, W); } // green glow in the sockets
    for (const [x, y] of [[11, 8], [14, 4], [2, 3], [9, 17], [40, 12], [43, 20]]) c.set(x, y, G); // drifting motes
  });
  return p;
};

// ---------------------------------------------------------------- the heroes' fears (shadow twins)
// Render the hero portrait, key out its background, recolour the figure by brightness onto a violet-black
// ramp, set it on a dark backdrop with a magenta disc, add a violet rim + wisps and glowing red eyes.
const SHADOW_FACE = ['181425', '2b1a3e', '45283c', '68386c', '8a4f8e'].map(H);
function shadowFace(render, keyColors, eyes = EYES, eyeW = 2) {
  const src = render();
  const keys = new Set(keyColors.map((k) => H(k) >>> 0));
  const out = new Canvas(S, S, H('262b44'));
  drawShape(out, { type: 'disc', color: 'b55088', x: 24, y: 22, r: 17 });
  const fig = new Uint8Array(S * S);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const c = src.get(x, y) >>> 0;
      if (keys.has(c)) continue;
      fig[y * S + x] = 1;
      const L = (0.3 * ((c >>> 24) & 255) + 0.59 * ((c >>> 16) & 255) + 0.11 * ((c >>> 8) & 255)) / 255;
      out.set(x, y, SHADOW_FACE[Math.min(4, Math.floor(L ** 1.1 * 4.6))]);
    }
  const isFig = (x, y) => x >= 0 && y >= 0 && x < S && y < S && fig[y * S + x];
  const rim = H('8a4f8e'), wisp = H('68386c');
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      if (isFig(x, y)) continue;
      if (isFig(x + 1, y) || isFig(x, y + 1) || isFig(x - 1, y) || isFig(x, y - 1)) out.set(x, y, rim);
      else if (isFig(x, y + 2) && ((x * 7 + y * 3) % 5 === 0)) out.set(x, y, wisp); // wisps rising off the silhouette
    }
  for (const [x, y] of eyes) { out.fillRect(x, y, eyeW, 2, H('ff0044')); out.set(x + (x < 24 ? 0 : eyeW - 1), y, H('f6757a')); }
  return out;
}
F.enemy_shadow_knight = () => ({ render: () => shadowFace(() => F.hero_knight().render(), ['feae34', 'f77622']) });
F.enemy_shadow_mage = () => ({ render: () => shadowFace(varFlat, ['e4a672', 'd77643']) });
F.enemy_shadow_thief = () => ({ render: () => shadowFace(() => F.hero_thief().render(), ['ead4aa', 'e4a672'], [[19, 22], [27, 22]], 3) });
F.enemy_shadow_monk = () => ({ render: () => shadowFace(() => F.hero_monk().render(), ['5a6988', '3a4466'], [[20, 25], [27, 25]]) });

export const FLAT_FACE_IDS = Object.keys(F);
export function flatFace(id) { return F[id]().render(); }
