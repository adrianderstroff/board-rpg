import { computeStats, createEnemy, createHero } from "../../../src/core/chars/character";
import type { Database, RawContent } from "../../../src/core/data/database";
import { STAT_KEYS, type AiRule, type ClassDef, type EnemyDef, type HeroDef, type NpcDef, type StatKey, type Stats } from "../../../src/core/data/types";

/**
 * Characters (editor-design §7): heroes with their class, enemies, NPCs – the files, new entries,
 * and what the screens show in words and numbers.
 */

export type Hero = Omit<HeroDef, "id">;
export type Klass = Omit<ClassDef, "id">;
export type Enemy = Omit<EnemyDef, "id">;
export type Npc = Omit<NpcDef, "id">;

export const HEROES_FILE = "data/heroes.yaml";
export const CLASSES_FILE = "data/classes.yaml";
export const ENEMIES_FILE = "data/enemies.yaml";
export const NPCS_FILE = "data/npcs.yaml";
export const CONFIG_FILE = "data/config.yaml";

export const header = (what: string) => `# The project's own ${what} (docs/game-design.md §3, edited in the editor: docs/editor-design.md §7).\n`;

export const STAT_LABEL: Record<StatKey, string> = { maxHp: "HP", maxMp: "MP", str: "STR", def: "DEF", mag: "MAG", mdef: "MDEF", spd: "SPD" };
export const zeroStats = (): Stats => Object.fromEntries(STAT_KEYS.map((k) => [k, 0])) as Stats;

/** Levels the stat tables show. */
export const TABLE_LEVELS = [1, 5, 10, 20, 30, 40, 50];

/** A hero's stats at each level (the game's own formula, with its start equipment). */
export function heroStatTable(db: Database, heroId: string, levels = TABLE_LEVELS): { level: number; stats: Stats }[] {
  return levels.map((level) => {
    const c = createHero(db, heroId);
    c.level = level;
    return { level, stats: computeStats(db, c) };
  });
}

/** An enemy's stats at a level (its growth, its equipment). */
export function enemyStatsAt(db: Database, enemyId: string, level?: number): Stats {
  return computeStats(db, createEnemy(db, "preview", enemyId, level));
}

/** The heroes that share a class (editing it changes all of them). */
export function classUsers(raw: RawContent, classId: string): string[] {
  return Object.entries(raw.heroes)
    .filter(([, h]) => h.classId === classId)
    .map(([id]) => id);
}

/** Where an NPC stands: the maps and entities that show it (as the figure or behind a counter). */
export function npcPlacements(raw: RawContent, npcId: string): { map: string; entity: string; index: number }[] {
  const out: { map: string; entity: string; index: number }[] = [];
  const uses = (v: unknown): boolean => {
    if (Array.isArray(v)) return v.some(uses);
    if (v && typeof v === "object") return Object.entries(v).some(([k, x]) => ((k === "npc" || k === "keeper") && x === npcId) || uses(x));
    return false;
  };
  for (const [map, m] of Object.entries(raw.maps)) (m.events ?? []).forEach((e, index) => uses(e) && out.push({ map, entity: e.id, index }));
  return out;
}

const first = (rec: Record<string, unknown> | undefined, prefer?: string) => (prefer && rec && prefer in rec ? prefer : (Object.keys(rec ?? {})[0] ?? ""));

export function newHero(raw: RawContent): Hero {
  return { name: "New hero", classId: first(raw.classes, "lib:knight"), level: 1, charset: first(raw.graphics.charsets, "lib:hero_knight"), battler: first(raw.graphics.battlers, "lib:hero_knight"), face: first(raw.graphics.faces, "lib:hero_knight") };
}

export function newClass(name: string): Klass {
  return {
    name,
    abilityType: "Skill",
    move: "lib:walk1",
    equip: ["sword", "lightArmor", "accessory"],
    base: { maxHp: 30, maxMp: 8, str: 9, def: 8, mag: 6, mdef: 7, spd: 8 },
    growth: { maxHp: 5, maxMp: 1.5, str: 1.5, def: 1.2, mag: 1, mdef: 1.2, spd: 0.8 },
    abilities: [],
  };
}

export function newEnemy(raw: RawContent): Enemy {
  return {
    name: "New enemy",
    level: 1,
    stats: { maxHp: 20, maxMp: 0, str: 8, def: 6, mag: 2, mdef: 4, spd: 6 },
    move: "lib:walk1",
    charset: first(raw.graphics.charsets, "lib:enemy_scorpion"),
    battler: first(raw.graphics.battlers, "lib:enemy_scorpion"),
    ai: [{ action: "attack", weight: 1 }],
    boardAi: { behavior: "aggressive", aggroRange: 4 },
    exp: 5,
    gold: 5,
  };
}

export function newNpc(raw: RawContent): Npc {
  return { name: "New villager", charset: first(raw.graphics.charsets, "lib:npc_villager_m") };
}

// ---------- in words ----------

const plain = (id: string) => id.replace(/^lib:/, "");
const TARGETS: Record<NonNullable<AiRule["target"]>, string> = { random: "", lowestHp: " on the weakest", highestHp: " on the healthiest", boss: " on its boss" };

/** An AI rule in words: "When HP < 50 %, 30 %: Heal on the weakest". */
export function aiRuleText(rule: AiRule, name: (kind: "abilities" | "items" | "statuses", id: string) => string = (_, id) => plain(id)): string {
  const w = rule.when ?? {};
  const when = [
    w.hpBelow !== undefined ? `HP < ${Math.round(w.hpBelow * 100)} %` : "",
    w.round !== undefined ? (w.round === 1 ? "" : `every ${w.round}${w.round === 2 ? "nd" : w.round === 3 ? "rd" : "th"} round`) : "",
    w.cooldown !== undefined ? `${w.cooldown} rounds after its last use` : "",
    w.alone ? "alone" : "",
    w.chance !== undefined ? `${Math.round(w.chance * 100)} % chance` : "",
    w.targetLacksStatus ? `on someone without ${name("statuses", w.targetLacksStatus)}` : "",
  ].filter(Boolean);
  const what = rule.action === "attack" ? "Attack" : rule.action === "item" ? `Use ${rule.item ? name("items", rule.item) : "an item"}` : name("abilities", rule.action);
  const head = rule.priority ? "First" : `Weight ${rule.weight}`;
  return `${head}${when.length ? `, when ${when.join(", ")}` : ""}: ${what}${rule.target ? TARGETS[rule.target] : ""}`;
}

/** How an element multiplier reads (1.5 weak, 0.5 resist, 0 immune). */
export function elementWord(m: number | undefined): string {
  if (m === undefined || m === 1) return "normal";
  if (m === 0) return "immune";
  if (m < 0) return "absorbs";
  return m > 1 ? "weak" : "resists";
}
