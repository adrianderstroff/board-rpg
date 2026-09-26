import { describe, expect, it } from "vitest";
import { readBrpg } from "../../src/content/brpg";
import { Database } from "../../src/core/data/database";
import { validateContent } from "../../src/core/data/validate";
import { NodeTree } from "../node-tree";
import { ProjectStore } from "./storage/ops";

describe("playing a .brpg (distribution.md §2)", () => {
  it("an exported project reads back as valid content, every asset it uses from the file", async () => {
    const game = readBrpg(await new ProjectStore(new NodeTree(".")).exportProject("demo"));
    expect(game.name).toBe("Board RPG Demo");
    expect(game.id).toBe("board-rpg-demo");
    const db = new Database(game.raw);
    expect(validateContent(db)).toEqual([]);
    // every image the content names is in the file (as a blob: URL)
    const images = [...Object.values(db.graphics.charsets), ...Object.values(db.graphics.faces), ...[...db.chipsets.values()].flatMap((c) => [{ image: c.image }, { image: c.decorImage }])].map((g) => g.image);
    for (const img of images) expect([img, game.assets[img]?.startsWith("blob:")]).toEqual([img, true]);
    expect(game.assets[db.musicPath("lib:village")]).toMatch(/^blob:/);
  });

  it("refuses what isn't a game", () => {
    expect(() => readBrpg(new Uint8Array([1, 2, 3]))).toThrow(/isn't a Board RPG game/);
  });
});
