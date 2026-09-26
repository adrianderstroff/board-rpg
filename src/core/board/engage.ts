import { isAlive, removeStatus } from "../chars/character";
import { getChar, type Ctx } from "../context";
import { startBattle } from "../battle/battle";
import type { BattleKind, BattleState } from "../battle/types";
import type { GameEvent } from "../events";
import type { Pos } from "../util/grid";
import { key } from "../util/grid";
import { aliveMembers, board, isGameOver, isHidden, mustPieceOf, piecesAt, reconcile } from "./board";
import { markMoved, movePiece, moveOptions } from "./moves";
import { BUILTIN } from "../data/builtins";

/**
 * Battle type when `attacker` engages (§8.4): heroes may get a First Strike (always when hidden),
 * enemies may Ambush (halved chance after Perceive this round).
 */
export function rollBattleKind(ctx: Ctx, attackerFaction: "hero" | "enemy", attackerHidden: boolean): BattleKind {
  const cfg = ctx.db.config;
  if (attackerFaction === "hero") {
    return attackerHidden || ctx.rng.chance(cfg.firstStrikeChance) ? "firstStrike" : "normal";
  }
  const b = board(ctx);
  const chance = b.perceivedRound === b.turn.round ? cfg.ambushChance / 2 : cfg.ambushChance;
  return ctx.rng.chance(chance) ? "ambush" : "normal";
}

/** Starts a battle for moving `charId`'s piece onto a hostile cell (`kind` forces e.g. an ambush). */
export function engage(ctx: Ctx, charId: string, dest: Pos, opts: { kind?: BattleKind } = {}): BattleState {
  const piece = mustPieceOf(ctx, charId);
  const option = moveOptions(ctx, charId).get(key(dest));
  if (!option || option.kind !== "engage") throw new Error(`No engagement at ${dest.x},${dest.y}`);
  if (piece.faction === "npc") throw new Error("NPCs don't engage");
  const defenders = piecesAt(ctx, dest).filter((p) => p.faction !== piece.faction);
  const attackers = aliveMembers(ctx, piece).map((c) => c.id);
  const defending = defenders.flatMap((p) => aliveMembers(ctx, p).map((c) => c.id));
  const kind = opts.kind ?? rollBattleKind(ctx, piece.faction, isHidden(ctx, piece));
  markMoved(ctx, piece);
  const heroesAttack = piece.faction === "hero";
  return startBattle(ctx, {
    kind,
    heroes: heroesAttack ? attackers : defending,
    enemies: heroesAttack ? defending : attackers,
    battleback: ctx.db.map(board(ctx).mapId).battleback,
    source: {
      attackerPiece: piece.id,
      attackerFaction: piece.faction,
      defenderPieces: defenders.map((d) => d.id),
      origin: { x: piece.x, y: piece.y },
      cell: dest,
      path: option.path,
      mode: option.mode,
    },
  });
}

/**
 * Applies a finished battle to the board (§8.5): KO'd heroes fall on the cell they stood on,
 * KO'd enemies are removed, a victorious attacker captures the cell.
 */
export function resolveEngagement(ctx: Ctx, result: BattleState): GameEvent[] {
  const src = result.source;
  const events: GameEvent[] = [];
  if (!src) return reconcile(ctx, { rewardKills: false });
  const b = board(ctx);

  // Fallen heroes lie where they stood when the battle began.
  const fallenAt: Record<string, Pos> = {};
  const attacker = b.pieces[src.attackerPiece];
  for (const c of result.combatants) {
    if (result.guests[c.id]) continue; // summoned for this battle only (§12.7)
    const ch = getChar(ctx, c.id);
    if (ch.kind !== "hero" || isAlive(ch)) continue;
    const onAttacker = attacker?.members.includes(c.id);
    fallenAt[c.id] = onAttacker ? src.origin : src.cell;
  }
  events.push(...reconcile(ctx, { rewardKills: false, fallenAt }));

  const attackerNow = b.pieces[src.attackerPiece];
  const attackerWon =
    result.result === "victory" ? src.attackerFaction === "hero" : result.result === "defeat" ? src.attackerFaction === "enemy" : false;
  if (attackerNow && attackerWon && aliveMembers(ctx, attackerNow).length) {
    // Capture: walk onto the defended cell (landing effects apply).
    const stillHostile = piecesAt(ctx, src.cell).some((p) => p.faction !== attackerNow.faction && p.faction !== "npc");
    if (!stillHostile) events.push(...movePiece(ctx, attackerNow, src.path, src.mode).events);
  }
  if (attackerNow) {
    // Engaging reveals the attacker.
    for (const c of aliveMembers(ctx, attackerNow)) removeStatus(c, BUILTIN.hidden);
  }
  if (isGameOver(ctx)) events.push({ type: "message", text: "gameover" });
  return events;
}
