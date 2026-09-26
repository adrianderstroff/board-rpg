import { isMap, isScalar, Scalar, type Document } from "yaml";
import type { Corner, MapDef } from "../../../src/core/data/types";
import type { Dir, Pos } from "../../../src/core/util/grid";

/**
 * Editing a map's layers (editor-design §5.2). Layers are strings of rows (one character per
 * cell); the terrain, decor and shape layers name their characters in the map's legend. These
 * functions change the YAML document in place, keeping the layers as `|` blocks.
 */

export type PaintLayer = "terrain" | "decor" | "shape";
export type LayerName = PaintLayer | "height" | "decorDir";

const HEIGHTS = "0123456789abcdefghijklmnopqrstuvwxyz";
export const MAX_HEIGHT = HEIGHTS.length - 1;
/** Characters that mean "nothing here" per layer. */
const EMPTY: Record<LayerName, string> = { terrain: " ", height: "0", decor: ".", decorDir: ".", shape: "." };
const LEGEND: Record<PaintLayer, "terrain" | "decor" | "shapes"> = { terrain: "terrain", decor: "decor", shape: "shapes" };

export function mapSize(map: MapDef): { w: number; h: number } {
  const rows = splitRows(map.layers.terrain);
  return { w: Math.max(0, ...rows.map((r) => r.length)), h: rows.length };
}

function splitRows(text: string | undefined): string[] {
  if (!text) return [];
  const rows = text.split("\n");
  while (rows.length && rows[rows.length - 1] === "") rows.pop();
  return rows;
}

/** A layer's rows padded to the map size with its empty character. */
export function rowsOf(map: MapDef, layer: LayerName): string[][] {
  const { w, h } = mapSize(map);
  const src = splitRows(layer === "terrain" ? map.layers.terrain : (map.layers as Record<string, string | undefined>)[layer]);
  return Array.from({ length: h }, (_, y) => Array.from({ length: w }, (_, x) => src[y]?.[x] ?? EMPTY[layer]));
}

function writeRows(doc: Document, layer: LayerName, rows: string[][]) {
  const text = rows.map((r) => r.join("")).join("\n") + "\n";
  const node = doc.getIn(["layers", layer], true);
  if (isScalar(node)) {
    node.value = text;
    node.type = Scalar.BLOCK_LITERAL;
    return;
  }
  const n = doc.createNode(text) as Scalar;
  n.type = Scalar.BLOCK_LITERAL;
  doc.setIn(["layers", layer], n);
}

/** The legend character for `id` in a layer, added with a readable free character if needed. */
export function legendChar(doc: Document, map: MapDef, layer: PaintLayer, id: string, shape?: Corner[]): string {
  const key = LEGEND[layer];
  const legend = (map.legend as Record<string, Record<string, unknown> | undefined>)[key] ?? {};
  for (const [ch, v] of Object.entries(legend)) {
    if (layer === "shape" ? JSON.stringify((v as { cut: Corner[] }).cut) === JSON.stringify(shape) : v === id) return ch;
  }
  const used = new Set([...Object.keys(legend), ".", " ", "#"]);
  const candidates = [id[0], id[0]?.toUpperCase(), ..."abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789^/\\<>~*+=%&$@!?"].filter(Boolean);
  const ch = candidates.find((c) => !used.has(c));
  if (!ch) throw new Error(`No free legend character left for ${key}`);
  if (layer === "shape") doc.setIn(["legend", key, ch], doc.createNode({ cut: shape }, { flow: true }));
  else doc.setIn(["legend", key, ch], id);
  (legend as Record<string, unknown>)[ch] = layer === "shape" ? { cut: shape } : id;
  if (!(map.legend as Record<string, unknown>)[key]) (map.legend as Record<string, unknown>)[key] = legend;
  return ch;
}

/**
 * Paints cells of the terrain / decor / shape layer: `id` = a terrain / decor id (null = hole / no
 * decor / no shape); for shapes `cut` lists the corners to cut.
 */
