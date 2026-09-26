import { describe, expect, it } from "vitest";
import { computeStats, createEnemy, enemyRewards, onHitEffect, weaponElement } from "../core/chars/character";
import { board } from "../core/board/board";
import { validateContent } from "../core/data/validate";
import { arena, arenaCtx, testDb } from "./helpers";

describe("enemy levels and equipment (§12.6)", () => {
  it("an enemy placed at a higher level grows its stats and rewards", () => {
    const db = testDb();
    const base = createEnemy(db, "a", "fishfolk");
    const up = createEnemy(db, "b", "fishfolk", 7);
    const s0 = computeStats(db, base);
    const s1 = computeStats(db, up);
    expect(s1.maxHp).toBe(s0.maxHp + 12); // growth 6 per level, two levels
    expect(s1.str).toBe(s0.str + 2); // floor(8 + 1.4 * 2) + spear 6 = 16 vs 14
    expect(up.hp).toBe(s1.maxHp);
    expect(enemyRewards(db, up).exp).toBe(Math.round(20 * 7 / 5));
    // without growth, a level changes nothing but the rewards
    const scorp = createEnemy(db, "c", "sand_scorpion", 9);
    expect(computeStats(db, scorp)).toEqual(computeStats(db, createEnemy(db, "d", "sand_scorpion")));
  });

  it("equipment adds its stats, element and immunities; creatures wear none", () => {
    const db = testDb();
    const fish = createEnemy(db, "a", "fishfolk");
    expect(fish.equipment).toEqual({ weapon: "coral_spear", armor: "scale_vest" });
    const s = computeStats(db, fish);
    expect(s.str).toBe(8 + 6);
    expect(s.def).toBe(5 + 4);
    expect(createEnemy(db, "b", "giant_condor").equipment).toEqual({});
    expect(weaponElement(db, fish)).toBeUndefined();
    expect(onHitEffect(db, fish)).toBeUndefined();
    expect(validateContent(db)).toEqual([]);
  });

  it("map entries place enemies at a level; party members shift alike", () => {
    const ctx = arenaCtx(arena({ enemies: [{ id: "f", enemy: "fishfolk", party: ["bog_toad"], x: 0, y: 0, level: 8 }] }));
    const chars = board(ctx).chars;
    expect(chars["f#0"].level).toBe(8);
    expect(chars["f#1"].level).toBe(ctx.db.enemy("bog_toad").level + 3);
  });

  it("validation catches equipment in the wrong slot", () => {
    const db = testDb();
    db.enemy("fishfolk").equipment = { armor: "coral_spear" };
    expect(validateContent(db).some((p) => p.includes("coral_spear"))).toBe(true);
  });
});
