import { describe, expect, it } from "vitest";
import { parseDocument } from "yaml";
import { readFileSync } from "node:fs";
import type { MapDef } from "../../../src/core/data/types";
import { addEntity, deleteEntity, duplicateEntity, entitiesAt, listEntities, moveEntity } from "./model";

const load = (file: string) => {
  const doc = parseDocument(readFileSync(file, "utf8"));
  return { doc, map: () => doc.toJS() as MapDef };
};

describe("map entities (editor-design §6)", () => {
  it("duplicates an entity onto another cell with a free id (not an arrival)", () => {
    const { doc, map } = load("projects/demo/data/maps/elder_house.yaml");
    const before = map().events!.length;
    const ref = duplicateEntity(doc, map(), { kind: "event", key: 0 }, { x: 1, y: 4 });
    const copy = map().events![ref!.key as number];
    expect(map().events!.length).toBe(before + 1);
    expect(copy).toMatchObject({ id: "elder_1", x: 1, y: 4 });
    expect(copy.pages).toEqual(map().events![0].pages);
    // arrivals come with what leads there – not copied
    expect(duplicateEntity(doc, map(), { kind: "spawn", key: "from_town" }, { x: 2, y: 4 })).toBeNull();
  });

  it("lists everything placed on a map as entities", () => {
    const { map } = load("projects/demo/data/maps/mirage_tower_1.yaml");
    const kinds = listEntities(map()).map((e) => e.kind);
    for (const k of ["event", "exit", "spawn"]) expect(kinds).toContain(k);
    // gates and floor plates are entities (events with states) now
    expect(entitiesAt(map(), { x: 9, y: 6 }).map((e) => [e.kind, e.label])).toEqual([["event", "east_gate"]]);
  });

  it("adds, moves and deletes entities in their own lists", () => {
    const { doc, map } = load("projects/demo/data/maps/temple.yaml");
    const before = map().exits!.length;
    const ref = addEntity(doc, map(), "exit", { x: 2, y: 7 }, { map: "sandhollow", spawn: "from_inn" });
    expect(map().exits!.length).toBe(before + 1);
    expect(map().exits![ref.key as number]).toMatchObject({ x: 2, y: 7, to: "sandhollow", spawn: "from_inn" });
    moveEntity(doc, ref, { x: 3, y: 7 });
    expect(map().exits![ref.key as number]).toMatchObject({ x: 3, y: 7 });
    deleteEntity(doc, ref);
    expect(map().exits!.length).toBe(before);
    const sp = addEntity(doc, map(), "spawn", { x: 1, y: 1 }, {});
    expect(map().spawns[sp.key as string]).toEqual({ x: 1, y: 1, dir: "S" });
    const ev = addEntity(doc, map(), "event", { x: 4, y: 4 }, {});
    expect(map().events![ev.key as number]).toMatchObject({ id: "event_1", x: 4, y: 4 });
  });

  it("maps without the list get one", () => {
    const { doc, map } = load("projects/demo/data/maps/elder_house.yaml");
    expect(map().enemies).toBeUndefined();
    addEntity(doc, map(), "enemy", { x: 2, y: 2 }, { enemy: "skeleton" });
    expect(map().enemies).toEqual([{ id: "enemy_1", enemy: "skeleton", x: 2, y: 2, dir: "S" }]);
  });
});
