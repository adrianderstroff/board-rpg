import { describe, expect, it } from "vitest";
import { useBoardAbility } from "../core/board/actions";
import { board, isExploring, mapMemory, mustPieceOf, piecesAt } from "../core/board/board";
import { armedTraps, hiddenThings, revealedTraps } from "../core/board/hidden";
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

const pos = (ctx: Ctx, charId: string) => {
  const p = mustPieceOf(ctx, charId);
  return [p.x, p.y];
};

describe("hidden things (§7.5)", () => {
  it("an ancient trap stops the party on the way and is spent", () => {
    const ctx = arenaCtx({ ...arena(), traps: [{ id: "t1", x: 3, y: 1, damage: 10, status: "stuck" }] });
    place(ctx, "aldric", 3, 5);
    const hp = getChar(ctx, "kit").hp;
    const res = executeMove(ctx, "aldric", { x: 3, y: 0 }); // exploring: walks straight north over the trap
    expect(res.interrupted).toBe(true);
    expect(pos(ctx, "aldric")).toEqual([3, 1]);
    expect(getChar(ctx, "kit").hp).toBe(hp - 10);
    expect(hasStatus(getChar(ctx, "kit"), "stuck")).toBe(true);
    expect(mapMemory(ctx, "arena").sprung).toEqual(["t1"]);
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
      traps: [
        { id: "near", x: 3, y: 1, damage: 10 },
        { id: "far", x: 6, y: 0, damage: 10 },
      ],
      enemies: [{ id: "sk", enemy: "skeleton", x: 0, y: 3 }],
      events: [
        {
          id: "chest",
          x: 5,
          y: 3,
          hidden: true,
          pages: [{ decor: "chest_closed", interactions: [{ type: "examine", label: "Open", dialog: "chest_charm" }] }],
        },
      ],
    });
    expect(piecesAt(ctx, { x: 5, y: 3 })).toHaveLength(0); // invisible
    place(ctx, "kit", 3, 4);
    const ev = useBoardAbility(ctx, "kit", "discover", { x: 3, y: 4 });
    const sensed = ev.find((e) => e.type === "sensed");
    expect(sensed && sensed.type === "sensed" && sensed.radius).toBe(3);
    expect(piecesAt(ctx, { x: 5, y: 3 })).toHaveLength(1); // the chest appeared
    expect(revealedTraps(ctx).map((t) => t.id)).toEqual(["near"]); // (6,0) is out of reach
    expect(board(ctx).pieces["e:sk"].dormant).toBeUndefined(); // the skeleton rose
    expect(hiddenThings(ctx).map((t) => t.id)).toEqual(["trap:far"]);
    // heroes walk around a trap they know about
    expect(occupancyFor(ctx, mustPieceOf(ctx, "kit"))({ x: 3, y: 1 })).toBe("block");
  });

  it("Defuse takes a visible trap apart into a Snare, which can be set on wild boards only", async () => {
    const { itemTargeting, useBoardItem } = await import("../core/board/actions");
    const ctx = arenaCtx({ ...arena(), kind: "peaceful", traps: [{ id: "t", x: 3, y: 2, damage: 10 }] });
    place(ctx, "kit", 3, 3);
    expect(() => useBoardAbility(ctx, "kit", "defuse", { x: 3, y: 2 })).toThrow(); // not seen yet
    useBoardAbility(ctx, "kit", "discover", { x: 3, y: 3 });
    board(ctx).turn.abilityUsed = [];
    useBoardAbility(ctx, "kit", "defuse", { x: 3, y: 2 });
    expect(ctx.state.inventory.snare).toBe(1);
    expect(armedTraps(ctx)).toHaveLength(0);
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
