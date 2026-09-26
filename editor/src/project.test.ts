import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { NodeTree } from "../node-tree";
import { ProjectStore } from "./storage/ops";
import { Project, type FileApi } from "./project";

/** The real data files, saved into memory instead of onto disk. */
function memoryApi(): FileApi & { written: Record<string, string> } {
  const loaded = new ProjectStore(new NodeTree(".")).loadProject("demo");
  const written: Record<string, string> = {};
  return {
    written,
    load: async () => ({ ...(await loaded), music: ["lib:village", "lib:boss"] }),
    save: async (path, text) => void (written[path] = text),
  };
}

const lines = (text: string) => text.split(/\r?\n/);

/** A stand-in for localStorage. */
function memoryStore() {
  const items = new Map<string, string>();
  return { getItem: (k: string) => items.get(k) ?? null, setItem: (k: string, v: string) => void items.set(k, v), removeItem: (k: string) => void items.delete(k), items };
}

describe("editor project (editor-design §2)", () => {
  it("loads the data files into the game's content and validates it", async () => {
    const p = new Project(memoryApi());
    await p.load();
    expect(p.content.db?.map("sandhollow").name).toBe("Sandhollow");
    expect(p.content.problems).toEqual([]);
    expect(p.music).toEqual(["lib:boss", "lib:village"]);
    expect(p.dirtyPaths()).toEqual([]);
  });

  it("edits keep comments and alignment, mark the file dirty, save writes only changed files", async () => {
    const api = memoryApi();
    const p = new Project(api);
    await p.load();
    p.edit("data/maps/sandhollow.yaml", "Music", (d) => d.set("music", "lib:boss"));
    expect(p.dirtyPaths()).toEqual(["data/maps/sandhollow.yaml"]);
    expect(p.content.db?.map("sandhollow").music).toBe("lib:boss");
    await p.save();
    expect(Object.keys(api.written)).toEqual(["data/maps/sandhollow.yaml"]);
    // only the changed line differs from the file on disk
    const before = lines(readFileSync("projects/demo/data/maps/sandhollow.yaml", "utf8"));
    const after = lines(api.written["data/maps/sandhollow.yaml"]);
    expect(after.length).toBe(before.length);
    expect(after.filter((l, i) => l !== before[i])).toEqual(["music: lib:boss"]);
    expect(p.dirtyPaths()).toEqual([]);
  });

  it("the library is read-only; its content shows up with lib: ids", async () => {
    const api = memoryApi();
    const p = new Project(api);
    await p.load();
    expect(() => p.edit("library/v1/data/chipsets/desert.yaml", "Sand", (d) => d.setIn(["terrains", "sand", "name"], "Fine Sand"))).toThrow(/read-only/);
    expect(p.dirtyPaths()).toEqual([]);
    expect(p.content.db?.heroes.get("lib:aldric")?.name).toBe("Aldric");
    expect(p.content.db?.chipsets.get("lib:desert")?.image).toBe("library/v1/assets/chipsets/desert.png");
  });

  it("undo/redo; edits of one group (a paint stroke) are one step", async () => {
    const p = new Project(memoryApi());
    await p.load();
    const f = "data/maps/sandhollow.yaml";
    p.edit(f, "Name", (d) => d.set("name", "A"), "name");
    p.edit(f, "Name", (d) => d.set("name", "AB"), "name");
    p.edit(f, "Kind", (d) => d.set("kind", "wild"));
    p.undo();
    expect(p.data<{ kind: string }>(f).kind).toBe("peaceful");
    p.undo();
    expect(p.data<{ name: string }>(f).name).toBe("Sandhollow"); // both name edits at once
    expect(p.dirtyPaths()).toEqual([]); // back to exactly the file on disk
    p.redo();
    expect(p.data<{ name: string }>(f).name).toBe("AB");
    p.revert();
    expect(p.dirtyPaths()).toEqual([]);
  });

  it("broken references show up as problems", async () => {
    const p = new Project(memoryApi());
    await p.load();
    p.edit("data/maps/sandhollow.yaml", "Battleback", (d) => d.set("battleback", "nowhere"));
    expect(p.content.problems.some((x) => x.includes("nowhere"))).toBe(true);
  });

  it("unsaved edits and their undo history survive a reload (a new Project on the same storage)", async () => {
    const api = memoryApi();
    const store = memoryStore();
    const a = new Project(api, store);
    await a.load();
    a.edit("data/maps/sandhollow.yaml", "Music", (d) => d.set("music", "lib:boss"));
    a.persistNow();
    const b = new Project(api, store);
    await b.load();
    expect(b.dirtyPaths()).toEqual(["data/maps/sandhollow.yaml"]);
    expect(b.content.db?.map("sandhollow").music).toBe("lib:boss");
    expect(b.undoLabel).toBe("Music");
    b.undo();
    expect(b.dirtyPaths()).toEqual([]);
    // saved and nothing left to undo: nothing is kept
    b.revert();
    b.persistNow();
    expect(store.items.size).toBe(0);
  });

  it("a file changed on disk since wins over the stored unsaved edits", async () => {
    const api = memoryApi();
    const store = memoryStore();
    const a = new Project(api, store);
    await a.load();
    a.edit("data/maps/sandhollow.yaml", "Music", (d) => d.set("music", "lib:boss"));
    a.persistNow();
    // someone edits the file outside the editor
    const { files } = await api.load();
    files["data/maps/sandhollow.yaml"] = files["data/maps/sandhollow.yaml"].replace("name: Sandhollow", "name: Sandhollow Town");
    const b = new Project(api, store);
    await b.load();
    expect(b.dirtyPaths()).toEqual([]);
    expect(b.dropped).toEqual(["data/maps/sandhollow.yaml"]);
    expect(b.canUndo).toBe(false);
  });

  it("a transaction's edits on several files are one undo step", async () => {
    const p = new Project(memoryApi(), null);
    await p.load();
    p.transaction("Two maps", () => {
      p.edit("data/maps/sandhollow.yaml", "a", (d) => d.set("music", "lib:boss"));
      p.edit("data/maps/temple.yaml", "b", (d) => d.set("music", "lib:boss"));
    });
    expect(p.dirtyPaths().sort()).toEqual(["data/maps/sandhollow.yaml", "data/maps/temple.yaml"]);
    expect(p.undoLabel).toBe("Two maps");
    p.undo();
    expect(p.dirtyPaths()).toEqual([]);
    p.redo();
    expect(p.dirtyPaths().length).toBe(2);
  });
});
