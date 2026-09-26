import { computeStats } from "../chars/character";
import { getChar, type Ctx } from "../context";
import type { BoardAiDef } from "../data/types";
import type { Piece } from "../state/types";
import type { Pos } from "../util/grid";
import { chebyshev } from "../util/grid";
import { aliveMembers, fieldEffectsAt, isHidden, memberReach, mustPieceOf, pageOfPiece, piecesAt, pieces } from "./board";
import { abilityTargeting, canUseBoardAbility, joinTargets } from "./actions";
import { canPieceMove, moveOptions, type MoveOption } from "./moves";
import { abilityUsed } from "./turns";
import { BUILTIN } from "../data/builtins";

export type AiDecision = { type: "move"; dest: Pos } | { type: "engage"; dest: Pos } | { type: "end" };

/** Actions an enemy takes before moving (they use the turn's single ability action). */
export type AiPreAction = { type: "ability"; ability: string; target: Pos } | { type: "join"; target: Pos } | { type: "leave" };

function aiDef(ctx: Ctx, piece: Piece): BoardAiDef {
  if (piece.faction === "enemy") {
    const leader = getChar(ctx, piece.members[0]);
    return ctx.db.enemy(leader.def).boardAi;
  }
  const page = pageOfPiece(ctx, piece);
  return { behavior: page?.move === "wander" ? "wander" : "static", wanderRadius: page?.wanderRadius ?? 2 };
}

/** Hero pieces enemies can see (not hidden, not fallen). */
function visibleHeroes(ctx: Ctx): Piece[] {
  return pieces(ctx).filter((p) => p.faction === "hero" && !p.fallen && !isHidden(ctx, p));
}

function hazard(ctx: Ctx, p: Pos): number {
  return fieldEffectsAt(ctx, p).reduce((s, e) => {
    const fx = ctx.db.fieldEffect(e);
    return s + (fx.damagePercent ? 3 : 0) + (fx.status ? 2 : 0) + (fx.slide ? 1 : 0);
  }, 0);
}

/** Decision for one board turn (§12.5). Only the first acting member moves a party. */
export function planBoardTurn(ctx: Ctx, charId: string): AiDecision {
  const piece = mustPieceOf(ctx, charId);
  if (!canPieceMove(ctx, piece)) return { type: "end" };
  const def = aiDef(ctx, piece);
  const options = [...moveOptions(ctx, charId).values()];
  if (!options.length || def.behavior === "static") return { type: "end" };

  if (piece.faction === "npc" || def.behavior === "wander") return wander(ctx, piece, options, def);

  const heroes = visibleHeroes(ctx);
  if (!heroes.length) return { type: "end" };
  const nearest = Math.min(...heroes.map((h) => chebyshev(h, piece)));
  if (def.behavior === "guard" && nearest > (def.aggroRange ?? 3)) return { type: "end" };
  if (def.behavior === "aggressive" && def.aggroRange !== undefined && nearest > def.aggroRange) {
    return wander(ctx, piece, options, { ...def, wanderRadius: def.wanderRadius ?? 2 });
  }

  // Engage the weakest reachable hero piece.
  const engages = options.filter((o) => o.kind === "engage");
  if (engages.length) {
    const score = (o: MoveOption) =>
      o.targets!.reduce((s, id) => {
        const p = ctx.state.board!.pieces[id];
        return s + aliveMembers(ctx, p).reduce((t, c) => t + c.hp / computeStats(ctx.db, c).maxHp, 0);
      }, 0);
    const best = engages.reduce((a, b) => (score(b) < score(a) ? b : a));
    return { type: "engage", dest: best.pos };
  }

  // Approach: minimise distance to the nearest hero, avoid hazards, stay near home for guards.
  const moves = options.filter((o) => o.kind === "move");
  if (!moves.length) return { type: "end" };
  const dist = (p: Pos) => Math.min(...heroes.map((h) => chebyshev(h, p)));
  const current = dist(piece);
  const ranked = moves
    .map((o) => ({ o, s: dist(o.pos) * 10 + hazard(ctx, o.pos) * 4 + ctx.rng.next() }))
    .sort((a, b) => a.s - b.s);
  if (dist(ranked[0].o.pos) > current) return { type: "end" };
  return { type: "move", dest: ranked[0].o.pos };
}

