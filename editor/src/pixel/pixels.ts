/**
 * Pixel operations of the pixel editor (graphics.md §5) on a plain RGBA buffer – the same shape as
 * ImageData, so they run in tests and in the browser. Every operation stays inside a clip
 * rectangle (the frame being drawn).
 */

export interface Pixels {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** An RGBA colour; a = 0 is transparent. */
export type Rgba = [number, number, number, number];

export const TRANSPARENT: Rgba = [0, 0, 0, 0];

export const blank = (width: number, height: number): Pixels => ({ width, height, data: new Uint8ClampedArray(width * height * 4) });
export const clone = (p: Pixels): Pixels => ({ width: p.width, height: p.height, data: new Uint8ClampedArray(p.data) });

const inside = (r: Rect, x: number, y: number) => x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h;

export function get(p: Pixels, x: number, y: number): Rgba {
  const i = (y * p.width + x) * 4;
  return [p.data[i], p.data[i + 1], p.data[i + 2], p.data[i + 3]];
}

export function set(p: Pixels, x: number, y: number, c: Rgba, clip?: Rect) {
  if (x < 0 || y < 0 || x >= p.width || y >= p.height) return;
  if (clip && !inside(clip, x, y)) return;
  const i = (y * p.width + x) * 4;
  p.data[i] = c[0];
  p.data[i + 1] = c[1];
  p.data[i + 2] = c[2];
  p.data[i + 3] = c[3];
}

/** Same colour (every fully transparent pixel counts as the same). */
export const same = (a: Rgba, b: Rgba) => (a[3] === 0 && b[3] === 0) || (a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3]);

/** Mirrored drawing: the pixel and its mirror across the clip's middle (for symmetric pieces). */
export function plot(p: Pixels, x: number, y: number, c: Rgba, clip: Rect, mirror = false) {
  set(p, x, y, c, clip);
  if (mirror) set(p, clip.x + clip.w - 1 - (x - clip.x), y, c, clip);
}

/** A straight line of pixels (Bresenham). */
export function line(p: Pixels, x0: number, y0: number, x1: number, y1: number, c: Rgba, clip: Rect, mirror = false) {
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    plot(p, x0, y0, c, clip, mirror);
    if (x0 === x1 && y0 === y1) return;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x0 += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y0 += sy;
    }
  }
}

/** A rectangle between two corners, its outline or filled. */
export function rect(p: Pixels, x0: number, y0: number, x1: number, y1: number, c: Rgba, clip: Rect, filled: boolean, mirror = false) {
  const [ax, bx] = [Math.min(x0, x1), Math.max(x0, x1)];
  const [ay, by] = [Math.min(y0, y1), Math.max(y0, y1)];
  for (let y = ay; y <= by; y++)
    for (let x = ax; x <= bx; x++) if (filled || x === ax || x === bx || y === ay || y === by) plot(p, x, y, c, clip, mirror);
}

/** Fills the area of one colour around (x, y) – four neighbours, inside the clip. */
export function fill(p: Pixels, x: number, y: number, c: Rgba, clip: Rect): number {
  if (!inside(clip, x, y)) return 0;
  const from = get(p, x, y);
  if (same(from, c)) return 0;
  const stack: [number, number][] = [[x, y]];
  let n = 0;
  while (stack.length) {
    const [cx, cy] = stack.pop()!;
    if (!inside(clip, cx, cy) || !same(get(p, cx, cy), from)) continue;
    set(p, cx, cy, c);
    n++;
    stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
  }
  return n;
}

/** The pixels of a rectangle, as their own buffer. */
export function copyRect(p: Pixels, r: Rect): Pixels {
  const out = blank(r.w, r.h);
  for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) if (x + r.x < p.width && y + r.y < p.height) set(out, x, y, get(p, r.x + x, r.y + y));
  return out;
}

/** Puts pixels at (x, y); transparent ones only overwrite when `opaqueOnly` is off. */
export function paste(p: Pixels, src: Pixels, x: number, y: number, clip: Rect, opaqueOnly = false) {
  for (let sy = 0; sy < src.height; sy++)
    for (let sx = 0; sx < src.width; sx++) {
      const c = get(src, sx, sy);
      if (opaqueOnly && c[3] === 0) continue;
      set(p, x + sx, y + sy, c, clip);
    }
}

export function clearRect(p: Pixels, r: Rect) {
  for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) set(p, x, y, TRANSPARENT);
}

/** Mirrors a rectangle left–right or top–bottom, in place. */
export function flip(p: Pixels, r: Rect, axis: "x" | "y") {
  const src = copyRect(p, r);
  for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) set(p, r.x + x, r.y + y, get(src, axis === "x" ? r.w - 1 - x : x, axis === "y" ? r.h - 1 - y : y));
}

/** Shifts a rectangle's pixels by (dx, dy), wrapping around (to nudge a frame into place). */
export function shift(p: Pixels, r: Rect, dx: number, dy: number) {
  const src = copyRect(p, r);
  for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) set(p, r.x + ((x + dx + r.w * 8) % r.w), r.y + ((y + dy + r.h * 8) % r.h), get(src, x, y));
}

/** The colours used in a rectangle, most used first (the sheet's palette). */
export function colorsIn(p: Pixels, r: Rect = { x: 0, y: 0, w: p.width, h: p.height }, max = 48): Rgba[] {
  const count = new Map<string, number>();
  for (let y = r.y; y < r.y + r.h; y++)
    for (let x = r.x; x < r.x + r.w; x++) {
      const c = get(p, x, y);
      if (c[3] === 0) continue;
      const k = c.join(",");
      count.set(k, (count.get(k) ?? 0) + 1);
    }
  return [...count.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([k]) => k.split(",").map(Number) as Rgba);
}

export const hex = (c: Rgba) => `#${c
  .slice(0, 3)
  .map((v) => v.toString(16).padStart(2, "0"))
  .join("")}`;

export function fromHex(h: string, alpha = 255): Rgba {
  const m = h.replace("#", "");
  return [parseInt(m.slice(0, 2), 16), parseInt(m.slice(2, 4), 16), parseInt(m.slice(4, 6), 16), alpha];
}

/** The game's palette: Endesga-32 (ASSETS.md). */
export const GAME_PALETTE = [
  "#be4a2f", "#d77643", "#ead4aa", "#e4a672", "#b86f50", "#733e39", "#3e2731", "#a22633",
  "#e43b44", "#f77622", "#feae34", "#fee761", "#63c74d", "#3e8948", "#265c42", "#193c3e",
  "#124e89", "#0099db", "#2ce8f5", "#ffffff", "#c0cbdc", "#8b9bb4", "#5a6988", "#3a4466",
  "#262b44", "#181425", "#ff0044", "#68386c", "#b55088", "#f6757a", "#e8b796", "#c28569",
].map((h) => fromHex(h));

/** A frame's rectangle in a sheet. */
export const frameRect = (i: number, fw: number, fh: number, cols: number): Rect => ({ x: (i % cols) * fw, y: Math.floor(i / cols) * fh, w: fw, h: fh });

/** A copy of the buffer grown to width × height (new pixels transparent). */
export function grow(p: Pixels, width: number, height: number): Pixels {
  if (width <= p.width && height <= p.height) return p;
  const out = blank(Math.max(width, p.width), Math.max(height, p.height));
  paste(out, p, 0, 0, { x: 0, y: 0, w: out.width, h: out.height });
  return out;
}
