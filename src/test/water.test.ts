import { describe, expect, it } from "vitest";
import { canUseBoardAbility, useBoardAbility } from "../core/board/actions";
import { board, grid, mustPieceOf } from "../core/board/board";
import { moveOptions } from "../core/board/moves";
import { planPreActions } from "../core/board/ai";
import { placeFieldEffect, shockNetwork, tickFieldEffects } from "../core/board/terrain";
import { getChar, type Ctx } from "../core/context";
import { key } from "../core/util/grid";
import { arena, arenaCtx } from "./helpers";

function place(ctx: Ctx, charId: string, x: number, y: number) {
  const p = mustPieceOf(ctx, charId);
  p.x = x;
  p.y = y;
}

// columns 2–4: shallow (s = sand, h = shallow, d = deep)
const POND = { terrain: { s: "sand", h: "shallow", d: "deep" } };
const pond = (rows: string, extra = {}) => ({ ...arena({ terrain: rows, ...extra }), legend: POND });

describe("water depth and swimmers (§5.5)", () => {
  it("heroes wade through shallow water but never enter deep water", () => {
    const ctx = arenaCtx(pond("sssssss\nsshhhss\nsshdhss\nsshhhss\nsssssss\nsssssss\nsssssss"));
    place(ctx, "lib:aldric", 0, 2);
    const opts = moveOptions(ctx, "lib:aldric");
    expect(opts.has(key({ x: 2, y: 2 }))).toBe(true); // shallow
    expect(opts.has(key({ x: 3, y: 2 }))).toBe(false); // deep
  });

  it("fish swim only in water, amphibians go everywhere", () => {
    const map = pond("ddddddd\nddddddd\nsssssss\nsssssss\nsssssss\nsssssss\nsssssss", {
      enemies: [
        { id: "f", enemy: "lib:fishfolk", x: 1, y: 1 },
        { id: "t", enemy: "lib:bog_toad", x: 5, y: 1 },
      ],
    });
    const ctx = arenaCtx(map);
    ctx.db.enemy("lib:fishfolk").swims = "water"; // pure swimmer for this check
    const fish = [...moveOptions(ctx, "f#0").values()].map((o) => o.pos);
    expect(fish.length).toBeGreaterThan(0);
    expect(fish.every((p) => grid(ctx).terrain(p)?.water)).toBe(true);
    ctx.db.enemy("lib:fishfolk").swims = "amphibious";
    const toad = [...moveOptions(ctx, "t#0").values()].map((o) => o.pos);
    expect(toad.some((p) => grid(ctx).terrain(p)?.water)).toBe(true);
    expect(toad.some((p) => !grid(ctx).terrain(p)?.water)).toBe(true);
  });
});

