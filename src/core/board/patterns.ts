import type { Database } from "../data/database";
import type { PatternDef, PatternPart, PatternRef } from "../data/types";
import type { Pos } from "../util/grid";
import { add, chebyshev, dirVectors, key, manhattan } from "../util/grid";
import type { BoardGrid } from "./grid";

/**
 * Occupancy of a cell for a moving piece:
 * - free:  can pass and stop
 * - pass:  can pass through, cannot stop (allies)
 * - stop:  can stop (engage/interact), cannot pass (enemies, NPCs)
 * - block: neither
 */
export type Occupancy = "free" | "pass" | "stop" | "block";

export interface Reach {
  pos: Pos;
  /** Cells walked through, excluding the origin, ending with pos. */
  path: Pos[];
  mode: "walk" | "leap";
}

export interface ResolvedPattern {
  parts: PatternPart[];
  reach: number;
  ignoreHeight: boolean;
  ignoreBlocking: boolean;
  includeOrigin: boolean;
  maxHeightDiff: number;
}

export function resolvePatternRef(db: Database, ref: PatternRef): ResolvedPattern {
  const def: Omit<PatternDef, "id"> = typeof ref === "string" ? db.pattern(ref) : ref;
  const parts = flattenParts(db, def.parts, new Set());
  return {
    parts,
    reach: def.reach ?? computeReach(parts),
    ignoreHeight: !!def.ignoreHeight,
    ignoreBlocking: !!def.ignoreBlocking,
    includeOrigin: !!def.includeOrigin,
    maxHeightDiff: def.maxHeightDiff ?? 1,
  };
}

function flattenParts(db: Database, parts: PatternPart[], seen: Set<string>): PatternPart[] {
  const out: PatternPart[] = [];
  for (const p of parts) {
    if ("include" in p) {
      if (seen.has(p.include)) throw new Error(`Pattern include cycle at "${p.include}"`);
      out.push(...flattenParts(db, db.pattern(p.include).parts, new Set([...seen, p.include])));
    } else out.push(p);
  }
  return out;
}

export function leapOffsets(part: { leap: [number, number][]; symmetric?: boolean }): Pos[] {
  const seen = new Set<string>();
  const out: Pos[] = [];
  for (const [a, b] of part.leap) {
    const variants = part.symmetric
      ? [
          [a, b], [b, a], [-a, b], [-b, a], [a, -b], [b, -a], [-a, -b], [-b, -a],
        ]
      : [[a, b]];
    for (const [x, y] of variants) {
      const k = `${x},${y}`;
      if (!seen.has(k) && (x !== 0 || y !== 0)) {
        seen.add(k);
        out.push({ x, y });
      }
    }
  }
  return out;
}

function computeReach(parts: PatternPart[]): number {
  let r = 0;
  for (const p of parts) {
    if ("walk" in p) r = Math.max(r, p.walk);
    else if ("ray" in p) r = Math.max(r, p.ray);
    else if ("area" in p) r = Math.max(r, p.area);
    else if ("leap" in p) for (const o of leapOffsets(p)) r = Math.max(r, chebyshev(o, { x: 0, y: 0 }));
  }
  return r;
}

export interface MoveQuery {
  grid: BoardGrid;
  origin: Pos;
  pattern: ResolvedPattern;
  /** Cut off everything beyond this reach (party rule). */
  maxReach?: number;
  occupancy: (p: Pos) => Occupancy;
}

