import { describe, expect, it } from "vitest";
import { coversSide, cutSquare, flareMiters, flareOffset } from "../engine/iso/shapes";
import { grid } from "../core/board/board";
import { Game } from "../core/game";
import { testDb } from "./helpers";
import { newGameState } from "../core/state/newGame";

describe("shaped blocks (§5.9)", () => {
  it("cutting corners along the diagonals leaves a half cell or a point", () => {
    const half = cutSquare([{ x: -1, y: -1 }]);
    expect(half).toHaveLength(3);
    expect(coversSide(half, 0)).toBe(true); // +x side stays whole
    expect(coversSide(half, 3)).toBe(false); // -y side is cut
    const point = cutSquare([{ x: -1, y: -1 }, { x: 1, y: -1 }]);
    expect(point.map((p) => p.map((v) => Math.round(v * 10) / 10))).toContainEqual([0, 0]);
    expect(coversSide(point, 1)).toBe(true); // the +y side (towards the deck) stays whole
  });

  it("hull flare mitres the corners and leaves inner edges alone", () => {
    const sq = cutSquare([]);
    const miters = flareMiters([{ x: 0, y: 0, outline: sq }, { x: 1, y: 0, outline: sq }]);
    expect(flareOffset(miters, -0.5, -0.5)).toEqual([1, 1]); // outer corner: both sides move in
    const mid = flareOffset(miters, 0.5, -0.5); // between the two cells: only the -y side
    expect(mid[0]).toBeCloseTo(0);
    expect(mid[1]).toBeCloseTo(1);
  });

  it("the Gull's bow cells are shaped and not walkable", () => {
    const db = testDb();
    const game = new Game(db, newGameState(db, 1));
    game.enter("saltmere_harbor", "start");
    expect(grid(game.ctx).cell({ x: 2, y: 1 })?.cut).toEqual(["NW", "NE"]);
    expect(grid(game.ctx).cell({ x: 2, y: 1 })?.walkable).toBe(false);
    expect(grid(game.ctx).cell({ x: 2, y: 2 })?.walkable).toBe(true);
  });
});
