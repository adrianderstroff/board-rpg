import { describe, expect, it } from "vitest";
import { leaveParty } from "../core/board/actions";
import { board, mustPieceOf } from "../core/board/board";
import { togetherReady } from "../core/board/gates";
import { Game } from "../core/game";
import { arena, testDb } from "./helpers";
import { newGameState } from "../core/state/newGame";

describe("split floors (§5.3)", () => {
  it("travel waits until every team stands on a together-exit; each arrives at its own spawn", () => {
    const db = testDb({
      floor1: {
        ...arena(),
        exits: [
          { x: 0, y: 0, dir: "N", to: "floor2", spawn: "west", together: true, door: true },
          { x: 6, y: 0, dir: "N", to: "floor2", spawn: "east", together: true, door: true },
        ],
      },
      floor2: { ...arena(), spawns: { start: { x: 3, y: 3 }, west: { x: 1, y: 5 }, east: { x: 5, y: 5 } } },
    });
    const game = new Game(db, newGameState(db, 3));
    game.enter("floor1", "start");
    const ctx = game.ctx;
    for (const id of ["kit", "tarek"]) leaveParty(ctx, id);
    const kit = mustPieceOf(ctx, "kit");
    const tarek = mustPieceOf(ctx, "tarek");
    Object.assign(mustPieceOf(ctx, "aldric"), { x: 0, y: 0 });
    expect(togetherReady(ctx)).toBeNull(); // kit and tarek are still in the hall
    Object.assign(kit, { x: 6, y: 0 });
    Object.assign(tarek, { x: 6, y: 1 });
    expect(togetherReady(ctx)).toBeNull();
    kit.members.push(...tarek.members); // tarek joins kit on the east stairs
    delete board(ctx).pieces[tarek.id];
    const ready = togetherReady(ctx)!;
    expect(ready.to).toBe("floor2");
    game.enterGroups(ready.to, ready.groups);
    const at = (id: string) => ((p) => [p.x, p.y])(mustPieceOf(game.ctx, id));
    expect(at("aldric")).toEqual([1, 5]);
    expect(at("kit")).toEqual([5, 5]);
    expect(at("tarek")).toEqual([5, 5]);
  });
});
