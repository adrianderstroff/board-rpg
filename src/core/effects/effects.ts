import {
  addStatus,
  computeStats,
  hasStatus,
  isAlive,
  knownAbilities,
  onHitEffect,
  removeStatus,
  weaponElement,
} from "../chars/character";
import type { Ctx } from "../context";
import type { EffectDef, Scope } from "../data/types";
import type { GameEvent } from "../events";
import { addItem } from "../items/inventory";
import type { Character } from "../state/types";
import { fixedDamage, healAmount, magicalDamage, physicalDamage, stealChance, type DamageRoll } from "./formulas";

export interface EffectContext {
  ctx: Ctx;
  user: Character;
  scope: Scope;
}

// ---------- low level HP changes ----------

export interface DamageOptions {
  /** Board rule: heroes can't be KO'd by board damage. */
  nonLethal?: boolean;
  crit?: boolean;
  element?: import("../data/types").Element;
  multiplier?: number;
}

export function dealDamage(ctx: Ctx, target: Character, amount: number, opts: DamageOptions = {}): GameEvent[] {
  if (!isAlive(target)) return [];
  const floor = opts.nonLethal ? 1 : 0;
  const applied = Math.min(amount, Math.max(0, target.hp - floor));
  target.hp -= applied;
  const events: GameEvent[] = [
    {
      type: "damage",
      target: target.id,
      amount: applied,
      crit: opts.crit,
      element: opts.element,
      weak: (opts.multiplier ?? 1) > 1,
      resist: (opts.multiplier ?? 1) < 1,
    },
  ];
  if (target.hp <= 0) events.push(...knockOut(target));
  else {
    for (const st of [...target.statuses]) {
      if (ctx.db.status(st.id).breakOnDamage && removeStatus(target, st.id)) {
        events.push({ type: "status", target: target.id, status: st.id, added: false });
      }
    }
  }
  return events;
}

export function knockOut(target: Character): GameEvent[] {
  target.hp = 0;
  target.statuses = [];
  return [{ type: "ko", target: target.id }];
}

export function heal(ctx: Ctx, target: Character, amount: number): GameEvent[] {
  if (!isAlive(target)) return [];
  const max = computeStats(ctx.db, target).maxHp;
  const applied = Math.max(0, Math.min(amount, max - target.hp));
  target.hp += applied;
  return [{ type: "heal", target: target.id, amount: applied }];
}

export function restoreMp(ctx: Ctx, target: Character, amount: number): GameEvent[] {
  if (!isAlive(target)) return [];
  const max = computeStats(ctx.db, target).maxMp;
  const applied = Math.max(0, Math.min(amount, max - target.mp));
  target.mp += applied;
  return [{ type: "mp", target: target.id, amount: applied }];
}

function damageEvents(ec: EffectContext, target: Character, roll: DamageRoll, element?: import("../data/types").Element) {
  if (!roll.hit) return [{ type: "miss", target: target.id } as GameEvent];
  return dealDamage(ec.ctx, target, roll.amount, {
    crit: roll.crit,
    element,
    multiplier: roll.multiplier,
    nonLethal: ec.scope === "board" && target.kind === "hero",
  });
}

// ---------- effect pipeline ----------

/** Applies a list of effects from `user` to one character target. */
export function applyEffects(ec: EffectContext, target: Character, effects: EffectDef[]): GameEvent[] {
  const events: GameEvent[] = [];
  for (const e of effects) events.push(...applyEffect(ec, target, e));
  return events;
}