export function paint(doc: Document, map: MapDef, layer: PaintLayer, cells: Pos[], id: string | null, cut?: Corner[]) {
  const rows = rowsOf(map, layer);
  const ch = id === null || (layer === "shape" && !cut?.length) ? EMPTY[layer] : legendChar(doc, map, layer, id ?? "", cut);
  for (const p of cells) if (rows[p.y]?.[p.x] !== undefined) rows[p.y][p.x] = ch;
  writeRows(doc, layer, rows);
  pruneLegend(doc, map, layer, rows);
}

/** Drops legend entries no cell uses any more (keeps the legend tidy). */
function pruneLegend(doc: Document, map: MapDef, layer: PaintLayer, rows: string[][]) {
  const key = LEGEND[layer];
  const node = doc.getIn(["legend", key], true);
  if (!isMap(node)) return;
  const used = new Set(rows.flat());
  if (layer === "terrain") for (const ch of splitRows(map.layers.overhead ?? "").join("")) used.add(ch);
  for (const item of [...node.items]) {
    const ch = String(isScalar(item.key) ? item.key.value : item.key);
    if (!used.has(ch)) node.delete(item.key);
  }
}

export function heightAt(map: MapDef, p: Pos): number {
  return Math.max(0, HEIGHTS.indexOf(rowsOf(map, "height")[p.y]?.[p.x] ?? "0"));
}

/** Changes heights: `fn` gets the old height of each cell. */
export function setHeights(doc: Document, map: MapDef, cells: Pos[], fn: (h: number) => number) {
  const rows = rowsOf(map, "height");
  for (const p of cells) {
    const old = rows[p.y]?.[p.x];
    if (old === undefined) continue;
    const h = Math.max(0, Math.min(MAX_HEIGHT, Math.round(fn(Math.max(0, HEIGHTS.indexOf(old))))));
    rows[p.y][p.x] = HEIGHTS[h];
  }
  writeRows(doc, "height", rows);
}

/** Turns a directional decor (null = default facing S). */
export function setFacing(doc: Document, map: MapDef, p: Pos, dir: Dir | null) {
  const rows = rowsOf(map, "decorDir");
  if (rows[p.y]?.[p.x] === undefined) return;
  rows[p.y][p.x] = dir && dir !== "S" ? dir : ".";
  if (rows.flat().every((c) => c === ".")) doc.deleteIn(["layers", "decorDir"]);
  else writeRows(doc, "decorDir", rows);
}

/** Cells of the 4-connected area around `start` whose value in `layer` equals the start's. */
export function floodArea(map: MapDef, layer: LayerName, start: Pos): Pos[] {
  const rows = rowsOf(map, layer);
  const want = rows[start.y]?.[start.x];
  if (want === undefined) return [];
  const seen = new Set<string>();
  const out: Pos[] = [];
  const stack = [start];
  while (stack.length) {
    const p = stack.pop()!;
    const k = `${p.x},${p.y}`;
    if (seen.has(k) || rows[p.y]?.[p.x] !== want) continue;
    seen.add(k);
    out.push(p);
    stack.push({ x: p.x + 1, y: p.y }, { x: p.x - 1, y: p.y }, { x: p.x, y: p.y + 1 }, { x: p.x, y: p.y - 1 });
  }
  return out;
}

export function rectCells(a: Pos, b: Pos): Pos[] {
  const out: Pos[] = [];
  for (let y = Math.min(a.y, b.y); y <= Math.max(a.y, b.y); y++) for (let x = Math.min(a.x, b.x); x <= Math.max(a.x, b.x); x++) out.push({ x, y });
  return out;
}

/**
 * Adds (positive) or removes (negative) rows/columns on each side. New cells are empty (holes) or get
 * `fill` terrain at height 0; everything placed on the map (events, exits, spawns…) moves along.
 */
