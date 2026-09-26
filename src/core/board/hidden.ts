import { addStatus, isAlive } from "../chars/character";
import type { Ctx } from "../context";
import type { MapTrapDef } from "../data/types";
import { dealDamage } from "../effects/effects";
import { addItem } from "../items/inventory";
import type { GameEvent } from "../events";
import type { Character, Piece } from "../state/types";
import type { Pos } from "../util/grid";
import { chebyshev, key, samePos } from "../util/grid";
import { movePatternOf } from "../chars/character";
import { aliveMembers, board, grid, mapMemory, mustPieceOf, pieceReach, pieces, reconcile, syncEvents } from "./board";
import { occupancyFor } from "./moves";
import { resolveMoves, resolvePatternRef } from "./patterns";

/**
 * Hidden things (§7.5): ancient traps that stop heroes, hidden objects (invisible chests) and
 * dormant enemies that look like remains. The Thief's Discover senses and uncovers them.
 */

export interface HiddenThing {
  /** "trap:<id>", "event:<id>" or "enemy:<pieceId>". */
  id: string;
  kind: "trap" | "event" | "enemy";
  x: number;
  y: number;
}

function memory(ctx: Ctx) {
  return mapMemory(ctx, board(ctx).mapId);
}

/** Ancient traps of the current map that are still armed. */
export function armedTraps(ctx: Ctx): MapTrapDef[] {
  const sprung = memory(ctx).sprung ?? [];
  return (ctx.db.map(board(ctx).mapId).traps ?? []).filter((t) => !sprung.includes(t.id));
}

export function dormantPieces(ctx: Ctx): Piece[] {
  return pieces(ctx).filter((p) => p.dormant);
}

/** Ancient traps Discover has revealed: still armed, visible, avoided by the heroes' paths. */
export function revealedTraps(ctx: Ctx): MapTrapDef[] {
  const revealed = memory(ctx).revealed ?? [];
  return armedTraps(ctx).filter((t) => revealed.includes(t.id));
}

/** Everything on this board that is still hidden from the heroes. */
export function hiddenThings(ctx: Ctx): HiddenThing[] {
  const mem = memory(ctx);
  const discovered = mem.discovered ?? [];
  const revealed = mem.revealed ?? [];
  const things: HiddenThing[] = armedTraps(ctx)
    .filter((t) => !revealed.includes(t.id))
    .map((t) => ({ id: `trap:${t.id}`, kind: "trap", x: t.x, y: t.y }));
  for (const ev of ctx.db.map(board(ctx).mapId).events ?? []) {
    if (ev.hidden && !discovered.includes(ev.id)) things.push({ id: `event:${ev.id}`, kind: "event", x: ev.x, y: ev.y });
  }
  for (const p of dormantPieces(ctx)) things.push({ id: `enemy:${p.id}`, kind: "enemy", x: p.x, y: p.y });
  return things;
}

/**
 * Could this dormant enemy attack a hero standing on `target` with its own move pattern (§7.5)?
 * That's when it rises – close enough to strike first.
 */
export function canReach(ctx: Ctx, sleeper: Piece, target: Pos): boolean {
  const leader = aliveMembers(ctx, sleeper)[0];
  if (!leader) return false;
  const occupancy = occupancyFor(ctx, sleeper);
  const moves = resolveMoves({
    grid: grid(ctx),
    origin: sleeper,
    pattern: resolvePatternRef(ctx.db, movePatternOf(ctx.db, leader)),
    maxReach: pieceReach(ctx, sleeper),
    occupancy: (p) => (samePos(p, target) ? "stop" : occupancy(p)),
  });
  return moves.has(key(target));
}

/**
 * Where a move gets interrupted: index of the first path cell with a trap – ancient traps for
 * heroes (§7.5), thief traps for enemies – or (heroes) one a dormant enemy could strike;
 * -1 if none. Flying pieces ignore traps. Leaps only check the landing cell.
 */
