import { describe, expect, it } from "vitest";
import { leaveParty } from "../core/board/actions";
import { board, mustPieceOf } from "../core/board/board";
import { entityTriggers, loadTriggers, stateOf } from "../core/board/entities";
import { executeMove, moveOptions } from "../core/board/moves";
import type { Ctx } from "../core/context";
import type { MapEventDef } from "../core/data/types";
import { interactionsFor, performInteraction } from "../core/script/interact";
import { runActions } from "../core/script/actions";
import { key } from "../core/util/grid";
import { arena, arenaCtx } from "./helpers";

/** A floor plate at (3,5) that opens a gate at (3,1) – both made of states and handlers (§10.3). */
const plate: MapEventDef = {
  id: "plate",
  x: 3,
  y: 5,
  states: { up: { decor: "switch_up", pass: "walk" }, down: { decor: "switch_down", pass: "walk" } },
  on: [
    { on: "enter", when: { heroesOn: { event: "plate" } }, do: [{ setState: { event: "plate", state: "down" } }] },
    { on: "leave", do: [{ setState: { event: "plate", state: "up" } }] },
  ],
};
const gate: MapEventDef = {
  id: "gate",
  x: 3,
  y: 1,
  states: { closed: { decor: "gate_bars", pass: "solid" }, open: { pass: "walk" } },
  on: [
    { on: "becomes", when: { state: { event: "plate", is: "down" } }, do: [{ setState: { event: "gate", state: "open" } }] },
    { on: "becomes", when: { not: { state: { event: "plate", is: "down" } } }, do: [{ setState: { event: "gate", state: "closed" } }, { setFlag: "gate_shut" }] },
  ],
};

function world(events: MapEventDef[]): Ctx {
  const ctx = arenaCtx({ ...arena(), events });
  for (const id of ["lib:mira", "lib:kit", "lib:tarek"]) leaveParty(ctx, id);
  loadTriggers(ctx);
  return ctx;
}

const step = (ctx: Ctx, to: { x: number; y: number }) => {
  board(ctx).turn.moved = [];
  executeMove(ctx, "lib:aldric", to);
  return entityTriggers(ctx);
};