export function resize(doc: Document, map: MapDef, delta: { left: number; right: number; top: number; bottom: number }, fill: string | null = null) {
  const { w, h } = mapSize(map);
  const nw = w + delta.left + delta.right;
  const nh = h + delta.top + delta.bottom;
  if (nw < 1 || nh < 1) throw new Error("A map needs at least one cell");
  const fillCh = fill === null ? EMPTY.terrain : legendChar(doc, map, "terrain", fill);
  const layers: LayerName[] = ["terrain", "height", "decor", "decorDir", "shape"];
  for (const layer of layers) {
    const present = layer === "terrain" || (map.layers as Record<string, unknown>)[layer] !== undefined;
    if (!present) continue;
    const rows = rowsOf(map, layer);
    const empty = layer === "terrain" ? fillCh : EMPTY[layer];
    const out = Array.from({ length: nh }, (_, y) => Array.from({ length: nw }, (_, x) => rows[y - delta.top]?.[x - delta.left] ?? empty));
    writeRows(doc, layer, out);
  }
  // overhead layers (door lintels) move with the cells
  for (const layer of ["overhead", "overheadHeight"] as const) {
    const src = splitRows(map.layers[layer]);
    if (!src.length) continue;
    const out = Array.from({ length: nh }, (_, y) => Array.from({ length: nw }, (_, x) => src[y - delta.top]?.[x - delta.left] ?? ".").join("")).join("\n") + "\n";
    const n = doc.createNode(out) as Scalar;
    n.type = Scalar.BLOCK_LITERAL;
    doc.setIn(["layers", layer], n);
  }
  if (delta.left || delta.top) shiftPlaced(doc, map, delta.left, delta.top);
}

/** Moves everything placed on the map by dx, dy (after rows/columns were added or removed). */
function shiftPlaced(doc: Document, map: MapDef, dx: number, dy: number) {
  const move = (path: (string | number)[]) => {
    const x = doc.getIn([...path, "x"]);
    const y = doc.getIn([...path, "y"]);
    if (typeof x === "number") doc.setIn([...path, "x"], x + dx);
    if (typeof y === "number") doc.setIn([...path, "y"], y + dy);
  };
  for (const list of ["events", "exits", "enemies", "gates", "switches", "traps", "wallDecor"] as const) {
    (map[list] as unknown[] | undefined)?.forEach((_, i) => move([list, i]));
  }
  for (const id of Object.keys(map.spawns ?? {})) move(["spawns", id]);
  if (map.editor?.quickPlay?.x !== undefined) move(["editor", "quickPlay"]);
}

/**
 * Door lintels (`overhead` + `overheadHeight`): a terrain block floating above a doorway from the
 * cell's clearance up to `top` (grid.ts DOOR_CLEARANCE). `terrain` null removes it.
 */
export function setOverhead(doc: Document, map: MapDef, cells: Pos[], terrain: string | null, top: number) {
  const { w, h } = mapSize(map);
  const read = (text: string | undefined) => {
    const src = splitRows(text);
    return Array.from({ length: h }, (_, y) => Array.from({ length: w }, (_, x) => src[y]?.[x] ?? "."));
  };
  const over = read(map.layers.overhead);
  const tops = read(map.layers.overheadHeight);
  const ch = terrain ? legendChar(doc, map, "terrain", terrain) : ".";
  for (const p of cells) {
    if (over[p.y]?.[p.x] === undefined) continue;
    over[p.y][p.x] = ch;
    tops[p.y][p.x] = terrain ? HEIGHTS[Math.max(0, Math.min(MAX_HEIGHT, top))] : ".";
  }
  if (over.flat().every((c) => c === ".")) {
    doc.deleteIn(["layers", "overhead"]);
    doc.deleteIn(["layers", "overheadHeight"]);
    return;
  }
  for (const [layer, rows] of [["overhead", over], ["overheadHeight", tops]] as const) {
    const n = doc.createNode(rows.map((r) => r.join("")).join("\n") + "\n") as Scalar;
    n.type = Scalar.BLOCK_LITERAL;
    doc.setIn(["layers", layer], n);
  }
}

