import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseDocument } from "yaml";
import { loadDatabase } from "../../../src/content/loader";
import type { MapDef } from "../../../src/core/data/types";
import { entitiesIn, placePrefabOnMap, prefabFootprint, prefabFrom } from "./prefabs";

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
    expect(ref).toEqual({ kind: "event", key: before });
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
    expect(prefab.events![0].on![0].when).toEqual({ flag: "$gate_open" });
    expect(prefab.events![2].on![0].when).toEqual({ state: { event: "$plate", is: "down" } });
  });
});
