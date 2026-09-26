import { computeStats, hasStatus } from "../chars/character";
import { getChar, type Ctx } from "../context";
import type { AiRule } from "../data/types";
import type { Character } from "../state/types";
import type { GameEvent } from "../events";
import { battle, canUseBattleAbility, holding, living, nextBattleTurn, performAction, sideOf, targetCandidates } from "./battle";
import type { BattleAction } from "./types";

const hpRatio = (ctx: Ctx, c: Character) => c.hp / computeStats(ctx.db, c).maxHp;

function ruleApplies(ctx: Ctx, actor: Character, rule: AiRule): boolean {
  const w = rule.when;
  if (!w) return true;
  if (w.hpBelow !== undefined && hpRatio(ctx, actor) >= w.hpBelow) return false;
  const b = battle(ctx);
  if (w.round !== undefined && b.round % w.round !== 0) return false;
  if (w.cooldown !== undefined) {
    const last = b.used?.[`${actor.id}:${rule.action}`];
    if (last !== undefined && b.round - last < w.cooldown) return false;
  }
  if (w.alone && living(ctx, sideOf(ctx, actor.id)).some((c) => c.id !== actor.id)) return false;
  if (w.chance !== undefined && !ctx.rng.chance(w.chance)) return false;
  return true;
}

function pickTarget(ctx: Ctx, candidates: string[], rule: AiRule): string | undefined {
  if (!candidates.length) return undefined;
  const chars = candidates.map((id) => getChar(ctx, id));
  const lacking = rule.when?.targetLacksStatus;
  let pool = lacking ? chars.filter((c) => !hasStatus(c, lacking)) : chars;
  if (rule.target === "boss") pool = pool.filter((c) => c.kind === "enemy" && !!ctx.db.enemy(c.def).boss);
  if (!pool.length) return undefined;
  switch (rule.target) {
    case "lowestHp":
      return pool.reduce((a, b) => (hpRatio(ctx, b) < hpRatio(ctx, a) ? b : a)).id;
    case "highestHp":
      return pool.reduce((a, b) => (b.hp > a.hp ? b : a)).id;
    default:
      return ctx.rng.pick(pool).id;
  }
}

/** Default rules for characters without an AI table (guests). */
const DEFAULT_RULES: AiRule[] = [{ action: "attack", weight: 1 }];

/** Weighted, conditional action choice (§12.5). */
export function chooseAiAction(ctx: Ctx, actorId: string): BattleAction {
  const actor = getChar(ctx, actorId);
  if (holding(ctx, actorId)) return { type: "digest" }; // a full stomach takes the whole turn (§12.7)
  const rules = actor.kind === "enemy" ? ctx.db.enemy(actor.def).ai : DEFAULT_RULES;
  const usable = rules.filter((r) => ruleApplies(ctx, actor, r) && (r.action === "attack" || canUseBattleAbility(ctx, actorId, r.action)));
  for (let tries = 0; tries < 4 + rules.length && usable.length; tries++) {
    // priority rules first (a henchman buffs its master before it attacks)
    const rule = usable.find((r) => r.priority) ?? ctx.rng.weighted(usable, (r) => r.weight)!;
    if (rule.action === "attack") {
      const t = pickTarget(ctx, targetCandidates(ctx, actorId, "enemy"), rule);
      if (t) return { type: "attack", target: t };
    } else {
      const use = ctx.db.ability(rule.action).battle!;
      if (use.target === "allEnemies" || use.target === "allAllies" || use.target === "self") {
        return { type: "ability", ability: rule.action };
      }
      const t = pickTarget(ctx, targetCandidates(ctx, actorId, use.target), rule);
      if (t) return { type: "ability", ability: rule.action, target: t };
    }
    usable.splice(usable.indexOf(rule), 1);
  }
  const fallback = targetCandidates(ctx, actorId, "enemy");
  return fallback.length ? { type: "attack", target: ctx.rng.pick(fallback) } : { type: "wait" };
}


/** Runs a battle to the end with AI on both sides (§8.9 – enemies attacking a lone NPC). */
export function autoResolve(ctx: Ctx): GameEvent[] {
  const b = battle(ctx);
  const events: GameEvent[] = [];
  for (let guard = 0; guard < 500 && !b.result; guard++) {
    const t = nextBattleTurn(ctx);
    events.push(...t.events);
    if (!t.actor) break;
    events.push(...performAction(ctx, t.actor, chooseAiAction(ctx, t.actor)));
  }
  return events;
}
