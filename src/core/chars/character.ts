import type { Ctx } from "../context";
import type { Database } from "../data/database";
import type { Element, EquipSlot, GraphicsRef, Stats, StatKey } from "../data/types";
import { STAT_KEYS } from "../data/types";
import type { Character } from "../state/types";

// ---------- creation ----------

export function createHero(db: Database, heroId: string): Character {
  const def = db.hero(heroId);
  const c: Character = {
    id: heroId,
    name: def.name,
    kind: "hero",
    def: heroId,
    classId: def.classId,
    level: def.level,
    exp: expForLevel(db, def.level),
    hp: 0,
    mp: 0,
    statuses: [],
    equipment: { ...(def.equipment ?? {}) },
    learned: [],
  };
  const s = computeStats(db, c);
  c.hp = s.maxHp;
  c.mp = s.maxMp;
  return c;
}

/** An enemy at its own level, or at `level` (stats follow its `growth`, §12.6), wearing its equipment. */
export function createEnemy(db: Database, id: string, enemyId: string, level?: number): Character {
  const def = db.enemy(enemyId);
  const c: Character = {
    id,
    name: def.name,
    kind: "enemy",
    def: enemyId,
    level: Math.max(1, level ?? def.level),
    exp: 0,
    hp: 0,
    mp: 0,
    statuses: (def.statuses ?? []).map((s) => ({ id: s })),
    equipment: { ...(def.equipment ?? {}) },
    learned: [],
  };
  const s = computeStats(db, c);
  c.hp = s.maxHp;
  c.mp = s.maxMp;
  return c;
}

/** EXP and gold for defeating an enemy: scaled by its level against its own (§12.6). */
export function enemyRewards(db: Database, c: Character): { exp: number; gold: number } {
  const def = db.enemy(c.def);
  const k = c.level / Math.max(1, def.level);
  return { exp: Math.round(def.exp * k), gold: Math.round(def.gold * k) };
}

export function createNpc(db: Database, id: string, npcId: string): Character {
  const def = db.npc(npcId);
  const stats = def.stats ?? { maxHp: 20, maxMp: 0, str: 5, def: 5, mag: 5, mdef: 5, spd: 5 };
  return {
    id,
    name: def.name,
    kind: "npc",
    def: npcId,
    level: def.level ?? 1,
    exp: 0,
    hp: stats.maxHp,
    mp: stats.maxMp,
    statuses: [],
    equipment: {},
    learned: [],
  };
}

// ---------- graphics / descriptive ----------

export function graphicsOf(db: Database, c: Character): GraphicsRef {
  if (c.kind === "hero") return db.hero(c.def);
  if (c.kind === "enemy") return db.enemy(c.def);
  return db.npc(c.def);
}

export function descriptionOf(db: Database, c: Character): string {
  if (c.kind === "hero") return db.hero(c.def).description ?? db.cls(c.classId!).description ?? "";
  if (c.kind === "enemy") return db.enemy(c.def).description ?? "";
  return db.npc(c.def).description ?? "";
}

export function movePatternOf(db: Database, c: Character): string {
  if (c.kind === "hero") return db.cls(c.classId!).move;
  if (c.kind === "enemy") return db.enemy(c.def).move;
  return db.npc(c.def).move ?? "walk1";
}

// ---------- stats (§3.1) ----------

export function baseStats(db: Database, c: Character): Stats {
  if (c.kind === "hero") {
    const cls = db.cls(c.classId!);
    const out = {} as Stats;
    for (const k of STAT_KEYS) out[k] = Math.floor(cls.base[k] + cls.growth[k] * (c.level - 1));
    return out;
  }
  if (c.kind === "enemy") {
    const def = db.enemy(c.def);
    const out = { ...def.stats };
    const levels = c.level - def.level;
    if (def.growth && levels) {
      for (const k of STAT_KEYS) out[k] = Math.max(k === "maxMp" ? 0 : 1, Math.floor(def.stats[k] + (def.growth[k] ?? 0) * levels));
    }
    return out;
  }
  return { ...(db.npc(c.def).stats ?? { maxHp: 20, maxMp: 0, str: 5, def: 5, mag: 5, mdef: 5, spd: 5 }) };
}

export function equipmentBonus(db: Database, c: Character): Partial<Stats> {
  const bonus: Partial<Stats> = {};
  for (const itemId of Object.values(c.equipment)) {
    if (!itemId) continue;
    const eq = db.item(itemId).equip;
    for (const [k, v] of Object.entries(eq?.stats ?? {})) {
      bonus[k as StatKey] = (bonus[k as StatKey] ?? 0) + (v as number);
    }
  }
  return bonus;
}

/** Stats including equipment but excluding temporary status modifiers. */
export function computeStats(db: Database, c: Character): Stats {
  const base = baseStats(db, c);
  const bonus = equipmentBonus(db, c);
  const out = {} as Stats;
  for (const k of STAT_KEYS) out[k] = Math.max(k === "maxMp" ? 0 : 1, base[k] + (bonus[k] ?? 0));
  return out;
}

/** Effective stats in the given scope (status modifiers applied). */
export function effectiveStats(db: Database, c: Character, scope: "board" | "battle" = "battle"): Stats {
  const s = computeStats(db, c);
  for (const st of c.statuses) {
    const def = db.status(st.id);
    if (!def.scope.includes(scope)) continue;
    for (const [k, m] of Object.entries(def.modifiers ?? {})) {
      const key = k as StatKey;
      if (key === "maxHp" || key === "maxMp") continue;
      s[key] = Math.max(1, Math.round(s[key] * (m as number)));
    }
  }
  return s;
}

export const isAlive = (c: Character) => c.hp > 0;