describe("entities: states and handlers (§10.3)", () => {
  it("a plate pressed by a hero opens its gate; stepping off closes it again", () => {
    const ctx = world([plate, gate]);
    expect(stateOf(ctx, "gate")).toBe("closed");
    expect(moveOptions(ctx, "lib:aldric").has(key({ x: 3, y: 1 }))).toBe(false); // solid
    step(ctx, { x: 3, y: 5 });
    expect(stateOf(ctx, "plate")).toBe("down");
    expect(stateOf(ctx, "gate")).toBe("open");
    step(ctx, { x: 4, y: 5 });
    expect(stateOf(ctx, "plate")).toBe("up");
    expect(stateOf(ctx, "gate")).toBe("closed");
    expect(ctx.state.flags.gate_shut).toBe(true);
  });

  it("a solid state waits until nobody stands on the cell (a gate never closes on someone)", () => {
    const ctx = world([plate, gate]);
    step(ctx, { x: 3, y: 5 });
    const hero = mustPieceOf(ctx, "lib:aldric");
    hero.x = 3;
    hero.y = 1; // in the open gate
    entityTriggers(ctx); // the plate is left: the gate wants to close
    expect(stateOf(ctx, "gate")).toBe("open");
    hero.x = 3;
    hero.y = 2;
    entityTriggers(ctx);
    expect(stateOf(ctx, "gate")).toBe("closed");
  });

  it("walk-through entities can be stood on; pass-over entities stop a move and run their script", () => {
    const trap: MapEventDef = {
      id: "trap",
      x: 3,
      y: 4,
      states: { armed: { pass: "walk" }, sprung: { pass: "walk" } },
      on: [{ on: "pass", when: { state: { event: "trap", is: "armed" } }, do: [{ setState: { event: "trap", state: "sprung" } }, { setFlag: "snap" }] }],
    };
    const ctx = world([trap]);
    board(ctx).turn.moved = [];
    const res = executeMove(ctx, "lib:aldric", { x: 3, y: 6 }); // straight across the trap
    expect(res.final).toEqual({ x: 3, y: 4 }); // caught on it
    entityTriggers(ctx);
    expect(ctx.state.flags.snap).toBe(true);
    expect(stateOf(ctx, "trap")).toBe("sprung");
  });

  it("map-load handlers set states from flags; interact handlers are close-up options", () => {
    const chest: MapEventDef = {
      id: "chest",
      x: 3,
      y: 2,
      states: { closed: { decor: "chest_closed" }, open: { decor: "chest_open" } },
      on: [
        { on: "load", when: { flag: "chest_looted" }, do: [{ setState: { event: "chest", state: "open" } }] },
        { on: "interact", when: { state: { event: "chest", is: "closed" } }, label: "Open", do: [{ giveItem: "lib:potion" }, { setState: { event: "chest", state: "open" } }, { setFlag: "chest_looted" }] },
      ],
    };
    const ctx = world([chest]);
    expect(stateOf(ctx, "chest")).toBe("closed");
    const opts = interactionsFor(ctx, "lib:aldric", "n:chest");
    expect(opts.map((o) => o.label)).toEqual(["Open"]);
    const potions = ctx.state.inventory["lib:potion"] ?? 0;
    performInteraction(ctx, "lib:aldric", "n:chest", opts[0]);
    expect(ctx.state.inventory["lib:potion"]).toBe(potions + 1);
    expect(stateOf(ctx, "chest")).toBe("open");
    expect(interactionsFor(ctx, "lib:aldric", "n:chest")).toEqual([]); // nothing more to do
    // coming back later: the flag opens it right away
    const again = world([chest]);
    runActions(again, [{ setFlag: "chest_looted" }]);
    loadTriggers(again);
    expect(stateOf(again, "chest")).toBe("open");
  });

  it("content validation catches unknown states and entities", async () => {
    const { validateContent } = await import("../core/data/validate");
    const { testDb } = await import("./helpers");
    const broken: MapEventDef = { id: "lever", x: 1, y: 1, states: { off: { decor: "switch_up" } }, on: [{ on: "interact", do: [{ setState: { event: "lever", state: "on" } }, { setState: { event: "nope", state: "x" } }] }] };
    const problems = validateContent(testDb({ arena: { ...arena(), events: [broken] } })).filter((p) => p.includes("arena"));
    expect(problems.some((p) => p.includes('has no state "on"'))).toBe(true);
    expect(problems.some((p) => p.includes('no entity "nope"'))).toBe(true);
  });

  it("script actions move and turn entities and heroes, hide / show them, open exits, change the party", () => {
    const npc: MapEventDef = { id: "guide", x: 1, y: 1, states: { here: { npc: "elder" } } };
    const ctx = world([npc]);
    expect(board(ctx).pieces["n:guide"]).toBeDefined();
    let out = runActions(ctx, [{ move: { who: "guide", to: { x: 1, y: 4 } } }, { face: { who: "guide", dir: "E" } }]);
    const walk = out.events.find((e) => e.type === "move");
    expect(walk && walk.type === "move" && walk.mode).toBe("walk");
    expect(board(ctx).pieces["n:guide"]).toMatchObject({ x: 1, y: 4, facing: "E" });
    expect(ctx.state.maps.arena.positions?.guide).toEqual({ x: 1, y: 4 }); // remembered for the next visit
    runActions(ctx, [{ move: { who: "party", to: { x: 5, y: 3 } } }]);
    expect(mustPieceOf(ctx, "lib:aldric")).toMatchObject({ x: 5, y: 3 });

    runActions(ctx, [{ hide: "guide" }]);
    expect(board(ctx).pieces["n:guide"]).toBeUndefined();
    runActions(ctx, [{ show: "guide" }]);
    expect(board(ctx).pieces["n:guide"]).toMatchObject({ x: 1, y: 4 });

    out = runActions(ctx, [{ camera: { who: "guide" } }, { emote: { who: "guide", icon: "exclaim" } }, { sound: "chest" }, { screen: "shake" }]);
    expect(out.requests.map((r) => r.type)).toEqual(["camera", "emote", "sound", "screen"]);

    runActions(ctx, [{ removeMember: "lib:tarek" }]);
    expect(ctx.state.roster).not.toContain("lib:tarek");
    expect(Object.values(board(ctx).pieces).some((p) => p.members.includes("lib:tarek"))).toBe(false);
    runActions(ctx, [{ addMember: "lib:tarek" }]);
    expect(ctx.state.roster).toContain("lib:tarek");
    expect(mustPieceOf(ctx, "lib:tarek").faction).toBe("hero");
  });

  it("setExit opens and closes an exit; a placed enemy's defeated handler runs once", async () => {
    const { exitEnabled } = await import("../core/board/board");
    const ctx = arenaCtx({
      ...arena({ enemies: [{ id: "boss", enemy: "lib:sand_scorpion", x: 5, y: 5, on: [{ on: "defeated", do: [{ setFlag: "boss_down" }, { giveGold: 5 }] }] }] }),
      exits: [{ x: 0, y: 3, dir: "W", to: "arena", spawn: "start", enabled: { flag: "never" } }],
    });
    const exit = ctx.db.map("arena").exits![0];
    expect(exitEnabled(ctx, exit)).toBe(false);
    runActions(ctx, [{ setExit: { x: 0, y: 3, open: true } }]);
    expect(exitEnabled(ctx, exit)).toBe(true);

    entityTriggers(ctx);
    expect(ctx.state.flags.boss_down).toBeUndefined();
    const gold = ctx.state.gold;
    ctx.state.maps.arena.defeated.push("boss");
    entityTriggers(ctx);
    entityTriggers(ctx);
    expect(ctx.state.flags.boss_down).toBe(true);
    expect(ctx.state.gold).toBe(gold + 5);
  });
});
