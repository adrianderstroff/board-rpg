import type { Database } from "../core/data/database";
import { Game, type EnterResult } from "../core/game";
import { quickPlay } from "../core/state/quickPlay";
import type { SaveStorage } from "../core/state/save";
import type { GameState } from "../core/state/types";

/** Browser save storage (desktop builds can swap in a file based implementation). */
export class LocalSaveStorage implements SaveStorage {
  constructor(private readonly prefix = "board-rpg:save:") {}
  read(slot: number) {
    try {
      return localStorage.getItem(this.prefix + slot);
    } catch {
      return null;
    }
  }
  write(slot: number, data: string) {
    localStorage.setItem(this.prefix + slot, data);
  }
  remove(slot: number) {
    localStorage.removeItem(this.prefix + slot);
  }
}

export interface Settings {
  textSpeed: number; // characters per second
  musicVolume: number; // 0..1
  sfxVolume: number; // 0..1
  /** Map turn speed 1 (slow) … 5 (fast); 3 is the default. */
  rotateSpeed: number;
}

/** Duration (ms) of a map quarter turn per speed setting 1…5. */
export const ROTATE_MS_BY_SPEED = [1500, 1150, 900, 600, 350];

/** Process-wide session shared by all scenes. */
export class Session {
  game: Game | null = null;
  settings: Settings = { textSpeed: 45, musicVolume: 0.5, sfxVolume: 0.7, rotateSpeed: 3 };
  readonly storage: SaveStorage;
  /** Editor Quick Play: start straight on this map instead of the title (editor-design §4). */
  pendingQuickPlay?: string;

  constructor(
    readonly db: Database,
    opts: { playtest?: boolean } = {},
  ) {
    // play-tests from the editor keep their own save slots
    this.storage = new LocalSaveStorage(opts.playtest ? "board-rpg:playtest:save:" : undefined);
    try {
      const s = localStorage.getItem("board-rpg:settings");
      if (s) this.settings = { ...this.settings, ...JSON.parse(s) };
    } catch {
      /* ignore */
    }
  }

  saveSettings() {
    try {
      localStorage.setItem("board-rpg:settings", JSON.stringify(this.settings));
    } catch {
      /* ignore */
    }
  }

  newGame() {
    const { game, result } = Game.create(this.db);
    this.game = game;
    return result;
  }

  /** Editor Quick Play on `mapId` (its Quick Play entity, see core/state/quickPlay). */
  startQuickPlay(mapId: string): EnterResult {
    const { game, result } = quickPlay(this.db, mapId);
    this.game = game;
    return result;
  }

  loadState(state: GameState) {
    this.game = new Game(this.db, state);
  }

  get current(): Game {
    if (!this.game) throw new Error("No game running");
    return this.game;
  }
}

let session: Session | null = null;

export function initSession(db: Database, opts: { playtest?: boolean } = {}) {
  session = new Session(db, opts);
  return session;
}

export function getSession(): Session {
  if (!session) throw new Error("Session not initialised");
  return session;
}
