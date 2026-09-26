import { describe, expect, it } from "vitest";
import { useBoardAbility } from "../core/board/actions";
import { board, isExploring, mustPieceOf, piecesAt } from "../core/board/board";
import { hiddenThings } from "../core/board/hidden";
import { entityTriggers, stateOf } from "../core/board/entities";
import type { MapEventDef } from "../core/data/types";
import { executeMove, moveOptions, occupancyFor } from "../core/board/moves";
import { turnQueue } from "../core/board/turns";
import { getChar, type Ctx } from "../core/context";
import { hasStatus } from "../core/chars/character";
import { key } from "../core/util/grid";
import { arena, arenaCtx } from "./helpers";

function place(ctx: Ctx, charId: string, x: number, y: number) {
  const p = mustPieceOf(ctx, charId);
  p.x = x;
  p.y = y;
}

/** An ancient trap: the editor's Hidden trap preset (armed → revealed by Discover → sprung). */
function trap(id: string, x: number, y: number, amount = 10, status?: string): MapEventDef {
  const is = (state: string) => ({ state: { event: id, is: state } });
  const to = (state: string) => ({ setState: { event: id, state } });
  return {
    id,
    x,
    y,
    states: { armed: { hidden: true, pass: "walk" }, revealed: { mark: "trap", pass: "avoid" }, sprung: { pass: "walk" } },
    on: [
      { on: "pass", when: { not: is("sprung") }, do: [{ damage: { amount, ...(status ? { status } : {}), cue: "trap" } }, to("sprung")] },
      { on: "ability", ability: "discover", when: is("armed"), do: [to("revealed")] },
      { on: "ability", ability: "defuse", when: is("revealed"), do: [to("sprung")] },
    ],
  };
}

const pos = (ctx: Ctx, charId: string) => {
  const p = mustPieceOf(ctx, charId);
  return [p.x, p.y];
};

describe("hidden things (§7.5)", () => {
  it("an ancient trap stops the party on the way and is spent", () => {
    const ctx = arenaCtx({ ...arena(), events: [trap("t1", 3, 1, 10, "stuck")] });
    place(ctx, "aldric", 3, 5);
    const hp = getChar(ctx, "kit").hp;
    const res = executeMove(ctx, "aldric", { x: 3, y: 0 }); // exploring: walks straight north over the trap
    expect(res.interrupted).toBe(true);
    expect(pos(ctx, "aldric")).toEqual([3, 1]);
    const snap = entityTriggers(ctx); // the trap's "pass over" handler
    expect(snap.events.some((e) => e.type === "trap")).toBe(true);
    expect(getChar(ctx, "kit").hp).toBe(hp - 10);
    expect(hasStatus(getChar(ctx, "kit"), "stuck")).toBe(true);
    expect(stateOf(ctx, "t1")).toBe("sprung");
    // spent: walking over it again is fine
    place(ctx, "aldric", 3, 5);
    expect(executeMove(ctx, "aldric", { x: 3, y: 0 }).interrupted).toBeFalsy();
  });

  it("dormant skeletons block, take no turns, keep exploration on and rise to ambush once they can reach", () => {
    const ctx = arenaCtx({ ...arena(), enemies: [{ id: "sk", enemy: "skeleton", x: 5, y: 1 }] });
    const skel = board(ctx).pieces["e:sk"];
    expect(skel.dormant).toBe(true);
    expect(isExploring(ctx)).toBe(true);
    expect(turnQueue(ctx).some((id) => id.startsWith("sk#"))).toBe(false);
    place(ctx, "aldric", 0, 5);
    expect(moveOptions(ctx, "aldric").has(key({ x: 5, y: 1 }))).toBe(false); // solid like remains
    const res = executeMove(ctx, "aldric", { x: 6, y: 5 }); // row 5: out of its reach (rook 2)
    expect(res.interrupted).toBeFalsy();
    const res2 = executeMove(ctx, "aldric", { x: 6, y: 0 });
    expect(res2.interrupted).toBe(true);
    expect(res2.ambush).toBe("e:sk");
    expect(skel.dormant).toBeUndefined();
    expect(isExploring(ctx)).toBe(false);
    const [x, y] = pos(ctx, "aldric");
    expect(x === 5 || y === 1).toBe(true); // stopped on a cell its rook move reaches
    expect(Math.abs(x - 5) + Math.abs(y - 1)).toBeLessThanOrEqual(2);
  });

  it("Discover reveals everything hidden within 3 cells: traps show, hidden objects appear, sleepers rise", () => {
    const ctx = arenaCtx({
      ...arena(),
      enemies: [{ id: "sk", enemy: "skeleton", x: 0, y: 3 }],
      events: [
        {
          id: "chest",
          x: 5,
          y: 3,
          hidden: true,
          pages: [{ decor: "chest_closed", interactions: [{ type: "examine", label: "Open", dialog: "chest_charm" }] }],
        },
        trap("near", 3, 1),
        trap("far", 6, 0),
      ],
    });
    expect(piecesAt(ctx, { x: 5, y: 3 })).toHaveLength(0); // invisible
    place(ctx, "kit", 3, 4);
    const ev = useBoardAbility(ctx, "kit", "discover", { x: 3, y: 4 });
    const sensed = ev.find((e) => e.type === "sensed");
    expect(sensed && sensed.type === "sensed" && sensed.radius).toBe(3);
    expect(piecesAt(ctx, { x: 5, y: 3 })).toHaveLength(1); // the chest appeared
    entityTriggers(ctx); // the traps' "discover" handlers
    expect(stateOf(ctx, "near")).toBe("revealed");
    expect(stateOf(ctx, "far")).toBe("armed"); // (6,0) is out of reach
    expect(board(ctx).pieces["e:sk"].dormant).toBeUndefined(); // the skeleton rose
    expect(hiddenThings(ctx).map((t) => t.id)).toEqual(["entity:far"]);
    // heroes walk around a trap they know about
    expect(occupancyFor(ctx, mustPieceOf(ctx, "kit"))({ x: 3, y: 1 })).toBe("block");
  });

  it("Defuse takes a visible trap apart into a Snare, which can be set on wild boards only", async () => {
    const { itemTargeting, useBoardItem } = await import("../core/board/actions");
    const ctx = arenaCtx({ ...arena(), kind: "peaceful", events: [trap("t", 3, 2)] });
    place(ctx, "kit", 3, 3);
    expect(() => useBoardAbility(ctx, "kit", "defuse", { x: 3, y: 2 })).toThrow(); // not seen yet
    useBoardAbility(ctx, "kit", "discover", { x: 3, y: 3 });
    entityTriggers(ctx);
    board(ctx).turn.abilityUsed = [];
    useBoardAbility(ctx, "kit", "defuse", { x: 3, y: 2 });
    entityTriggers(ctx);
    expect(ctx.state.inventory.snare).toBe(1);
    expect(stateOf(ctx, "t")).toBe("sprung");
    expect(itemTargeting(ctx, "kit", "snare")!.valid).toHaveLength(0); // peaceful board
    const wild = arenaCtx(arena());
    wild.state.inventory.snare = 1;
    const t = itemTargeting(wild, "kit", "snare")!;
    expect(t.valid.length).toBeGreaterThan(0);
    useBoardItem(wild, "kit", "snare", t.valid[0]);
    expect(board(wild).traps).toHaveLength(1);
    expect(wild.state.inventory.snare ?? 0).toBe(0);
  });
});
