import { describe, expect, it } from "vitest";
import { layeredRaw } from "../content/raw";
import { systemOverrides } from "../content/system";
import { validateContent } from "../core/data/validate";
import { testDb } from "./helpers";

describe("a project's own game images (graphics.md §2)", () => {
  it("replaces the runtime's images it lists with its own files, and names its own icons", () => {
    const roots = { library: "library/v1/assets/", project: "projects/p/assets/" };
    const raw = layeredRaw([["library/v1/data/graphics.yaml", { charsets: {} }]], [["data/graphics.yaml", { system: { images: ["title_bg", "icons"], icons: { sword: 0, lantern: 64 } } }]], roots);
    expect(raw.graphics.system).toEqual({ images: ["title_bg", "icons"], icons: { sword: 0, lantern: 64 } });
    expect(systemOverrides(raw.graphics, roots)).toEqual({ "system/title_bg.png": "projects/p/assets/system/title_bg.png", "system/icons.png": "projects/p/assets/system/icons.png" });
    // without its own images, nothing is replaced
    expect(systemOverrides({}, roots)).toEqual({});
  });

  it("validates the list and the icon names", () => {
    // the rules on their own: unknown image names and icon names without the sheet
    const g = testDb();
    (g.graphics as { system?: object }).system = { images: ["banner"], icons: { x: 1 } };
    const problems = validateContent(g).filter((p) => p.includes("system"));
    expect(problems.some((p) => p.includes('"banner" isn\'t one of the game\'s images'))).toBe(true);
    expect(problems.some((p) => p.includes("system.images must list icons"))).toBe(true);
  });
});
