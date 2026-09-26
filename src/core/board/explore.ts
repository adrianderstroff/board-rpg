import type { Ctx } from "../context";
import type { GameEvent } from "../events";
import { planBoardTurn } from "./ai";
import { aliveMembers, board, pageOfPiece, pieces, reconcile } from "./board";
import { executeMove } from "./moves";
import { tickFieldEffects } from "./terrain";
import { startRound, tickStatuses } from "./turns";

/**
 * Free exploration (§8.10): after every hero action statuses of all heroes on the board tick
 * (unless `statuses: false`) and every move/ability flag is reset so any hero can act again.
 * Field effects run on a clock instead (exploreTime).
 */
export function exploreTick(ctx: Ctx, opts: { statuses?: boolean } = {}): GameEvent[] {
  const events: GameEvent[] = [];
  if (opts.statuses !== false) {
    for (const p of pieces(ctx)) {
      if (p.faction !== "hero" || p.fallen) continue;
      for (const c of aliveMembers(ctx, p)) events.push(...tickStatuses(ctx, c, "board"));
    }
  }
  board(ctx).turn.current = null;
  events.push(...startRound(ctx, { fieldEffects: false }).filter((e) => e.type !== "round"));
  events.push(...reconcile(ctx));
  return events;
}

/**
 * Free exploration runs field effects on a clock instead of per action (§8.10): called every
 * `config.exploreRoundMs` while the player is on the map – fires spread, ice melts.
 */
export function exploreTime(ctx: Ctx): GameEvent[] {
  return [...tickFieldEffects(ctx), ...reconcile(ctx)];
}

/** One wandering villager takes a step (called on a timer while exploring). */
export function exploreWander(ctx: Ctx): GameEvent[] {
  const npcs = pieces(ctx).filter((p) => p.faction === "npc" && !p.fallen && p.members.length && pageOfPiece(ctx, p)?.move === "wander");
  if (!npcs.length) return [];
  const piece = npcs[ctx.rng.int(0, npcs.length - 1)];
  const id = piece.members[0];
  if (!aliveMembers(ctx, piece).length) return [];
  const t = board(ctx).turn;
  t.moved = t.moved.filter((m) => !piece.members.includes(m));
  const d = planBoardTurn(ctx, id);
  return d.type === "move" ? executeMove(ctx, id, d.dest).events : [];
}

/** Leaving free exploration (an enemy appeared): tactics start fresh at round 1. */
export function startTactics(ctx: Ctx): GameEvent[] {
  const events = exploreTick(ctx, { statuses: false });
  board(ctx).turn.round = 1;
  // enemies Discover just uncovered wait out this first round
  for (const p of pieces(ctx)) if (p.waitRound !== undefined) p.waitRound = 1;
  return events;
}
