import { enterMap, exitEnabled } from "./board/board";
import { makeCtx, type Ctx } from "./context";
import type { Database } from "./data/database";
import type { ExitDef } from "./data/types";
import { emptyResult, merge, runActions, type ScriptResult } from "./script/actions";
import { autoTriggers, type InteractionOutcome } from "./script/interact";
import { loadTriggers } from "./board/entities";
import { evaluateQuests, startQuest } from "./script/quests";
import { newGameState } from "./state/newGame";
import type { GameState } from "./state/types";
import { deepClone } from "./util/misc";
import type { Dir } from "./util/grid";

/**
 * Thin facade owning the mutable state. All rules live in the core modules and take `game.ctx`.
 * `snapshot`/`restore` implement undo for move confirmation (§7.3).
 */
export class Game {
  ctx: Ctx;

  constructor(
    readonly db: Database,
    state: GameState,
  ) {
    this.ctx = makeCtx(db, state);
  }

  get state(): GameState {
    return this.ctx.state;
  }

  static create(db: Database, seed?: number): { game: Game; result: EnterResult } {
    const game = new Game(db, newGameState(db, seed));
    const result = game.enter(db.config.start.map, db.config.start.spawn);
    if (db.config.start.quest) merge(result, startQuest(game.ctx, db.config.start.quest));
    return { game, result };
  }

  snapshot(): GameState {
    return deepClone(this.ctx.state);
  }

  restore(state: GameState) {
    this.ctx = makeCtx(this.db, state);
  }

  /** Enters a map: builds the board, runs its onEnter actions and auto events. */
  /** `facing`: which way the party looks on arrival (default: the spawn's direction). */
  enter(mapId: string, spawn: string, facing?: Dir): EnterResult {
    const out: EnterResult = { ...emptyResult(), dialogs: [] };
    out.events.push(...enterMap(this.ctx, mapId, spawn, undefined, facing));
    merge(out, loadTriggers(this.ctx));
    merge(out, runActions(this.ctx, this.db.map(mapId).onEnter));
    for (const r of autoTriggers(this.ctx)) collect(out, r);
    merge(out, evaluateQuests(this.ctx));
    return out;
  }

  /** Split floors (§5.3): every group of heroes arrives at its own spawn on `mapId`. */
  enterGroups(mapId: string, groups: { members: string[]; spawn: string }[]): EnterResult {
    const out: EnterResult = { ...emptyResult(), dialogs: [] };
    out.events.push(...enterMap(this.ctx, mapId, groups[0].spawn, groups));
    merge(out, loadTriggers(this.ctx));
    merge(out, runActions(this.ctx, this.db.map(mapId).onEnter));
    for (const r of autoTriggers(this.ctx)) collect(out, r);
    merge(out, evaluateQuests(this.ctx));
    return out;
  }

  travel(exit: ExitDef): EnterResult {
    if (!exitEnabled(this.ctx, exit)) throw new Error("Exit disabled");
    return this.enter(exit.to, exit.spawn);
  }
}

export interface EnterResult extends ScriptResult {
  dialogs: { id: string; speaker?: string }[];
}

function collect(out: EnterResult, r: InteractionOutcome) {
  merge(out, r);
  if (r.dialog) out.dialogs.push(r.dialog);
}
