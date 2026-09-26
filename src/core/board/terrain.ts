import type { Ctx } from "../context";
import type { GameEvent } from "../events";
import type { Pos } from "../util/grid";
import { key } from "../util/grid";
import { board, grid, isExploring, mapMemory, piecesAt } from "./board";
import { isFlyingPiece } from "./moves";
import type { Piece } from "../state/types";

/**
 * Terrain that reacts to field effects (§5.4): ice bridges water, fire burns flowers/grass and
 * spreads, fire melts ice. Terrain changes are remembered per map.
 */

const ORTHO: Pos[] = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
];

/** Rounds a fire lasts when it spreads on its own. */
const SPREAD_ROUNDS = 2;

function effectsOn(ctx: Ctx, p: Pos) {
  return board(ctx).fieldEffects.filter((f) => f.x === p.x && f.y === p.y);
}

/**
 * The ice under `p` is gone: whoever stands there on open water goes back to the cell they
 * stepped onto the ice from (or the nearest free walkable cell) (§5.4).
 */
function strandCheck(ctx: Ctx, p: Pos): GameEvent[] {
  const g = grid(ctx);
  if (g.cell(p)?.walkable) return [];
  const events: GameEvent[] = [];
  for (const piece of piecesAt(ctx, p, { includeFallen: true })) {
    if (!piece.fallen && isFlyingPiece(ctx, piece)) continue;
    const back = piece.iceOrigin && g.cell(piece.iceOrigin)?.walkable ? piece.iceOrigin : nearestShore(ctx, p, piece);
    delete piece.iceOrigin;
    if (!back) continue;
    piece.x = back.x;
    piece.y = back.y;
    events.push({ type: "move", piece: piece.id, path: [back], mode: "warp" });
  }
  return events;
}

function nearestShore(ctx: Ctx, p: Pos, piece: Piece): Pos | undefined {
  const g = grid(ctx);
  for (let r = 1; r < 8; r++) {
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const n = { x: p.x + dx, y: p.y + dy };
        if (!g.cell(n)?.walkable) continue;
        if (piecesAt(ctx, n).some((o) => o.faction !== piece.faction)) continue;
        return n;
      }
  }
  return undefined;
}

/**
 * Cells an ice spell of `size` (3, 5, 7) freezes (§5.4): aimed at water, a size×size square
 * around the target – water cells only; aimed at anything else, a straight line of `size` cells
 * centred on the target, along the caster → target direction.
 */
export function freezeCells(ctx: Ctx, caster: Pos, target: Pos, size: number): Pos[] {
  const g = grid(ctx);
  const half = Math.floor(size / 2);
  const out: Pos[] = [];
  if (!g.has(target)) return out;
  // The cold creeps from cell to cell and only across steps of at most one level (§5.4).
  const step = (a: Pos, b: Pos) => g.has(b) && Math.abs(g.heightAt(a) - g.heightAt(b)) <= 1;
  if (g.terrain(target)?.freezable) {
    // water: the square around the target, water cells reachable from it
    const seen = new Set([key(target)]);
    const queue = [target];
    while (queue.length) {
      const cur = queue.shift()!;
      out.push(cur);
      for (const d of ORTHO) {
        const n = { x: cur.x + d.x, y: cur.y + d.y };
        if (seen.has(key(n)) || Math.abs(n.x - target.x) > half || Math.abs(n.y - target.y) > half) continue;
        if (!g.terrain(n)?.freezable || !step(cur, n)) continue;
        seen.add(key(n));
        queue.push(n);
      }
    }
    return out.sort((a, b) => a.y - b.y || a.x - b.x);
  }
  // land: a line along the caster → target direction, stopping at steps of more than one level
  const dx = target.x - caster.x;
  const dy = target.y - caster.y;
  const axis = Math.abs(dx) >= Math.abs(dy) ? { x: 1, y: 0 } : { x: 0, y: 1 };
  const line: Pos[] = [target];
  for (const sign of [-1, 1]) {
    let cur = target;
    for (let k = 1; k <= half; k++) {
      const n = { x: cur.x + axis.x * sign, y: cur.y + axis.y * sign };
      if (!step(cur, n)) break;
      line.push(n);
      cur = n;
    }
  }
  return line.sort((a, b) => a.y - b.y || a.x - b.x);
}

/** Terrain or decor on `p` that fire can catch. */
function burnable(ctx: Ctx, p: Pos): boolean {
  const g = grid(ctx);
  const c = g.cell(p);
  if (!c) return false;
  return !!g.chipset.terrains[c.terrain].flammable || !!(c.decor && g.chipset.decor[c.decor]?.flammable);
}

/** Changes a cell's decor for good: null removes it (burnt, cut), an id adds it (grown). */
export function setDecor(ctx: Ctx, p: Pos, decor: string | null, cause?: "burnt" | "cut" | "grown"): GameEvent[] {
  const mem = mapMemory(ctx, board(ctx).mapId);
  (mem.decor ??= {})[key(p)] = decor;
  return [{ type: "decor", x: p.x, y: p.y, decor, ...(cause ? { cause } : {}) }];
}

/** Does lightning run through this cell? Water (not frozen) or a conducting field effect (§5.6). */
export function conductive(ctx: Ctx, p: Pos): boolean {
  const effects = board(ctx).fieldEffects.filter((f) => f.x === p.x && f.y === p.y).map((f) => ctx.db.fieldEffect(f.effect));
  if (effects.some((f) => f.conducts)) return true;
  return !!grid(ctx).terrain(p)?.water && !effects.some((f) => f.bridges);
}

/**
 * Cells a bolt striking `target` reaches, with their distance (§5.6): just the target, or – on a
 * conductive cell – every conductive cell connected to it (4-neighbourhood) within `reach` steps.
 */
