import { describe, expect, it } from "vitest";
import { leaveParty } from "../core/board/actions";
import { board, grid, mustPieceOf, reconcile } from "../core/board/board";
import { togetherReady } from "../core/board/gates";
import { executeMove } from "../core/board/moves";
import { Game } from "../core/game";
import type { Ctx } from "../core/context";
import { arena, arenaCtx, testDb } from "./helpers";
import { newGameState } from "../core/state/newGame";

function place(ctx: Ctx, charId: string, x: number, y: number) {
  const p = mustPieceOf(ctx, charId);
  p.x = x;
  p.y = y;
}

const gated = (extra = {}) =>
  arenaCtx({
    ...arena(),
    gates: [{ id: "g", x: 3, y: 1, closeFlag: "split_up" }],
    switches: [{ id: "s", x: 3, y: 5, opens: ["g"] }],
    ...extra,
  });

describe("switches and gates (§5.8)", () => {
  it("a gate is open only while a hero stands on its switch; the first close sets its flag", () => {
    const ctx = gated();
    expect(board(ctx).gates?.g).toBe(false);
    expect(grid(ctx).cell({ x: 3, y: 1 })?.walkable).toBe(false);
    for (const id of ["mira", "kit", "tarek"]) leaveParty(ctx, id);
    executeMove(ctx, "aldric", { x: 3, y: 5 }); // onto the plate
    expect(board(ctx).gates?.g).toBe(true);
    expect(grid(ctx).cell({ x: 3, y: 1 })?.walkable).toBe(true);
    board(ctx).turn.moved = [];
    executeMove(ctx, "aldric", { x: 4, y: 5 }); // off again
    expect(board(ctx).gates?.g).toBe(false);
    expect(ctx.state.flags.split_up).toBe(true);
  });

  it("a gate never closes on someone standing in it; latches stay down; weight needs enough heroes", () => {
    const ctx = gated({ switches: [{ id: "s", x: 3, y: 5, opens: ["g"], weight: 2, latch: true }] });
    for (const id of ["kit", "tarek"]) leaveParty(ctx, id); // aldric+mira stay together
    place(ctx, "kit", 3, 5);
    reconcile(ctx);
    expect(board(ctx).gates?.g).toBe(false); // one hero is not heavy enough
    place(ctx, "aldric", 3, 5); // the pair of two
    place(ctx, "kit", 0, 0);
    reconcile(ctx);
    expect(board(ctx).gates?.g).toBe(true);
    place(ctx, "aldric", 0, 6);
    reconcile(ctx);
    expect(board(ctx).gates?.g).toBe(true); // latched
  });

  it("opens by condition (all enemies defeated)", () => {
    const ctx = arenaCtx({
      ...arena({ enemies: [{ id: "e", enemy: "sand_scorpion", x: 0, y: 0 }] }),
      gates: [{ id: "g", x: 3, y: 1, openWhen: { defeatedAllOn: "arena" } }],
    });
    expect(board(ctx).gates?.g).toBe(false);
    board(ctx).chars["e#0"].hp = 0;
    reconcile(ctx);
    expect(board(ctx).gates?.g).toBe(true);
  });
});

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
