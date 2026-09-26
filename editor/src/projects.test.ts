import { existsSync, readFileSync, rmSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { createProject, listProjects, readProject } from "../vite-plugin-files";
import { projectIdFor } from "./ProjectMenu";

const made: string[] = [];
const fresh = (base: string) => {
  const id = `${base}_${Date.now().toString(36)}_${made.length}`;
  made.push(id);
  return id;
};
afterEach(() => {
  for (const id of made.splice(0)) rmSync(`projects/${id}`, { recursive: true, force: true });
});

describe("projects (projects.md §6)", () => {
  it("lists the projects", () => {
    expect(listProjects(".").map((p) => p.id)).toContain("demo");
  });

  it("a new project starts from the library's template: its own name, one map, the library", () => {
    const id = fresh("test_empty");
    const info = createProject(".", { id, name: "Test Game" });
    expect(info).toEqual({ id, name: "Test Game", library: "v1" });
    const p = readProject(".", id);
    expect(p.project.name).toBe("Test Game");
    expect(Object.keys(p.files).filter((f) => f.startsWith("data/")).sort()).toEqual(["data/config.yaml", "data/maps/start.yaml"]);
    expect(Object.keys(p.files).some((f) => f.startsWith("library/v1/data/heroes"))).toBe(true);
    expect(readFileSync(`projects/${id}/project.yaml`, "utf8")).toContain("# A new project"); // comments kept
  });

  it("or as a copy of another project; ids are checked", () => {
    const id = fresh("test_copy");
    createProject(".", { id, name: "Demo Copy", from: "demo" });
    expect(readProject(".", id).files["data/maps/sandhollow.yaml"]).toBe(readFileSync("projects/demo/data/maps/sandhollow.yaml", "utf8"));
    expect(() => createProject(".", { id, name: "Again", from: "demo" })).toThrow(/exists/);
    expect(() => createProject(".", { id: "../evil", name: "x" })).toThrow(/project id/);
    expect(existsSync("projects/evil")).toBe(false);
  });

  it("folder ids from names", () => {
    expect(projectIdFor("My Game!")).toBe("my_game");
    expect(projectIdFor("  Ünïcode  Quest 2 ")).toBe("unicode_quest_2");
    expect(projectIdFor("!!!")).toBe("project");
  });
});
