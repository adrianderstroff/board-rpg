import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { Project, type FileApi } from "./project";

/** The real data files, saved into memory instead of onto disk. */
function memoryApi(): FileApi & { written: Record<string, string> } {
  const files: Record<string, string> = {};
  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : e.name.endsWith(".yaml") ? [join(dir, e.name)] : []));
  for (const abs of walk("data")) files[relative(".", abs).split(sep).join("/")] = readFileSync(abs, "utf8");
  const written: Record<string, string> = {};
  return {
    written,
    load: async () => ({ files, music: ["village", "boss"] }),
    save: async (path, text) => void (written[path] = text),
  };
}

const lines = (text: string) => text.split(/\r?\n/);

describe("editor project (editor-design §2)", () => {
  it("loads the data files into the game's content and validates it", async () => {
    const p = new Project(memoryApi());
    await p.load();
    expect(p.content.db?.map("sandhollow").name).toBe("Sandhollow");
    expect(p.content.problems).toEqual([]);
    expect(p.music).toEqual(["boss", "village"]);
    expect(p.dirtyPaths()).toEqual([]);
  });

  it("edits keep comments and alignment, mark the file dirty, save writes only changed files", async () => {
    const api = memoryApi();
    const p = new Project(api);
    await p.load();
    p.edit("data/maps/sandhollow.yaml", "Music", (d) => d.set("music", "boss"));
    expect(p.dirtyPaths()).toEqual(["data/maps/sandhollow.yaml"]);
    expect(p.content.db?.map("sandhollow").music).toBe("boss");
    await p.save();
    expect(Object.keys(api.written)).toEqual(["data/maps/sandhollow.yaml"]);
    // only the changed line differs from the file on disk
    const before = lines(readFileSync("data/maps/sandhollow.yaml", "utf8"));
    const after = lines(api.written["data/maps/sandhollow.yaml"]);
    expect(after.length).toBe(before.length);
    expect(after.filter((l, i) => l !== before[i])).toEqual(["music: boss"]);
    expect(p.dirtyPaths()).toEqual([]);
  });

  it("an edit in an aligned file keeps the other lines' columns", async () => {
    const api = memoryApi();
    const p = new Project(api);
    await p.load();
    p.edit("data/chipsets/desert.yaml", "Sand", (d) => d.setIn(["terrains", "sand", "name"], "Fine Sand"));
    await p.save();
    const before = lines(readFileSync("data/chipsets/desert.yaml", "utf8"));
    const after = lines(api.written["data/chipsets/desert.yaml"]);
    const changed = after.filter((l, i) => l !== before[i]);
    expect(changed).toHaveLength(1);
    expect(changed[0]).toContain("Fine Sand");
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
});
