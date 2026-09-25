import {
  critChance,
  effectiveStats,
  elementMultiplier,
} from "../chars/character";
import type { Ctx } from "../context";
import type { Element } from "../data/types";
import type { Character } from "../state/types";
import { clamp } from "../util/misc";

export interface DamageRoll {
  amount: number;
  hit: boolean;
  crit: boolean;
  multiplier: number;
}

function defenseFactor(ctx: Ctx, defense: number) {
  const s = ctx.db.config.defenseScale;
  return (s / (s + Math.max(0, defense))) * ctx.db.config.damageFactor;
}

function hitChance(ctx: Ctx, user: Character, scope: "board" | "battle") {
  let chance = ctx.db.config.hitChance;
  for (const st of user.statuses) {
    const d = ctx.db.status(st.id);
    if (d.scope.includes(scope) && d.hitModifier) chance *= d.hitModifier;
  }
  return chance;
}

/** §12.3 physical damage. */
export function physicalDamage(
  ctx: Ctx,
  user: Character,
  target: Character,
  opts: { power?: number; element?: Element; ignoreDef?: number; scope?: "board" | "battle"; canMiss?: boolean },
): DamageRoll {
  const scope = opts.scope ?? "battle";
  const u = effectiveStats(ctx.db, user, scope);
  const t = effectiveStats(ctx.db, target, scope);
  if (opts.canMiss !== false && !ctx.rng.chance(hitChance(ctx, user, scope))) {
    return { amount: 0, hit: false, crit: false, multiplier: 1 };
  }
  const def = t.def * (1 - (opts.ignoreDef ?? 0));
  let dmg = u.str * (opts.power ?? 1) * defenseFactor(ctx, def) * ctx.rng.range(0.9, 1.1);
  const crit = ctx.rng.chance(critChance(ctx.db, user));
  if (crit) dmg *= 1.5;
  const multiplier = elementMultiplier(ctx.db, target, opts.element);
  dmg *= multiplier;
  return { amount: multiplier === 0 ? 0 : Math.max(1, Math.round(dmg)), hit: true, crit, multiplier };
}

/** §12.3 magical damage (never misses). */
export function magicalDamage(
  ctx: Ctx,
  user: Character,
  target: Character,
  opts: { power?: number; base?: number; element?: Element; scope?: "board" | "battle" },
): DamageRoll {
  const scope = opts.scope ?? "battle";
  const u = effectiveStats(ctx.db, user, scope);
  const t = effectiveStats(ctx.db, target, scope);
  let dmg = (u.mag * (opts.power ?? 1) + (opts.base ?? 0)) * defenseFactor(ctx, t.mdef) * ctx.rng.range(0.9, 1.1);
  const multiplier = elementMultiplier(ctx.db, target, opts.element);
  dmg *= multiplier;
  return { amount: multiplier === 0 ? 0 : Math.max(1, Math.round(dmg)), hit: true, crit: false, multiplier };
}

export function fixedDamage(ctx: Ctx, target: Character, amount: number, element?: Element): DamageRoll {
  const multiplier = elementMultiplier(ctx.db, target, element);
  return { amount: Math.round(amount * multiplier), hit: true, crit: false, multiplier };
}

export function healAmount(ctx: Ctx, user: Character, base = 0, scale = 0): number {
  return Math.max(1, Math.round(base + effectiveStats(ctx.db, user).mag * scale));
}

/** §12.3 steal chance. */
export function stealChance(ctx: Ctx, thief: Character, target: Character): number {
  const a = effectiveStats(ctx.db, thief).spd;
  const b = effectiveStats(ctx.db, target).spd;
  return clamp(0.4 + 0.03 * (a - b), 0.1, 0.9);
}