// ---------- areas: copy / paste / move (editor-design §5.3) ----------

/** One cell with everything the board layers say about it. */
export interface ClipCell {
  terrain: string | null;
  height: number;
  decor: string | null;
  facing: Dir | null;
  shape: Corner[] | null;
  lintel: { terrain: string; top: number } | null;
}

export interface Clip {
  w: number;
  h: number;
  cells: ClipCell[][];
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const rectOf = (a: Pos, b: Pos): Rect => ({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x) + 1, h: Math.abs(a.y - b.y) + 1 });
export const inRect = (r: Rect, p: Pos) => p.x >= r.x && p.y >= r.y && p.x < r.x + r.w && p.y < r.y + r.h;

/** Everything in the board layers of a rectangle (cells outside the map are left out on paste). */
export function copyArea(map: MapDef, r: Rect): Clip {
  const terrain = rowsOf(map, "terrain");
  const height = rowsOf(map, "height");
  const decor = rowsOf(map, "decor");
  const dirs = rowsOf(map, "decorDir");
  const shape = rowsOf(map, "shape");
  const over = splitRows(map.layers.overhead);
  const overTop = splitRows(map.layers.overheadHeight);
  const lt = map.legend.terrain;
  const cells = Array.from({ length: r.h }, (_, dy) =>
    Array.from({ length: r.w }, (_, dx): ClipCell => {
      const x = r.x + dx;
      const y = r.y + dy;
      const t = terrain[y]?.[x];
      const o = over[y]?.[x];
      return {
        terrain: t && t !== " " ? (lt[t] ?? null) : null,
        height: Math.max(0, HEIGHTS.indexOf(height[y]?.[x] ?? "0")),
        decor: map.legend.decor?.[decor[y]?.[x] ?? "."] ?? null,
        facing: "NESW".includes(dirs[y]?.[x] ?? ".") && dirs[y]?.[x] !== "." ? (dirs[y][x] as Dir) : null,
        shape: map.legend.shapes?.[shape[y]?.[x] ?? "."]?.cut ?? null,
        lintel: o && o !== "." && lt[o] ? { terrain: lt[o], top: Math.max(0, HEIGHTS.indexOf(overTop[y]?.[x] ?? "0")) } : null,
      };
    }),
  );
  return { w: r.w, h: r.h, cells };
}

