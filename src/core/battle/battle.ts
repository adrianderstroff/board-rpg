import {
  computeStats,
  createEnemy,
  enemyRewards,
  addStatus,
  removeStatus,
  dropNonPersistent,
  effectiveStats,
  hasFlagStatus,
  isAlive,
  knownAbilities,
} from "../chars/character";
import { getChar, type Ctx } from "../context";
import type { BattleTarget, BattleUse } from "../data/types";
import { applyEffects, basicAttack, breakOnOffense, isOffensive } from "../effects/effects";
import type { GameEvent } from "../events";
import { addItem, itemCount, removeItem } from "../items/inventory";
import { shareRewards } from "../board/board";
import { tickStatuses } from "../board/turns";
import type { Character } from "../state/types";
import { clamp } from "../util/misc";
import type { BattleAction, BattleKind, BattleSource, BattleState, Combatant, Side } from "./types";
import { BUILTIN } from "../data/builtins";

export interface BattleSetup {
  kind: BattleKind;
  heroes: string[];
  enemies: string[];
  battleback: string;
  source?: BattleSource;
}

export function battle(ctx: Ctx): BattleState {
  if (!ctx.state.battle) throw new Error("No active battle");
  return ctx.state.battle;
}

export function startBattle(ctx: Ctx, setup: BattleSetup): BattleState {
  const combatants: Combatant[] = [
    ...setup.heroes.map((id, i) => ({ id, side: "hero" as Side, ai: getChar(ctx, id).kind !== "hero", slot: i })),
    ...setup.enemies.map((id, i) => ({ id, side: "enemy" as Side, ai: true, slot: i })),
  ];
  const boss = setup.enemies.some((id) => {
    const c = getChar(ctx, id);
    return c.kind === "enemy" && !!ctx.db.enemy(c.def).boss;
  });
  const b: BattleState = {
    kind: boss ? "normal" : setup.kind,
    combatants,
    guests: {},
    round: 0,
    queue: [],
    current: null,
    result: null,
    boss,
    battleback: setup.battleback,
    source: setup.source,
  };
  ctx.state.battle = b;
  if (b.kind !== "normal") {
    const side: Side = b.kind === "ambush" ? "enemy" : "hero";
    b.queue = orderBySpeed(ctx, combatants.filter((c) => c.side === side));
  }
  return b;
}

export function combatant(ctx: Ctx, id: string): Combatant {
  const c = battle(ctx).combatants.find((x) => x.id === id);
  if (!c) throw new Error(`${id} is not in this battle`);
  return c;
}

export function sideOf(ctx: Ctx, id: string): Side {
  return combatant(ctx, id).side;
}

export function living(ctx: Ctx, side?: Side): Character[] {
  return battle(ctx)
    .combatants.filter((c) => !side || c.side === side)
    .map((c) => getChar(ctx, c.id))
    .filter(isAlive);
}

function orderBySpeed(ctx: Ctx, list: Combatant[]): string[] {
  return list
    .map((c) => ({ id: c.id, s: effectiveStats(ctx.db, getChar(ctx, c.id)).spd * ctx.rng.range(0.9, 1.1) }))
    .sort((a, b) => b.s - a.s)
    .map((e) => e.id);
}

// ---------- turn flow ----------

export interface BattleTurn {
  actor: string | null;
  needsInput: boolean;
  events: GameEvent[];
}

/** Advances to the next actor who can act; handles rounds and skipped turns. */
export function nextBattleTurn(ctx: Ctx): BattleTurn {
  const b = battle(ctx);
  const events: GameEvent[] = [];
  for (let guard = 0; guard < 200 && !b.result; guard++) {
    if (!b.queue.length) {
      b.round++;
      b.queue = orderBySpeed(ctx, b.combatants);
      events.push({ type: "round", round: b.round });
    }
    const id = b.queue.shift()!;
    const c = getChar(ctx, id);
    if (!isAlive(c)) continue;
    b.current = id;
    // statuses that last "until your next turn" (Defend) end now
    for (const st of [...c.statuses]) {
      if (ctx.db.status(st.id).consumeOnTurnStart && removeStatus(c, st.id)) events.push({ type: "status", target: id, status: st.id, added: false });
    }
    events.push({ type: "turnStart", actor: id, round: b.round });
    if (swallowedEntry(ctx, id)) {
      events.push({ type: "turnSkipped", actor: id, reason: "swallowed" });
      events.push(...endBattleTurn(ctx, id));
      continue;
    }
    if (hasFlagStatus(ctx.db, c, "battle", "skipTurn")) {
      events.push({ type: "turnSkipped", actor: id, reason: c.statuses.map((s) => s.id).join(",") });
      events.push(...endBattleTurn(ctx, id));
      continue;
    }
    return { actor: id, needsInput: !combatant(ctx, id).ai, events };
  }
  return { actor: null, needsInput: false, events };
}

