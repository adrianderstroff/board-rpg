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
}

export interface FieldEffectInst {
  x: number;
  y: number;
  effect: string;
  /** Remaining rounds. */
  rounds: number;
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
