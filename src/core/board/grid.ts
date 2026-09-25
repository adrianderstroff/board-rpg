import type { Database } from "../data/database";
import type { ChipsetDef, MapDef, TerrainDef } from "../data/types";
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
}

/** Static cell data of a map (terrain, heights, decor). Derived from MapDef + chipset, never saved. */
export class BoardGrid {
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
        this.cells.set(key({ x, y }), {
          x,
          y,
          terrain: terrainKey,
          height: h,
          decor: decorKey,
          walkable: terrain.walkable && !decor?.blocks,
          surface: terrain.surface,
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
