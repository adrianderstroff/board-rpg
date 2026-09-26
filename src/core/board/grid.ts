import type { Database } from "../data/database";
import type { ChipsetDef, Corner, MapDef, TerrainDef } from "../data/types";
import type { Pos } from "../util/grid";
import { key } from "../util/grid";

export interface Cell {
  x: number;
  y: number;
  terrain: string;
  height: number;
  decor?: string;
  /** Walkable terrain and no blocking decor. */
  walkable: boolean;
  /** Permanent field effect from terrain. */
  surface?: string;
  /** Visual structure above the cell (door lintel): terrain and the level of its top. */
  overhead?: { terrain: string; top: number };
  /** Corners cut off along the diagonals (§5.9): a half cell or a point – purely visual, not walkable. */
  cut?: Corner[];
}

/** Levels of open space under an overhead structure (a doorway ≈ a character's height, 4 × 8 px). */
export const DOOR_CLEARANCE = 4;

/** Read access to a board's cells – the static {@link BoardGrid} or a {@link LiveGrid} view of it. */
export interface GridView {
  readonly width: number;
  readonly height: number;
  readonly map: MapDef;
  readonly chipset: ChipsetDef;
  cell(p: Pos): Cell | undefined;
  has(p: Pos): boolean;
  terrain(p: Pos): TerrainDef | undefined;
  heightAt(p: Pos): number;
  allCells(): Cell[];
}

/** Static cell data of a map (terrain, heights, decor). Derived from MapDef + chipset, never saved. */
export class BoardGrid implements GridView {
  readonly width: number;
  readonly height: number;
  private readonly cells = new Map<string, Cell>();

  constructor(
    readonly map: MapDef,
    readonly chipset: ChipsetDef,
  ) {
    const terrainRows = splitRows(map.layers.terrain);
    const heightRows = splitRows(map.layers.height ?? "");
    const decorRows = splitRows(map.layers.decor ?? "");
    const overRows = splitRows(map.layers.overhead ?? "");
    const overHeightRows = splitRows(map.layers.overheadHeight ?? "");
    const shapeRows = splitRows(map.layers.shape ?? "");
    this.height = terrainRows.length;
    this.width = Math.max(0, ...terrainRows.map((r) => r.length));

    for (let y = 0; y < terrainRows.length; y++) {
      for (let x = 0; x < terrainRows[y].length; x++) {
        const ch = terrainRows[y][x];
        const terrainKey = map.legend.terrain[ch];
        if (!terrainKey) continue; // hole
        const terrain = chipset.terrains[terrainKey];
        if (!terrain) throw new Error(`Map ${map.id}: unknown terrain "${terrainKey}" at ${x},${y}`);
        const h = parseHeight(heightRows[y]?.[x]);
        const decorKey = decorRows[y]?.[x] ? map.legend.decor?.[decorRows[y][x]] : undefined;
        const decor = decorKey ? chipset.decor[decorKey] : undefined;
        if (decorKey && !decor) throw new Error(`Map ${map.id}: unknown decor "${decorKey}" at ${x},${y}`);
        const overKey = overRows[y]?.[x] ? map.legend.terrain[overRows[y][x]] : undefined;
        if (overKey && !chipset.terrains[overKey]) throw new Error(`Map ${map.id}: unknown overhead terrain "${overKey}" at ${x},${y}`);
        const overTop = overKey ? parseHeight(overHeightRows[y]?.[x]) : 0;
        const shapeCh = shapeRows[y]?.[x];
        const shape = shapeCh && shapeCh !== "." ? map.legend.shapes?.[shapeCh] : undefined;
        if (shapeCh && shapeCh !== "." && !shape) throw new Error(`Map ${map.id}: unknown shape "${shapeCh}" at ${x},${y}`);
        this.cells.set(key({ x, y }), {
          x,
          y,
          terrain: terrainKey,
          height: h,
          decor: decorKey,
          ...(overKey && overTop >= h + DOOR_CLEARANCE + 1 ? { overhead: { terrain: overKey, top: overTop } } : {}),
          walkable: terrain.walkable && !decor?.blocks && !shape,
          surface: terrain.surface,
          ...(shape ? { cut: shape.cut } : {}),
        });
      }
    }
  }

