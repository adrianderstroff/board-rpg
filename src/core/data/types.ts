/**
 * Definition types for everything under data/*.yaml.
 * These describe *static* content; runtime state lives in core/state.
 */
import type { DirSet, Dir } from "../util/grid";

// ---------- shared ----------

export type StatKey = "maxHp" | "maxMp" | "str" | "def" | "mag" | "mdef" | "spd";
export const STAT_KEYS: StatKey[] = ["maxHp", "maxMp", "str", "def", "mag", "mdef", "spd"];
export type Stats = Record<StatKey, number>;

export type Element = "fire" | "ice" | "thunder" | "earth" | "holy";
export const ELEMENTS: Element[] = ["fire", "ice", "thunder", "earth", "holy"];

export type Scope = "board" | "battle";

// ---------- patterns (§6) ----------

export type PatternPart =
  | { walk: number; dirs?: DirSet }
  | { ray: number; dirs?: DirSet }
  | { leap: [number, number][]; symmetric?: boolean; maxHeightDiff?: number }
  | { area: number; shape?: "diamond" | "square" | "cross" }
  | { include: string };

export interface PatternDef {
  id: string;
  name?: string;
  parts: PatternPart[];
  /** Explicit reach; otherwise computed. */
  reach?: number;
  ignoreHeight?: boolean;
  ignoreBlocking?: boolean;
  includeOrigin?: boolean;
  /** Max height difference per step (default 1). */
  maxHeightDiff?: number;
}

/** Either a pattern id or an inline pattern. */
export type PatternRef = string | Omit<PatternDef, "id">;

// ---------- statuses (§4.2) ----------

export interface StatusDef {
  id: string;
  name: string;
  icon?: string;
  description?: string;
  scope: Scope[];
  persists: boolean;
  negative: boolean;
  /** Multipliers on stats, e.g. { spd: 0.5 }. */
  modifiers?: Partial<Record<StatKey, number>>;
  /** % of max HP per turn: negative = damage, positive = heal. */
  tickPercent?: number;
  /** Poison-style ticks on the board cannot KO (stop at 1 HP). */
  nonLethalOnBoard?: boolean;
  skipTurn?: boolean;
  breakOnDamage?: boolean;
  untargetable?: boolean;
  /** Ends when the owner performs an offensive action. */
  breakOnOffense?: boolean;
  hitModifier?: number;
  reachModifier?: number;
  /** Removed when the owner's next turn starts (Defend). */
  consumeOnTurnStart?: boolean;
  /** Field effects, traps and ice don't affect the owner (Flying). A party needs all members immune. */
  fieldImmune?: boolean;
  defaultTurns?: number | [number, number];
}

// ---------- field effects (§7.4) ----------

export interface FieldEffectDef {
  id: string;
  name: string;
  /** % max HP damage on landing and each turn end on the cell. */
  damagePercent?: number;
  element?: Element;
  /** Status applied on landing. */
  status?: string;
  statusTurns?: number | [number, number];
  slide?: boolean;
  overlayRow: number;
}

// ---------- effects (§13.2) ----------

export type EffectDef =
  | { type: "damage"; kind: "physical" | "magical"; power?: number; base?: number; element?: Element; ignoreDef?: number }
  | { type: "fixedDamage"; amount: number; element?: Element }
  | { type: "heal"; base?: number; scale?: number }
  | { type: "healPercent"; percent: number }
  | { type: "restoreMp"; amount: number }
  | { type: "applyStatus"; status: string; chance?: number; turns?: number | [number, number] }
  | { type: "cureStatus"; statuses?: string[]; allNegative?: boolean }
  | { type: "revive"; percent: number }
  | { type: "fieldEffect"; effect: string; rounds: number }
  | { type: "placeTrap"; damage: number; status?: string }
  | { type: "steal" }
  | { type: "reveal" }
  | { type: "learnAbility"; ability: string };

export type BattleTarget = "enemy" | "ally" | "self" | "any" | "allEnemies" | "allAllies" | "fallenAlly";

export type BoardTargetFilter =
  | "hero"
  | "enemy"
  | "npc"
  | "anyCharacter"
  | "fallen"
  | "emptyCell"
  | "anyCell"
  | "self";

export interface BattleUse {
  target: BattleTarget;
  effects: EffectDef[];
  animation?: string;
}

export interface BoardUse {
  range: PatternRef;
  area?: PatternRef;
  targets: BoardTargetFilter[];
  effects: EffectDef[];
}

// ---------- abilities (§13) ----------

export type SpecialAbility = "joinParty" | "leaveParty";

export interface AbilityDef {
  id: string;
  name: string;
  type: string; // Magic, Sword Art, Skill, Ki, Party, Enemy
  group?: string;
  mp: number;
  icon?: string;
  description?: string;
  /** Offensive actions break Hidden. */
  offensive?: boolean;
  battle?: BattleUse;
  board?: BoardUse;
  special?: SpecialAbility;
}

