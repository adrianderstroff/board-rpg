import { parse } from "yaml";
import { describe, expect, it } from "vitest";
import { loadDatabase, loadRawContent } from "../content/loader";
import { layeredRaw } from "../content/raw";
import { Database } from "../core/data/database";
import { validateContent } from "../core/data/validate";

/** The libraries' files and their new-project templates (not part of the game's bundle). */
const files = import.meta.glob(["/library/*/data/**/*.yaml", "/library/*/template/data/**/*.yaml", "/projects/*/project.yaml"], {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;
const under = (prefix: string) =>
  Object.entries(files)
    .filter(([p]) => p.startsWith(prefix))
    .map(([p, t]) => [p, parse(t)] as [string, unknown]);

describe("content", () => {
  it("loads and passes validation", () => {
    const db = loadDatabase();
    expect(db.maps.size).toBeGreaterThanOrEqual(2);
    expect(validateContent(db)).toEqual([]);
  });

  it("every project passes validation (projects.md)", () => {
    const ids = Object.keys(files).flatMap((p) => /^\/projects\/([^/]+)\/project\.yaml$/.exec(p)?.[1] ?? []);
    expect(ids).toContain("demo");
    for (const id of ids) expect([id, validateContent(new Database(loadRawContent(undefined, id)))]).toEqual([id, []]);
  });

  it("a new project from the library's template is valid right away", () => {
    const versions = [...new Set(Object.keys(files).flatMap((p) => /^\/library\/([^/]+)\/template\//.exec(p)?.[1] ?? []))];
    expect(versions).toContain("v1");
    for (const v of versions) {
      const db = new Database(layeredRaw(under(`/library/${v}/data/`), under(`/library/${v}/template/data/`), { library: "", project: "" }));
      expect(validateContent(db)).toEqual([]);
      expect(db.maps.has(db.config.start.map)).toBe(true);
    }
  });
});
