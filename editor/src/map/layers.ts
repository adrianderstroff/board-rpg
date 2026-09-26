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
 * Adds (positive) or removes (negative) rows/columns on each side. New cells get `fill` terrain at
 * height 0; everything placed on the map (events, exits, spawns…) moves along.
 */
export function resize(doc: Document, map: MapDef, delta: { left: number; right: number; top: number; bottom: number }, fill: string) {
  const { w, h } = mapSize(map);
  const nw = w + delta.left + delta.right;
  const nh = h + delta.top + delta.bottom;
  if (nw < 1 || nh < 1) throw new Error("A map needs at least one cell");
  const fillCh = legendChar(doc, map, "terrain", fill);
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
