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
  | { type: "terrain"; x: number; y: number; terrain: string } // a cell's terrain changed (burnt, §5.4)
  | { type: "melt"; x: number; y: number }
  | { type: "decor"; x: number; y: number; decor: string | null; cause?: "burnt" | "cut" | "grown" } // §5.4, §5.7
  | { type: "shock"; cells: Pos[] } // lightning ran through these cells (§5.6)
  | { type: "state"; event: string; state: string } // an entity changed state – a gate opened, a plate went down (§10.3)
  | { type: "wake"; piece: string } // a dormant enemy rises (§7.5)
  | { type: "sensed"; cells: Pos[]; center: Pos; radius: number } // Discover's reach and what it found
  | { type: "defused"; x: number; y: number; item: string }
  | { type: "uncovered"; x: number; y: number; what: "trap" | "event" | "enemy" }
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
  | { type: "swallow"; actor: string; target: string } // §12.7
  | { type: "spit"; actor: string; target: string; hp: number; mp: number }
  | { type: "release"; actor: string; target: string } // swallower fell: out without loss
  | { type: "summoned"; actor: string; ids: string[]; cost: number }
  | { type: "round"; round: number };