/** Writes cells into all board layers at once (one undo step). */
export function writeCells(doc: Document, map: MapDef, writes: { p: Pos; c: ClipCell }[]) {
  const { w, h } = mapSize(map);
  const inside = writes.filter(({ p }) => p.x >= 0 && p.y >= 0 && p.x < w && p.y < h);
  const terrain = rowsOf(map, "terrain");
  const height = rowsOf(map, "height");
  const decor = rowsOf(map, "decor");
  const dirs = rowsOf(map, "decorDir");
  const shape = rowsOf(map, "shape");
  const read = (text: string | undefined) => {
    const src = splitRows(text);
    return Array.from({ length: h }, (_, y) => Array.from({ length: w }, (_, x) => src[y]?.[x] ?? "."));
  };
  const over = read(map.layers.overhead);
  const overTop = read(map.layers.overheadHeight);
  for (const { p, c } of inside) {
    terrain[p.y][p.x] = c.terrain ? legendChar(doc, map, "terrain", c.terrain) : " ";
    height[p.y][p.x] = HEIGHTS[Math.min(MAX_HEIGHT, c.height)];
    decor[p.y][p.x] = c.decor ? legendChar(doc, map, "decor", c.decor) : ".";
    dirs[p.y][p.x] = c.facing && c.facing !== "S" ? c.facing : ".";
    shape[p.y][p.x] = c.shape?.length ? legendChar(doc, map, "shape", "shape", c.shape) : ".";
    over[p.y][p.x] = c.lintel ? legendChar(doc, map, "terrain", c.lintel.terrain) : ".";
    overTop[p.y][p.x] = c.lintel ? HEIGHTS[Math.min(MAX_HEIGHT, c.lintel.top)] : ".";
  }
  writeRows(doc, "terrain", terrain);
  writeRows(doc, "height", height);
  writeRows(doc, "decor", decor);
  // optional layers only exist while something uses them
  const optional: [LayerName | "overhead" | "overheadHeight", string[][]][] = [
    ["decorDir", dirs],
    ["shape", shape],
    ["overhead", over],
    ["overheadHeight", overTop],
  ];
  const anyLintel = over.flat().some((c) => c !== ".");
  for (const [layer, rows] of optional) {
    const used = layer === "overhead" || layer === "overheadHeight" ? anyLintel : rows.flat().some((c) => c !== ".");
    if (!used) {
      if (doc.hasIn(["layers", layer])) doc.deleteIn(["layers", layer]);
      continue;
    }
    const n = doc.createNode(rows.map((r) => r.join("")).join("\n") + "\n") as Scalar;
    n.type = Scalar.BLOCK_LITERAL;
    doc.setIn(["layers", layer], n);
  }
  for (const layer of ["terrain", "decor", "shape"] as const) pruneLegend(doc, doc.toJS() as MapDef, layer, rowsOf(doc.toJS() as MapDef, layer));
}

/** Pastes a clip with its top-left corner at `at`. */
export function pasteArea(doc: Document, map: MapDef, clip: Clip, at: Pos) {
  const writes: { p: Pos; c: ClipCell }[] = [];
  clip.cells.forEach((row, dy) => row.forEach((c, dx) => writes.push({ p: { x: at.x + dx, y: at.y + dy }, c })));
  writeCells(doc, map, writes);
}

/**
 * Moves an area: its cells go to `to` (top-left), the cells it leaves behind become `fill`
 * (a terrain id, or null for holes) at height 0 with nothing on them. Entities standing in the
 * area move along when `withEntities`.
 */
export function moveArea(doc: Document, map: MapDef, r: Rect, to: Pos, fill: string | null, withEntities: boolean) {
  const clip = copyArea(map, r);
  const empty: ClipCell = { terrain: fill, height: 0, decor: null, facing: null, shape: null, lintel: null };
  const writes: { p: Pos; c: ClipCell }[] = [];
  for (let dy = 0; dy < r.h; dy++) for (let dx = 0; dx < r.w; dx++) writes.push({ p: { x: r.x + dx, y: r.y + dy }, c: empty });
  clip.cells.forEach((row, dy) => row.forEach((c, dx) => writes.push({ p: { x: to.x + dx, y: to.y + dy }, c })));
  writeCells(doc, map, writes);
  if (withEntities) {
    const dx = to.x - r.x;
    const dy = to.y - r.y;
    const inside = (e: { x: number; y: number }) => inRect(r, e);
    const move = (path: (string | number)[]) => {
      doc.setIn([...path, "x"], (doc.getIn([...path, "x"]) as number) + dx);
      doc.setIn([...path, "y"], (doc.getIn([...path, "y"]) as number) + dy);
    };
    for (const list of ["events", "exits", "enemies", "gates", "switches", "traps", "wallDecor"] as const) {
      (map[list] as { x: number; y: number }[] | undefined)?.forEach((e, i) => inside(e) && move([list, i]));
    }
    for (const [id, s] of Object.entries(map.spawns ?? {})) if (inside(s)) move(["spawns", id]);
    const qp = map.editor?.quickPlay;
    if (qp?.x !== undefined && qp.y !== undefined && inside({ x: qp.x, y: qp.y })) move(["editor", "quickPlay"]);
  }
}
