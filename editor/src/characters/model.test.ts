import { describe, expect, it } from "vitest";
import { NodeTree } from "../../node-tree";
import { ProjectStore } from "../storage/ops";
import { Project, type FileApi } from "../project";
import { addEntry } from "../forms/entries";
import { aiRuleText, classUsers, ENEMIES_FILE, enemyStatsAt, header, HEROES_FILE, heroStatTable, newEnemy, newHero, newNpc, npcPlacements, NPCS_FILE } from "./model";

function memoryApi(): FileApi {
  const loaded = new ProjectStore(new NodeTree(".")).loadProject("demo");
  return { load: async () => ({ ...(await loaded), music: [] }), save: async () => {} };
}

async function demo() {
  const p = new Project(memoryApi(), null);
  await p.load();
  return p;
}

describe("characters (editor-design §7)", () => {
  it("a hero's stats by level follow the class and its equipment", async () => {
    const p = await demo();
    const table = heroStatTable(p.content.db!, "lib:aldric");
    expect(table.map((r) => r.level)).toEqual([1, 5, 10, 20, 30, 40, 50]);
    // knight: 42 HP + 7 per level; the chain mail adds DEF
    expect(table[0].stats.maxHp).toBe(42);
    expect(table[1].stats.maxHp).toBe(42 + 7 * 4);
    expect(table[0].stats.def).toBeGreaterThan(11);
    // an enemy with growth at another level
    expect(enemyStatsAt(p.content.db!, "lib:fishfolk", 7).maxHp).toBe(enemyStatsAt(p.content.db!, "lib:fishfolk").maxHp + 12);
  });

  it("knows who shares a class and where an NPC stands", async () => {
    const p = await demo();
    expect(classUsers(p.content.raw, "lib:knight")).toEqual(["lib:aldric"]);
    expect(npcPlacements(p.content.raw, "smith")).toContainEqual({ map: "sandhollow", entity: expect.any(String), index: expect.any(Number) });
  });

  it("says an AI rule in words", () => {
    expect(aiRuleText({ action: "lib:heal", weight: 2, when: { hpBelow: 0.5, chance: 0.3 }, target: "lowestHp" })).toBe("Weight 2, when HP < 50 %, 30 % chance: heal on the weakest");
    expect(aiRuleText({ action: "item", item: "lib:potion", weight: 1, priority: true })).toBe("First: Use potion");
  });

  it("new heroes, enemies and NPCs are valid content", async () => {
    const p = await demo();
    const raw = p.content.raw;
    addEntry(p, HEROES_FILE, header("heroes"), newHero(raw), (x) => x in p.content.raw.heroes, "New hero");
    addEntry(p, ENEMIES_FILE, header("enemies"), newEnemy(raw), (x) => x in p.content.raw.enemies, "New enemy");
    addEntry(p, NPCS_FILE, header("NPCs"), newNpc(raw), (x) => x in p.content.raw.npcs, "New NPC");
    expect(Object.keys(p.content.raw.heroes)).toContain("new_hero");
    expect(p.content.problems).toEqual([]);
  });
});