  cell(p: Pos): Cell | undefined {
    return this.cells.get(key(p));
  }

  has(p: Pos): boolean {
    return this.cells.has(key(p));
  }

  terrain(p: Pos): TerrainDef | undefined {
    const c = this.cell(p);
    return c ? this.chipset.terrains[c.terrain] : undefined;
  }

  heightAt(p: Pos): number {
    return this.cell(p)?.height ?? 0;
  }

  allCells(): Cell[] {
    return [...this.cells.values()];
  }
}

/**
 * The grid as it is right now (§5.4): terrain overrides (burnt flowers…) replace the static
 * terrain, and freezable terrain is walkable where `bridged` says so (ice on water).
 */
export class LiveGrid implements GridView {
  constructor(
    private readonly base: BoardGrid,
    private readonly overrides: Record<string, string>,
    private readonly bridged: (p: Pos) => boolean,
    private readonly decorOverrides: Record<string, string | null> = {},
    private readonly closed: ReadonlySet<string> = new Set(),
  ) {}

  get width() {
    return this.base.width;
  }
  get height() {
    return this.base.height;
  }
  get map() {
    return this.base.map;
  }
  get chipset() {
    return this.base.chipset;
  }

  cell(p: Pos): Cell | undefined {
    const c = this.base.cell(p);
    if (!c) return c;
    const k = key(p);
    const over = this.overrides[k];
    const terrainKey = over ?? c.terrain;
    const t = this.chipset.terrains[terrainKey];
    const od = this.decorOverrides[k];
    const decor = od === undefined ? c.decor : (od ?? undefined);
    const decorBlocks = !!(decor && this.chipset.decor[decor]?.blocks);
    let walkable = t.walkable && !decorBlocks && !this.closed.has(k) && !c.cut;
    if (!walkable && t.freezable && !decorBlocks && this.bridged(p)) walkable = true;
    if (!over && decor === c.decor && walkable === c.walkable) return c;
    if (this.closed.has(k)) return { ...c, terrain: terrainKey, decor, walkable: false, surface: t.surface };
    return { ...c, terrain: terrainKey, decor, walkable, surface: t.surface };
  }

  has(p: Pos): boolean {
    return this.base.has(p);
  }

  terrain(p: Pos): TerrainDef | undefined {
    const c = this.cell(p);
    return c ? this.chipset.terrains[c.terrain] : undefined;
  }

  heightAt(p: Pos): number {
    return this.base.heightAt(p);
  }

  allCells(): Cell[] {
    return this.base.allCells().map((c) => this.cell(c)!);
  }
}

function splitRows(layer: string): string[] {
  const rows = layer.replace(/\r/g, "").split("\n");
  while (rows.length && rows[rows.length - 1].trim() === "") rows.pop();
  return rows;
}

/** Height chars: 0-9 then a-z (10-35). Anything else = 0. */
export function parseHeight(ch: string | undefined): number {
  if (!ch) return 0;
  if (ch >= "0" && ch <= "9") return ch.charCodeAt(0) - 48;
  if (ch >= "a" && ch <= "z") return ch.charCodeAt(0) - 87;
  return 0;
}

const cache = new WeakMap<Database, Map<string, BoardGrid>>();

export function getGrid(db: Database, mapId: string): BoardGrid {
  let perDb = cache.get(db);
  if (!perDb) cache.set(db, (perDb = new Map()));
  let grid = perDb.get(mapId);
  if (!grid) {
    const map = db.map(mapId);
    grid = new BoardGrid(map, db.chipset(map.chipset));
    perDb.set(mapId, grid);
  }
  return grid;
}
