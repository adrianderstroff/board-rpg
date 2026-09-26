/**
 * Geometry of shaped blocks (no Phaser): cells whose top is a polygon inside the unit square
 * (diagonal pieces, e.g. a ship's bow) and hull flare (exposed sides lean inward toward the
 * bottom, so the top overhangs – a ship's hull).
 *
 * Coordinates are local to the cell centre: the square runs from -0.5 to 0.5 on both axes.
 */

export type Pt = [number, number];

export const UNIT_SQUARE: Pt[] = [
  [-0.5, -0.5],
  [0.5, -0.5],
  [0.5, 0.5],
  [-0.5, 0.5],
];

const EPS = 1e-9;

/**
 * The unit square with corners cut off along the diagonals: each entry names a corner by the
 * signs of its grid offset (e.g. {x: 1, y: -1} = the +x/-y corner). Cutting one corner leaves a
 * triangle (half cell); cutting two neighbouring corners leaves a triangle pointing at the centre.
 */
export function cutSquare(corners: { x: number; y: number }[]): Pt[] {
  let poly = UNIT_SQUARE.map((p) => [...p] as Pt);
  for (const c of corners) {
    // keep the side of the diagonal through the centre that is away from the corner
    const inside = (p: Pt) => c.x * p[0] + c.y * p[1] <= EPS;
    const out: Pt[] = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      if (inside(a)) out.push(a);
      if (inside(a) !== inside(b)) {
        const da = c.x * a[0] + c.y * a[1];
        const db = c.x * b[0] + c.y * b[1];
        const t = da / (da - db);
        out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      }
    }
    poly = dedupe(out);
  }
  return poly;
}

function dedupe(poly: Pt[]): Pt[] {
  return poly.filter((p, i) => {
    const q = poly[(i + 1) % poly.length];
    return Math.abs(p[0] - q[0]) > EPS || Math.abs(p[1] - q[1]) > EPS;
  });
}

/** Outward unit normal of the edge a→b of a polygon wound like UNIT_SQUARE. */
export function edgeNormal(a: Pt, b: Pt): Pt {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy) || 1;
  return [dy / len, -dx / len];
}

/** Which side of the square an edge lies on (0 +x, 1 +y, 2 -x, 3 -y), or -1 for a diagonal. */
export function edgeSide(a: Pt, b: Pt): number {
  const on = (v: number, w: number) => Math.abs(v - w) < EPS;
  if (on(a[0], 0.5) && on(b[0], 0.5)) return 0;
  if (on(a[1], 0.5) && on(b[1], 0.5)) return 1;
  if (on(a[0], -0.5) && on(b[0], -0.5)) return 2;
  if (on(a[1], -0.5) && on(b[1], -0.5)) return 3;
  return -1;
}

export const SIDE_OFFSETS: Pt[] = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
];

/** Does the outline cover the whole of side `side` of the square? */
export function coversSide(outline: Pt[], side: number): boolean {
  return outline.some((a, i) => {
    const b = outline[(i + 1) % outline.length];
    if (edgeSide(a, b) !== side) return false;
    return Math.abs(Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) - 1) < EPS;
  });
}

export interface FlareCell {
  x: number;
  y: number;
  outline: Pt[];
}

const vkey = (x: number, y: number) => `${Math.round(x * 2)},${Math.round(y * 2)}`;

/**
 * Inward offset directions for the vertices of flared hulls, keyed by world vertex (see
 * {@link flareOffset}). An edge is part of the hull when no other flared cell continues across it;
 * where two hull edges meet the offset is mitred, so neighbouring columns stay closed.
 */
export function flareMiters(cells: FlareCell[]): Map<string, Pt> {
  const byPos = new Map(cells.map((c) => [`${c.x},${c.y}`, c]));
  const normals = new Map<string, Pt[]>();
  for (const c of cells) {
    c.outline.forEach((a, i) => {
      const b = c.outline[(i + 1) % c.outline.length];
      const side = edgeSide(a, b);
      if (side >= 0) {
        const [ox, oy] = SIDE_OFFSETS[side];
        const nb = byPos.get(`${c.x + ox},${c.y + oy}`);
        if (nb && coversSide(nb.outline, (side + 2) % 4)) return; // the hull continues there
      }
      const n = edgeNormal(a, b);
      const inward: Pt = [-n[0], -n[1]];
      for (const p of [a, b]) {
        const k = vkey(c.x + p[0], c.y + p[1]);
        const list = normals.get(k) ?? [];
        if (!list.some((m) => Math.abs(m[0] - inward[0]) < 1e-6 && Math.abs(m[1] - inward[1]) < 1e-6)) list.push(inward);
        normals.set(k, list);
      }
    });
  }
  const out = new Map<string, Pt>();
  for (const [k, list] of normals) {
    const [n1, n2] = list;
    const det = n2 ? n1[0] * n2[1] - n1[1] * n2[0] : 0;
    if (!n2 || Math.abs(det) < 1e-6) {
      out.set(k, n1);
      continue;
    }
    // v · n1 = 1 and v · n2 = 1: both edges move inward by the same distance
    out.set(k, [(n2[1] - n1[1]) / det, (n1[0] - n2[0]) / det]);
  }
  return out;
}

/** The inward offset (grid units, per unit of flare) of a world vertex, or 0,0 if it isn't on a hull. */
export function flareOffset(miters: Map<string, Pt>, wx: number, wy: number): Pt {
  return miters.get(vkey(wx, wy)) ?? [0, 0];
}
