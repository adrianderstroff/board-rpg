import { createHero } from "../chars/character";
import type { Database } from "../data/database";
import { SAVE_VERSION, type GameState } from "./types";

/** Fresh state from config.yaml (the board is entered by the Game facade). */
export function newGameState(db: Database, seed = Date.now() >>> 0): GameState {
  const start = db.config.start;
  const heroes = Object.fromEntries(start.party.map((id) => [id, createHero(db, id)]));
  return {
    version: SAVE_VERSION,
    rng: { seed },
    playTime: 0,
    gold: start.gold,
    inventory: { ...start.items },
    flags: {},
    vars: {},
    heroes,
    roster: [...start.party],
    quests: { active: null, entries: {} },
    records: { kills: {}, talkedTo: [], revealed: [] },
    maps: {},
    board: null,
    battle: null,
  };
}
