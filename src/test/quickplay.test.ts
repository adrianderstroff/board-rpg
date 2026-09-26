import { describe, expect, it } from "vitest";
import { knownAbilities } from "../core/chars/character";
import { board, mustPieceOf } from "../core/board/board";
import { centreCell, quickPlay } from "../core/state/quickPlay";
import { testDb } from "./helpers";

describe("editor Quick Play (editor-design §4)", () => {
  it("without a Quick Play entity: the start party on the walkable cell nearest the centre", () => {
    const db = testDb();
    const { game } = quickPlay(db, "sandhollow", 1);
    const ctx = game.ctx;
    expect(board(ctx).mapId).toBe("sandhollow");
    expect(ctx.state.roster).toEqual(db.config.start.party);
    const p = mustPieceOf(ctx, db.config.start.party[0]);
    expect([p.x, p.y]).toEqual(Object.values(centreCell(db, "sandhollow")));
    expect(ctx.state.quests.active).toBeNull(); // no prologue
  });

  it("the entity sets position, party and levels, items, abilities, flags and gold", () => {
    const db = testDb();
    db.map("temple").editor = {
      quickPlay: {
        x: 5,
        y: 6,
        party: [{ hero: "lib:tarek", level: 9 }, { hero: "lib:kit" }],
        items: { "lib:token_serenity": 1, "lib:potion": 2 },
        abilities: { "lib:tarek": ["lib:holy"] },
        flags: ["monks_trial"],
        gold: 999,
      },
    };
    const { game } = quickPlay(db, "temple", 1);
    const ctx = game.ctx;
    const p = mustPieceOf(ctx, "lib:tarek");
    expect([p.x, p.y]).toEqual([5, 6]);
    expect(ctx.state.roster).toEqual(["lib:tarek", "lib:kit"]);
    expect(ctx.state.heroes["lib:tarek"].level).toBe(9);
    expect(ctx.state.heroes["lib:aldric"]).toBeUndefined();
    expect(knownAbilities(db, ctx.state.heroes["lib:tarek"])).toContain("lib:holy");
    expect(ctx.state.inventory["lib:token_serenity"]).toBe(1);
    expect(ctx.state.inventory["lib:potion"]).toBe(db.config.start.items["lib:potion"] + 2);
    expect(ctx.state.flags.monks_trial).toBe(true);
    expect(ctx.state.gold).toBe(999);
  });
});
