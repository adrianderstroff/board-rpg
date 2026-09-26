import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { BOX, fitsBox, layoutTokens, previewTokens, textX } from "./layout";

const font = JSON.parse(readFileSync("public/assets/system/font.json", "utf8"));

describe("dialog preview layout (editor-design §10)", () => {
  it("wraps words like the game's text box and says when a line doesn't fit", () => {
    const width = BOX.w - textX(true) - 12;
    const short = layoutTokens(previewTokens("Hello *friend*!", () => undefined), font, width);
    expect(short.lines).toBe(1);
    expect(short.glyphs.find((g) => g.ch === "f")!.style.color).toBe("#feae34");
    const long = layoutTokens(previewTokens("word ".repeat(80), () => undefined), font, width);
    expect(long.lines).toBeGreaterThan(4);
    expect(fitsBox(short.height, true)).toBe(true);
    expect(fitsBox(long.height, true)).toBe(false);
    // explicit line breaks and sample values for placeholders
    expect(layoutTokens(previewTokens("a\nb\nc", () => undefined), font, width).lines).toBe(3);
    expect(layoutTokens(previewTokens("{hero}", (n) => (n === "hero" ? "Aldric" : undefined)), font, width).glyphs.map((g) => g.ch).join("")).toBe("Aldric");
  });
});