export function applyEffect(ec: EffectContext, target: Character, e: EffectDef): GameEvent[] {
  const { ctx, user } = ec;
  const alive = isAlive(target);
  switch (e.type) {
    case "damage": {
      if (!alive) return [];
      const roll =
        e.kind === "physical"
          ? physicalDamage(ctx, user, target, { power: e.power, element: e.element, ignoreDef: e.ignoreDef, scope: ec.scope })
          : magicalDamage(ctx, user, target, { power: e.power, base: e.base, element: e.element, scope: ec.scope });
      return damageEvents(ec, target, roll, e.element);
    }
    case "fixedDamage":
      return alive ? damageEvents(ec, target, fixedDamage(ctx, target, e.amount, e.element), e.element) : [];
    case "heal":
      return heal(ctx, target, healAmount(ctx, user, e.base, e.scale));
    case "healPercent":
      return heal(ctx, target, Math.round((computeStats(ctx.db, target).maxHp * e.percent) / 100));
    case "restoreMp":
      return restoreMp(ctx, target, e.amount);
    case "applyStatus": {
      if (!alive || !ctx.rng.chance(e.chance ?? 1)) return alive ? [{ type: "miss", target: target.id }] : [];
      return addStatus(ctx, target, e.status, e.turns)
        ? [{ type: "status", target: target.id, status: e.status, added: true }]
        : [{ type: "miss", target: target.id }];
    }
    case "cureStatus": {
      const events: GameEvent[] = [];
      for (const st of [...target.statuses]) {
        const def = ctx.db.status(st.id);
        if ((e.allNegative && def.negative) || e.statuses?.includes(st.id)) {
          removeStatus(target, st.id);
          events.push({ type: "status", target: target.id, status: st.id, added: false });
        }
      }
      return events;
    }
    case "revive": {
      if (alive) return [];
      target.hp = Math.max(1, Math.round((computeStats(ctx.db, target).maxHp * e.percent) / 100));
      return [{ type: "revive", target: target.id, hp: target.hp }];
    }
    case "steal":
      return alive ? steal(ctx, user, target) : [];
    case "reveal": {
      if (target.kind !== "enemy") return [];
      if (!ctx.state.records.revealed.includes(target.def)) ctx.state.records.revealed.push(target.def);
      return [{ type: "reveal", targets: [target.id] }];
    }
    case "learnAbility": {
      if (target.kind !== "hero" || knownAbilities(ctx.db, target).includes(e.ability)) return [];
      target.learned.push(e.ability);
      return [{ type: "learn", target: target.id, ability: e.ability }];
    }
    case "fieldEffect":
    case "freezeArea":
    case "placeTrap":
    case "discover":
    case "defuse":
    case "shock":
    case "cut":
      return []; // cell effects are handled by the board layer
  }
}

/** Basic "Fight" attack (weapon element and on-hit status apply). */
export function basicAttack(ec: EffectContext, target: Character): GameEvent[] {
  const { ctx, user } = ec;
  const element = weaponElement(ctx.db, user);
  const roll = physicalDamage(ctx, user, target, { element, scope: ec.scope });
  const events = damageEvents(ec, target, roll, element);
  const onHit = onHitEffect(ctx.db, user);
  if (roll.hit && onHit && isAlive(target) && ctx.rng.chance(onHit.chance)) {
    if (addStatus(ctx, target, onHit.status)) events.push({ type: "status", target: target.id, status: onHit.status, added: true });
  }
  return events;
}

export function steal(ctx: Ctx, thief: Character, target: Character): GameEvent[] {
  const table =
    target.kind === "enemy" ? ctx.db.enemy(target.def).steal : target.kind === "npc" ? ctx.db.npc(target.def).steal : undefined;
  if (!table?.length || target.looted) return [{ type: "steal", actor: thief.id, target: target.id, item: null }];
  if (!ctx.rng.chance(stealChance(ctx, thief, target))) return [{ type: "steal", actor: thief.id, target: target.id, item: null }];
  const entry = ctx.rng.weighted(table, (t) => t.chance)!;
  target.looted = true;
  return [{ type: "steal", actor: thief.id, target: target.id, item: entry.item }, ...addItem(ctx, entry.item)];
}

/** Offensive actions end Hidden (and similar statuses). */
export function breakOnOffense(ctx: Ctx, user: Character): GameEvent[] {
  const events: GameEvent[] = [];
  for (const st of [...user.statuses]) {
    if (ctx.db.status(st.id).breakOnOffense && removeStatus(user, st.id)) {
      events.push({ type: "status", target: user.id, status: st.id, added: false });
    }
  }
  return events;
}

export function isOffensive(effects: EffectDef[]): boolean {
  return effects.some((e) => e.type === "damage" || e.type === "fixedDamage" || e.type === "steal");
}

export { hasStatus };