// ---------- classes (§3.2) ----------

export interface ClassDef {
  id: string;
  name: string;
  description?: string;
  abilityType: string;
  move: string;
  equip: string[]; // equipment kinds, e.g. sword, heavyArmor
  base: Stats;
  growth: Stats;
  critBonus?: number;
  abilities: { level: number; ability: string }[];
}

// ---------- items (§14) ----------

export type ItemCategory = "key" | "weapon" | "armor" | "accessory" | "consumable" | "battle" | "scroll";
export type EquipSlot = "weapon" | "armor" | "accessory";

export interface EquipDef {
  slot: EquipSlot;
  kind: string; // sword, staff, dagger, claw, heavyArmor, robe, lightArmor, accessory
  stats?: Partial<Stats>;
  element?: Element;
  grants?: string[];
  onHit?: { status: string; chance: number };
  immune?: string[];
}

export interface ItemDef {
  id: string;
  name: string;
  category: ItemCategory;
  price: number;
  icon?: string;
  description?: string;
  equip?: EquipDef;
  battle?: BattleUse;
  board?: BoardUse;
  /** Scrolls */
  learn?: { ability: string; classes: string[] };
}

// ---------- enemies & npcs (§3.3) ----------

export interface AiRule {
  /** Ability id or "attack". */
  action: string;
  weight: number;
  when?: { hpBelow?: number; chance?: number; targetLacksStatus?: string; round?: number };
  target?: "random" | "lowestHp" | "highestHp";
}

export interface BoardAiDef {
  behavior: "aggressive" | "guard" | "wander" | "static";
  aggroRange?: number;
  wanderRadius?: number;
  /** Join adjacent allied pieces when heroes are near (enemy parties, §8.7). */
  pack?: boolean;
  /** Board abilities the AI may use before moving; chance = probability per turn when a target exists. */
  abilities?: { ability: string; chance?: number }[];
}

export interface GraphicsRef {
  charset: string;
  battler?: string;
  face?: string;
}

export interface EnemyDef extends GraphicsRef {
  id: string;
  name: string;
  description?: string;
  level: number;
  stats: Stats;
  move: string;
  elements?: Partial<Record<Element, number>>;
  immune?: string[];
  /** Permanent statuses the enemy always has (e.g. flying). */
  statuses?: string[];
  element?: Element;
  onHit?: { status: string; chance: number };
  ai: AiRule[];
  boardAi: BoardAiDef;
  exp: number;
  gold: number;
  drops?: { item: string; chance: number }[];
  steal?: { item: string; chance: number }[];
  boss?: boolean;
}

export interface NpcDef extends GraphicsRef {
  id: string;
  name: string;
  description?: string;
  level?: number;
  stats?: Stats;
  move?: string;
  steal?: { item: string; chance: number }[];
  targetable?: boolean;
}

export interface HeroDef extends GraphicsRef {
  id: string;
  name: string;
  classId: string;
  description?: string;
  level: number;
  equipment?: Partial<Record<EquipSlot, string>>;
}

// ---------- shops ----------

export interface ShopDef {
  id: string;
  name: string;
  type: "weapon" | "item" | "magic";
  items: string[];
}

// ---------- conditions & actions (§10) ----------

export type Condition =
  | { flag: string }
  | { not: Condition }
  | { all: Condition[] }
  | { any: Condition[] }
  | { item: string | { id: string; count?: number } }
  | { gold: number }
  | { var: { name: string; op?: "==" | "!=" | ">=" | "<=" | ">" | "<"; value: number } }
  | { talkedTo: string }
  | { defeated: { enemy?: string; piece?: string; count?: number } }
  | { defeatedAllOn: string }
  | { onMap: string }
  | { questActive: string }
  | { questDone: string | { quest: string; ending?: string } }
  | { questStep: { quest: string; step: string } }
  | { questStepsDone: string }
  | { partyHas: string }
  | { level: number }
  | { always: boolean };

export type Action =
  | { setFlag: string }
  | { clearFlag: string }
  | { setVar: { name: string; value: number } }
  | { addVar: { name: string; value: number } }
  | { giveItem: string | { id: string; count?: number } }
  | { takeItem: string | { id: string; count?: number } }
  | { giveGold: number }
  | { takeGold: number }
  | { startQuest: string | { id: string; activate?: boolean } }
  | { completeQuest: string | { id: string; ending?: string } }
  | { setQuestStep: { quest: string; step: string } }
  | { dialog: string }
  | { shop: string }
  | { inn: number }
  | { healParty: boolean }
  | { removeEvent: string }
  | { spawnEnemy: string }
  | { teleport: { map: string; spawn: string } }
  | { message: string }
  | { reveal: string };

