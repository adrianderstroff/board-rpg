import type { GridView } from "../../../src/core/board/grid";
import { patternCells, resolvePatternRef } from "../../../src/core/board/patterns";
import type { Database } from "../../../src/core/data/database";
import type { PatternRef } from "../../../src/core/data/types";

/**
 * A pattern's cells on open, flat ground around the user (editor-design §8: the preview of a
 * board range or area). Offsets from the user; null when the pattern can't be resolved.
 */
export function patternOffsets(db: Database, ref: PatternRef, size = 11): { x: number; y: number }[] | null {
  const c = Math.floor(size / 2);
  const inside = (p: { x: number; y: number }) => p.x >= 0 && p.y >= 0 && p.x < size && p.y < size;
  const grid = {
    width: size,
    height: size,
    has: inside,
    cell: (p: { x: number; y: number }) => (inside(p) ? { x: p.x, y: p.y, walkable: true, height: 0 } : undefined),
    heightAt: () => 0,
  } as unknown as GridView;
  try {
    return patternCells(grid, { x: c, y: c }, resolvePatternRef(db, ref)).map((p) => ({ x: p.x - c, y: p.y - c }));
  } catch {
    return null;
  }
}
