import { describe, expect, it } from "vitest";
import { placePrefab, prefabCells, rewire } from "../core/data/prefab";
import type { PrefabDef } from "../core/data/types";
import { loadDatabase } from "../content/loader";

describe("prefabs (§10.5)", () => {
  it("placing gives placeholders fresh ids and rewires every string naming them", () => {
    const db = loadDatabase();
    const prefab = db.prefabs.get("lib:plate_gate")!;
    const taken = new Set(["plate", "gate"]);
    const placed = placePrefab(prefab, { x: 4, y: 6 }, (id) => taken.has(id));
    expect(placed.ids).toEqual({ plate: "plate_2", gate: "gate_2" });
    expect(placed.events.map((e) => [e.id, e.x, e.y])).toEqual([
      ["plate_2", 4, 6],
      ["gate_2", 4, 4],
    ]);
    expect(JSON.stringify(placed.events)).not.toContain("$");
    expect(placed.events[1].on![0].when).toEqual({ state: { event: "plate_2", is: "down" } });
    expect(prefabCells(prefab, { x: 4, y: 6 })).toEqual([
      { x: 4, y: 6 },
      { x: 4, y: 4 },
    ]);
  });

  it("a placeholder inside a longer string: the longest that fits wins", () => {
    expect(rewire({ flag: "$gate_open", a: "$gate", b: "$gates", c: "no $ here" }, { gate: "gate_2", gates: "g3" })).toEqual({ flag: "gate_2_open", a: "gate_2", b: "g3", c: "no $ here" });
  });

  it("the library's prefabs", () => {
    const db = loadDatabase();
    for (const id of ["lib:gate", "lib:floor_switch", "lib:plate_gate", "lib:hidden_trap", "lib:snare_trap"]) expect(db.prefabs.has(id)).toBe(true);
    const empty: PrefabDef = { id: "x", name: "x" };
    expect(placePrefab(empty, { x: 0, y: 0 }, () => false)).toEqual({ events: [], enemies: [], exits: [], ids: {} });
  });

  it("per copy names get their own on each placement, inputs take the given values (else their defaults)", () => {
    const lever: PrefabDef = {
      id: "lever",
      name: "Lever",
      inputs: { door: { label: "Gate", type: "entity", default: "gate" }, loot: { label: "Item", type: "item", default: "lib:potion" } },
      events: [
        {
          id: "$lever",
          x: 0,
          y: 0,
          states: { up: {}, down: {} },
          on: [{ on: "interact", do: [{ setFlag: "$pulled" }, { setFlag: "$lever_done" }, { setState: { event: "$door", state: "open" } }, { giveItem: "$loot" }] }],
        },
      ],
    };
    const taken = (id: string) => id === "lever";
    const a = placePrefab(lever, { x: 0, y: 0 }, taken, { takenName: (n) => n === "pulled", inputs: { door: "east_gate" } });
    expect(a.ids).toEqual({ lever: "lever_2", door: "east_gate", loot: "lib:potion", pulled: "pulled_2", lever_done: "lever_2_done" });
    expect(a.events[0].on![0].do).toEqual([{ setFlag: "pulled_2" }, { setFlag: "lever_2_done" }, { setState: { event: "east_gate", state: "open" } }, { giveItem: "lib:potion" }]);
    // during play: numbered names, the inputs' defaults
    const b = placePrefab(lever, { x: 0, y: 0 }, () => false, { name: (n) => `${n}~7` });
    expect(b.ids).toMatchObject({ lever: "lever~7", pulled: "pulled~7", lever_done: "lever~7_done", door: "gate" });
  });

  it("the library's Chest: its item chosen when placing, given once, then it stays open", async () => {
    const { arena, arenaCtx } = await import("./helpers");
    const { interactionsFor, performInteraction } = await import("../core/script/interact");
    const { stateOf } = await import("../core/board/entities");
    const db = loadDatabase();
    const chest = placePrefab(db.prefabs.get("lib:chest")!, { x: 3, y: 2 }, () => false, { inputs: { loot: "lib:ether" } });
    const ctx = arenaCtx({ ...arena(), events: chest.events });
    const opts = interactionsFor(ctx, "lib:aldric", "n:chest");
    expect(opts.map((o) => o.label)).toEqual(["Open"]);
    const before = ctx.state.inventory["lib:ether"] ?? 0;
    performInteraction(ctx, "lib:aldric", "n:chest", opts[0]);
    expect(ctx.state.inventory["lib:ether"]).toBe(before + 1);
    expect(stateOf(ctx, "chest")).toBe("open");
    expect(interactionsFor(ctx, "lib:aldric", "n:chest")).toEqual([]);
  });
});
