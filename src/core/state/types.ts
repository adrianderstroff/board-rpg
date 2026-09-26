import type { EquipSlot } from "../data/types";
import type { Dir, Pos } from "../util/grid";
import type { RngState } from "../util/rng";

export interface StatusInst {
  id: string;
  /** Remaining turns; undefined = until cured. */
  turns?: number;
}

export type CharKind = "hero" | "enemy" | "npc";

export interface Character {
  id: string;
  name: string;
  kind: CharKind;
  /** Hero def id / enemy def id / npc def id. */
  def: string;
  classId?: string;
  level: number;
  exp: number;
  hp: number;
  mp: number;
  statuses: StatusInst[];
  equipment: Partial<Record<EquipSlot, string>>;
  learned: string[];
  /** Already stolen from (enemies/NPCs). */
  looted?: boolean;
}

export type Faction = "hero" | "enemy" | "npc";

export interface Piece {
  id: string;
  faction: Faction;
  members: string[];
  x: number;
  y: number;
  facing: Dir;
  /** Map enemy entry id (enemies) or event id (npcs/objects). */
  sourceId?: string;
  /** Centre for wandering. */
  home?: Pos;
  /** Fallen hero marker piece: lies on the cell, no turns, passable. */
  fallen?: boolean;
  /** Dormant enemy: looks like remains, no turns, blocks, rises when heroes come close (§7.5). */
  dormant?: boolean;
  /**
   * The member whose turn start triggers the cell's field effects – the one who moved the piece
   * there (§7.4). Falls back to the next member when that one leaves or falls.
   */
  anchor?: string;
  /** Rose from dormancy (Discover) in this round: takes no turn before the next one (§7.5). */
  waitRound?: number;
  /** Last cell before the piece stepped onto ice: where it goes back to if the ice melts under it (§5.4). */
  iceOrigin?: Pos;
}

export interface FieldEffectInst {
  x: number;
  y: number;
  effect: string;
  /** Remaining rounds. */
  rounds: number;
  /** Fire on burnt terrain: spreads to flammable neighbours at the next round start (§5.4). */
  spreads?: boolean;
}

export interface TrapInst {
  x: number;
  y: number;
  damage: number;
  status?: string;
}

export interface TurnState {
  round: number;
  /** Character ids that finished their turn this round. */
  acted: string[];
  current: string | null;
  moved: string[];
  abilityUsed: string[];
  /** Pieces whose cell effects already hit them this round (start of their turn). */
  cellTicked?: string[];
}

export interface BoardState {
  mapId: string;
  pieces: Record<string, Piece>;
  /** Enemy and NPC characters living on this board (heroes live in GameState.heroes). */
  chars: Record<string, Character>;
  fieldEffects: FieldEffectInst[];
  traps: TrapInst[];
  turn: TurnState;
  /** Gate / switch states (§5.8), kept up to date by updateGates. */
  gates?: Record<string, boolean>;
  switches?: Record<string, boolean>;
  /** Enemy types whose stats were revealed on this board this round (ambush reduction). */
  perceivedRound?: number;
  nextId: number;
}

export interface QuestProgress {
  status: "started" | "done";
  step: number;
  ending?: string;
}

export interface MapMemory {
  defeated: string[];
  removedEvents: string[];
  triggered: string[];
  /** Changed terrain by cell key "x,y" (burnt flowers…, §5.4). */
  terrain?: Record<string, string>;
  /** Decor changed per cell "x,y": null = gone (burnt/cut), a decor id = grown (brambles) (§5.4, §5.7). */
  decor?: Record<string, string | null>;
  /** Ancient traps revealed by Discover (still armed, now visible). */
  revealed?: string[];
  /** Hidden events uncovered. */
  discovered?: string[];
  /** Ancient traps triggered or disarmed. */
  sprung?: string[];
  /** Latching switches pressed for good (§5.8). */
  latched?: string[];
}

export interface Records {
  kills: Record<string, number>;
  talkedTo: string[];
  revealed: string[];
}

export interface GameState {
  version: number;
  rng: RngState;
  playTime: number;
  gold: number;
  inventory: Record<string, number>;
  flags: Record<string, boolean>;
  vars: Record<string, number>;
  heroes: Record<string, Character>;
  roster: string[];
  quests: { active: string | null; entries: Record<string, QuestProgress> };
  records: Records;
  maps: Record<string, MapMemory>;
  board: BoardState | null;
  battle: import("../battle/types").BattleState | null;
}

export const SAVE_VERSION = 1;