function endBattleTurn(ctx: Ctx, id: string): GameEvent[] {
  const b = battle(ctx);
  const events = tickStatuses(ctx, getChar(ctx, id), "battle");
  if (b.current === id) b.current = null;
  events.push(...releaseFromFallen(ctx));
  events.push(...checkOutcome(ctx));
  return events;
}

// ---------- targets ----------

export function isTargetable(ctx: Ctx, actorId: string, targetId: string): boolean {
  const t = getChar(ctx, targetId);
  if (swallowedEntry(ctx, targetId)) return false; // inside a stomach: out of reach for everyone
  if (sideOf(ctx, actorId) === sideOf(ctx, targetId)) return true;
  return !hasFlagStatus(ctx.db, t, "battle", "untargetable");
}

/** Candidate targets for a battle use from the actor's perspective (§12.2). */
export function targetCandidates(ctx: Ctx, actorId: string, target: BattleTarget): string[] {
  const own = sideOf(ctx, actorId);
  const other: Side = own === "hero" ? "enemy" : "hero";
  const b = battle(ctx);
  const alive = (side?: Side) =>
    b.combatants.filter((c) => (!side || c.side === side) && isAlive(getChar(ctx, c.id)) && isTargetable(ctx, actorId, c.id)).map((c) => c.id);
  switch (target) {
    case "self":
      return [actorId];
    case "enemy":
    case "allEnemies":
      return alive(other);
    case "ally":
    case "allAllies":
      return alive(own);
    case "any":
      return alive();
    case "fallenAlly":
      return b.combatants.filter((c) => c.side === own && !isAlive(getChar(ctx, c.id))).map((c) => c.id);
  }
}

function resolveTargets(ctx: Ctx, actorId: string, use: BattleUse, chosen?: string): string[] {
  if (use.target === "allEnemies" || use.target === "allAllies") return targetCandidates(ctx, actorId, use.target);
  if (use.target === "self") return [actorId];
  if (chosen) return [chosen];
  const cands = targetCandidates(ctx, actorId, use.target);
  return cands.length ? [ctx.rng.pick(cands)] : [];
}

// ---------- actions ----------

export function battleAbilities(ctx: Ctx, id: string): string[] {
  return knownAbilities(ctx.db, getChar(ctx, id)).filter((a) => !!ctx.db.ability(a).battle);
}

export function battleItems(ctx: Ctx): string[] {
  return Object.keys(ctx.state.inventory).filter((i) => itemCount(ctx, i) > 0 && !!ctx.db.item(i).battle);
}

export function canUseBattleAbility(ctx: Ctx, id: string, abilityId: string): boolean {
  const a = ctx.db.ability(abilityId);
  if (!a.battle || getChar(ctx, id).mp < a.mp) return false;
  if (a.battle.swallow) {
    // one at a time, and never the last one standing
    if (holding(ctx, id)) return false;
    if (targetCandidates(ctx, id, "enemy").length < 2) return false;
  }
  if (a.battle.summon && (battle(ctx).spent ?? 0) + a.battle.summon.cost > purse(ctx, id)) return false;
  return true;
}

// ---------- swallow & summon (§12.7) ----------

/** The entry of a combatant that sits in someone's stomach. */
export function swallowedEntry(ctx: Ctx, id: string) {
  return ctx.state.battle?.swallowed?.find((s) => s.target === id);
}

/** The entry of a swallower with a full stomach (its turns are forced: digest, spit). */
export function holding(ctx: Ctx, id: string) {
  return ctx.state.battle?.swallowed?.find((s) => s.by === id);
}

function swallow(ctx: Ctx, actorId: string, targetId: string, take: { hp: number; mp: number }): GameEvent[] {
  const b = battle(ctx);
  const t = getChar(ctx, targetId);
  if (!isAlive(t)) return [];
  (b.swallowed ??= []).push({ by: actorId, target: targetId, hp: Math.floor(t.hp * take.hp), mp: Math.floor(t.mp * take.mp), stage: 0 });
  return [{ type: "swallow", actor: actorId, target: targetId }];
}

