import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import type { MapDef } from "../../../src/core/data/types";
import { Project, type FileApi } from "../project";
import { arrivalUses, createTeleport, deleteArrival, deleteExit, frontOf, mapFile, placeStart, renameArrival, retargetExit } from "./teleports";

/** The real data files in memory. */
function memoryApi(): FileApi {
  const files: Record<string, string> = {};
  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : e.name.endsWith(".yaml") ? [join(dir, e.name)] : []));
  for (const abs of walk("data")) files[relative(".", abs).split(sep).join("/")] = readFileSync(abs, "utf8");
  return { load: async () => ({ files, music: [] }), save: async () => {} };
}

async function project() {
  const p = new Project(memoryApi(), null);
  await p.load();
  return p;
}
const map = (p: Project, id: string) => p.data<MapDef>(mapFile(id));

describe("teleports (editor-design §6.4)", () => {
  it("an arrival lies one cell in front of an exit, facing away from it", () => {
    expect(frontOf({ x: 4, y: 0, dir: "N" })).toEqual({ x: 4, y: 1, dir: "S" });
    expect(frontOf({ x: 9, y: 3, dir: "E" })).toEqual({ x: 8, y: 3, dir: "W" });
  });

  it("finds what leads to an arrival: exits, teleport actions, inn wake-ups, the game start", async () => {
    const p = await project();
    const kinds = (m: string, s: string) => arrivalUses(p, m, s).map((u) => u.kind);
    expect(kinds("mirage_sands", "from_dunes")).toContain("teleport");
    expect(kinds("sandhollow_inn_upper", "bed")).toContain("inn");
    const cfg = p.data<{ start: { map: string; spawn: string } }>("data/config.yaml").start;
    expect(kinds(cfg.map, cfg.spawn)).toContain("start");
  });

  it("a one-way teleport makes its arrival; deleting the exit removes the arrival again (one undo step each)", async () => {
    const p = await project();
    const exits = map(p, "elder_house").exits!.length;
    const i = createTeleport(p, "elder_house", { x: 1, y: 4, dir: "W" }, { map: "temple", x: 2, y: 2, dir: "E" });
    const exit = map(p, "elder_house").exits![i];
    expect(exit).toMatchObject({ x: 1, y: 4, to: "temple", spawn: "from_elder_house" });
    expect(map(p, "temple").spawns.from_elder_house).toEqual({ x: 2, y: 2, dir: "E" });
    expect(p.undoLabel).toBe("Add teleport");
    deleteExit(p, "elder_house", i);
    expect(map(p, "elder_house").exits!.length).toBe(exits);
    expect(map(p, "temple").spawns.from_elder_house).toBeUndefined();
    p.undo();
    expect(map(p, "temple").spawns.from_elder_house).toBeDefined();
  });

  it("way back: a return exit, and each arrival in front of the other side's exit", async () => {
    const p = await project();
    const i = createTeleport(p, "elder_house", { x: 1, y: 4, dir: "W" }, { map: "temple", x: 0, y: 3, dir: "W", wayBack: true });
    const here = map(p, "elder_house");
    const there = map(p, "temple");
    const out = here.exits![i];
    const back = there.exits!.find((e) => e.to === "elder_house" && e.x === 0 && e.y === 3)!;
    expect(there.spawns[out.spawn]).toEqual({ x: 1, y: 3, dir: "E" });
    expect(here.spawns[back.spawn]).toEqual({ x: 2, y: 4, dir: "E" });
  });

  it("changing where an exit leads drops the old arrival if nothing else uses it", async () => {
    const p = await project();
    const i = createTeleport(p, "elder_house", { x: 1, y: 4, dir: "W" }, { map: "temple", x: 2, y: 2, dir: "E" });
    retargetExit(p, "elder_house", i, { map: "grave_cave", x: 3, y: 3, dir: "S" });
    expect(map(p, "temple").spawns.from_elder_house).toBeUndefined();
    expect(map(p, "grave_cave").spawns.from_elder_house).toBeDefined();
  });

  it("deleting an arrival deletes the exits leading there, on other maps too", async () => {
    const p = await project();
    const i = createTeleport(p, "elder_house", { x: 1, y: 4, dir: "W" }, { map: "temple", x: 2, y: 2, dir: "E" });
    const n = map(p, "elder_house").exits!.length;
    deleteArrival(p, "temple", "from_elder_house");
    expect(map(p, "elder_house").exits!.length).toBe(n - 1);
    expect(map(p, "elder_house").exits!.some((e, j) => j === i && e.to === "temple")).toBe(false);
    expect(p.undoLabel).toBe("Delete arrival");
  });

  it("renaming an arrival renames every reference", async () => {
    const p = await project();
    renameArrival(p, "sandhollow_inn_upper", "bed", "by_the_beds");
    expect(map(p, "sandhollow_inn_upper").spawns.by_the_beds).toBeDefined();
    expect(arrivalUses(p, "sandhollow_inn_upper", "by_the_beds").map((u) => u.kind)).toContain("inn");
    expect(p.content.problems).toEqual([]);
  });

  it("the Quick Play start is an arrival with that role; placing it again moves it", async () => {
    const p = await project();
    placeStart(p, "elder_house", { x: 2, y: 3 }, "quickplay");
    const qp = map(p, "elder_house").editor!.quickPlay!.spawn!;
    expect(map(p, "elder_house").spawns[qp]).toMatchObject({ x: 2, y: 3 });
    placeStart(p, "elder_house", { x: 4, y: 3 }, "quickplay");
    const qp2 = map(p, "elder_house").editor!.quickPlay!.spawn!;
    expect(map(p, "elder_house").spawns[qp2]).toMatchObject({ x: 4, y: 3 });
    expect(map(p, "elder_house").spawns[qp === qp2 ? "__none" : qp]).toBeUndefined();
    expect(p.content.problems).toEqual([]);
  });
});
