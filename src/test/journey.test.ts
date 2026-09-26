import { describe, expect, it } from "vitest";
import { useBoardAbility } from "../core/board/actions";
import { board, exitAt, grid, isExploring, mustPieceOf } from "../core/board/board";
import { exploreTick, exploreTime } from "../core/board/explore";
import { dormantPieces, hiddenThings } from "../core/board/hidden";
import { hiddenEntities } from "../core/board/entities";
import { executeMove, moveOptions } from "../core/board/moves";
import { Game } from "../core/game";
import { buy, itemCount, readScroll } from "../core/items/inventory";
import { interactionsFor, performInteraction } from "../core/script/interact";
import { currentObjective, evaluateQuests } from "../core/script/quests";
import type { Pos } from "../core/util/grid";
import { key } from "../core/util/grid";
import { testDb } from "./helpers";

/** Walks the party (explore mode) to a cell; fails if it's not reachable. */
function walk(game: Game, to: Pos) {
  const opts = moveOptions(game.ctx, "aldric");
  expect(opts.has(key(to)), `reachable ${to.x},${to.y}`).toBe(true);
  executeMove(game.ctx, "aldric", to);
  exploreTick(game.ctx);
}

function travel(game: Game, at: Pos) {
  const exit = exitAt(game.ctx, at)!;
  expect(exit, `exit at ${at.x},${at.y}`).toBeTruthy();
  game.travel(exit);
  evaluateQuests(game.ctx);
}

describe("the journey inland (§18)", () => {
  it("harbor → greenwood → elvenglade (ice) → river → burnt stairs → ruins → sandhollow", () => {
    const { game } = Game.create(testDb(), 99);
    const ctx = () => game.ctx;
    expect(board(ctx()).mapId).toBe("saltmere_harbor");
    expect(currentObjective(ctx())).toBe("Head east into the Greenwood");
    expect(isExploring(ctx())).toBe(true);

    // Search a barrel: a potion, once.
    const potions = itemCount(ctx(), "potion");
    const search = interactionsFor(ctx(), "aldric", "n:barrel_herring").find((o) => o.label === "Search")!;
    performInteraction(ctx(), "aldric", "n:barrel_herring", search);
    expect(itemCount(ctx(), "potion")).toBe(potions + 1);
    // searching again only tells what's left inside
    const again = interactionsFor(ctx(), "aldric", "n:barrel_herring");
    expect(again.map((o) => o.label)).toEqual(["Search"]);
    expect(performInteraction(ctx(), "aldric", "n:barrel_herring", again[0]).dialog?.id).toBe("after_herring");
    expect(itemCount(ctx(), "potion")).toBe(potions + 1);

    // Off the ship and east along the quay.
    walk(game, { x: 16, y: 6 });
    travel(game, { x: 17, y: 6 });
    expect(board(ctx()).mapId).toBe("greenwood");
    expect(currentObjective(ctx())).toBe("Cross the river and climb to the desert");

    // The river blocks the way.
    walk(game, { x: 16, y: 6 });
    expect(moveOptions(ctx(), "aldric").has(key({ x: 20, y: 6 }))).toBe(false);

    // North to Elvenglade: buy and read the Ice scroll.
    walk(game, { x: 9, y: 1 });
    travel(game, { x: 9, y: 0 });
    expect(board(ctx()).mapId).toBe("elvenglade");
    expect(buy(ctx(), "scroll_ice")).toBe(true);
    readScroll(ctx(), ctx().state.heroes.mira, "scroll_ice");
    travel(game, { x: 7, y: 11 });

    // Freeze the river (3x3) and walk across.
    walk(game, { x: 16, y: 6 });
    useBoardAbility(ctx(), "mira", "ice", { x: 18, y: 6 });
    exploreTick(ctx());
    expect(grid(ctx()).cell({ x: 18, y: 6 })?.walkable).toBe(true);
    walk(game, { x: 20, y: 6 });

    // Two cacti side by side block the stairs until they burn.
    walk(game, { x: 26, y: 5 });
    expect(moveOptions(ctx(), "aldric").has(key({ x: 31, y: 5 }))).toBe(false);
    useBoardAbility(ctx(), "mira", "fire", { x: 28, y: 5 });
    expect(grid(ctx()).cell({ x: 28, y: 5 })?.walkable).toBe(true); // that cactus burnt away
    exploreTime(ctx()); // exploring: the fire spreads by time, to the other half of the step
    expect(grid(ctx()).cell({ x: 28, y: 6 })?.decor).toBeUndefined(); // the fire caught the other one
    for (let i = 0; i < 3; i++) exploreTime(ctx());
    walk(game, { x: 32, y: 5 });
    travel(game, { x: 33, y: 5 });
    expect(board(ctx()).mapId).toBe("sunken_ruins");
    expect(currentObjective(ctx())).toBe("Cross the ruins to Sandhollow");

    // The ruins: dormant skeletons (still exploring), traps and a hidden chest.
    expect(dormantPieces(ctx())).toHaveLength(3);
    expect(isExploring(ctx())).toBe(true);
    expect(hiddenEntities(ctx()).map((e) => e.id)).toEqual(expect.arrayContaining(["trap_a", "trap_b", "trap_c"])); // three armed traps
    expect(hiddenThings(ctx()).some((t) => t.kind === "event")).toBe(true);

    // Walking in wakes the first skeleton and stops the party.
    const res = executeMove(ctx(), "aldric", [...moveOptions(ctx(), "aldric").values()].find((o) => o.pos.x === 9 && o.pos.y === 6)!.pos);
    expect(res.interrupted).toBe(true);
    expect(isExploring(ctx())).toBe(false);

    // (Skip the fights) straight on to Sandhollow: the prologue ends, the main quest begins.
    travelTo(game, "sandhollow", "from_ruins");
    expect(ctx().state.quests.entries.into_the_desert?.status).toBe("done");
    expect(currentObjective(ctx())).toBe("Talk to Elder Hamid");
    expect(mustPieceOf(ctx(), "aldric")).toBeTruthy();
  });
});

function travelTo(game: Game, map: string, spawn: string) {
  game.enter(map, spawn);
  evaluateQuests(game.ctx);
}
