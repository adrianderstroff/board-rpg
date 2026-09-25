// Tiny canvas-like raster library. Colors are packed 0xRRGGBBAA numbers
// (use rgba()/hex() helpers); null/undefined color = no-op.

export function rgba(r, g, b, a = 255) {
  return ((r & 255) << 24 | (g & 255) << 16 | (b & 255) << 8 | (a & 255)) >>> 0;
}
/** '#be4a2f' | 'be4a2f' -> packed, optional alpha 0..255 */
export function hex(s, a = 255) {
  if (typeof s === 'number') return a === 255 ? s : withAlpha(s, a);
  s = s.replace('#', '');
  return rgba(parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16), a);
}
export const R = (c) => (c >>> 24) & 255;
export const G = (c) => (c >>> 16) & 255;
export const B = (c) => (c >>> 8) & 255;
export const A = (c) => c & 255;
export function withAlpha(c, a) { return ((c & 0xffffff00) | (a & 255)) >>> 0; }
export function mix(c1, c2, t) {
  return rgba(
    Math.round(R(c1) + (R(c2) - R(c1)) * t),
    Math.round(G(c1) + (G(c2) - G(c1)) * t),
    Math.round(B(c1) + (B(c2) - B(c1)) * t),
    Math.round(A(c1) + (A(c2) - A(c1)) * t),
  );
}

// 4x4 Bayer matrix, values 0..15
export const BAYER4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];
/** true if pixel (x,y) should take the "upper" color for a fraction t in 0..1 */
export function dither(x, y, t) {
  return t * 16 > BAYER4[((y % 4) + 4) % 4][((x % 4) + 4) % 4] + 0.5;
}

