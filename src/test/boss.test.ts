import { describe, expect, it } from "vitest";
import { chooseAiAction } from "../core/battle/ai";
import { mustPieceOf } from "../core/board/board";
import { resolveEngagement } from "../core/board/engage";
import { battle, finishBattle, isTargetable, nextBattleTurn, performAction, startBattle, swallowedEntry, targetCandidates } from "../core/battle/battle";
import { computeStats, hasStatus } from "../core/chars/character";
import { getChar, type Ctx } from "../core/context";
import type { GameEvent } from "../core/events";
import { arena, arenaCtx } from "./helpers";

/** The Grave Toad (b#0) with its two acolytes (b#1, b#2) against the four heroes. */
function bossFight(seed = 42): Ctx {
  const ctx = arenaCtx(arena({ enemies: [{ id: "b", enemy: "grave_toad", party: ["bone_acolyte", "bone_acolyte"], x: 0, y: 0 }] }), seed);
  startBattle(ctx, { kind: "normal", heroes: ["aldric", "mira", "kit", "tarek"], enemies: ["b#0", "b#1", "b#2"], battleback: "cave" });
  return ctx;
}

/** Plays turns (heroes wait) until `id` is about to act; returns that turn's events. */
function untilTurnOf(ctx: Ctx, id: string, log: GameEvent[] = []): GameEvent[] {
  for (let guard = 0; guard < 50; guard++) {
    const t = nextBattleTurn(ctx);
    log.push(...t.events);
    if (t.actor === id) return log;
    if (!t.actor) throw new Error("battle ended");
    log.push(...performAction(ctx, t.actor, { type: "wait" }));
  }
  throw new Error(`${id} never acted`);
}