export function interruptionAt(ctx: Ctx, piece: Piece, path: Pos[], mode: string, flying: boolean): number {
  if (!path.length || piece.faction === "npc") return -1;
  const hero = piece.faction === "hero";
  const traps: Pos[] = flying ? [] : hero ? armedTraps(ctx) : board(ctx).traps;
  const sleepers = hero ? dormantPieces(ctx) : [];
  if (!traps.length && !sleepers.length) return -1;
  const first = mode === "leap" ? path.length - 1 : 0;
  for (let i = first; i < path.length; i++) {
    const p = path[i];
    if (traps.some((t) => samePos(t, p))) return i;
    if (sleepers.some((s) => canReach(ctx, s, p))) return i;
  }
  return -1;
}

/** A dormant enemy rises (§7.5). */
export function wake(_ctx: Ctx, piece: Piece): GameEvent[] {
  if (!piece.dormant) return [];
  delete piece.dormant;
  return [{ type: "wake", piece: piece.id }, { type: "pieces" }];
}

/**
 * A hero piece stopped after an interruption: an armed ancient trap on its cell springs (damage +
 * status, spent for good) and dormant enemies that can reach it rise – the first one attacks at
 * once (`ambush`). Thief traps stopping enemies are sprung by the landing rules.
 */
export function hiddenStop(ctx: Ctx, piece: Piece, flying: boolean): { events: GameEvent[]; ambush?: string } {
  const events: GameEvent[] = [];
  if (piece.faction !== "hero") return { events };
  const trap = flying ? undefined : armedTraps(ctx).find((t) => samePos(t, piece));
  if (trap) {
    (memory(ctx).sprung ??= []).push(trap.id);
    events.push({ type: "trap", x: trap.x, y: trap.y, triggeredBy: piece.id });
    for (const c of aliveMembers(ctx, piece)) {
      events.push(...dealDamage(ctx, c, trap.damage, { nonLethal: true }));
      if (trap.status && isAlive(c) && addStatus(ctx, c, trap.status)) events.push({ type: "status", target: c.id, status: trap.status, added: true });
    }
  }
  let ambush: string | undefined;
  for (const s of dormantPieces(ctx)) {
    if (!canReach(ctx, s, piece)) continue;
    events.push(...wake(ctx, s));
    ambush ??= s.id;
  }
  events.push(...reconcile(ctx));
  return { events, ambush };
}

/**
 * Discover (§7.5): everything hidden within `radius` of the user shows itself – traps become
 * visible, hidden objects appear, dormant enemies rise.
 */
export function discover(ctx: Ctx, user: Character, radius: number): GameEvent[] {
  const from = mustPieceOf(ctx, user.id);
  const mem = memory(ctx);
  const found = hiddenThings(ctx).filter((t) => chebyshev(t, from) <= radius);
  const events: GameEvent[] = [{ type: "sensed", cells: found.map((t) => ({ x: t.x, y: t.y })), center: { x: from.x, y: from.y }, radius }];
  for (const t of found) {
    const id = t.id.slice(t.id.indexOf(":") + 1);
    events.push({ type: "uncovered", x: t.x, y: t.y, what: t.kind });
    if (t.kind === "trap") (mem.revealed ??= []).push(id);
    else if (t.kind === "event") (mem.discovered ??= []).push(id);
    else {
      const piece = board(ctx).pieces[id];
      if (piece) {
        events.push(...wake(ctx, piece));
        piece.waitRound = board(ctx).turn.round; // uncovered, not provoked: it acts from next round on
      }
    }
  }
  if (found.some((t) => t.kind === "event")) events.push(...syncEvents(ctx));
  return events;
}

/** A visible trap on `p`: a revealed ancient trap or one the heroes placed. */
export function visibleTrapAt(ctx: Ctx, p: Pos): boolean {
  return revealedTraps(ctx).some((t) => samePos(t, p)) || board(ctx).traps.some((t) => samePos(t, p));
}

/** Defuse (§7.5): takes the visible trap on `p` apart – it becomes an item in the inventory. */
export function defuse(ctx: Ctx, p: Pos, item: string): GameEvent[] {
  const b = board(ctx);
  const ancient = revealedTraps(ctx).find((t) => samePos(t, p));
  if (ancient) (memory(ctx).sprung ??= []).push(ancient.id);
  else if (b.traps.some((t) => samePos(t, p))) b.traps = b.traps.filter((t) => !samePos(t, p));
  else return [];
  return [{ type: "defused", x: p.x, y: p.y, item }, ...addItem(ctx, item)];
}