function gain(ctx: Ctx, id: string, hp: number, mp: number): GameEvent[] {
  const c = getChar(ctx, id);
  const s = computeStats(ctx.db, c);
  const events: GameEvent[] = [];
  if (hp > 0) {
    c.hp = Math.min(s.maxHp, c.hp + hp);
    events.push({ type: "heal", target: id, amount: hp });
  }
  if (mp > 0) {
    c.mp = Math.min(s.maxMp, c.mp + mp);
    events.push({ type: "mp", target: id, amount: mp });
  }
  return events;
}

/** First forced turn: shows half of what will be absorbed; second: the rest, then spits the victim out. */
function digest(ctx: Ctx, actorId: string): GameEvent[] {
  const b = battle(ctx);
  const s = holding(ctx, actorId);
  if (!s) return [];
  const victim = getChar(ctx, s.target);
  const events: GameEvent[] = [];
  const half = { hp: Math.ceil(s.hp / 2), mp: Math.ceil(s.mp / 2) };
  if (s.stage === 0) {
    s.stage = 1;
    events.push({ type: "action", actor: actorId, name: "Digest", targets: [] });
    events.push(...gain(ctx, actorId, half.hp, half.mp));
    return events;
  }
  events.push({ type: "action", actor: actorId, name: "Spit Out", targets: [s.target] });
  events.push(...gain(ctx, actorId, s.hp - half.hp, s.mp - half.mp));
  b.swallowed = b.swallowed!.filter((x) => x !== s);
  const hp = Math.min(s.hp, Math.max(0, victim.hp - 1)); // never digested to death
  const mp = Math.min(s.mp, victim.mp);
  victim.hp -= hp;
  victim.mp -= mp;
  events.push({ type: "spit", actor: actorId, target: s.target, hp, mp });
  return events;
}

/** A swallower that fell lets its victim go without the loss; a victim that fell inside is let go too. */
function releaseFromFallen(ctx: Ctx): GameEvent[] {
  const b = battle(ctx);
  const events: GameEvent[] = [];
  for (const s of [...(b.swallowed ?? [])]) {
    if (isAlive(getChar(ctx, s.by)) && isAlive(getChar(ctx, s.target))) continue;
    b.swallowed = b.swallowed!.filter((x) => x !== s);
    events.push({ type: "release", actor: s.by, target: s.target });
  }
  return events;
}

/** Gold a summoner can spend on the battle: its own reward. */
function purse(ctx: Ctx, id: string): number {
  const c = getChar(ctx, id);
  return c.kind === "enemy" ? ctx.db.enemy(c.def).gold : 0;
}

function summon(ctx: Ctx, actorId: string, what: { enemies: string[]; cost: number }): GameEvent[] {
  const b = battle(ctx);
  const side = sideOf(ctx, actorId);
  b.spent = (b.spent ?? 0) + what.cost;
  // the new ones take the places of the fallen first
  const mine = b.combatants.filter((c) => c.side === side);
  const taken = new Set(mine.filter((c) => isAlive(getChar(ctx, c.id))).map((c) => c.slot));
  const free = [...new Set(mine.map((c) => c.slot).filter((s) => !taken.has(s)))].sort((x, y) => x - y);
  let next = Math.max(...mine.map((c) => c.slot)) + 1;
  const ids: string[] = [];
  for (const enemyId of what.enemies) {
    const id = `${actorId}~${b.combatants.length}`;
    b.guests[id] = createEnemy(ctx.db, id, enemyId);
    b.combatants.push({ id, side, ai: true, slot: free.shift() ?? next++, summoned: true });
    ids.push(id);
  }
  return [{ type: "summoned", actor: actorId, ids, cost: what.cost }];
}

export function escapeChance(ctx: Ctx): number {
  const avg = (cs: Character[]) => cs.reduce((s, c) => s + effectiveStats(ctx.db, c).spd, 0) / Math.max(1, cs.length);
  return clamp(0.5 + 0.04 * (avg(living(ctx, "hero")) - avg(living(ctx, "enemy"))), 0.1, 0.95);
}