// ---------- dialogs (§9) ----------

export type DialogNode =
  | { say: string; speaker?: string; face?: string }
  | { choice: { text: string; goto?: string; when?: Condition; do?: Action[] }[] }
  | { do: Action[] }
  | { if: Condition; then?: string; else?: string }
  | { goto: string }
  | { end: true };

export type DialogDef = DialogNode[];

// ---------- quests (§10.4) ----------

export interface QuestStepDef {
  id: string;
  objective: string;
  done: Condition;
  lock?: boolean;
  onStart?: Action[];
  onComplete?: Action[];
}

export interface QuestEndingDef {
  id: string;
  when: Condition;
  hidden?: boolean;
  onComplete?: Action[];
}

export interface QuestDef {
  id: string;
  title: string;
  description: string;
  parent?: string;
  lockSwitch?: boolean;
  steps: QuestStepDef[];
  /** Default: a single ending "done" when all steps are completed. */
  endings?: QuestEndingDef[];
  onStart?: Action[];
}

// ---------- graphics definitions ----------

export interface SheetDef {
  image: string;
  frameWidth: number;
  frameHeight: number;
}

export interface GraphicsDb {
  charsets: Record<string, SheetDef>;
  battlers: Record<string, SheetDef & { frames: Record<string, number> }>;
  faces: Record<string, { image: string }>;
  battlebacks: Record<string, { image: string }>;
}

export interface TerrainDef {
  name: string;
  frame: number;
  /** Animation frames (cycle). */
  frames?: number[];
  /** Frame used for blocks below the surface. */
  fill?: number;
  walkable: boolean;
  /** Permanent field effect. */
  surface?: string;
  /** Surface is drawn this many px lower (water). */
  sink?: number;
}

export interface DecorDef {
  name: string;
  frame: number;
  blocks: boolean;
}

export interface ChipsetDef {
  id: string;
  image: string;
  frameWidth: number;
  frameHeight: number;
  tileWidth: number;
  tileHeight: number;
  blockHeight: number;
  terrains: Record<string, TerrainDef>;
  decorImage: string;
  decorFrameWidth: number;
  decorFrameHeight: number;
  decorAnchorY: number;
  decor: Record<string, DecorDef>;
}

// ---------- maps (§5, §10.3, §17) ----------

export type Interaction =
  | { type: "talk"; dialog: string; label?: string }
  | { type: "shop"; shop: string; label?: string }
  | { type: "inn"; price?: number; label?: string }
  | { type: "examine"; dialog?: string; actions?: Action[]; label?: string };

export interface EventPageDef {
  when?: Condition;
  npc?: string;
  decor?: string;
  dir?: Dir;
  move?: "static" | "wander";
  wanderRadius?: number;
  trigger?: "interact" | "step" | "auto" | "none";
  /** Shortcut: talk interaction. */
  dialog?: string;
  interactions?: Interaction[];
  actions?: Action[];
  /** Show a shop sign icon above. */
  sign?: string;
  /** Auto/step triggers run once by default. */
  once?: boolean;
}

export interface MapEventDef {
  id: string;
  x: number;
  y: number;
  pages: EventPageDef[];
}

export interface ExitDef {
  x: number;
  y: number;
  dir: Dir;
  to: string;
  spawn: string;
  label?: string;
  enabled?: Condition;
}

export interface MapEnemyDef {
  id: string;
  enemy: string;
  x: number;
  y: number;
  /** Additional party members (enemy ids). */
  party?: string[];
  when?: Condition;
  dir?: Dir;
}

export interface MapDef {
  id: string;
  name: string;
  kind: "peaceful" | "wild";
  chipset: string;
  battleback: string;
  /** Music track id (public/assets/audio/music/<id>.wav). */
  music?: string;
  layers: { terrain: string; height?: string; decor?: string };
  legend: { terrain: Record<string, string>; decor?: Record<string, string> };
  spawns: Record<string, { x: number; y: number; dir?: Dir }>;
  exits?: ExitDef[];
  enemies?: MapEnemyDef[];
  events?: MapEventDef[];
  /** Actions when the map is entered. */
  onEnter?: Action[];
}

// ---------- config ----------

export interface ConfigDef {
  title: string;
  start: { map: string; spawn: string; party: string[]; gold: number; items: Record<string, number>; quest?: string };
  maxLevel: number;
  maxPartySize: number;
  expBase: number;
  expExponent: number;
  critChance: number;
  defenseScale: number;
  damageFactor: number;
  hitChance: number;
  firstStrikeChance: number;
  ambushChance: number;
  innPricePerHero: number;
  /** Music for non-map situations. */
  music?: { title?: string; battle?: string; boss?: string };
  sellRatio: number;
  boardBurnMinHp: number;
}