function wander(ctx: Ctx, piece: Piece, options: MoveOption[], def: BoardAiDef): AiDecision {
  if (ctx.rng.chance(0.4)) return { type: "end" };
  const home = piece.home ?? piece;
  const radius = def.wanderRadius ?? 2;
  const moves = options.filter((o) => o.kind === "move" && chebyshev(o.pos, home) <= radius && hazard(ctx, o.pos) === 0);
  if (!moves.length) return { type: "end" };
  return { type: "move", dest: ctx.rng.pick(moves).pos };
}

/**
 * Enemy actions before moving (§8.7, §12.5):
 * - leave the party when this member is stuck (reach 0) so the others can still move
 * - pack animals join an adjacent allied piece when heroes approach
 * - use a board ability (field effects / statuses on heroes, support on allies)
 */
export function planPreActions(ctx: Ctx, charId: string): AiPreAction[] {
  const piece = mustPieceOf(ctx, charId);
  if (piece.faction !== "enemy" || abilityUsed(ctx, charId)) return [];
  const me = getChar(ctx, charId);
  const def = ctx.db.enemy(me.def).boardAi;
  const heroes = visibleHeroes(ctx);
  const nearest = heroes.length ? Math.min(...heroes.map((h) => chebyshev(h, piece))) : Infinity;
  const aware = nearest <= (def.aggroRange ?? 4) + 2;

  // 1. stuck member leaves so the rest of the party can move
  if (piece.members.length > 1 && memberReach(ctx, me) === 0 && canUseBoardAbility(ctx, charId, BUILTIN.leaveParty)) {
    const others = aliveMembers(ctx, piece).filter((c) => c.id !== charId);
    if (others.some((c) => memberReach(ctx, c) > 0)) return [{ type: "leave" }];
  }

  // 2. pack up before a fight
  if (def.pack && aware && canUseBoardAbility(ctx, charId, BUILTIN.joinParty)) {
    const engageNow = canPieceMove(ctx, piece) && [...moveOptions(ctx, charId).values()].some((o) => o.kind === "engage");
    const target = joinTargets(ctx, charId).find((p) => p.faction === "enemy");
    if (!engageNow && target) return [{ type: "join", target: { x: target.x, y: target.y } }];
  }

  // 3. board abilities
  if (!aware) return [];
  for (const entry of def.abilities ?? []) {
    if (!canUseBoardAbility(ctx, charId, entry.ability) || !ctx.rng.chance(entry.chance ?? 0.5)) continue;
    const ability = ctx.db.ability(entry.ability);
    const t = abilityTargeting(ctx, charId, entry.ability);
    if (!t?.valid.length) continue;
    const effects = ability.board!.effects;
    const supportive = effects.some((e) => e.type === "heal" || (e.type === "applyStatus" && !ctx.db.status(e.status).negative));
    const score = (p: Pos) => {
      const cells = t.areaAt(p);
      let s = 0;
      for (const c of cells) {
        for (const pc of piecesAt(ctx, c)) {
          if (supportive && pc.faction === "enemy") s += aliveMembers(ctx, pc).reduce((a, m) => a + (1 - m.hp / computeStats(ctx.db, m).maxHp), 0);
          if (!supportive && pc.faction === "hero" && !isHidden(ctx, pc)) s += aliveMembers(ctx, pc).length;
          if (!supportive && pc.faction === "enemy") s -= aliveMembers(ctx, pc).length; // don't hit friends
        }
      }
      return s;
    };
    const best = t.valid.map((p) => ({ p, s: score(p) })).sort((a, b) => b.s - a.s)[0];
    if (best && best.s > 0) return [{ type: "ability", ability: entry.ability, target: best.p }];
  }
  return [];
}