/** Performs one action for the current actor and ends its turn. */
export function performAction(ctx: Ctx, actorId: string, action: BattleAction): GameEvent[] {
  const b = battle(ctx);
  if (b.result) return [];
  const actor = getChar(ctx, actorId);
  const ec = { ctx, user: actor, scope: "battle" as const };
  const events: GameEvent[] = [];

  switch (action.type) {
    case "attack": {
      events.push({ type: "action", actor: actorId, name: "Attack", targets: [action.target] });
      events.push(...breakOnOffense(ctx, actor));
      events.push(...basicAttack(ec, getChar(ctx, action.target)));
      break;
    }
    case "ability": {
      const a = ctx.db.ability(action.ability);
      if (!a.battle || actor.mp < a.mp) throw new Error(`${actorId} cannot use ${a.id}`);
      actor.mp -= a.mp;
      const targets = resolveTargets(ctx, actorId, a.battle, action.target);
      events.push({ type: "action", actor: actorId, name: a.name, ability: a.id, targets });
      if (a.mp) events.push({ type: "mp", target: actorId, amount: -a.mp });
      if (a.offensive ?? isOffensive(a.battle.effects)) events.push(...breakOnOffense(ctx, actor));
      for (const t of targets) events.push(...applyEffects(ec, getChar(ctx, t), a.battle.effects));
      if (a.battle.swallow && targets[0]) events.push(...swallow(ctx, actorId, targets[0], a.battle.swallow));
      if (a.battle.summon) events.push(...summon(ctx, actorId, a.battle.summon));
      (b.used ??= {})[`${actorId}:${a.id}`] = b.round;
      break;
    }
    case "digest":
      events.push(...digest(ctx, actorId));
      break;
    case "item": {
      const item = ctx.db.item(action.item);
      if (!item.battle || !removeItem(ctx, action.item)) throw new Error(`Cannot use ${action.item}`);
      const targets = resolveTargets(ctx, actorId, item.battle, action.target);
      events.push({ type: "action", actor: actorId, name: item.name, item: item.id, targets });
      for (const t of targets) events.push(...applyEffects(ec, getChar(ctx, t), item.battle.effects));
      break;
    }
    case "defend": {
      events.push({ type: "action", actor: actorId, name: "Defend" });
      if (addStatus(ctx, actor, BUILTIN.defending)) events.push({ type: "status", target: actorId, status: BUILTIN.defending, added: true });
      break;
    }
    case "run": {
      events.push({ type: "action", actor: actorId, name: "Run" });
      if (b.boss) events.push({ type: "message", text: "There is no escape!" });
      else if (ctx.rng.chance(escapeChance(ctx))) {
        b.result = "escaped";
        events.push({ type: "message", text: "Escaped!" });
      } else events.push({ type: "message", text: "Couldn't escape!" });
      break;
    }
    case "wait":
      break;
  }
  events.push(...endBattleTurn(ctx, actorId));
  return events;
}

// ---------- outcome ----------

function checkOutcome(ctx: Ctx): GameEvent[] {
  const b = battle(ctx);
  if (b.result) return [];
  if (!living(ctx, "enemy").length) {
    b.result = "victory";
    return grantRewards(ctx);
  }
  if (!living(ctx, "hero").length) b.result = "defeat";
  return [];
}

function grantRewards(ctx: Ctx): GameEvent[] {
  const b = battle(ctx);
  const rewards = { exp: 0, gold: 0, items: [] as string[] };
  for (const c of b.combatants.filter((x) => x.side === "enemy")) {
    const ch = getChar(ctx, c.id);
    if (ch.kind !== "enemy") continue;
    const def = ctx.db.enemy(ch.def);
    const r = enemyRewards(ctx.db, ch);
    rewards.exp += r.exp;
    if (!c.summoned) rewards.gold += r.gold;
    for (const d of def.drops ?? []) if (ctx.rng.chance(d.chance)) rewards.items.push(d.item);
  }
  rewards.gold = Math.max(0, rewards.gold - (b.spent ?? 0)); // what the boss paid for its summons
  b.rewards = rewards;
  const heroes = living(ctx, "hero")
    .filter((c) => c.kind === "hero")
    .map((c) => c.id);
  const events = shareRewards(ctx, rewards.exp, rewards.gold, heroes);
  for (const item of rewards.items) events.push(...addItem(ctx, item));
  return events;
}

/** True when no player-controlled hero takes part (e.g. enemies attacking a lone NPC). */
export function isAutoBattle(ctx: Ctx): boolean {
  return battle(ctx).combatants.every((c) => c.ai);
}

/** Cleans up after the battle: battle-only statuses end; returns the result. */
export function finishBattle(ctx: Ctx): BattleState {
  const b = battle(ctx);
  for (const c of b.combatants) dropNonPersistent(ctx.db, getChar(ctx, c.id));
  ctx.state.battle = null;
  return b;
}
