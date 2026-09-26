import { describe, expect, it } from "vitest";
import { NodeTree } from "../../node-tree";
import { ProjectStore } from "../storage/ops";
import { Project, type FileApi } from "../project";
import { Database } from "../../../src/core/data/database";
import { getGrid } from "../../../src/core/board/grid";
import { chipsetData, nextFrame, pieceUsers, PREVIEW_MAP, previewRaw } from "./chipsets";

function memoryApi(): FileApi {
  const loaded = new ProjectStore(new NodeTree(".")).loadProject("demo");
  return { load: async () => ({ ...(await loaded), music: [] }), save: async () => {} };
}

describe("tiles (graphics.md §4)", () => {
  it("finds the next free frame and what uses a piece", async () => {
    const p = new Project(memoryApi(), null);
    await p.load();
    const c = chipsetData(p, "lib:desert");
    expect(nextFrame(c, "terrain")).toBe(57); // the sheet's last block is 56 (cave wall)
    expect(nextFrame(c, "decor")).toBeGreaterThan(Math.max(...Object.values(c.decor).map((d) => d.frame)));
    expect(pieceUsers(p.content.raw, "lib:desert", "terrain", "scorched")).toContain("terrain grass"); // grass burns to it
    expect(pieceUsers(p.content.raw, "lib:desert", "terrain", "plaster_wall").length).toBeGreaterThan(0);
  });

  it("the preview board shows a terrain flat and raised, a decor object standing", async () => {
    const p = new Project(memoryApi(), null);
    await p.load();
    const db = new Database(structuredClone(previewRaw(p.content.raw, "lib:desert", "terrain", "water")));
    const g = getGrid(db, PREVIEW_MAP);
    expect(g.cell({ x: 1, y: 1 })!.terrain).toBe("water");
    expect(g.cell({ x: 4, y: 4 })!.height).toBe(2);
    expect(g.cell({ x: 0, y: 0 })!.terrain).toBe("sand");
    const d = new Database(structuredClone(previewRaw(p.content.raw, "lib:desert", "decor", "palm")));
    expect(getGrid(d, PREVIEW_MAP).cell({ x: 2, y: 2 })!.decor).toBe("palm");
  });
});
