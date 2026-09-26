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
  /** Makes freezable terrain walkable while it lasts (ice on water, §5.4). */
  bridges?: boolean;
  /** Burns flammable terrain and spreads to flammable 4-neighbours each round (§5.4). */
  ignites?: boolean;
  /** Placing this effect on a cell with the named effect removes that one instead (fire melts ice). */
  melts?: string;
  /** Durations are multiplied by this when placed on a board being explored (time-based, §8.10). */
  exploreFactor?: number;
  /** Conducts lightning like water (Soaked, §5.6). */
  conducts?: boolean;
  /** When it wears off, this decor grows on the cell unless someone stands there (Seeds → bramble, §5.7). */
  grows?: string;
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
  /** Ice shapes (§5.4): on water a size×size square of water cells, otherwise a line of `size` cells. */
  | { type: "freezeArea"; effect: string; rounds: number; size: number }
  /** Lightning on a cell; through connected conductive cells up to `reach` steps (§5.6). */
  | { type: "shock"; power: number; reach?: number }
  /** Cut down a cuttable plant on the target cell (§5.7). */
  | { type: "cut" }
  | { type: "placeTrap"; damage: number; status?: string }
  | { type: "steal" }
  | { type: "reveal" }
  | { type: "discover"; radius: number }
  /** Remove a trap on the target cell and put this item in the inventory (Defuse, §7.5). */
  | { type: "defuse"; item: string }
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
  | "self"
  /** A visible trap: a revealed ancient trap or one placed by the heroes. */
  | "trap"
  /** A cell with a cuttable plant (bramble, bush). */
  | "plant";

export interface BattleUse {
  target: BattleTarget;
  effects: EffectDef[];
  animation?: string;
  /**
   * Swallow the target (§12.7): it vanishes into the user, can't act or be targeted; the user
   * digests (gains half) next turn and spits it out the turn after, taking these fractions of
   * the target's current HP / MP.
   */
  swallow?: { hp: number; mp: number };
  /** Raise these enemies into the user's side for `cost` gold of the battle's reward (§12.7). */
  summon?: { enemies: string[]; cost: number };
}

export interface BoardUse {
  range: PatternRef;
  area?: PatternRef;
  targets: BoardTargetFilter[];
  effects: EffectDef[];
  /** Only usable on wild boards (e.g. placing a snare). */
  wildOnly?: boolean;
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
  when?: {
    hpBelow?: number;
    chance?: number;
    targetLacksStatus?: string;
    round?: number;
    /** At least this many rounds since this actor last used the action. */
    cooldown?: number;
    /** Only while every other combatant on the actor's side is down. */
    alone?: boolean;
  };
  /** "boss": allies that are bosses (henchmen buffing their master). */
  target?: "random" | "lowestHp" | "highestHp" | "boss";
  /** Tried before the weighted pick whenever it applies (e.g. buffs before attacking). */
  priority?: boolean;
}

export interface BoardAiDef {
  behavior: "aggressive" | "guard" | "wander" | "static";
  aggroRange?: number;
  wanderRadius?: number;
  /** Join adjacent allied pieces when heroes are near (enemy parties, §8.7). */
  pack?: boolean;
  /** Board abilities the AI may use before moving; chance = probability per turn when a target exists. */
  abilities?: { ability: string; chance?: number }[];
  /** Lies dormant (drawn as this chipset decor) until a hero comes within its reach (§7.5). */
  dormant?: { decor: string };
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
  /** Swimmer (§5.5): `water` = only through water, `amphibious` = land and water. */
  swims?: "water" | "amphibious";
  element?: Element;
  onHit?: { status: string; chance: number };
  ai: AiRule[];
  boardAi: BoardAiDef;
  exp: number;
  gold: number;
  drops?: { item: string; chance: number }[];
  steal?: { item: string; chance: number }[];
  boss?: boolean;
  /** Battle music instead of the usual boss / battle track. */
  music?: string;
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
  /** `floor`: image row where the walkable ground starts (the close-up stands villagers on it). */
  battlebacks: Record<string, { image: string; floor?: number }>;
  /** Flat lettering/symbols painted onto wall faces (MapDef.wallDecor): sheet + sign id → frame. */
  wallSigns?: SheetDef & { frames: Record<string, number> };
}

