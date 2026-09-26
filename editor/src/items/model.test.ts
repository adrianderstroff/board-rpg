import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { NodeTree } from "../../node-tree";
import { ProjectStore } from "../storage/ops";
import { Project, type FileApi } from "../project";
import { addItem, deleteItem, deriveCategory, ITEMS_FILE, itemSummary, PRESETS, withChange, type Item } from "./model";

function memoryApi(): FileApi {
  const loaded = new ProjectStore(new NodeTree(".")).loadProject("demo");
  return { load: async () => ({ ...(await loaded), music: [] }), save: async () => {} };
}

describe("items (editor-design §8)", () => {
  it("derives the library's categories from the sections (the one override: an ally-targeted battle item)", () => {
    const items = parse(readFileSync("library/v1/data/items.yaml", "utf8")) as Record<string, Item>;
    const differ = Object.entries(items)
      .filter(([, i]) => i.category !== "key" && deriveCategory(i) !== i.category)
      .map(([id]) => id);
    expect(differ).toEqual(["levitation_draught"]);
  });

  it("the category follows the sections while it is the derived one", () => {
    const potion: Item = { name: "P", category: "consumable", price: 1, battle: { target: "ally", effects: [] } };
    // aimed at an enemy → a battle item
    expect(withChange(potion, { ...potion, battle: { target: "enemy", effects: [] } }).category).toBe("battle");
    // an overridden category stays, and so does a quest item
    const odd: Item = { ...potion, category: "battle" };
    expect(withChange(odd, { ...odd, equip: { slot: "weapon", kind: "sword" } }).category).toBe("battle");
    const key: Item = { name: "K", category: "key", price: 0 };
    expect(withChange(key, { ...key, learn: { ability: "x", classes: [] } }).category).toBe("key");
  });

  it("every preset is valid content once added to a project", async () => {
    const p = new Project(memoryApi(), null);
    await p.load();
    const ids = PRESETS.filter((x) => x.id !== "scroll").map((x) => addItem(p, x.item));
    expect(ids[0]).toBe("potion"); // a plain id beside the library's lib:potion
    expect(p.content.problems).toEqual([]);
    expect(p.data<Record<string, Item>>(ITEMS_FILE).potion.battle).toEqual({ target: "ally", effects: [{ type: "heal", base: 50 }] });
    // the second copy of a name gets a free id; delete takes it out again
    expect(addItem(p, PRESETS[0].item)).toBe("potion_2");
    deleteItem(p, "potion_2");
    expect(Object.keys(p.data<Record<string, Item>>(ITEMS_FILE))).not.toContain("potion_2");
  });

  it("says what an item does", () => {
    const bomb = PRESETS.find((x) => x.id === "bomb")!.item;
    expect(itemSummary(bomb)).toEqual(["Battle: all enemies – 40 fire damage"]);
    expect(itemSummary(PRESETS.find((x) => x.id === "sword")!.item)).toEqual(["Equip (weapon, sword): STR +5"]);
  });
});

describe("pattern preview", () => {
  it("shows the cells a range reaches from the user", async () => {
    const { patternOffsets } = await import("./patterns");
    const p = new Project(memoryApi(), null);
    await p.load();
    const db = p.content.db!;
    // adjacent: the user and the 8 cells around
    expect(patternOffsets(db, "lib:adjacent")!.length).toBe(9);
    expect(patternOffsets(db, "lib:range2")!.length).toBe(13);
    expect(patternOffsets(db, "nope")).toBeNull();
  });
});