export function elementMultiplier(db: Database, c: Character, element: Element | undefined): number {
  if (!element || c.kind !== "enemy") return 1;
  return db.enemy(c.def).elements?.[element] ?? 1;
}

export function weaponElement(db: Database, c: Character): Element | undefined {
  if (c.kind === "enemy" && db.enemy(c.def).element) return db.enemy(c.def).element;
  const w = c.equipment.weapon;
  return w ? db.item(w).equip?.element : undefined;
}

export function onHitEffect(db: Database, c: Character) {
  if (c.kind === "enemy" && db.enemy(c.def).onHit) return db.enemy(c.def).onHit;
  const w = c.equipment.weapon;
  return w ? db.item(w).equip?.onHit : undefined;
}

export function critChance(db: Database, c: Character): number {
  const bonus = c.kind === "hero" ? (db.cls(c.classId!).critBonus ?? 0) : 0;
  return db.config.critChance + bonus;
}

// ---------- statuses (§4.2) ----------

export function hasStatus(c: Character, id: string): boolean {
  return c.statuses.some((s) => s.id === id);
}

export function isImmune(db: Database, c: Character, status: string): boolean {
  if (c.kind === "enemy" && db.enemy(c.def).immune?.includes(status)) return true;
  return Object.values(c.equipment).some((i) => i && db.item(i).equip?.immune?.includes(status));
}

export function addStatus(ctx: Ctx, c: Character, status: string, turns?: number | [number, number]): boolean {
  if (!isAlive(c) || isImmune(ctx.db, c, status)) return false;
  const def = ctx.db.status(status);
  const spec = turns ?? def.defaultTurns;
  const t = spec === undefined ? undefined : Array.isArray(spec) ? ctx.rng.int(spec[0], spec[1]) : spec;
  const existing = c.statuses.find((s) => s.id === status);
  if (existing) existing.turns = t === undefined || existing.turns === undefined ? t : Math.max(existing.turns, t);
  else c.statuses.push({ id: status, turns: t });
  return true;
}

export function removeStatus(c: Character, status: string): boolean {
  const before = c.statuses.length;
  c.statuses = c.statuses.filter((s) => s.id !== status);
  return c.statuses.length !== before;
}

export function hasFlagStatus(db: Database, c: Character, scope: "board" | "battle", flag: "skipTurn" | "untargetable"): boolean {
  return c.statuses.some((s) => {
    const d = db.status(s.id);
    return d.scope.includes(scope) && !!d[flag];
  });
}

/** Removes statuses that don't persist when switching between board and battle. */
export function dropNonPersistent(db: Database, c: Character) {
  c.statuses = c.statuses.filter((s) => db.status(s.id).persists);
}

// ---------- equipment & abilities ----------

export function canEquip(db: Database, c: Character, itemId: string): boolean {
  if (c.kind !== "hero") return false;
  const eq = db.item(itemId).equip;
  return !!eq && db.cls(c.classId!).equip.includes(eq.kind);
}

export function equippedIn(c: Character, slot: EquipSlot) {
  return c.equipment[slot];
}

/** All abilities a character can currently use (class by level, learned, granted by equipment, party). */
export function knownAbilities(db: Database, c: Character): string[] {
  const out = new Set<string>();
  if (c.kind === "hero") {
    for (const a of db.cls(c.classId!).abilities) if (a.level <= c.level) out.add(a.ability);
    for (const a of c.learned) out.add(a);
    for (const i of Object.values(c.equipment)) for (const g of (i && db.item(i).equip?.grants) || []) out.add(g);
    for (const [id, a] of db.abilities) if (a.special) out.add(id);
  } else if (c.kind === "enemy") {
    const def = db.enemy(c.def);
    for (const r of def.ai) if (r.action !== "attack") out.add(r.action);
    for (const i of Object.values(c.equipment)) for (const g of (i && db.item(i).equip?.grants) || []) out.add(g);
    for (const a of def.boardAi.abilities ?? []) out.add(a.ability);
    if (def.boardAi.pack) for (const [id, a] of db.abilities) if (a.special) out.add(id);
  }
  return [...out];
}

// ---------- levels (§3.1) ----------

export function expForLevel(db: Database, level: number): number {
  return Math.floor(db.config.expBase * Math.pow(level - 1, db.config.expExponent));
}

export interface LevelUpResult {
  level: number;
  gains: Partial<Stats>;
  abilities: string[];
}

/** Adds EXP and applies level ups. HP/MP grow by the same amount as their maximum. */
export function gainExp(db: Database, c: Character, amount: number): LevelUpResult[] {
  if (c.kind !== "hero") return [];
  c.exp += amount;
  const results: LevelUpResult[] = [];
  const cls = db.cls(c.classId!);
  while (c.level < db.config.maxLevel && c.exp >= expForLevel(db, c.level + 1)) {
    const before = baseStats(db, c);
    c.level++;
    const after = baseStats(db, c);
    const gains: Partial<Stats> = {};
    for (const k of STAT_KEYS) if (after[k] !== before[k]) gains[k] = after[k] - before[k];
    if (c.hp > 0) {
      c.hp += gains.maxHp ?? 0;
      c.mp += gains.maxMp ?? 0;
    }
    const abilities = cls.abilities.filter((a) => a.level === c.level).map((a) => a.ability);
    results.push({ level: c.level, gains, abilities });
  }
  return results;
}

/** Clamp HP/MP to current maxima (after equipment changes). */
export function clampVitals(db: Database, c: Character) {
  const s = computeStats(db, c);
  c.hp = Math.min(c.hp, s.maxHp);
  c.mp = Math.min(c.mp, s.maxMp);
}
