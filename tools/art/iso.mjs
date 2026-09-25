// Isometric block helpers. Tile top = 32x16 diamond, block height = 8px.
// Block frame = 32x24: diamond rows 0..15, side faces below (8px tall).
import { Canvas, mix } from './raster.mjs';

export const TW = 32, TH = 16, BH = 8;

/** Half-width (in px) of diamond row r (0..15). */
export const rowHalf = (r) => (r < 8 ? 2 * (r + 1) : 2 * (16 - r));
/** Is (x,y) inside the diamond whose top row is at y0? */
export function inDiamond(x, y, y0 = 0) {
  const r = y - y0;
  if (r < 0 || r > 15) return false;
  const w = rowHalf(r);
  return x >= 16 - w && x < 16 + w;
}
/** Bottom row of the diamond at column x (diamond top at y0). */
export const bottomEdge = (x, y0 = 0) => y0 + (x < 16 ? 8 + (x >> 1) : 15 - ((x - 16) >> 1));
/** Top row of the diamond at column x. */
export const topEdge = (x, y0 = 0) => y0 + (x < 16 ? 7 - (x >> 1) : (x - 16) >> 1);
/** Diamond (u,v) texture coords in [0,16): u runs toward the SE edge (+x grid), v toward SW (+y grid). */
export function diamondUV(x, y, y0 = 0) {
  const xp = x + 0.5 - 16, yp = y + 0.5 - y0;
  return [yp + xp / 2, yp - xp / 2];
}
/** Is (x,y) one of the two outermost pixels of an upper (NW/NE) diamond edge? */
export function isUpperEdge(x, y, y0 = 0) {
  const r = y - y0;
  if (r < 0 || r > 7) return false;
  const w = rowHalf(r);
  return x - (16 - w) < 2 || 16 + w - 1 - x < 2;
}

/**
 * Draw a block into a 32x24 frame.
 * m = { top(u,v,x,y) -> color, left(s,t,x,y) -> color, right(s,t,x,y) -> color,
 *       topY (diamond top offset, default 0), sideH (side height, default 8),
 *       edge (top rim highlight color or null), lip (side lip highlight strength) }
 * Side coords: s = 0..15 along the face (left face: from the left corner toward the
 * front corner; right face: from the front corner toward the right corner), t = 0..sideH-1 downward.
 */
export function drawBlock(m, c = new Canvas(TW, 24)) {
  const y0 = m.topY ?? 0;
  const sideH = m.sideH ?? 8;
  for (let x = 0; x < TW; x++) {
    const be = bottomEdge(x, y0);
    for (let t = 0; t < sideH; t++) {
      const y = be + 1 + t;
      if (y > 23) break;
      const col = x < 16 ? m.left(x, t, x, y) : m.right(x - 16, t, x, y);
      c.set(x, y, col);
    }
  }
  for (let y = y0; y < y0 + 16; y++)
    for (let x = 0; x < TW; x++) {
      if (!inDiamond(x, y, y0)) continue;
      const [u, v] = diamondUV(x, y, y0);
      let col = m.top(u, v, x, y);
      if (m.edge != null && isUpperEdge(x, y, y0)) col = mix(col, m.edge, m.edgeAmt ?? 0.3);
      c.set(x, y, col);
    }
  return c;
}

/** Periodic (period 16) wrap. */
export const wrap16 = (a) => ((a % 16) + 16) % 16;
