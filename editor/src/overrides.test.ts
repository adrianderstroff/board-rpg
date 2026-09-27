import { describe, expect, it } from "vitest";
import { parseDocument } from "yaml";
import { rewriteRefs } from "../../src/content/refs";
import { NodeTree } from "../node-tree";
import { writeEntry } from "./forms/entries";
import { editEntry, isOverridden, revertToLibrary } from "./overrides";
import { Project, type FileApi } from "./project";
import { ProjectStore } from "./storage/ops";

function memoryApi(): FileApi {
  const loaded = new ProjectStore(new NodeTree(".")).loadProject("demo");
  return { load: async () => ({ ...(await loaded), music: [] }), save: async () => {} };
}

describe("library content changed in a project (projects.md §2)", () => {
  it("the first edit makes the project's version under the same id; undo and revert bring the library's back", async () => {
    const p = new Project(memoryApi(), null);
    await p.load();
    const before = p.content.raw.heroes["lib:aldric"];
    expect(isOverridden(p, "heroes", "lib:aldric")).toBe(false);
    editEntry(p, "heroes", "lib:aldric", "Aldric: name", () => writeEntry(p, "data/heroes.yaml", "lib:aldric", before, { ...before, name: "Sir Aldric" }, "Aldric: name"));
    expect(isOverridden(p, "heroes", "lib:aldric")).toBe(true);
    expect(p.content.raw.heroes["lib:aldric"].name).toBe("Sir Aldric");
    // the rest is the library's, references untouched, still valid
    expect(p.content.raw.heroes["lib:aldric"].classId).toBe("lib:knight");
    expect(p.data<{ start: { party: string[] } }>("data/config.yaml").start.party[0]).toBe("lib:aldric");
    expect(p.content.problems).toEqual([]);
    // one undo step: the override and the change
    p.undo();
    expect(isOverridden(p, "heroes", "lib:aldric")).toBe(false);
    p.redo();
    await revertToLibrary(p, "heroes", "lib:aldric");
    expect(p.content.raw.heroes["lib:aldric"].name).toBe("Aldric");
  });

  it("references are repointed by field only (renames)", () => {
    const doc = parseDocument("elder: { name: Elder, charset: lib:hero_knight, face: lib:hero_knight }\nstart: { items: { lib:potion: 2 }, party: [lib:aldric] }\n");
    expect(rewriteRefs(doc, "charsets", "lib:hero_knight", "hero_knight")).toBe(1);
    expect(rewriteRefs(doc, "items", "lib:potion", "potion")).toBe(1);
    expect(rewriteRefs(doc, "heroes", "lib:aldric", "aldric")).toBe(1);
    expect(doc.toJS()).toEqual({ elder: { name: "Elder", charset: "hero_knight", face: "lib:hero_knight" }, start: { items: { potion: 2 }, party: ["aldric"] } });
  });
});
