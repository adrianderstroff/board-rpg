export interface Pos {
  x: number;
  y: number;
}

/** Grid facing. N = -y (screen up-right), E = +x (down-right), S = +y (down-left), W = -x (up-left). */
export type Dir = "N" | "E" | "S" | "W";

export const DIR_VEC: Record<Dir, Pos> = {
  N: { x: 0, y: -1 },
  E: { x: 1, y: 0 },
  S: { x: 0, y: 1 },
  W: { x: -1, y: 0 },
};

export const ORTHOGONAL: Pos[] = [
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
];
export const DIAGONAL: Pos[] = [
  { x: 1, y: -1 },
  { x: 1, y: 1 },
  { x: -1, y: 1 },
  { x: -1, y: -1 },
];
export const ALL_DIRS: Pos[] = [...ORTHOGONAL, ...DIAGONAL];

export type DirSet = "orthogonal" | "diagonal" | "all";

export function dirVectors(set: DirSet = "all"): Pos[] {
  return set === "orthogonal" ? ORTHOGONAL : set === "diagonal" ? DIAGONAL : ALL_DIRS;
}

export const key = (p: Pos): string => `${p.x},${p.y}`;
export const parseKey = (k: string): Pos => {
  const [x, y] = k.split(",").map(Number);
  return { x, y };
};
export const samePos = (a: Pos, b: Pos) => a.x === b.x && a.y === b.y;
export const add = (a: Pos, b: Pos): Pos => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Pos, b: Pos): Pos => ({ x: a.x - b.x, y: a.y - b.y });
export const chebyshev = (a: Pos, b: Pos) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
export const manhattan = (a: Pos, b: Pos) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

/** Facing derived from a step. Diagonals resolve to the dominant axis (x wins ties). */
export function dirFromStep(from: Pos, to: Pos): Dir {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.abs(dx) >= Math.abs(dy) && dx !== 0) return dx > 0 ? "E" : "W";
  return dy > 0 ? "S" : "N";
}

/** Unit step vector (-1/0/1 per axis) from a to b. */
export function stepToward(a: Pos, b: Pos): Pos {
  return { x: Math.sign(b.x - a.x), y: Math.sign(b.y - a.y) };
}
