import { describe, expect, it } from "vitest";
import { NodeTree } from "../../node-tree";
import { ProjectStore } from "../storage/ops";
import { Project, type FileApi } from "../project";
import { ABILITY_PRESETS, abilityUsers, addAbility, EMPTY_ABILITY } from "./model";
import { shopUsers } from "../shops/model";
import { useSummary } from "../items/model";

function memoryApi(): FileApi {
  const loaded = new ProjectStore(new NodeTree(".")).loadProject("demo");
  return { load: async () => ({ ...(await loaded), music: [] }), save: async () => {} };
}

describe("abilities and shops (editor-design §10)", () => {
  it("every preset (and an empty one) is valid content", async () => {
    const p = new Project(memoryApi(), null);
    await p.load();
    for (const a of [EMPTY_ABILITY, ...ABILITY_PRESETS.map((x) => x.ability)]) addAbility(p, a);
    expect(p.content.problems).toEqual([]);
    expect(Object.keys(p.data<Record<string, unknown>>("data/abilities.yaml"))).toContain("strike");
  });

  it("knows who has an ability and where a shop is opened", async () => {
    const p = new Project(memoryApi(), null);
    await p.load();
    const raw = p.content.raw;
    expect(abilityUsers(raw, "lib:cleave")).toContainEqual({ kind: "class", id: "lib:knight", how: "at level 1" });
    expect(abilityUsers(raw, "lib:fire").some((u) => u.kind === "item" && u.how === "while equipped")).toBe(true); // the Flame Blade
    expect(abilityUsers(raw, "lib:venom_spit")).toContainEqual({ kind: "enemy", id: "lib:sand_scorpion", how: "on the board" });
    expect(shopUsers(raw, "sandhollow_smith").map((u) => u.map)).toEqual(["sandhollow"]);
  });

  it("says a swallow skill in words", () => {
    expect(useSummary({ target: "enemy", effects: [], swallow: { hp: 0.5, mp: 0.3 } }, undefined)).toEqual(["Battle: one enemy – swallows"]);
  });
});

describe("settings (editor-design §10)", () => {
  it("the EXP curve and the damage example use the game's formulas", async () => {
    const { expFor } = await import("../screens/SettingsScreen");
    const { expForLevel } = await import("../../../src/core/chars/character");
    const { damageScale } = await import("../../../src/core/effects/formulas");
    const p = new Project(memoryApi(), null);
    await p.load();
    const db = p.content.db!;
    for (const l of [1, 2, 10, 50]) expect(expFor(db.config, l)).toBe(expForLevel(db, l));
    expect(damageScale({ defenseScale: 24, damageFactor: 1.4 }, 9)).toBeCloseTo((24 / 33) * 1.4);
  });
});