export class Canvas {
  constructor(width, height, fill = 0) {
    this.width = width;
    this.height = height;
    this.data = new Uint8Array(width * height * 4);
    if (fill) this.clear(fill);
  }
  clear(c = 0) {
    for (let i = 0; i < this.width * this.height; i++) this._put(i * 4, c);
    return this;
  }
  _put(o, c) {
    this.data[o] = (c >>> 24) & 255;
    this.data[o + 1] = (c >>> 16) & 255;
    this.data[o + 2] = (c >>> 8) & 255;
    this.data[o + 3] = c & 255;
  }
  inside(x, y) { return x >= 0 && y >= 0 && x < this.width && y < this.height; }
  get(x, y) {
    x = Math.floor(x); y = Math.floor(y);
    if (!this.inside(x, y)) return 0;
    const o = (y * this.width + x) * 4, d = this.data;
    return ((d[o] << 24) | (d[o + 1] << 16) | (d[o + 2] << 8) | d[o + 3]) >>> 0;
  }
  alpha(x, y) {
    x = Math.floor(x); y = Math.floor(y);
    return this.inside(x, y) ? this.data[(y * this.width + x) * 4 + 3] : 0;
  }
  /** Overwrite a pixel (no blending). */
  set(x, y, c) {
    if (c == null) return;
    x = Math.floor(x); y = Math.floor(y);
    if (!this.inside(x, y)) return;
    this._put((y * this.width + x) * 4, c);
  }
  /** Alpha-blend a pixel over the existing one. */
  blend(x, y, c) {
    if (c == null) return;
    x = Math.floor(x); y = Math.floor(y);
    if (!this.inside(x, y)) return;
    const a = A(c);
    if (a === 255) return this.set(x, y, c);
    if (a === 0) return;
    const d = this.get(x, y);
    const da = A(d) / 255, sa = a / 255;
    const oa = sa + da * (1 - sa);
    const ch = (s, t) => Math.round((s * sa + t * da * (1 - sa)) / oa);
    this.set(x, y, rgba(ch(R(c), R(d)), ch(G(c), G(d)), ch(B(c), B(d)), Math.round(oa * 255)));
  }
  setPixel(x, y, c, blend = false) { blend ? this.blend(x, y, c) : this.set(x, y, c); }
  fillRect(x, y, w, h, c, blend = false) {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.setPixel(i, j, typeof c === 'function' ? c(i, j) : c, blend);
    return this;
  }
  strokeRect(x, y, w, h, c) {
    this.line(x, y, x + w - 1, y, c); this.line(x, y + h - 1, x + w - 1, y + h - 1, c);
    this.line(x, y, x, y + h - 1, c); this.line(x + w - 1, y, x + w - 1, y + h - 1, c);
    return this;
  }
  /** Bresenham line; c may be a function (x,y,i)=>color */
  line(x0, y0, x1, y1, c, blend = false) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy, i = 0;
    for (;;) {
      this.setPixel(x0, y0, typeof c === 'function' ? c(x0, y0, i) : c, blend);
      i++;
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
    return this;
  }
  /** Filled ellipse by pixel-center test. c may be a function (x,y,nx,ny), nx/ny in -1..1 */
  ellipse(cx, cy, rx, ry, c, blend = false) {
    for (let y = Math.floor(cy - ry - 1); y <= Math.ceil(cy + ry + 1); y++)
      for (let x = Math.floor(cx - rx - 1); x <= Math.ceil(cx + rx + 1); x++) {
        const nx = (x + 0.5 - cx) / rx, ny = (y + 0.5 - cy) / ry;
        if (nx * nx + ny * ny <= 1) this.setPixel(x, y, typeof c === 'function' ? c(x, y, nx, ny) : c, blend);
      }
    return this;
  }
  /** Scanline polygon fill (pixel-center sampling, even-odd). pts = [[x,y],...]; c may be fn(x,y) */
  polygon(pts, c, blend = false) {
    let minY = Infinity, maxY = -Infinity;
    for (const [, y] of pts) { minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
    for (let y = Math.floor(minY); y <= Math.ceil(maxY); y++) {
      const sy = y + 0.5, xs = [];
      for (let i = 0; i < pts.length; i++) {
        const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % pts.length];
        if ((y0 <= sy && y1 > sy) || (y1 <= sy && y0 > sy)) xs.push(x0 + ((sy - y0) / (y1 - y0)) * (x1 - x0));
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2)
        for (let x = Math.ceil(xs[k] - 0.5); x < Math.ceil(xs[k + 1] - 0.5); x++)
          this.setPixel(x, y, typeof c === 'function' ? c(x, y) : c, blend);
    }
    return this;
  }
  /** Copy src onto this canvas. opts: sx,sy,sw,sh (source rect), flipX, blend (default true), scale */
  blit(src, dx, dy, opts = {}) {
    const { sx = 0, sy = 0, sw = src.width, sh = src.height, flipX = false, blend = true, scale = 1 } = opts;
    for (let j = 0; j < sh * scale; j++)
      for (let i = 0; i < sw * scale; i++) {
        const u = Math.floor(i / scale), v = Math.floor(j / scale);
        const c = src.get(sx + (flipX ? sw - 1 - u : u), sy + v);
        if (blend) { if (A(c)) this.blend(dx + i, dy + j, c); }
        else this.set(dx + i, dy + j, c);
      }
    return this;
  }
  clone() { const c = new Canvas(this.width, this.height); c.data.set(this.data); return c; }
  mirrorX() {
    const c = new Canvas(this.width, this.height);
    for (let y = 0; y < this.height; y++) for (let x = 0; x < this.width; x++) c.set(this.width - 1 - x, y, this.get(x, y));
    return c;
  }
  crop(x, y, w, h) { const c = new Canvas(w, h); c.blit(this, 0, 0, { sx: x, sy: y, sw: w, sh: h, blend: false }); return c; }
  scaled(n) { const c = new Canvas(this.width * n, this.height * n); c.blit(this, 0, 0, { scale: n, blend: false }); return c; }
  /** Add a 1px outline around opaque pixels (alpha >= thr). */
  outline(color, { diagonal = false, thr = 128 } = {}) {
    const src = this.clone();
    for (let y = 0; y < this.height; y++)
      for (let x = 0; x < this.width; x++) {
        if (src.alpha(x, y) >= thr) continue;
        const n = src.alpha(x - 1, y) >= thr || src.alpha(x + 1, y) >= thr || src.alpha(x, y - 1) >= thr || src.alpha(x, y + 1) >= thr ||
          (diagonal && (src.alpha(x - 1, y - 1) >= thr || src.alpha(x + 1, y - 1) >= thr || src.alpha(x - 1, y + 1) >= thr || src.alpha(x + 1, y + 1) >= thr));
        if (n) this.set(x, y, color);
      }
    return this;
  }
  /** Replace colors: map is Map(packed->packed) or function(c,x,y)->c */
  recolor(map) {
    for (let y = 0; y < this.height; y++)
      for (let x = 0; x < this.width; x++) {
        const c = this.get(x, y);
        const n = typeof map === 'function' ? map(c, x, y) : map.has(c) ? map.get(c) : c;
        if (n !== c) this.set(x, y, n);
      }
    return this;
  }
  /** Draw a copy of the opaque pixels offset by (dx,dy) in color c underneath. */
  dropShadow(dx, dy, c) {
    const src = this.clone();
    this.clear(0);
    for (let y = 0; y < this.height; y++)
      for (let x = 0; x < this.width; x++) if (src.alpha(x, y)) this.set(x + dx, y + dy, c);
    this.blit(src, 0, 0);
    return this;
  }
  /** Bounding box of pixels with alpha > 0: {x0,y0,x1,y1} or null */
  bbox() {
    let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
    for (let y = 0; y < this.height; y++)
      for (let x = 0; x < this.width; x++)
        if (this.alpha(x, y)) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    return x1 < 0 ? null : { x0, y0, x1, y1 };
  }
  shifted(dx, dy) { const c = new Canvas(this.width, this.height); c.blit(this, dx, dy, { blend: false }); return c; }
}

/** Pack rows of frames into a sheet. */
export function sheet(rows, fw, fh) {
  const cols = Math.max(...rows.map((r) => r.length));
  const s = new Canvas(cols * fw, rows.length * fh);
  rows.forEach((row, j) => row.forEach((f, i) => f && s.blit(f, i * fw, j * fh, { blend: false })));
  return s;
}
/** Pack a flat list of frames into a grid with `cols` columns. */
export function grid(frames, fw, fh, cols) {
  const rows = [];
  for (let i = 0; i < frames.length; i += cols) rows.push(frames.slice(i, i + cols));
  return sheet(rows, fw, fh);
}
