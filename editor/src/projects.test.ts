import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { unzipSync } from "fflate";
import { parse } from "yaml";
import { layeredRaw } from "../../src/content/raw";
import { Database } from "../../src/core/data/database";
import { validateContent } from "../../src/core/data/validate";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NodeTree } from "../node-tree";
import { ProjectStore, ASSET_PATH } from "./storage/ops";
import { LayeredTree, MemoryTree } from "./storage/tree";
import { BundledLibraryTree, bundledDemo } from "./storage/trees";

/** The projects of a folder with the repository's layout. */
const at = (dir: string) => new ProjectStore(new NodeTree(dir));
import { projectIdFor } from "./ProjectMenu";

/**
 * A scratch copy of the repository's library (without its assets) and the demo, so creating and
 * importing projects never touches projects/ – other test files read it at the same time.
 */
let root = "";
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "brpg-root-"));
  for (const part of ["library/v1/library.yaml", "library/v1/data", "library/v1/template", "projects/demo"]) cpSync(part, join(root, part), { recursive: true });
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("projects (projects.md §6)", () => {
  it("lists the projects", async () => {
    expect((await at(root).listProjects()).map((p) => p.id)).toContain("demo");
  });

  it("a new project starts from the library's template: its own name, one map, the library", async () => {
    const id = "test_empty";
    const info = await at(root).createProject({ id, name: "Test Game" });
    expect(info).toEqual({ id, name: "Test Game", library: "v1" });
    const p = await at(root).loadProject(id);
    expect(p.project.name).toBe("Test Game");
    expect(Object.keys(p.files).filter((f) => f.startsWith("data/")).sort()).toEqual(["data/config.yaml", "data/heroes.yaml", "data/maps/start.yaml"]);
    expect(Object.keys(p.files).some((f) => f.startsWith("library/v1/data/heroes"))).toBe(true);
    expect(readFileSync(join(root, `projects/${id}/project.yaml`), "utf8")).toContain("# A new project"); // comments kept
  });

  it("or as a copy of another project; ids are checked", async () => {
    const id = "test_copy";
    await at(root).createProject({ id, name: "Demo Copy", from: "demo" });
    expect((await at(root).loadProject(id)).files["data/maps/sandhollow.yaml"]).toBe(readFileSync("projects/demo/data/maps/sandhollow.yaml", "utf8"));
    await expect(at(root).createProject({ id, name: "Again", from: "demo" })).rejects.toThrow(/exists/);
    await expect(at(root).createProject({ id: "../evil", name: "x" })).rejects.toThrow(/project id/);
    expect(existsSync(join(root, "projects/evil"))).toBe(false);
  });

  it("folder ids from names", () => {
    expect(projectIdFor("My Game!")).toBe("my_game");
    expect(projectIdFor("  Ünïcode  Quest 2 ")).toBe("unicode_quest_2");
    expect(projectIdFor("!!!")).toBe("project");
    expect(projectIdFor("My Desert Game!", "-")).toBe("my-desert-game"); // project folders
  });

  it("exports a .brpg with the library content it uses; importing it elsewhere installs that library", async () => {
    const brpg = await at(".").exportProject("demo");
    const zip = unzipSync(brpg);
    const paths = Object.keys(zip);
    expect(paths).toContain("project.yaml");
    expect(paths).toContain("data/maps/sandhollow.yaml");
    expect(paths).toContain("library/v1/library.yaml");
    expect(paths).toContain("library/v1/data/heroes.yaml");
    expect(paths).toContain("library/v1/assets/charsets/hero_knight.png");
    expect(paths.some((p) => p.includes("/template/"))).toBe(false); // the library's own template isn't content

    // a machine without the library: the import brings it
    const other = mkdtempSync(join(tmpdir(), "brpg-"));
    try {
      const info = await at(other).importProject(brpg);
      expect(info).toEqual({ id: "board-rpg-demo", name: "Board RPG Demo", library: "v1" });
      expect(readFileSync(join(other, "library/v1/library.yaml"), "utf8")).toContain("bundled: true");
      const p = await at(other).loadProject(info.id);
      const layer = (lib: boolean) => Object.entries(p.files).filter(([f]) => f.startsWith("library/") === lib).map(([f, t]) => [f, parse(t)] as [string, unknown]);
      expect(validateContent(new Database(layeredRaw(layer(true), layer(false), p.roots)))).toEqual([]);
      expect((await at(other).importProject(brpg)).id).toBe("board-rpg-demo-2"); // folders stay unique
    } finally {
      rmSync(other, { recursive: true, force: true });
    }
  });

  it("rejects what isn't a project", async () => {
    await expect(at(root).importProject(new Uint8Array([1, 2, 3]))).rejects.toThrow(/not a \.brpg/);
  });

  it("moves a project to another library version only when that version has everything it uses", async () => {
    // v2 lost the potion; v3 is v1 again
    cpSync(join(root, "library/v1"), join(root, "library/v2"), { recursive: true });
    cpSync(join(root, "library/v1"), join(root, "library/v3"), { recursive: true });
    // (the scratch library has no assets: stand-ins for the music tracks, by name)
    for (const v of ["v2", "v3"]) {
      mkdirSync(join(root, `library/${v}/assets/audio/music`), { recursive: true });
      for (const f of readdirSync("library/v1/assets/audio/music")) writeFileSync(join(root, `library/${v}/assets/audio/music`, f), "");
    }
    const items = join(root, "library/v2/data/items.yaml");
    const doc = parse(readFileSync(items, "utf8")) as Record<string, unknown>;
    delete doc.potion;
    writeFileSync(items, JSON.stringify(doc)); // JSON is YAML
    expect((await at(root).listLibraries()).map((l) => l.id)).toEqual(["v1", "v2", "v3"]);
    expect(await at(root).moveToLibrary("demo", "v2", true)).toEqual({ missing: ["lib:potion"], moved: false });
    expect((await at(root).loadProject("demo")).project.library).toBe("v1");
    expect(await at(root).moveToLibrary("demo", "v3", true)).toEqual({ missing: [], moved: true });
    expect((await at(root).loadProject("demo")).project.library).toBe("v3");
    expect(readFileSync(join(root, "projects/demo/project.yaml"), "utf8")).toContain("# The demo"); // comments kept
  });

  it("the browser's storage: the bundled library under the stored projects – a new one from the template, the demo copied in", async () => {
    const stored = new MemoryTree(bundledDemo());
    const store = new ProjectStore(new LayeredTree(new BundledLibraryTree(), stored));
    expect((await store.listProjects()).map((p) => p.id)).toEqual(["demo"]);
    expect((await store.listLibraries()).map((l) => l.id)).toContain("v1");
    await store.createProject({ id: "mine", name: "Mine" });
    const p = await store.loadProject("mine");
    expect(Object.keys(p.files)).toContain("data/maps/start.yaml");
    expect(p.music).toContain("lib:village");
    // written to the stored tree only; the library stays bundled
    expect([...stored.files.keys()].some((k) => k.startsWith("projects/mine/"))).toBe(true);
    expect([...stored.files.keys()].some((k) => k.startsWith("library/"))).toBe(false);
    await store.putAsset("mine", "faces/me.png", new Uint8Array([1, 2]));
    await expect(store.putAsset("mine", "../evil.png", new Uint8Array([1]))).rejects.toThrow();
    await expect(store.saveFile("mine", "data/../../x.yaml", "")).rejects.toThrow();
    expect(ASSET_PATH.test("faces/me.png")).toBe(true);
  });
});
