import { describe, expect, it } from "vitest";
import { loadDatabase } from "../content/loader";
import { validateContent } from "../core/data/validate";

describe("content", () => {
  it("loads and passes validation", () => {
    const db = loadDatabase();
    expect(db.maps.size).toBeGreaterThanOrEqual(2);
    expect(validateContent(db)).toEqual([]);
  });
});