/** Destinations reachable with a movement pattern, each with its shortest path. */
export function resolveMoves(q: MoveQuery): Map<string, Reach> {
  const { grid, origin, pattern } = q;
  const cap = Math.min(pattern.reach, q.maxReach ?? Infinity);
  const result = new Map<string, Reach>();
  if (cap <= 0) return result;

  const record = (r: Reach) => {
    const k = key(r.pos);
    const prev = result.get(k);
    if (!prev || better(r, prev)) result.set(k, r);
  };

  const canStep = (from: Pos, to: Pos, maxDiff: number) => {
    const cell = grid.cell(to);
    if (!cell) return false;
    if (!cell.walkable && !pattern.ignoreBlocking) return false;
    if (!pattern.ignoreHeight && Math.abs(cell.height - grid.heightAt(from)) > maxDiff) return false;
    return true;
  };

  for (const part of pattern.parts) {
    if ("walk" in part) {
      const range = Math.min(part.walk, cap);
      const dirs = dirVectors(part.dirs ?? "orthogonal");
      const seen = new Map<string, Pos[]>([[key(origin), []]]);
      let frontier: { pos: Pos; path: Pos[] }[] = [{ pos: origin, path: [] }];
      for (let step = 0; step < range; step++) {
        const next: typeof frontier = [];
        for (const f of frontier) {
          for (const d of dirs) {
            const n = add(f.pos, d);
            const k = key(n);
            if (seen.has(k) || !canStep(f.pos, n, pattern.maxHeightDiff)) continue;
            const occ = q.occupancy(n);
            if (occ === "block") continue;
            const path = [...f.path, n];
            seen.set(k, path);
            if (occ === "free" || occ === "stop") record({ pos: n, path, mode: "walk" });
            if (occ === "free" || occ === "pass") next.push({ pos: n, path });
          }
        }
        frontier = next;
      }
    } else if ("ray" in part) {
      const range = Math.min(part.ray, cap);
      for (const d of dirVectors(part.dirs ?? "orthogonal")) {
        let cur = origin;
        const path: Pos[] = [];
        for (let i = 0; i < range; i++) {
          const n = add(cur, d);
          if (!canStep(cur, n, pattern.maxHeightDiff)) break;
          const occ = q.occupancy(n);
          if (occ === "block") break;
          path.push(n);
          if (occ === "free" || occ === "stop") record({ pos: n, path: [...path], mode: "walk" });
          if (occ === "stop") break;
          cur = n;
        }
      }
    } else if ("leap" in part) {
      const maxDiff = part.maxHeightDiff ?? pattern.maxHeightDiff;
      for (const o of leapOffsets(part)) {
        if (chebyshev(o, { x: 0, y: 0 }) > cap) continue;
        const n = add(origin, o);
        if (!canStep(origin, n, maxDiff)) continue;
        const occ = q.occupancy(n);
        if (occ === "free" || occ === "stop") record({ pos: n, path: [n], mode: "leap" });
      }
    } else if ("area" in part) {
      for (const p of areaCells(origin, Math.min(part.area, cap), part.shape ?? "diamond")) {
        if (p.x === origin.x && p.y === origin.y) continue;
        if (!canStep(origin, p, pattern.ignoreHeight ? Infinity : pattern.maxHeightDiff)) continue;
        const occ = q.occupancy(p);
        if (occ === "free" || occ === "stop") record({ pos: p, path: [p], mode: "leap" });
      }
    }
  }
  return result;
}

/** Walk paths beat leaps; shorter beats longer. */
function better(a: Reach, b: Reach): boolean {
  if (a.mode !== b.mode) return a.mode === "walk";
  return a.path.length < b.path.length;
}

export function areaCells(origin: Pos, radius: number, shape: "diamond" | "square" | "cross"): Pos[] {
  const out: Pos[] = [];
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const p = { x: origin.x + dx, y: origin.y + dy };
      const ok =
        shape === "square"
          ? true
          : shape === "cross"
            ? dx === 0 || dy === 0
            : manhattan(p, origin) <= radius;
      if (ok) out.push(p);
    }
  }
  return out;
}

/**
 * Static target cells of a pattern (ability ranges and areas): ignores occupancy,
 * only requires the cell to exist. Rays/walks are treated as their geometric shape.
 */
export function patternCells(grid: BoardGrid, origin: Pos, pattern: ResolvedPattern): Pos[] {
  const out = new Map<string, Pos>();
  if (pattern.includeOrigin && grid.has(origin)) out.set(key(origin), origin);
  const moves = resolveMoves({
    grid,
    origin,
    pattern: { ...pattern, ignoreBlocking: true },
    occupancy: () => "free",
  });
  for (const r of moves.values()) out.set(key(r.pos), r.pos);
  return [...out.values()];
}
