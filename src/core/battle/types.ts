import type { Character, Faction } from "../state/types";
import type { Pos } from "../util/grid";

export type BattleKind = "normal" | "ambush" | "firstStrike";
export type Side = "hero" | "enemy";

export interface Combatant {
  id: string;
  side: Side;
  /** Controlled by AI (enemies, NPC guests). */
  ai: boolean;
  /** Position index on its side (for layout). */
  slot: number;
  /** Raised mid-battle (§12.7): gives exp but no gold. */
  summoned?: boolean;
}

/** A combatant inside another one's stomach (§12.7). */
export interface Swallowed {
  by: string;
  target: string;
  /** What will be taken when spat out. */
  hp: number;
  mp: number;
  /** 0 = just swallowed, 1 = digested half. */
  stage: 0 | 1;
}

export interface BattleSource {
  attackerPiece: string;
  attackerFaction: Faction;
  defenderPieces: string[];
  origin: Pos;
  cell: Pos;
  /** Path the attacker takes to capture the cell after winning. */
  path: Pos[];
  mode: "walk" | "leap";
}

export interface BattleRewards {
  exp: number;
  gold: number;
  items: string[];
}

export interface BattleState {
  kind: BattleKind;
  combatants: Combatant[];
  /** Characters that only exist for this battle. */
  guests: Record<string, Character>;
  /** 0 = opening round of an ambush / first strike. */
  round: number;
  queue: string[];
  current: string | null;
  result: null | "victory" | "defeat" | "escaped";
  boss: boolean;
  battleback: string;
  source?: BattleSource;
  rewards?: BattleRewards;
  swallowed?: Swallowed[];
  /** Round in which an actor last used an action: "actor:action" (AI cooldowns). */
  used?: Record<string, number>;
  /** Gold spent by the enemy side on summons (taken from the reward). */
  spent?: number;
}

export type BattleAction =
  | { type: "attack"; target: string }
  | { type: "ability"; ability: string; target?: string }
  | { type: "item"; item: string; target?: string }
  | { type: "defend" }
  | { type: "run" }
  | { type: "wait" }
  /** Forced turn of a swallower: digest, then spit out (§12.7). */
  | { type: "digest" };