export function shockNetwork(ctx: Ctx, target: Pos, reach = 4): { pos: Pos; d: number }[] {
  if (!grid(ctx).has(target)) return [];
  if (!conductive(ctx, target)) return [{ pos: target, d: 0 }];
  const out: { pos: Pos; d: number }[] = [];
  const seen = new Set([key(target)]);
  let frontier = [target];
  for (let d = 0; d <= reach && frontier.length; d++) {
    const next: Pos[] = [];
    for (const p of frontier) {
      out.push({ pos: p, d });
      for (const o of ORTHO) {
        const n = { x: p.x + o.x, y: p.y + o.y };
        if (seen.has(key(n)) || !grid(ctx).has(n) || !conductive(ctx, n)) continue;
        seen.add(key(n));
        next.push(n);
      }
    }
    frontier = next;
  }
  return out;
}

/** Damage multiplier of a bolt at distance d from where it struck (§5.6). */
export function shockMultiplier(onWater: boolean, d: number): number {
  return onWater ? Math.max(0.25, 1.5 - 0.25 * d) : 1;
}

/** Changes a cell's terrain for good (e.g. flowers → scorched earth). */
export function setTerrain(ctx: Ctx, p: Pos, terrain: string): GameEvent[] {
  const mem = mapMemory(ctx, board(ctx).mapId);
  (mem.terrain ??= {})[key(p)] = terrain;
  return [{ type: "terrain", x: p.x, y: p.y, terrain }];
}

/**
 * Puts a field effect on a cell following the terrain rules:
 * - open water (freezable, not bridged) only takes bridging effects (ice)
 * - an effect that `melts` another removes that one instead (fire on ice)
 * - an igniting effect burns flammable terrain, which then spreads the fire
 */
export function placeFieldEffect(ctx: Ctx, p: Pos, effect: string, rounds: number, opts: { spreading?: boolean } = {}): GameEvent[] {
  const g = grid(ctx);
  const cell = g.cell(p);
  if (!cell) return [];
  const b = board(ctx);
  const fx = ctx.db.fieldEffect(effect);
  const terrain = g.chipset.terrains[cell.terrain];
  const events: GameEvent[] = [];
  const present = effectsOn(ctx, p);

  if (fx.melts) {
    const melting = present.filter((f) => f.effect === fx.melts);
    if (melting.length) {
      b.fieldEffects = b.fieldEffects.filter((f) => !melting.includes(f));
      return [{ type: "melt", x: p.x, y: p.y }, { type: "fieldEffect", x: p.x, y: p.y, effect: fx.melts, rounds: 0 }, ...strandCheck(ctx, p)];
    }
  }
  if (terrain.freezable && !fx.bridges) return []; // water douses fire, washes away clouds and mud
  // Boards without enemies run on a clock: some effects (ice) last longer there (§8.10).
  if (fx.exploreFactor && isExploring(ctx)) rounds = Math.round(rounds * fx.exploreFactor);

  let spreads = false;
  if (fx.ignites && terrain.flammable && terrain.burnsTo) {
    events.push(...setTerrain(ctx, p, terrain.burnsTo));
    spreads = true;
  }
  if (fx.ignites && cell.decor && g.chipset.decor[cell.decor]?.flammable) {
    // a cactus, bush or bramble burns away for good
    events.push(...setDecor(ctx, p, null, "burnt"));
    spreads = true;
  }
  // seeds only take on free, plantable ground (§5.7)
  if (fx.grows && (!cell.walkable || cell.decor || terrain.water)) return events;
  if (fx.ignites && opts.spreading && !spreads) return [];
  b.fieldEffects = b.fieldEffects.filter((f) => !(f.x === p.x && f.y === p.y));
  b.fieldEffects.push({ x: p.x, y: p.y, effect, rounds, ...(spreads ? { spreads: true } : {}) });
  events.push({ type: "fieldEffect", x: p.x, y: p.y, effect, rounds });
  return events;
}

/**
 * Round start: durations run down (people on melted ice over water go back ashore), then fires on
 * burnt terrain spread to flammable 4-neighbours.
 */
export function tickFieldEffects(ctx: Ctx): GameEvent[] {
  const b = board(ctx);
  const events: GameEvent[] = [];
  const spreaders = b.fieldEffects.filter((f) => f.spreads);
  const kept = [];
  for (const f of b.fieldEffects) {
    if (f.rounds > 1) kept.push({ ...f, rounds: f.rounds - 1 });
    else events.push({ type: "fieldEffect", x: f.x, y: f.y, effect: f.effect, rounds: 0 });
  }
  const gone = b.fieldEffects.filter((f) => f.rounds <= 1);
  b.fieldEffects = kept;
  for (const f of gone) {
    const fx = ctx.db.fieldEffect(f.effect);
    if (fx.bridges) events.push(...strandCheck(ctx, f));
    // seeds sprout into brambles – unless someone stands there (§5.7)
    if (fx.grows && !piecesAt(ctx, f, { includeFallen: true }).length && !grid(ctx).cell(f)?.decor) events.push(...setDecor(ctx, f, fx.grows, "grown"));
  }
  for (const f of spreaders) {
    for (const d of ORTHO) {
      const n = { x: f.x + d.x, y: f.y + d.y };
      // fire only climbs or drops one level at a time (§5.4)
      if (burnable(ctx, n) && Math.abs(grid(ctx).heightAt(n) - grid(ctx).heightAt(f)) <= 1) events.push(...placeFieldEffect(ctx, n, f.effect, SPREAD_ROUNDS, { spreading: true }));
    }
  }
  return events;
}
