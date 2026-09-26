import { describe, expect, it } from "vitest";
import { parseDocument } from "yaml";
import { resourceId, sheetFor } from "./resources";
import { ASSET_PATH } from "./storage/ops";

describe("importing resources (projects.md §6)", () => {
  it("works out a sheet's layout from its size (ASSETS.md)", () => {
    expect(sheetFor("charsets", "charsets/a.png", 72, 128)).toEqual({ entry: { image: "charsets/a.png", frameWidth: 24, frameHeight: 32 } });
    expect(sheetFor("charsets", "charsets/a.png", 70, 128)).toHaveProperty("error");
    expect(sheetFor("battlers", "battlers/h.png", 192, 32)).toEqual({ entry: { image: "battlers/h.png", frameWidth: 32, frameHeight: 32, frames: { idle: 0, idle2: 1, attack: 2, cast: 3, hurt: 4, ko: 5 } } });
    expect(sheetFor("battlers", "battlers/e.png", 192, 48)).toMatchObject({ entry: { frameWidth: 48, frames: { idle: 0, idle2: 1, attack: 2, hurt: 3 } } });
    expect(sheetFor("battlers", "battlers/x.png", 50, 32)).toHaveProperty("error");
    expect(sheetFor("faces", "faces/f.png", 48, 48)).toEqual({ entry: { image: "faces/f.png" } });
    expect(sheetFor("faces", "faces/f.png", 64, 64)).toHaveProperty("warning");
    expect(sheetFor("battlebacks", "battlebacks/b.png", 480, 190)).toEqual({ entry: { image: "battlebacks/b.png", floor: 110 } });
  });

  it("gives imported files free ids from their names", () => {
    expect(resourceId("My Hero.png", () => false)).toBe("my_hero");
    expect(resourceId("hero.png", (id) => id === "hero" || id === "hero_2")).toBe("hero_3");
  });

  it("only takes graphics and music into a project's assets", () => {
    for (const ok of ["charsets/a.png", "faces/b_2.png", "battlebacks/sky.png", "audio/music/theme.wav"]) expect(ASSET_PATH.test(ok)).toBe(true);
    for (const bad of ["../x.png", "charsets/../../x.png", "system/font.png", "charsets/a.gif", "audio/sfx/a.wav", "charsets/A.png"]) expect(ASSET_PATH.test(bad)).toBe(false);
  });

  it("registers into a new graphics file as block YAML", () => {
    const doc = parseDocument("# The project's own graphics.\n");
    doc.setIn(["faces", "hero"], doc.createNode({ image: "faces/hero.png" }));
    expect(doc.toJS()).toEqual({ faces: { hero: { image: "faces/hero.png" } } });
    expect(doc.toString()).toContain("# The project's own graphics.");
  });
});
