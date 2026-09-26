import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parseDocument } from "yaml";
import { rewriteRefs } from "../../src/content/refs";
import { copyEntryToProject } from "./copyToProject";
import { Project } from "./project";
import { NodeTree } from "../node-tree";
import { ProjectStore } from "./storage/ops";

let root = "";
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "brpg-copy-"));
  for (const part of ["library/v1/library.yaml", "library/v1/data", "projects/demo"]) cpSync(part, join(root, part), { recursive: true });
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("copy to project (projects.md §2)", () => {
  it("repoints only the fields that refer to that kind of content", () => {
    const doc = parseDocument("elder: { name: Elder, charset: lib:hero_knight, face: lib:hero_knight }\nstart: { items: { lib:potion: 2 }, party: [lib:aldric] }\n");
    expect(rewriteRefs(doc, "charsets", "lib:hero_knight", "hero_knight")).toBe(1);
    expect(rewriteRefs(doc, "items", "lib:potion", "potion")).toBe(1);
    expect(rewriteRefs(doc, "heroes", "lib:aldric", "aldric")).toBe(1);
    expect(doc.toJS()).toEqual({ elder: { name: "Elder", charset: "hero_knight", face: "lib:hero_knight" }, start: { items: { potion: 2 }, party: ["aldric"] } });
  });

  it("a hero copied into the project: its own file, the project's references follow, still valid", async () => {
    const files = await new ProjectStore(new NodeTree(root)).loadProject("demo");
    const p = new Project({ load: async () => files, save: async () => {} }, null);
    await p.load();
    const id = copyEntryToProject(p, "heroes", "lib:aldric");
    expect(id).toBe("aldric");
    expect(p.data<Record<string, { name: string }>>("data/heroes.yaml").aldric.name).toBe("Aldric");
    expect(p.data<{ start: { party: string[] } }>("data/config.yaml").start.party).toEqual(["aldric", "lib:mira", "lib:kit", "lib:tarek"]);
    expect(p.content.problems).toEqual([]);
    expect(p.content.db!.heroes.has("lib:aldric")).toBe(true); // the library's is still there
    // one undo step takes it all back
    p.undo();
    expect(p.data("data/heroes.yaml")).toBeFalsy();
    expect(p.data<{ start: { party: string[] } }>("data/config.yaml").start.party[0]).toBe("lib:aldric");
  });
});
