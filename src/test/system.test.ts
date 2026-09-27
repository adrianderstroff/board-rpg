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

describe("a project's overrides of library content (projects.md §2)", () => {
  it("replaces library entries, graphics and chipsets under the same ids", () => {
    const roots = { library: "library/v1/assets/", project: "projects/p/assets/" };
    const chip = { image: "chipsets/desert.png", decorImage: "chipsets/desert_decor.png", terrains: { sand: { name: "Sand", frame: 0, walkable: true } }, decor: {} };
    const raw = layeredRaw(
      [
        ["library/v1/data/items.yaml", { potion: { name: "Potion", price: 20 } }],
        ["library/v1/data/graphics.yaml", { charsets: { hero: { image: "charsets/hero.png", frameWidth: 24, frameHeight: 32 } } }],
        ["library/v1/data/chipsets/desert.yaml", chip],
      ],
      [
        ["data/items.yaml", { "lib:potion": { name: "Big Potion", price: 25 } }],
        ["data/graphics.yaml", { charsets: { "lib:hero": { image: "charsets/lib/hero.png", frameWidth: 24, frameHeight: 32 } } }],
        ["data/chipsets/lib/desert.yaml", { ...chip, image: "chipsets/lib/desert.png", terrains: { sand: { name: "Hot Sand", frame: 0, walkable: false } } }],
      ],
      roots,
    );
    expect(raw.items["lib:potion"]).toEqual({ name: "Big Potion", price: 25 });
    expect(raw.graphics.charsets["lib:hero"].image).toBe("projects/p/assets/charsets/lib/hero.png");
    expect(raw.chipsets["lib:desert"].terrains.sand).toMatchObject({ name: "Hot Sand", walkable: false });
    expect(raw.chipsets["lib:desert"].image).toBe("projects/p/assets/chipsets/lib/desert.png");
  });
});
