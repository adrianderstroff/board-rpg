import type { Database } from "./data/database";
import type { Character, GameState } from "./state/types";
import { Rng } from "./util/rng";

/** Everything a rule function needs: static content, mutable state, randomness. */
export interface Ctx {
  db: Database;
  state: GameState;
  rng: Rng;
}

export function makeCtx(db: Database, state: GameState): Ctx {
  return { db, state, rng: new Rng(state.rng) };
}

export function findChar(ctx: Ctx, id: string): Character | undefined {
  return ctx.state.heroes[id] ?? ctx.state.board?.chars[id] ?? ctx.state.battle?.guests[id];
}

export function getChar(ctx: Ctx, id: string): Character {
  const c = findChar(ctx, id);
  if (!c) throw new Error(`Unknown character "${id}"`);
  return c;
}
