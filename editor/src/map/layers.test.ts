import { describe, expect, it } from "vitest";
import { parseDocument } from "yaml";
import { readFileSync } from "node:fs";
import type { MapDef } from "../../../src/core/data/types";
import { floodArea, heightAt, paint, rectCells, resize, rowsOf, setFacing, setHeights } from "./layers";

const SRC = `name: Test
kind: peaceful
chipset: desert
battleback: desert
legend:
  terrain:
    s: sand
    r: rock
  decor:
    P: palm
layers:
  terrain: |
    sssr
    ssrr
    ssss
  height: |
    0001
    0011
    0000
  decor: |
    ....
    .P..
    ....
spawns:
  start: { x: 1, y: 2 }
events:
  - { id: e, x: 3, y: 0, pages: [] }
`;

function load() {
  const doc = parseDocument(SRC);
  return { doc, map: () => doc.toJS() as MapDef };
}

describe("map layers (editor-design §5.2)", () => {
  it("paints terrain, adding a readable legend character for a new terrain; layers stay | blocks", () => {
    const { doc, map } = load();
    paint(doc, map(), "terrain", [{ x: 0, y: 0 }, { x: 1, y: 0 }], "grass");
    expect(map().legend.terrain.g).toBe("grass");
    expect(rowsOf(map(), "terrain")[0].join("")).toBe("ggsr");
    expect(doc.toString()).toContain("  terrain: |\n    ggsr\n");
    // painting over the last rock removes rock from the legend
    paint(doc, map(), "terrain", rectCells({ x: 2, y: 0 }, { x: 3, y: 1 }), "sand");
    expect(map().legend.terrain.r).toBeUndefined();
  });

  it("decor and holes: null clears; the fill tool finds connected equal cells", () => {
    const { doc, map } = load();
    paint(doc, map(), "decor", [{ x: 1, y: 1 }], null);
    expect(rowsOf(map(), "decor")[1].join("")).toBe("....");
    expect(floodArea(map(), "terrain", { x: 0, y: 0 })).toHaveLength(9); // the sand around the rocks
  });

  it("heights: raise and lower, clamped to 0..35", () => {
    const { doc, map } = load();
    setHeights(doc, map(), [{ x: 0, y: 0 }], (h) => h + 12);
    expect(heightAt(map(), { x: 0, y: 0 })).toBe(12);
    expect(rowsOf(map(), "height")[0][0]).toBe("c");
    setHeights(doc, map(), [{ x: 0, y: 0 }], (h) => h - 99);
    expect(heightAt(map(), { x: 0, y: 0 })).toBe(0);
  });

  it("decor facing gets its own layer only while something is turned", () => {
    const { doc, map } = load();
    setFacing(doc, map(), { x: 1, y: 1 }, "N");
    expect(rowsOf(map(), "decorDir")[1].join("")).toBe(".N..");
    setFacing(doc, map(), { x: 1, y: 1 }, "S");
    expect(map().layers.decorDir).toBeUndefined();
  });

  it("resizing adds rows/columns and moves everything placed on the map", () => {
    const { doc, map } = load();
    resize(doc, map(), { left: 1, right: 0, top: 2, bottom: -1 }, "sand");
    const m = map();
    expect(rowsOf(m, "terrain").map((r) => r.join(""))).toEqual(["sssss", "sssss", "ssssr", "sssrr"]);
    expect(m.spawns.start).toEqual({ x: 2, y: 4 });
    expect(m.events![0]).toMatchObject({ x: 4, y: 2 });
  });

  it("new cells are empty (holes) unless a fill terrain is given", () => {
    const { doc, map } = load();
    resize(doc, map(), { left: 0, right: 1, top: 0, bottom: 0 });
    expect(rowsOf(map(), "terrain").every((r) => r[r.length - 1] === " ")).toBe(true);
    expect(rowsOf(map(), "height").every((r) => r[r.length - 1] === "0")).toBe(true);
  });
});

describe("wall signs (Decor mode)", () => {
  it("paints a sign on one side of a block, replacing that side's sign; right click removes the cell's signs", async () => {
    const { setWallSigns } = await import("./layers");
    const doc = parseDocument(readFileSync("projects/demo/data/maps/sandhollow.yaml", "utf8"));
    const map = () => doc.toJS() as MapDef;
    const before = map().wallDecor!.length;
    setWallSigns(doc, map(), [{ x: 4, y: 4 }], "magic", "E", 3);
    expect(map().wallDecor!.length).toBe(before + 1);
    expect(map().wallDecor!.at(-1)).toEqual({ x: 4, y: 4, sign: "magic", face: "E", level: 3 });
    setWallSigns(doc, map(), [{ x: 4, y: 4 }], "inn", "E");
    expect(map().wallDecor!.filter((w) => w.x === 4 && w.y === 4)).toEqual([{ x: 4, y: 4, sign: "inn", face: "E" }]);
    setWallSigns(doc, map(), [{ x: 4, y: 4 }], null, "E");
    expect(map().wallDecor!.length).toBe(before);
  });
});

describe("door lintels", () => {
  it("adds and removes a lintel above a doorway", async () => {
    const { setOverhead } = await import("./layers");
    const { doc, map } = load();
    setOverhead(doc, map(), [{ x: 1, y: 1 }], "rock", 7);
    expect(rowsOf(map(), "terrain")).toBeTruthy();
    expect(map().layers.overhead!.split("\n")[1]).toBe(".r..");
    expect(map().layers.overheadHeight!.split("\n")[1]).toBe(".7..");
    setOverhead(doc, map(), [{ x: 1, y: 1 }], null, 0);
    expect(map().layers.overhead).toBeUndefined();
  });
});

describe("areas: copy, paste, move", () => {
  it("copies every board layer and pastes it elsewhere; cells outside the map are dropped", async () => {
    const { copyArea, pasteArea, rectOf } = await import("./layers");
    const { doc, map } = load();
    const clip = copyArea(map(), rectOf({ x: 2, y: 0 }, { x: 3, y: 1 }));
    expect(clip.cells[0][1]).toMatchObject({ terrain: "rock", height: 1 });
    pasteArea(doc, map(), clip, { x: 0, y: 1 });
    expect(rowsOf(map(), "terrain").map((r) => r.join(""))).toEqual(["sssr", "srrr", "rrss"]);
    expect(rowsOf(map(), "height")[2].join("")).toBe("1100");
    // the decor at (1,1) was overwritten by the pasted cell without decor
    expect(rowsOf(map(), "decor")[1].join("")).toBe("....");
    pasteArea(doc, map(), clip, { x: 3, y: 2 }); // half outside
    expect(rowsOf(map(), "terrain")[2].join("")).toBe("rrss".slice(0, 3) + "s");
  });

  it("moving leaves the fill terrain behind and takes the entities along", async () => {
    const { moveArea } = await import("./layers");
    const { doc, map } = load();
    // the palm at (1,1) and the spawn at (1,2) move two cells right
    moveArea(doc, map(), { x: 0, y: 1, w: 2, h: 2 }, { x: 2, y: 1 }, "rock", true);
    expect(rowsOf(map(), "terrain").map((r) => r.join(""))).toEqual(["sssr", "rrss", "rrss"]);
    expect(rowsOf(map(), "decor")[1].join("")).toBe("...P");
    expect(map().spawns.start).toEqual({ x: 3, y: 2 });
    expect(map().events![0]).toMatchObject({ x: 3, y: 0 }); // outside the area: stays
  });
});
