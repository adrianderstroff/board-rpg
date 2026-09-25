import { computeStats, effectiveStats, hasFlagStatus, isAlive, removeStatus } from "../chars/character";
import { findChar, getChar, type Ctx } from "../context";
import { dealDamage, heal } from "../effects/effects";
import type { GameEvent } from "../events";
import type { Character, Piece } from "../state/types";
import { hashNoise } from "../util/rng";
import { aliveMembers, board, pageOfPiece, pieceOf, pieceSpeed, pieces, reconcile } from "./board";
import { cellEffects } from "./moves";

const FACTION_ORDER = { hero: 0, enemy: 1, npc: 2 } as const;

/** Pieces that take turns: heroes, enemies, and NPCs that wander. */
function takesTurns(ctx: Ctx, p: Piece): boolean {
  if (p.fallen || !p.members.length) return false;
  if (p.faction !== "npc") return true;
  return pageOfPiece(ctx, p)?.move === "wander";
}

/**
 * Remaining actors this round in order (§7.1): pieces by slot speed (slowest member),
 * heroes before enemies before NPCs on ties, then a stable per-round tiebreak;
 * members of a piece act consecutively by their own speed.
 */
export function turnQueue(ctx: Ctx): string[] {
  const b = board(ctx);
  const entries: { id: string; slot: number; faction: number; noise: number; own: number }[] = [];
  for (const p of pieces(ctx)) {
    if (!takesTurns(ctx, p)) continue;
    const slot = pieceSpeed(ctx, p);
    const noise = hashNoise(`${p.id}:${b.turn.round}`);
    for (const c of aliveMembers(ctx, p)) {
      if (b.turn.acted.includes(c.id)) continue;
      entries.push({ id: c.id, slot, faction: FACTION_ORDER[p.faction], noise, own: effectiveStats(ctx.db, c, "board").spd });
    }
  }
  entries.sort((a, b) => b.slot - a.slot || a.faction - b.faction || a.noise - b.noise || b.own - a.own || a.id.localeCompare(b.id));
  return entries.map((e) => e.id);
}

export interface TurnStart {
  actor: string | null;
  events: GameEvent[];
}

/**
 * Returns the current actor, starting the next turn (and a new round) when needed.
 * Characters with a skip-turn status (Sleep) automatically lose their turn.
 */
export function nextTurn(ctx: Ctx): TurnStart {
  const b = board(ctx);
  const events: GameEvent[] = [];
  if (b.turn.current) return { actor: b.turn.current, events };
  for (let guard = 0; guard < 500; guard++) {
    let queue = turnQueue(ctx);
    if (!queue.length) {
      events.push(...startRound(ctx));
      queue = turnQueue(ctx);
      if (!queue.length) return { actor: null, events };
    }
    const actor = queue[0];
    b.turn.current = actor;
    const c = getChar(ctx, actor);
    events.push({ type: "turnStart", actor, round: b.turn.round });
    // The cell's field effects hit the whole piece once, when its first member starts its turn.
    const piece = pieceOf(ctx, actor);
    const ticked = (b.turn.cellTicked ??= []);
    if (piece && !ticked.includes(piece.id)) {
      ticked.push(piece.id);
      events.push(...cellEffects(ctx, piece), ...reconcile(ctx));
      if (!isAlive(c)) {
        events.push(...endTurn(ctx, actor));
        continue;
      }
    }
    if (hasFlagStatus(ctx.db, c, "board", "skipTurn")) {
      events.push({ type: "turnSkipped", actor, reason: c.statuses.map((s) => s.id).join(",") });
      events.push(...endTurn(ctx, actor));
      continue;
    }
    return { actor, events };
  }
  throw new Error("Turn loop did not settle");
}

function startRound(ctx: Ctx): GameEvent[] {
  const b = board(ctx);
  b.turn.round++;
  b.turn.acted = [];
  b.turn.moved = [];
  b.turn.abilityUsed = [];
  b.turn.cellTicked = [];
  const expired = b.fieldEffects.filter((f) => f.rounds <= 1);
  b.fieldEffects = b.fieldEffects.filter((f) => f.rounds > 1).map((f) => ({ ...f, rounds: f.rounds - 1 }));
  const events: GameEvent[] = [{ type: "round", round: b.turn.round }];
  for (const f of expired) events.push({ type: "fieldEffect", x: f.x, y: f.y, effect: f.effect, rounds: 0 });
  return events;
}

/** Ends a character's board turn: cell effects, status ticks & durations (§4.2, §7.4). */
export function endTurn(ctx: Ctx, charId: string): GameEvent[] {
  const b = board(ctx);
  const c = findChar(ctx, charId); // may be gone if it died during its turn
  const events: GameEvent[] = [];
  if (c && isAlive(c)) events.push(...tickStatuses(ctx, c, "board"));
  if (!b.turn.acted.includes(charId)) b.turn.acted.push(charId);
  if (b.turn.current === charId) b.turn.current = null;
  events.push(...reconcile(ctx));
  return events;
}

/** Status ticks (poison/regen) and duration countdown for one scope. */
export function tickStatuses(ctx: Ctx, c: Character, scope: "board" | "battle"): GameEvent[] {
  const events: GameEvent[] = [];
  for (const st of [...c.statuses]) {
    const def = ctx.db.status(st.id);
    if (!def.scope.includes(scope) || !isAlive(c)) continue;
    if (def.tickPercent) {
      const amount = Math.max(1, Math.round((computeStats(ctx.db, c).maxHp * Math.abs(def.tickPercent)) / 100));
      if (def.tickPercent < 0) {
        events.push(...dealDamage(ctx, c, amount, { nonLethal: scope === "board" && !!def.nonLethalOnBoard }));
      } else events.push(...heal(ctx, c, amount));
    }
    if (st.turns !== undefined) {
      st.turns--;
      if (st.turns <= 0 && removeStatus(c, st.id)) events.push({ type: "status", target: c.id, status: st.id, added: false });
    }
  }
  return events;
}

export function abilityUsed(ctx: Ctx, charId: string): boolean {
  return board(ctx).turn.abilityUsed.includes(charId);
}

export function markAbilityUsed(ctx: Ctx, charId: string) {
  const t = board(ctx).turn;
  if (!t.abilityUsed.includes(charId)) t.abilityUsed.push(charId);
}