describe("the Grave Toad (§12.7)", () => {
  it("swallows a hero: out of reach, no turns; digests half, then the rest and spits it out", () => {
    const ctx = bossFight();
    const mira = getChar(ctx, "mira");
    const toad = getChar(ctx, "b#0");
    toad.hp -= 200; // room to heal
    untilTurnOf(ctx, "b#0");
    const hp0 = mira.hp;
    const mp0 = mira.mp;
    const toadHp0 = toad.hp;
    const ev = performAction(ctx, "b#0", { type: "ability", ability: "swallow", target: "mira" });
    expect(ev.some((e) => e.type === "swallow")).toBe(true);
    const s = swallowedEntry(ctx, "mira")!;
    expect(s.hp).toBe(Math.floor(hp0 / 2));
    expect(s.mp).toBe(Math.floor(mp0 * 0.3));
    // nobody can reach mira, not even her friends
    expect(targetCandidates(ctx, "b#1", "enemy")).not.toContain("mira");
    expect(targetCandidates(ctx, "aldric", "ally")).not.toContain("mira");
    expect(isTargetable(ctx, "aldric", "mira")).toBe(false);
    // the toad's next turn is forced: digest half
    const log = untilTurnOf(ctx, "b#0");
    expect(chooseAiAction(ctx, "b#0")).toEqual({ type: "digest" });
    performAction(ctx, "b#0", { type: "digest" });
    expect(toad.hp).toBe(toadHp0 + Math.ceil(s.hp / 2));
    expect(mira.hp).toBe(hp0); // nothing taken yet
    // the turn after: the rest, then out she comes with the full loss
    untilTurnOf(ctx, "b#0", log);
    expect(log.some((e) => e.type === "turnSkipped" && e.actor === "mira")).toBe(true); // no turns inside
    const spit = performAction(ctx, "b#0", chooseAiAction(ctx, "b#0"));
    expect(spit.find((e) => e.type === "spit")).toMatchObject({ target: "mira", hp: s.hp, mp: s.mp });
    expect(toad.hp).toBe(toadHp0 + s.hp);
    expect(mira.hp).toBe(hp0 - s.hp);
    expect(mira.mp).toBe(mp0 - s.mp);
    expect(swallowedEntry(ctx, "mira")).toBeUndefined();
    expect(isTargetable(ctx, "b#1", "mira")).toBe(true);
  });

  it("releases a swallowed hero unharmed when it falls; never swallows the last one standing", () => {
    const ctx = bossFight();
    const kit = getChar(ctx, "kit");
    untilTurnOf(ctx, "b#0");
    const hp0 = kit.hp;
    performAction(ctx, "b#0", { type: "ability", ability: "swallow", target: "kit" });
    const t = nextBattleTurn(ctx);
    getChar(ctx, "b#0").hp = 1;
    const ev = [...t.events];
    if (t.actor === "aldric") ev.push(...performAction(ctx, "aldric", { type: "attack", target: "b#0" }));
    else {
      getChar(ctx, "b#0").hp = 0; // any blow will do
      ev.push(...performAction(ctx, t.actor!, { type: "wait" }));
    }
    expect(ev.some((e) => e.type === "release" && e.target === "kit")).toBe(true);
    expect(swallowedEntry(ctx, "kit")).toBeUndefined();
    expect(kit.hp).toBe(hp0);

    const lone = bossFight();
    for (const id of ["mira", "kit", "tarek"]) getChar(lone, id).hp = 0;
    expect(chooseAiAction(lone, "b#0")).not.toMatchObject({ ability: "swallow" });
  });

  it("acolytes bless their master before they fight", () => {
    const ctx = bossFight();
    const toad = getChar(ctx, "b#0");
    expect(chooseAiAction(ctx, "b#1")).toEqual({ type: "ability", ability: "dark_blessing", target: "b#0" });
    performAction(ctx, "b#1", chooseAiAction(ctx, "b#1"));
    expect(hasStatus(toad, "empowered")).toBe(true);
    expect(chooseAiAction(ctx, "b#2")).toEqual({ type: "ability", ability: "bone_ward", target: "b#0" });
    performAction(ctx, "b#2", chooseAiAction(ctx, "b#2"));
    for (let i = 0; i < 10; i++) expect(["attack", "bone_bolt"]).toContain(((a) => (a.type === "ability" ? a.ability : a.type))(chooseAiAction(ctx, "b#1")));
  });

  it("raises new acolytes for gold once both have fallen, and pays for them out of the reward", () => {
    const ctx = bossFight();
    getChar(ctx, "b#1").hp = 0;
    getChar(ctx, "b#2").hp = 0;
    let raised = 0;
    for (let i = 0; i < 40 && !raised; i++) {
      const a = chooseAiAction(ctx, "b#0");
      if (a.type === "ability" && a.ability === "raise_dead") raised = i + 1;
    }
    expect(raised).toBeGreaterThan(0);
    const ev = performAction(ctx, "b#0", { type: "ability", ability: "raise_dead" });
    const s = ev.find((e) => e.type === "summoned");
    expect(s).toMatchObject({ cost: 120 });
    const b = battle(ctx);
    const fresh = b.combatants.filter((c) => c.summoned);
    expect(fresh.map((c) => c.slot).sort()).toEqual([1, 2]); // in the places of the fallen
    expect(fresh.every((c) => getChar(ctx, c.id).hp === computeStats(ctx.db, getChar(ctx, c.id)).maxHp)).toBe(true);
    for (const c of b.combatants.filter((x) => x.side === "enemy")) getChar(ctx, c.id).hp = 0;
    const t = nextBattleTurn(ctx);
    if (t.actor) performAction(ctx, t.actor, { type: "wait" });
    expect(b.result).toBe("victory");
    expect(b.rewards!.gold).toBe(480 + 20 + 20 - 120);
    // the summoned ones only lived for this battle: resolving it on the board must not look for them
    const hero = mustPieceOf(ctx, "aldric");
    b.source = { attackerPiece: hero.id, attackerFaction: "hero", defenderPieces: ["e:b"], origin: { x: hero.x, y: hero.y }, cell: { x: 0, y: 0 }, path: [], mode: "walk" };
    expect(() => resolveEngagement(ctx, finishBattle(ctx))).not.toThrow();
  });
});
