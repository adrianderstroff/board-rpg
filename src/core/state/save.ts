import type { Database } from "../data/database";
import { SAVE_VERSION, type GameState } from "./types";

export interface SaveSummary {
  slot: number;
  savedAt: string;
  mapName: string;
  playTime: number;
  gold: number;
  heroes: { name: string; level: number }[];
}

export interface SaveFile {
  version: number;
  summary: SaveSummary;
  state: GameState;
}

/** Where saves go. Browser: localStorage; desktop builds can provide a file implementation. */
export interface SaveStorage {
  read(slot: number): string | null;
  write(slot: number, data: string): void;
  remove(slot: number): void;
}

export const SAVE_SLOTS = 3;

export function serialize(db: Database, state: GameState, slot: number): string {
  if (state.battle) throw new Error("Cannot save during battle");
  const file: SaveFile = {
    version: SAVE_VERSION,
    summary: {
      slot,
      savedAt: new Date().toISOString(),
      mapName: state.board ? db.map(state.board.mapId).name : "",
      playTime: Math.floor(state.playTime),
      gold: state.gold,
      heroes: state.roster.map((id) => ({ name: state.heroes[id].name, level: state.heroes[id].level })),
    },
    state,
  };
  return JSON.stringify(file);
}

export function deserialize(text: string): SaveFile {
  const file = JSON.parse(text) as SaveFile;
  if (!file || typeof file !== "object" || !file.state) throw new Error("Invalid save file");
  return migrate(file);
}

/** Upgrades older save versions in place. */
function migrate(file: SaveFile): SaveFile {
  if (file.version > SAVE_VERSION) throw new Error(`Save version ${file.version} is newer than the game`);
  // before projects (version 1) ids had no `lib:` prefix – such saves are dropped (projects.md §2)
  if (file.version < 2) throw new Error(`Save version ${file.version} is too old`);
  return file;
}

export function listSaves(storage: SaveStorage): (SaveSummary | null)[] {
  return Array.from({ length: SAVE_SLOTS }, (_, slot) => {
    const raw = storage.read(slot);
    if (!raw) return null;
    try {
      return deserialize(raw).summary;
    } catch {
      return null;
    }
  });
}

export function saveGame(db: Database, state: GameState, storage: SaveStorage, slot: number) {
  storage.write(slot, serialize(db, state, slot));
}

export function loadGame(storage: SaveStorage, slot: number): GameState | null {
  const raw = storage.read(slot);
  return raw ? deserialize(raw).state : null;
}

export class MemoryStorage implements SaveStorage {
  private data = new Map<number, string>();
  read = (slot: number) => this.data.get(slot) ?? null;
  write = (slot: number, d: string) => void this.data.set(slot, d);
  remove = (slot: number) => void this.data.delete(slot);
}
