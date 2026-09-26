import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseDocument } from "yaml";
import { loadDatabase } from "../../../src/content/loader";
import type { MapDef } from "../../../src/core/data/types";
import { entitiesIn, placePrefabOnMap, prefabFootprint, prefabFrom, prefabSlots, type PrefabSlot } from "./prefabs";
import { canMoveGroup, groupAnchor, groupPrefab, moveGroup } from "./group";

const load = () => {
  const doc = parseDocument(readFileSync("projects/demo/data/maps/sandhollow.yaml", "utf8"));
  return { doc, map: () => doc.toJS() as MapDef };
};

describe("prefabs in the editor (editor-design §6.5)", () => {
  const db = loadDatabase();
  const plateGate = db.prefabs.get("lib:plate_gate")!;

  it("places a prefab: fresh ids, references rewired, cells from the click", () => {
    const { doc, map } = load();
    const before = map().events!.length;
    const ref = placePrefabOnMap(doc, map(), plateGate, { x: 5, y: 8 });
    const events = map().events!;
    expect(ref).toEqual([
      { kind: "event", key: before },
      { kind: "event", key: before + 1 },
    ]);
    const [plate, gate] = events.slice(before);
    expect([plate.x, plate.y, gate.x, gate.y]).toEqual([5, 8, 5, 6]);
    expect(gate.on![0].when).toEqual({ state: { event: plate.id, is: "down" } });
    expect(doc.toString()).not.toContain("$");
    // placing it again: other ids
    placePrefabOnMap(doc, map(), plateGate, { x: 8, y: 8 });
    const ids = map().events!.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("the footprint must be free and on the map", () => {
    const { map } = load();
    const taken = map().events![0];
    expect(prefabFootprint(map(), plateGate, { x: taken.x, y: taken.y }).fits[0]).toBe(false);
    expect(prefabFootprint(map(), plateGate, { x: 0, y: 0 }).fits).toEqual([true, false]); // the gate would be at y -2
  });

  it("Save as prefab: relative cells, ids back to placeholders (a flag named after one too)", () => {
    const rows = Array.from({ length: 16 }, () => "    ssssssssssssssss").join("\n");
    const doc = parseDocument(["name: Empty", "chipset: lib:desert", "legend: { terrain: { s: sand } }", "layers:", "  terrain: |", rows, "spawns: {}", ""].join("\n"));
    const map = () => doc.toJS() as MapDef;
    placePrefabOnMap(doc, map(), db.prefabs.get("lib:gate")!, { x: 9, y: 9 });
    placePrefabOnMap(doc, map(), plateGate, { x: 12, y: 9 });
    const refs = entitiesIn(map(), { x: 9, y: 7, w: 4, h: 3 });
    expect(refs).toHaveLength(3);
    const prefab = prefabFrom(map(), refs, { x: 9, y: 7 });
    expect(prefab.events!.map((e) => [e.id, e.x, e.y])).toEqual([
      ["$gate", 0, 2],
      ["$plate", 3, 2],
      ["$gate_2", 3, 0],
    ]);
    expect(prefab.events![0].on![0].when).toEqual({ flag: "gate_open" }); // flags start fixed
    expect(prefab.events![2].on![0].when).toEqual({ state: { event: "$plate", is: "down" } });
  });

  it("values: what each becomes – per copy, fixed or set on placement (with the current value as default)", () => {
    const rows = Array.from({ length: 8 }, () => "    ssssssss").join("\n");
    const doc = parseDocument(["name: Empty", "chipset: lib:desert", "legend: { terrain: { s: sand } }", "layers:", "  terrain: |", rows, "spawns: {}", ""].join("\n"));
    const map = () => doc.toJS() as MapDef;
    placePrefabOnMap(doc, map(), db.prefabs.get("lib:gate")!, { x: 1, y: 1 });
    doc.setIn(["events", 0, "on", 0, "do", 1], doc.createNode({ setFlag: "lever_pulled" }));
    doc.setIn(["events", 0, "on", 0, "do", 2], doc.createNode({ giveItem: "lib:potion" }));
    doc.setIn(["events", 0, "on", 0, "do", 3], doc.createNode({ setState: { event: "far_door", state: "open" } }));
    const refs = [{ kind: "event" as const, key: 0 }];
    const slots = prefabSlots(map(), refs);
    expect(slots.map((s) => [s.kind, s.value, s.mode])).toEqual([
      ["entity", "gate", "perCopy"],
      ["outside", "far_door", "fixed"],
      ["flag", "gate_open", "fixed"],
      ["flag", "lever_pulled", "fixed"],
      ["item", "lib:potion", "fixed"],
    ]);
    const choose = (patch: Record<string, Partial<PrefabSlot>>) => slots.map((s) => ({ ...s, ...(patch[s.value] ?? {}) }));
    const fixed = prefabFrom(map(), refs, { x: 1, y: 1 }, choose({ gate_open: { mode: "fixed" } }));
    expect(fixed.events![0].on![0].when).toEqual({ flag: "gate_open" });
    const inputs = prefabFrom(map(), refs, { x: 1, y: 1 }, choose({ "lib:potion": { mode: "input", label: "Loot" }, far_door: { mode: "input", label: "Door" }, lever_pulled: { mode: "perCopy" } }));
    expect(inputs.inputs).toEqual({ door: { label: "Door", type: "entity", default: "far_door" }, loot: { label: "Loot", type: "item", default: "lib:potion" } });
    expect(inputs.events![0].on![0].do!.slice(1)).toEqual([{ setFlag: "$lever_pulled" }, { giveItem: "$loot" }, { setState: { event: "$door", state: "open" } }]);
    // placed with inputs: the chosen values, per copy names renamed
    const prefab = { id: "x", name: "x", ...inputs };
    const placed = placePrefabOnMap(doc, map(), prefab, { x: 5, y: 5 }, { inputs: { loot: "lib:ether", door: "gate" }, takenName: (n) => n === "lever_pulled" });
    const ev = map().events![placed[0].key as number];
    expect(ev.on![0].do!.slice(1)).toEqual([{ setFlag: "lever_pulled_2" }, { giveItem: "lib:ether" }, { setState: { event: "gate", state: "open" } }]);
  });

  it("a group moves together only where all of it fits; duplicating it is a prefab of it", () => {
    const rows = Array.from({ length: 8 }, () => "    ssssssss").join("\n");
    const doc = parseDocument(["name: Empty", "chipset: lib:desert", "legend: { terrain: { s: sand } }", "layers:", "  terrain: |", rows, "spawns: {}", ""].join("\n"));
    const map = () => doc.toJS() as MapDef;
    const refs = placePrefabOnMap(doc, map(), plateGate, { x: 2, y: 4 }); // plate 2,4 · gate 2,2
    expect(groupAnchor(map(), refs)).toEqual({ x: 2, y: 2 });
    expect(canMoveGroup(map(), refs, 1, 0)).toBe(true);
    expect(canMoveGroup(map(), refs, 0, -3)).toBe(false); // the gate would leave the map
    expect(canMoveGroup(map(), refs, 0, 2)).toBe(true); // onto its own cells is fine
    moveGroup(doc, map(), refs, 3, 1);
    expect(map().events!.map((e) => [e.x, e.y])).toEqual([
      [5, 5],
      [5, 3],
    ]);
    const copy = groupPrefab(map(), refs);
    const placed = placePrefabOnMap(doc, map(), copy, { x: 0, y: 0 });
    const events = map().events!;
    expect(placed).toHaveLength(2);
    expect(events[3].on![0].when).toEqual({ state: { event: events[2].id, is: "down" } }); // the copy's gate follows the copy's plate
  });
});