/** A corner of a cell: N = -y, S = +y, W = -x, E = +x. */
export type Corner = "NW" | "NE" | "SE" | "SW";

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
  /** Not walkable, but a bridging field effect (ice) makes it walkable (§5.4). */
  freezable?: boolean;
  /** Catches fire: turns into `burnsTo` and spreads fire (§5.4). */
  flammable?: boolean;
  burnsTo?: string;
  /** Water (§5.5): shallow = walkable, deep = only swimmers (or frozen). Conducts lightning. */
  water?: "shallow" | "deep";
  /** Hull flare (§5.9): outer sides lean inward toward the bottom by this much (cells) – a ship's hull. */
  flare?: number;
  /** Terrain drawn flat at height 0 under a flared column (the sea around a hull). */
  underlay?: string;
  /** A low wall (levels high) along the hull's outer edges; open toward walkable non-hull neighbours (a gangway). */
  bulwark?: number;
}

export interface DecorDef {
  name: string;
  frame: number;
  /**
   * Directional objects (a ship's wheel): one frame per quarter turn of the board, from `frame` on;
   * `frame` shows it facing S (grid +y). Maps turn single placements with the `decorDir` layer.
   */
  views?: number;
  blocks: boolean;
  /** Burns away when set on fire (and passes the fire on, §5.4). */
  flammable?: boolean;
  /** Can be cut down with Cut (§5.7). */
  cuttable?: boolean;
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
  /** `wakeAt`: where the party wakes up after resting (e.g. the inn's upper floor). */
  | { type: "inn"; price?: number; label?: string; wakeAt?: { map: string; spawn: string } }
  | { type: "examine"; dialog?: string; actions?: Action[]; label?: string };

export interface EventPageDef {
  when?: Condition;
  npc?: string;
  /** For objects like a shop counter: the npc standing behind it (speaker, close-up figure). */
  keeper?: string;
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
  /** Invisible until uncovered with Discover (§7.5). */
  hidden?: boolean;
}

/** Bars across a cell (§5.8): open while a linked switch is pressed or `openWhen` holds. */
export interface GateDef {
  id: string;
  x: number;
  y: number;
  openWhen?: Condition;
  /** Set this flag the first time the gate closes (e.g. to start a scene). */
  closeFlag?: string;
}

/** A floor plate (§5.8): held down by standing heroes (`weight` = how many), opens gates. */
export interface SwitchDef {
  id: string;
  x: number;
  y: number;
  opens: string[];
  weight?: number;
  /** Stays down for good once pressed. */
  latch?: boolean;
}

/** Ancient trap hidden on a map: stops heroes walking over it (§7.5). */
export interface MapTrapDef {
  id: string;
  x: number;
  y: number;
  damage: number;
  status?: string;
}

export interface ExitDef {
  x: number;
  y: number;
  dir: Dir;
  to: string;
  spawn: string;
  label?: string;
  enabled?: Condition;
  /** A building door (or stairs): no arrow, no travel question – stepping in enters. */
  door?: boolean;
  /** Split floors (§5.3): pieces wait here until every hero piece waits on one; each arrives at its exit's spawn. */
  together?: boolean;
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
  /**
   * `overhead` + `overheadHeight`: a structure floating above a walkable cell – e.g. the lintel and
   * roof above a door. Terrain chars (legend.terrain) and the level of its top; it starts above a
   * 4-level clearance (a character's height). Purely visual.
   */
  /** `decorDir`: N/E/S/W per cell – which way a directional decor (e.g. a ship's wheel) faces; default S. */
  layers: { terrain: string; height?: string; decor?: string; overhead?: string; overheadHeight?: string; shape?: string; decorDir?: string };
  /**
   * `shapes`: chars of the `shape` layer → corners cut off along the diagonals (§5.9), e.g.
   * `{ cut: [NW] }` = a half cell, `{ cut: [NW, NE] }` = a point (a ship's bow). Shaped cells are
   * not walkable.
   */
  legend: { terrain: Record<string, string>; decor?: Record<string, string>; shapes?: Record<string, { cut: Corner[] }> };
  spawns: Record<string, { x: number; y: number; dir?: Dir }>;
  exits?: ExitDef[];
  enemies?: MapEnemyDef[];
  events?: MapEventDef[];
  traps?: MapTrapDef[];
  gates?: GateDef[];
  switches?: SwitchDef[];
  /**
   * Signs painted on one side of a block (shop lettering next to a door): `sign` from
   * graphics.wallSigns on the `face` side of cell x,y, `level` = which block (default: the top
   * one). Drawn onto the face (isometrically distorted), only while that side faces the camera.
   */
  wallDecor?: { x: number; y: number; sign: string; face: Dir; level?: number }[];
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
  /** Free exploration: field effects advance one round every this many ms (§8.10). */
  exploreRoundMs?: number;
}
