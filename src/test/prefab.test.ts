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
});
