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
  for (const id of ["mira", "kit", "tarek"]) leaveParty(ctx, id);
  loadTriggers(ctx);
  return ctx;
}

const step = (ctx: Ctx, to: { x: number; y: number }) => {
  board(ctx).turn.moved = [];
  executeMove(ctx, "aldric", to);
  return entityTriggers(ctx);
};

describe("entities: states and handlers (§10.3)", () => {
  it("a plate pressed by a hero opens its gate; stepping off closes it again", () => {
    const ctx = world([plate, gate]);
    expect(stateOf(ctx, "gate")).toBe("closed");
    expect(moveOptions(ctx, "aldric").has(key({ x: 3, y: 1 }))).toBe(false); // solid
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
    const hero = mustPieceOf(ctx, "aldric");
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
    const res = executeMove(ctx, "aldric", { x: 3, y: 6 }); // straight across the trap
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
        { on: "interact", when: { state: { event: "chest", is: "closed" } }, label: "Open", do: [{ giveItem: "potion" }, { setState: { event: "chest", state: "open" } }, { setFlag: "chest_looted" }] },
      ],
    };
    const ctx = world([chest]);
    expect(stateOf(ctx, "chest")).toBe("closed");
    const opts = interactionsFor(ctx, "aldric", "n:chest");
    expect(opts.map((o) => o.label)).toEqual(["Open"]);
    const potions = ctx.state.inventory.potion ?? 0;
    performInteraction(ctx, "aldric", "n:chest", opts[0]);
    expect(ctx.state.inventory.potion).toBe(potions + 1);
    expect(stateOf(ctx, "chest")).toBe("open");
    expect(interactionsFor(ctx, "aldric", "n:chest")).toEqual([]); // nothing more to do
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
});
