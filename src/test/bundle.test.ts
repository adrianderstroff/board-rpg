import { parse } from "yaml";
import { describe, expect, it } from "vitest";
import { libraryUsage, trimLibraryFile, usedAssets } from "../content/bundle";
import { layeredRaw } from "../content/raw";
import { Database } from "../core/data/database";
import { validateContent } from "../core/data/validate";

const files = import.meta.glob(["/library/v1/library.yaml", "/library/v1/data/**/*.yaml", "/library/v1/template/data/**/*.yaml", "/projects/demo/data/**/*.yaml"], {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;
const tracks = Object.keys(import.meta.glob("/library/v1/assets/audio/music/*.wav")).map((p) => p.replace(/^.*\//, "").replace(/\.wav$/, ""));
const under = (prefix: string) => Object.entries(files).filter(([p]) => p.startsWith(prefix)) as [string, string][];
const library = under("/library/v1/data/");

/** The project on the trimmed library alone – what an export or a build ships. */
function shipped(project: [string, string][]) {
  const usage = libraryUsage(library, project, tracks);
  const trimmed = library.flatMap(([p, t]) => {
    const out = trimLibraryFile(p, t, usage);
    return out === null ? [] : [[p, parse(out)] as [string, unknown]];
  });
  const db = new Database(layeredRaw(trimmed, project.map(([p, t]) => [p, parse(t)] as [string, unknown]), { library: "", project: "" }));
  return { usage, db, assets: usedAssets(library, usage) };
}

describe("bundling the used library content (projects.md §5)", () => {
  it("a new project ships a small library that is complete for it", () => {
    const { usage, db, assets } = shipped(under("/library/v1/template/data/"));
    expect(validateContent(db)).toEqual([]);
    // what its own hero uses (class, equipment); what the rules need; nothing unrelated – not even the library's heroes
    for (const id of ["lib:knight", "lib:bronze_sword", "lib:chain_mail", "lib:potion", "lib:desert", "lib:defending", "lib:join_party"]) expect(usage.ids).toContain(id);
    for (const id of ["lib:grave_toad", "lib:aldric", "lib:mira", "lib:token_serenity"]) expect(usage.ids).not.toContain(id);
    expect(usage.music).toContain("village");
    expect(usage.music).not.toContain("final");
    expect(assets).toContain("charsets/hero_knight.png");
    expect(assets).toContain("chipsets/desert.png");
    expect(assets).toContain("audio/music/village.wav");
    expect(assets).not.toContain("faces/enemy_grave_toad.png");
    expect(db.heroes.size).toBe(1);
  });

  it("the demo on its trimmed library still passes validation", () => {
    const { db, usage } = shipped(under("/projects/demo/data/"));
    expect(validateContent(db)).toEqual([]);
    expect(usage.ids).toContain("lib:grave_toad");
  });

  it("trimming keeps the file's comments and drops unused chipsets whole", () => {
    const usage = { ids: new Set(["lib:aldric"]), music: new Set<string>() };
    const heroes = under("/library/v1/data/heroes.yaml")[0];
    const out = trimLibraryFile(heroes[0], heroes[1], usage)!;
    expect(Object.keys(parse(out))).toEqual(["aldric"]);
    expect(out.split("\n")[0]).toBe(heroes[1].split(/\r?\n/)[0]); // the header comment
    const chip = under("/library/v1/data/chipsets/")[0];
    expect(trimLibraryFile(chip[0], chip[1], usage)).toBeNull();
    expect(trimLibraryFile("/library/v1/library.yaml", "version: 1\n", usage)).toBe("version: 1\n");
  });
});