describe("lightning (§5.6)", () => {
  it("on dry ground a bolt hits one cell", () => {
    const ctx = arenaCtx(pond("sssssss\nsssssss\nsssssss\nsssssss\nsssssss\nsssssss\nsssssss"));
    expect(shockNetwork(ctx, { x: 3, y: 3 })).toEqual([{ pos: { x: 3, y: 3 }, d: 0 }]);
  });

  it("in water it runs through connected water up to 4 steps, stronger where it struck", () => {
    const ctx = arenaCtx(
      pond("hhhhhhh\nsssssss\nsssssss\nsssssss\nsssssss\nsssssss\nsssssss", {
        enemies: [
          { id: "a", enemy: "lib:emperor_scorpion", x: 0, y: 0 },
          { id: "b", enemy: "lib:emperor_scorpion", x: 4, y: 0 },
          { id: "c", enemy: "lib:emperor_scorpion", x: 6, y: 0 },
        ],
      }),
    );
    const net = shockNetwork(ctx, { x: 0, y: 0 });
    expect(net.map((n) => n.pos.x)).toEqual([0, 1, 2, 3, 4]); // 5 steps away is out of reach
    getChar(ctx, "lib:mira").learned.push("lib:thunder");
    place(ctx, "lib:mira", 0, 1);
    const hp = (id: string) => getChar(ctx, id).hp;
    const [a0, b0, c0] = [hp("a#0"), hp("b#0"), hp("c#0")];
    useBoardAbility(ctx, "lib:mira", "lib:thunder", { x: 0, y: 0 });
    expect(a0 - hp("a#0")).toBeGreaterThan(b0 - hp("b#0")); // falls off with distance
    expect(b0 - hp("b#0")).toBeGreaterThan(0);
    expect(hp("c#0")).toBe(c0); // too far
  });

  it("Soaked ground conducts; ice doesn't", () => {
    const ctx = arenaCtx(pond("sssssss\nsssssss\nsssssss\nsssssss\nsssssss\nsssssss\nsssssss"));
    placeFieldEffect(ctx, { x: 2, y: 2 }, "lib:soaked", 3);
    placeFieldEffect(ctx, { x: 3, y: 2 }, "lib:soaked", 3);
    expect(shockNetwork(ctx, { x: 2, y: 2 })).toHaveLength(2);
    const wet = arenaCtx(pond("hhhhhhh\nsssssss\nsssssss\nsssssss\nsssssss\nsssssss\nsssssss"));
    placeFieldEffect(wet, { x: 1, y: 0 }, "lib:frozen", 3);
    expect(shockNetwork(wet, { x: 0, y: 0 })).toHaveLength(1); // the ice breaks the chain
  });
});

describe("produce combos (§18.11)", () => {
  it("a lemon out of reach of the heroes zaps the soaked ground that leads to them", () => {
    const ctx = arenaCtx(arena({ enemies: [{ id: "l", enemy: "lib:lemon", x: 0, y: 0 }] }));
    place(ctx, "lib:aldric", 6, 0);
    for (const x of [3, 4, 5, 6]) placeFieldEffect(ctx, { x, y: 0 }, "lib:soaked", 3);
    const entry = ctx.db.enemy("lib:lemon").boardAi.abilities![0];
    const chance = entry.chance;
    entry.chance = 1;
    try {
      const plan = planPreActions(ctx, "l#0");
      expect(plan[0]).toMatchObject({ type: "ability", ability: "lib:zap" });
      const target = (plan[0] as { target: { x: number; y: number } }).target;
      expect(shockNetwork(ctx, target).some((c) => c.pos.x === 6 && c.pos.y === 0)).toBe(true);
    } finally {
      entry.chance = chance;
    }
  });
});

describe("plants (§5.7)", () => {
  it("seeds grow into brambles a round later – not under a piece; swords cut them", () => {
    const ctx = arenaCtx(arena());
    placeFieldEffect(ctx, { x: 1, y: 1 }, "lib:seeds", 1);
    placeFieldEffect(ctx, { x: 3, y: 3 }, "lib:seeds", 1); // the party stands here
    tickFieldEffects(ctx);
    expect(grid(ctx).cell({ x: 1, y: 1 })?.decor).toBe("bramble");
    expect(grid(ctx).cell({ x: 1, y: 1 })?.walkable).toBe(false);
    expect(grid(ctx).cell({ x: 3, y: 3 })?.decor).toBeUndefined();
    // Aldric's bronze sword grants Cut
    place(ctx, "lib:aldric", 1, 2);
    expect(canUseBoardAbility(ctx, "lib:aldric", "lib:cut")).toBe(true);
    useBoardAbility(ctx, "lib:aldric", "lib:cut", { x: 1, y: 1 });
    expect(grid(ctx).cell({ x: 1, y: 1 })?.walkable).toBe(true);
  });

  it("seeds don't take on water or on decor", () => {
    const ctx = arenaCtx(pond("hssssss\nsssssss\nsssssss\nsssssss\nsssssss\nsssssss\nsssssss"));
    expect(placeFieldEffect(ctx, { x: 0, y: 0 }, "lib:seeds", 1)).toEqual([]);
    expect(board(ctx).fieldEffects).toHaveLength(0);
  });
});
