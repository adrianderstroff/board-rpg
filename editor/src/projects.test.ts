import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { unzipSync } from "fflate";
import { parse } from "yaml";
import { layeredRaw } from "../../src/content/raw";
import { Database } from "../../src/core/data/database";
import { validateContent } from "../../src/core/data/validate";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createProject, exportProject, importProject, listLibraries, listProjects, moveToLibrary, readProject } from "../vite-plugin-files";
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
  it("lists the projects", () => {
    expect(listProjects(root).map((p) => p.id)).toContain("demo");
  });

  it("a new project starts from the library's template: its own name, one map, the library", () => {
    const id = "test_empty";
    const info = createProject(root, { id, name: "Test Game" });
    expect(info).toEqual({ id, name: "Test Game", library: "v1" });
    const p = readProject(root, id);
    expect(p.project.name).toBe("Test Game");
    expect(Object.keys(p.files).filter((f) => f.startsWith("data/")).sort()).toEqual(["data/config.yaml", "data/maps/start.yaml"]);
    expect(Object.keys(p.files).some((f) => f.startsWith("library/v1/data/heroes"))).toBe(true);
    expect(readFileSync(join(root, `projects/${id}/project.yaml`), "utf8")).toContain("# A new project"); // comments kept
  });

  it("or as a copy of another project; ids are checked", () => {
    const id = "test_copy";
    createProject(root, { id, name: "Demo Copy", from: "demo" });
    expect(readProject(root, id).files["data/maps/sandhollow.yaml"]).toBe(readFileSync("projects/demo/data/maps/sandhollow.yaml", "utf8"));
    expect(() => createProject(root, { id, name: "Again", from: "demo" })).toThrow(/exists/);
    expect(() => createProject(root, { id: "../evil", name: "x" })).toThrow(/project id/);
    expect(existsSync(join(root, "projects/evil"))).toBe(false);
  });

  it("folder ids from names", () => {
    expect(projectIdFor("My Game!")).toBe("my_game");
    expect(projectIdFor("  Ünïcode  Quest 2 ")).toBe("unicode_quest_2");
    expect(projectIdFor("!!!")).toBe("project");
  });

  it("exports a .brpg with the library content it uses; importing it elsewhere installs that library", () => {
    const brpg = exportProject(".", "demo");
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
      const info = importProject(other, brpg);
      expect(info).toEqual({ id: "board_rpg_demo", name: "Board RPG Demo", library: "v1" });
      expect(readFileSync(join(other, "library/v1/library.yaml"), "utf8")).toContain("bundled: true");
      const p = readProject(other, info.id);
      const layer = (lib: boolean) => Object.entries(p.files).filter(([f]) => f.startsWith("library/") === lib).map(([f, t]) => [f, parse(t)] as [string, unknown]);
      expect(validateContent(new Database(layeredRaw(layer(true), layer(false), p.roots)))).toEqual([]);
      expect(importProject(other, brpg).id).toBe("board_rpg_demo_2"); // ids stay unique
    } finally {
      rmSync(other, { recursive: true, force: true });
    }
  });

  it("rejects what isn't a project", () => {
    expect(() => importProject(root, new Uint8Array([1, 2, 3]))).toThrow();
  });

  it("moves a project to another library version only when that version has everything it uses", () => {
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
    expect(listLibraries(root).map((l) => l.id)).toEqual(["v1", "v2", "v3"]);
    expect(moveToLibrary(root, "demo", "v2", true)).toEqual({ missing: ["lib:potion"], moved: false });
    expect(readProject(root, "demo").project.library).toBe("v1");
    expect(moveToLibrary(root, "demo", "v3", true)).toEqual({ missing: [], moved: true });
    expect(readProject(root, "demo").project.library).toBe("v3");
    expect(readFileSync(join(root, "projects/demo/project.yaml"), "utf8")).toContain("# The demo"); // comments kept
  });
});
