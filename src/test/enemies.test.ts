import { describe, expect, it } from "vitest";
import { computeStats, createEnemy, enemyRewards, onHitEffect, weaponElement } from "../core/chars/character";
import { board } from "../core/board/board";
import { validateContent } from "../core/data/validate";
import { arena, arenaCtx, testDb } from "./helpers";

describe("enemy levels and equipment (§12.6)", () => {
  it("an enemy placed at a higher level grows its stats and rewards", () => {
    const db = testDb();
    const base = createEnemy(db, "a", "lib:fishfolk");
    const up = createEnemy(db, "b", "lib:fishfolk", 7);
    const s0 = computeStats(db, base);
    const s1 = computeStats(db, up);
    expect(s1.maxHp).toBe(s0.maxHp + 12); // growth 6 per level, two levels
    expect(s1.str).toBe(s0.str + 2); // floor(8 + 1.4 * 2) + spear 6 = 16 vs 14
    expect(up.hp).toBe(s1.maxHp);
    expect(enemyRewards(db, up).exp).toBe(Math.round(20 * 7 / 5));
    // without growth, a level changes nothing but the rewards
    const scorp = createEnemy(db, "c", "lib:sand_scorpion", 9);
    expect(computeStats(db, scorp)).toEqual(computeStats(db, createEnemy(db, "d", "lib:sand_scorpion")));
  });

  it("equipment adds its stats, element and immunities; creatures wear none", () => {
    const db = testDb();
    const fish = createEnemy(db, "a", "lib:fishfolk");
    expect(fish.equipment).toEqual({ weapon: "lib:coral_spear", armor: "lib:scale_vest" });
    const s = computeStats(db, fish);
    expect(s.str).toBe(8 + 6);
    expect(s.def).toBe(5 + 4);
    expect(createEnemy(db, "b", "lib:giant_condor").equipment).toEqual({});
    expect(weaponElement(db, fish)).toBeUndefined();
    expect(onHitEffect(db, fish)).toBeUndefined();
    expect(validateContent(db)).toEqual([]);
  });

  it("map entries place enemies at a level; party members shift alike", () => {
    const ctx = arenaCtx(arena({ enemies: [{ id: "f", enemy: "lib:fishfolk", party: ["lib:bog_toad"], x: 0, y: 0, level: 8 }] }));
    const chars = board(ctx).chars;
    expect(chars["f#0"].level).toBe(8);
    expect(chars["f#1"].level).toBe(ctx.db.enemy("lib:bog_toad").level + 3);
  });

  it("validation catches equipment in the wrong slot", () => {
    const db = testDb();
    db.enemy("lib:fishfolk").equipment = { armor: "lib:coral_spear" };
    expect(validateContent(db).some((p) => p.includes("lib:coral_spear"))).toBe(true);
  });
});

describe("enemies use their own items (§12.5)", () => {
  it("an AI item rule uses one of what the enemy carries; each use takes one, then the rule is out", async () => {
    const { chooseAiAction } = await import("../core/battle/ai");
    const { enemyItemsLeft, nextBattleTurn, performAction, startBattle } = await import("../core/battle/battle");
    const { getChar } = await import("../core/context");
    const ctx = arenaCtx(arena({ enemies: [{ id: "s", enemy: "lib:sand_scorpion", x: 0, y: 0 }] }));
    const def = ctx.db.enemy("lib:sand_scorpion");
    const saved = { ai: def.ai, items: def.items };
    try {
      def.items = [{ item: "lib:potion", count: 1 }];
      def.ai = [{ action: "item", item: "lib:potion", weight: 1 }];
      expect(validateContent(ctx.db)).toEqual([]);
      startBattle(ctx, { kind: "normal", heroes: ["lib:aldric"], enemies: ["s#0"], battleback: "lib:desert" });
      const me = getChar(ctx, "s#0");
      me.hp -= 20;
      const hp = me.hp;
      const inventory = { ...ctx.state.inventory };
      const act = chooseAiAction(ctx, "s#0");
      expect(act).toEqual({ type: "item", item: "lib:potion", target: "s#0" }); // its only ally: itself
      nextBattleTurn(ctx);
      performAction(ctx, "s#0", act);
      expect(me.hp).toBe(hp + 20);
      expect(enemyItemsLeft(ctx, "s#0", "lib:potion")).toBe(0);
      expect(ctx.state.inventory).toEqual(inventory); // the party's potions are untouched
      // nothing left: it falls back to attacking
      expect(chooseAiAction(ctx, "s#0").type).toBe("attack");
      // an item rule for something it doesn't carry is a content problem
      def.items = [];
      expect(validateContent(ctx.db)).toContain('enemy lib:sand_scorpion: AI uses "lib:potion", which it doesn\'t carry (items)');
    } finally {
      Object.assign(def, saved);
    }
  });
});

describe("immunities", () => {
  it("an enemy's and an item's immunities keep the status off (library ids)", async () => {
    const { isImmune, createHero } = await import("../core/chars/character");
    const db = testDb();
    expect(isImmune(db, createEnemy(db, "a", "lib:skeleton"), "lib:poison")).toBe(true);
    expect(isImmune(db, createEnemy(db, "b", "lib:emperor_scorpion"), "lib:sleep")).toBe(true);
    const kit = createHero(db, "lib:kit");
    const charm = [...db.items.values()].find((i) => i.equip?.immune?.includes("lib:poison") && i.equip.slot === "accessory")!;
    kit.equipment.accessory = charm.id;
    expect(isImmune(db, kit, "lib:poison")).toBe(true);
  });
});
