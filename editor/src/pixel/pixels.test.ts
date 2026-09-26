import { describe, expect, it } from "vitest";
import { blank, colorsIn, fill, flip, frameRect, get, grow, line, plot, rect, same, shift, TRANSPARENT, type Rgba } from "./pixels";

const RED: Rgba = [228, 59, 68, 255];
const BLUE: Rgba = [0, 153, 219, 255];

describe("pixel operations (graphics.md §5)", () => {
  it("draws only inside the frame, mirrored when asked", () => {
    const p = blank(8, 4);
    const frame = frameRect(1, 4, 4, 2); // the right half
    line(p, 0, 0, 7, 0, RED, frame);
    expect(same(get(p, 3, 0), TRANSPARENT)).toBe(true);
    expect(get(p, 4, 0)).toEqual(RED);
    plot(p, 4, 2, BLUE, frame, true);
    expect(get(p, 7, 2)).toEqual(BLUE); // its mirror in the frame
  });

  it("fills an area of one colour, not across a border", () => {
    const p = blank(5, 5);
    const all = { x: 0, y: 0, w: 5, h: 5 };
    rect(p, 1, 1, 3, 3, RED, all, false);
    expect(fill(p, 2, 2, BLUE, all)).toBe(1); // the inside is one pixel
    expect(fill(p, 0, 0, BLUE, all)).toBe(16); // the outside ring
    expect(get(p, 1, 1)).toEqual(RED);
  });

  it("flips, shifts, counts colours and grows", () => {
    const p = blank(4, 1);
    const r = { x: 0, y: 0, w: 4, h: 1 };
    plot(p, 0, 0, RED, r);
    flip(p, r, "x");
    expect(get(p, 3, 0)).toEqual(RED);
    shift(p, r, 1, 0);
    expect(get(p, 0, 0)).toEqual(RED); // wrapped around
    plot(p, 2, 0, BLUE, r);
    plot(p, 3, 0, BLUE, r);
    expect(colorsIn(p)).toEqual([BLUE, RED]);
    const g = grow(p, 8, 2);
    expect([g.width, g.height]).toEqual([8, 2]);
    expect(get(g, 0, 0)).toEqual(RED);
  });
});
