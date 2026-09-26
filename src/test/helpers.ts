import { loadRawContent } from "../content/loader";
import { Database } from "../core/data/database";
import type { MapDef } from "../core/data/types";
import { makeCtx, type Ctx } from "../core/context";
import { enterMap } from "../core/board/board";
import { newGameState } from "../core/state/newGame";
import { Game } from "../core/game";
import { runActions } from "../core/script/actions";

/** Real content plus an optional test map. */
export function testDb(extraMaps: Record<string, Omit<MapDef, "id">> = {}): Database {
  const raw = loadRawContent();
  raw.maps = { ...raw.maps, ...extraMaps };
  return new Database(raw);
}

/** 7x7 flat sand arena; heights/terrain overridable via rows. */
export function arena(opts: { terrain?: string; height?: string; enemies?: MapDef["enemies"]; events?: MapDef["events"] } = {}): Omit<MapDef, "id"> {
  return {
    name: "Arena",
    kind: "wild",
    chipset: "desert",
    battleback: "desert",
    legend: { terrain: { s: "sand", q: "quicksand", i: "ice", w: "water", p: "stone_path" } },
    layers: {
      terrain: opts.terrain ?? "sssssss\nsssssss\nsssssss\nsssssss\nsssssss\nsssssss\nsssssss",
      height: opts.height,
    },
    spawns: { start: { x: 3, y: 3 } },
    enemies: opts.enemies,
    events: opts.events,
  };
}

/** New game placed on a test arena; returns ctx with the full hero party on (3,3). */
export function arenaCtx(map: Omit<MapDef, "id"> = arena(), seed = 42): Ctx {
  const db = testDb({ arena: map });
  const ctx = makeCtx(db, newGameState(db, seed));
  enterMap(ctx, "arena", "start");
  return ctx;
}

/**
 * A new game that skips the prologue (harbor → forest → ruins): the party stands in Sandhollow
 * with the main quest active, like the original demo start.
 */
export function villageGame(seed = 7): Game {
  const { game } = Game.create(testDb(), seed);
  runActions(game.ctx, [{ completeQuest: "into_the_desert" }, { startQuest: { id: "road_to_oasis", activate: true } }]);
  game.enter("sandhollow", "start");
  return game;
}
