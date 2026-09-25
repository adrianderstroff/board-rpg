import type { Element, Stats } from "./data/types";
import type { Dir, Pos } from "./util/grid";

/**
 * Everything the rules report back. Core functions mutate state and return a list of these;
 * the presentation layer replays them as animations/messages. Nothing in here is required
 * to understand the resulting state – it is purely descriptive.
 */
export type GameEvent =
  | { type: "move"; piece: string; path: Pos[]; mode: "walk" | "leap" | "slide" | "warp" }
  | { type: "face"; piece: string; dir: Dir }
  | { type: "action"; actor: string; name: string; ability?: string; item?: string; targets?: string[] }
  | { type: "damage"; target: string; amount: number; crit?: boolean; element?: Element; weak?: boolean; resist?: boolean }
  | { type: "miss"; target: string }
  | { type: "heal"; target: string; amount: number }
  | { type: "mp"; target: string; amount: number }
  | { type: "status"; target: string; status: string; added: boolean }
  | { type: "ko"; target: string }
  | { type: "revive"; target: string; hp: number }
  | { type: "fieldEffect"; x: number; y: number; effect: string; rounds: number }
  | { type: "trap"; x: number; y: number; triggeredBy?: string }
  | { type: "steal"; actor: string; target: string; item: string | null }
  | { type: "reveal"; targets: string[] }
  | { type: "learn"; target: string; ability: string }
  | { type: "itemGained"; item: string; count: number }
  | { type: "gold"; amount: number }
  | { type: "exp"; target: string; amount: number }
  | { type: "levelUp"; target: string; level: number; gains: Partial<Stats>; abilities: string[] }
  | { type: "message"; text: string }
  | { type: "join"; char: string; from: Pos; to: Pos } // a character walks over to join a party
  | { type: "pieces" } // piece set/parties changed – re-sync visuals
  | { type: "turnStart"; actor: string; round: number }
  | { type: "turnSkipped"; actor: string; reason: string }
  | { type: "round"; round: number };
