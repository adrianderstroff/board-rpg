import { describe, expect, it } from "vitest";
import { board, mustPieceOf, pieceReach, piecesAt, reconcile } from "../core/board/board";
import { getGrid } from "../core/board/grid";
import { leapOffsets, resolveMoves, resolvePatternRef } from "../core/board/patterns";
import { executeMove, moveOptions } from "../core/board/moves";
import { endTurn, nextTurn, turnQueue } from "../core/board/turns";
import { canUseBoardAbility, joinParty, leaveParty, useBoardAbility, useBoardItem } from "../core/board/actions";
import { engage, resolveEngagement } from "../core/board/engage";
import { chooseAiAction } from "../core/battle/ai";
import { finishBattle, nextBattleTurn, performAction } from "../core/battle/battle";
import { hasStatus } from "../core/chars/character";
import { getChar, type Ctx } from "../core/context";
import { key } from "../core/util/grid";
import { arena, arenaCtx } from "./helpers";

/** Turn-based arena: a far-away scorpion keeps the board out of free exploration (§8.10). */
const WATCHED = { enemies: [{ id: "w", enemy: "sand_scorpion", x: 0, y: 0 }] };

/** Splits the starting party so each hero stands alone on (3,3). */
function splitAll(ctx: Ctx) {
  for (const id of ["mira", "kit", "tarek"]) leaveParty(ctx, id);
}

function place(ctx: Ctx, charId: string, x: number, y: number) {
  const p = mustPieceOf(ctx, charId);
  p.x = x;
  p.y = y;
}

describe("patterns", () => {
  it("knight leaps in 8 L-shapes", () => {
    expect(leapOffsets({ leap: [[1, 2]], symmetric: true })).toHaveLength(8);
  });

  it("rays stop at height differences above 1", () => {
    const ctx = arenaCtx(arena({ height: "0000000\n0000000\n0000000\n0002000\n0000000\n0000000\n0000000" }));
    const g = getGrid(ctx.db, "arena");
    const rook = resolvePatternRef(ctx.db, "rook3");
    const moves = resolveMoves({ grid: g, origin: { x: 3, y: 0 }, pattern: rook, occupancy: () => "free" });
    expect(moves.has(key({ x: 3, y: 2 }))).toBe(true);
    expect(moves.has(key({ x: 3, y: 3 }))).toBe(false); // height 2 wall
  });

  it("party reach is the smallest member reach and moves are unioned", () => {
    const ctx = arenaCtx(arena(WATCHED));
    const party = mustPieceOf(ctx, "aldric");
    expect(party.members).toHaveLength(4);
    expect(pieceReach(ctx, party)).toBe(2); // knight 2, magician 2, thief 3, monk 3
    const opts = moveOptions(ctx, "aldric");
    expect(opts.has(key({ x: 4, y: 5 }))).toBe(true); // knight leap
    expect(opts.has(key({ x: 5, y: 5 }))).toBe(true); // thief/magician diagonal 2
    expect(opts.has(key({ x: 6, y: 3 }))).toBe(false); // thief would reach 3, cut to 2
  });
});

describe("turns & parties", () => {
  it("a party acts consecutively at its slowest member's speed", () => {
    const ctx = arenaCtx();
    const q = turnQueue(ctx);
    expect(q).toHaveLength(4);
    // one slot → all four heroes adjacent in the queue, fastest (thief) first
    expect(q[0]).toBe("kit");
  });

  it("a party moves once; other members can't move afterwards", () => {
    const ctx = arenaCtx(arena(WATCHED));
    executeMove(ctx, "kit", { x: 3, y: 4 });
    endTurn(ctx, "kit");
    expect(moveOptions(ctx, "aldric").size).toBe(0);
  });

  it("leaving keeps the leaver on the cell; joining merges again", () => {
    const ctx = arenaCtx();
    leaveParty(ctx, "kit");
    expect(piecesAt(ctx, { x: 3, y: 3 })).toHaveLength(2);
    joinParty(ctx, "kit", mustPieceOf(ctx, "aldric"));
    expect(piecesAt(ctx, { x: 3, y: 3 })).toHaveLength(1);
  });
});

describe("field effects", () => {
  it("frozen cells make pieces slide until solid ground", () => {
    const ctx = arenaCtx(arena({ terrain: "sssssss\nsssssss\nsssssss\nsssiiis\nsssssss\nsssssss\nsssssss" }));
    splitAll(ctx);
    place(ctx, "aldric", 0, 0);
    place(ctx, "mira", 0, 1);
    place(ctx, "kit", 0, 2);
    place(ctx, "tarek", 1, 3);
    const res = executeMove(ctx, "tarek", { x: 3, y: 3 });
    expect(res.final).toEqual({ x: 6, y: 3 }); // slid over (4,3),(5,3) onto sand (6,3)
  });

  it("quicksand makes you stuck and reduces reach", () => {
    const ctx = arenaCtx(arena({ terrain: "sssssss\nsssssss\nsssssss\nsssssqs\nsssssss\nsssssss\nsssssss" }));
    splitAll(ctx);
    executeMove(ctx, "tarek", { x: 5, y: 3 });
    const tarek = getChar(ctx, "tarek");
    expect(hasStatus(tarek, "stuck")).toBe(true);
    expect(pieceReach(ctx, mustPieceOf(ctx, "tarek"))).toBe(2);
  });

  it("burning damages on landing but never KOs heroes on the board", () => {
    const ctx = arenaCtx();
    splitAll(ctx);
    board(ctx).fieldEffects.push({ x: 3, y: 5, effect: "burning", rounds: 3 });
    const mira = getChar(ctx, "mira");
    mira.hp = 1;
    place(ctx, "mira", 3, 4);
    executeMove(ctx, "mira", { x: 3, y: 5 });
    expect(mira.hp).toBe(1);
  });

  it("fire on the board creates a burning cell", () => {
    const ctx = arenaCtx();
    splitAll(ctx);
    useBoardAbility(ctx, "mira", "fire", { x: 5, y: 3 });
    expect(board(ctx).fieldEffects).toContainEqual({ x: 5, y: 3, effect: "burning", rounds: 3 });
  });
});

describe("fallen heroes", () => {
  it("stay on their cell and are revived there", () => {
    const ctx = arenaCtx();
    splitAll(ctx);
    place(ctx, "kit", 4, 3);
    getChar(ctx, "kit").hp = 0;
    reconcile(ctx);
    const fallen = piecesAt(ctx, { x: 4, y: 3 }, { includeFallen: true });
    expect(fallen).toHaveLength(1);
    expect(fallen[0].fallen).toBe(true);
    useBoardItem(ctx, "aldric", "phoenix_feather", { x: 4, y: 3 });
    const revived = piecesAt(ctx, { x: 4, y: 3 });
    expect(revived[0].members).toEqual(["kit"]);
    expect(getChar(ctx, "kit").hp).toBeGreaterThan(0);
  });
});

describe("engagement", () => {
  it("moving onto an enemy starts a battle; winning captures the cell", () => {
    const ctx = arenaCtx(arena({ enemies: [{ id: "s1", enemy: "sand_scorpion", x: 3, y: 5 }] }));
    const opts = moveOptions(ctx, "aldric");
    expect(opts.get(key({ x: 3, y: 5 }))?.kind).toBe("engage");
    const b = engage(ctx, "aldric", { x: 3, y: 5 });
    expect(b.combatants.filter((c) => c.side === "hero")).toHaveLength(4);
    // Heroes just attack until the battle ends.
    for (let i = 0; i < 100 && !b.result; i++) {
      const t = nextBattleTurn(ctx);
      if (!t.actor) break;
      performAction(ctx, t.actor, chooseAiAction(ctx, t.actor));
    }
    expect(b.result).toBe("victory");
    finishBattle(ctx);
    resolveEngagement(ctx, b);
    expect(mustPieceOf(ctx, "aldric")).toMatchObject({ x: 3, y: 5 });
    expect(ctx.state.maps.arena.defeated).toContain("s1");
    expect(ctx.state.records.kills.sand_scorpion).toBe(1);
  });
});

describe("targetable NPCs (§8.9)", () => {
  it("enemies can attack a targetable NPC; the fight is auto-resolved", async () => {
    const { autoResolve } = await import("../core/battle/ai");
    const { isAutoBattle } = await import("../core/battle/battle");
    const ctx = arenaCtx(
      arena({
        enemies: [{ id: "e1", enemy: "emperor_scorpion", x: 1, y: 1 }],
        events: [{ id: "trader", x: 1, y: 2, pages: [{ npc: "trader", dialog: "trader_help" }] }],
      }),
    );
    const opts = moveOptions(ctx, "e1#0");
    expect(opts.get(key({ x: 1, y: 2 }))?.kind).toBe("engage");
    // heroes never "engage" NPCs – they interact
    splitAll(ctx);
    place(ctx, "kit", 1, 4);
    expect(moveOptions(ctx, "kit").get(key({ x: 1, y: 2 }))?.kind).toBe("interact");

    engage(ctx, "e1#0", { x: 1, y: 2 });
    expect(isAutoBattle(ctx)).toBe(true);
    autoResolve(ctx);
    const b = finishBattle(ctx);
    expect(b.result).toBe("defeat"); // the boss crushes the trader
    resolveEngagement(ctx, b);
    expect(piecesAt(ctx, { x: 1, y: 2 })[0]?.id).toBe("e:e1"); // captured the cell
    expect(ctx.state.maps.arena.removedEvents).toContain("trader");
  });
});

describe("enemy board AI (§8.7, §12.5)", () => {
  it("pack enemies join an adjacent ally when heroes are near", async () => {
    const { planPreActions } = await import("../core/board/ai");
    const ctx = arenaCtx(
      arena({
        enemies: [
          { id: "c1", enemy: "giant_condor", x: 0, y: 0 },
          { id: "c2", enemy: "giant_condor", x: 1, y: 0 },
        ],
      }),
    );
    // keep heroes out of flight range so joining beats engaging
    place(ctx, "aldric", 6, 6);
    const plan = planPreActions(ctx, "c1#0");
    expect(plan[0]).toEqual({ type: "join", target: { x: 1, y: 0 } });
    useBoardAbility(ctx, "c1#0", "join_party", plan[0].type === "join" ? plan[0].target : undefined);
    expect(mustPieceOf(ctx, "c1#0").members).toEqual(["c2#0", "c1#0"]);
  });

  it("a stuck member leaves its party so the others can move", async () => {
    const { planPreActions } = await import("../core/board/ai");
    const { addStatus } = await import("../core/chars/character");
    const ctx = arenaCtx(arena({ enemies: [{ id: "p", enemy: "sand_scorpion", party: ["sand_scorpion"], x: 0, y: 0 }] }));
    // Make this member immobile (reach 0) while its partner can still move.
    ctx.db.statuses.set("rooted", { ...ctx.db.status("stuck"), id: "rooted", reachModifier: -5 });
    addStatus(ctx, getChar(ctx, "p#0"), "rooted", 2);
    const plan = planPreActions(ctx, "p#0");
    expect(plan).toEqual([{ type: "leave" }]);
  });

  it("enemies use board abilities on heroes", async () => {
    const { planPreActions } = await import("../core/board/ai");
    const ctx = arenaCtx(arena({ enemies: [{ id: "boss", enemy: "emperor_scorpion", x: 3, y: 1 }] }));
    ctx.rng.chance = () => true; // always try
    const plan = planPreActions(ctx, "boss#0");
    expect(plan[0]).toMatchObject({ type: "ability", ability: "quake", target: { x: 3, y: 3 } });
    useBoardAbility(ctx, "boss#0", "quake", { x: 3, y: 3 });
    expect(board(ctx).fieldEffects.some((f) => f.x === 3 && f.y === 3 && f.effect === "sticky")).toBe(true);
  });
});

describe("NPCs on the board (§8.3, §8.8)", () => {
  const villager = (x: number, y: number) => ({ id: "v", x, y, pages: [{ npc: "villager_m", dialog: "villager_1" }] });

  it("heroes walk through villagers and interact by stepping onto their cell", () => {
    const ctx = arenaCtx(arena({ events: [villager(4, 3)] }));
    splitAll(ctx);
    const opts = moveOptions(ctx, "tarek"); // rook3 from (3,3)
    expect(opts.get(key({ x: 4, y: 3 }))).toMatchObject({ kind: "interact", approach: { x: 4, y: 3 } });
    expect(opts.get(key({ x: 5, y: 3 }))?.kind).toBe("move"); // passes through the villager
    executeMove(ctx, "tarek", { x: 4, y: 3 });
    expect(mustPieceOf(ctx, "tarek")).toMatchObject({ x: 4, y: 3 });
  });

  it("standing on a villager's cell doesn't protect heroes from enemies", () => {
    const ctx = arenaCtx(arena({ events: [villager(3, 5)], enemies: [{ id: "s", enemy: "emperor_scorpion", x: 3, y: 6 }] }));
    splitAll(ctx);
    place(ctx, "kit", 3, 5);
    expect(moveOptions(ctx, "s#0").get(key({ x: 3, y: 5 }))?.kind).toBe("engage");
  });

  it("objects like chests stay solid", () => {
    const ctx = arenaCtx(arena({ ...WATCHED, events: [{ id: "c", x: 4, y: 3, pages: [{ decor: "chest_closed", dialog: "chest_charm" }] }] }));
    splitAll(ctx);
    const opts = moveOptions(ctx, "tarek");
    expect(opts.get(key({ x: 4, y: 3 }))?.kind).toBe("interact");
    expect(opts.has(key({ x: 5, y: 3 }))).toBe(false);
  });
});

describe("flying & field effects per group", () => {
  it("flying pieces ignore field effects, traps and ice; a party flies only if everyone flies", async () => {
    const { addStatus } = await import("../core/chars/character");
    const { isFlyingPiece } = await import("../core/board/moves");
    const ctx = arenaCtx(arena({ terrain: "sssssss\nsssssss\nsssssss\nsssiiis\nsssssss\nsssssss\nsssssss" }));
    const party = mustPieceOf(ctx, "aldric");
    for (const id of ["aldric", "mira", "kit"]) addStatus(ctx, getChar(ctx, id), "flying");
    expect(isFlyingPiece(ctx, party)).toBe(false); // Tarek walks
    addStatus(ctx, getChar(ctx, "tarek"), "flying");
    expect(isFlyingPiece(ctx, party)).toBe(true);
    board(ctx).fieldEffects.push({ x: 4, y: 3, effect: "burning", rounds: 3 });
    const hp = getChar(ctx, "kit").hp;
    place(ctx, "aldric", 2, 3);
    const res = executeMove(ctx, "aldric", { x: 4, y: 3 }); // burning + ice
    expect(res.final).toEqual({ x: 4, y: 3 }); // no sliding
    expect(getChar(ctx, "kit").hp).toBe(hp); // no burn
  });

  it("condors fly permanently", () => {
    const ctx = arenaCtx(arena({ enemies: [{ id: "c", enemy: "giant_condor", x: 0, y: 0 }] }));
    expect(getChar(ctx, "c#0").statuses.some((s) => s.id === "flying")).toBe(true);
  });

  it("a cell's effect hits a party once per round, at the start of its anchor's turn (who moved it)", () => {
    const ctx = arenaCtx(arena(WATCHED));
    board(ctx).fieldEffects.push({ x: 3, y: 3, effect: "burning", rounds: 9 });
    mustPieceOf(ctx, "aldric").anchor = "tarek"; // Tarek moved the party onto the fire
    const hits: Record<string, number> = {};
    for (let i = 0; i < 8; i++) {
      const { actor, events } = nextTurn(ctx);
      if (!actor) break;
      hits[actor] = (hits[actor] ?? 0) + events.filter((e) => e.type === "damage").length;
      endTurn(ctx, actor);
    }
    expect(hits.tarek).toBe(8); // 4 members, twice (two rounds) – always at Tarek's turn
    expect((hits.kit ?? 0) + (hits.aldric ?? 0) + (hits.mira ?? 0)).toBe(0);
  });

  it("walking through a burning cell hurts on the way; the anchor passes on when it leaves", () => {
    const ctx = arenaCtx(arena(WATCHED));
    board(ctx).fieldEffects.push({ x: 3, y: 2, effect: "burning", rounds: 9 });
    const hp = getChar(ctx, "mira").hp;
    const res = executeMove(ctx, "kit", { x: 3, y: 1 });
    expect(res.events.filter((e) => e.type === "damage").length).toBe(4); // crossed (3,2)
    expect(getChar(ctx, "mira").hp).toBeLessThan(hp);
    expect(mustPieceOf(ctx, "aldric").anchor).toBe("kit");
    const order = mustPieceOf(ctx, "aldric").members.slice();
    leaveParty(ctx, "kit");
    expect(mustPieceOf(ctx, "aldric").anchor).toBe(order[order.indexOf("kit") + 1] ?? order[0]);
    expect(mustPieceOf(ctx, "kit").anchor).toBe("kit");
  });
});

describe("battle: defend", () => {
  it("defending raises defense until the defender's next turn", async () => {
    const { startBattle, performAction, nextBattleTurn } = await import("../core/battle/battle");
    const { effectiveStats } = await import("../core/chars/character");
    const ctx = arenaCtx(arena({ enemies: [{ id: "s", enemy: "sand_scorpion", x: 0, y: 0 }] }));
    startBattle(ctx, { kind: "normal", heroes: ["aldric"], enemies: ["s#0"], battleback: "desert" });
    const aldric = getChar(ctx, "aldric");
    const def0 = effectiveStats(ctx.db, aldric).def;
    let t = nextBattleTurn(ctx);
    while (t.actor !== "aldric") {
      performAction(ctx, t.actor!, { type: "wait" });
      t = nextBattleTurn(ctx);
    }
    performAction(ctx, "aldric", { type: "defend" });
    expect(effectiveStats(ctx.db, aldric).def).toBe(def0 * 2);
    for (t = nextBattleTurn(ctx); t.actor !== "aldric"; t = nextBattleTurn(ctx)) performAction(ctx, t.actor!, { type: "wait" });
    expect(aldric.statuses.some((s) => s.id === "defending")).toBe(false); // ended when his turn came
  });
});

describe("free exploration (§8.10)", () => {
  it("is active while no living enemy is on the board", async () => {
    const { isExploring } = await import("../core/board/board");
    expect(isExploring(arenaCtx())).toBe(true);
    const ctx = arenaCtx(arena(WATCHED));
    expect(isExploring(ctx)).toBe(false);
    getChar(ctx, "w#0").hp = 0;
    reconcile(ctx);
    expect(isExploring(ctx)).toBe(true);
  });

  it("heroes walk anywhere reachable, as often as they like, but still obey the height rule", () => {
    const ctx = arenaCtx(arena({ height: "0000000\n0000000\n0000000\n0000000\n0000000\n2222222\n0000000" }));
    const opts = moveOptions(ctx, "aldric");
    expect(opts.get(key({ x: 0, y: 0 }))?.path).toHaveLength(6); // far beyond any pattern reach
    expect(opts.has(key({ x: 3, y: 6 }))).toBe(false); // behind a 2-high wall
    executeMove(ctx, "aldric", { x: 0, y: 0 });
    expect(moveOptions(ctx, "aldric").has(key({ x: 6, y: 0 }))).toBe(true); // may move again
  });

  it("each action ticks hero statuses and frees the ability; field effects run on the clock", async () => {
    const { exploreTick, exploreTime } = await import("../core/board/explore");
    const { addStatus } = await import("../core/chars/character");
    const { markAbilityUsed, abilityUsed } = await import("../core/board/turns");
    const ctx = arenaCtx();
    addStatus(ctx, getChar(ctx, "mira"), "haste", 2);
    board(ctx).fieldEffects.push({ x: 1, y: 1, effect: "burning", rounds: 1 });
    markAbilityUsed(ctx, "mira");
    const events = exploreTick(ctx);
    expect(events.some((e) => e.type === "round")).toBe(false); // no round banner
    expect(board(ctx).fieldEffects).toHaveLength(1); // not per action...
    exploreTime(ctx);
    expect(board(ctx).fieldEffects).toHaveLength(0); // ...but by time
    expect(abilityUsed(ctx, "mira")).toBe(false);
    exploreTick(ctx);
    expect(hasStatus(getChar(ctx, "mira"), "haste")).toBe(false);
  });

  it("any party member with Steal can steal for the party", async () => {
    const { interactionsFor, performInteraction } = await import("../core/script/interact");
    const ctx = arenaCtx(arena({ events: [{ id: "m", x: 3, y: 4, pages: [{ npc: "villager_m", dialog: "villager_1" }] }] }));
    const npc = Object.values(board(ctx).pieces).find((p) => p.faction === "npc")!;
    const steal = interactionsFor(ctx, "aldric", npc.id).find((o) => o.interaction.type === "steal");
    expect(steal?.by).toBe("kit");
    performInteraction(ctx, "aldric", npc.id, steal!);
    expect(getChar(ctx, npc.members[0]).looted).toBe(true);
  });

  it("wandering villagers step on their own", async () => {
    const { exploreWander } = await import("../core/board/explore");
    const ctx = arenaCtx(arena({ events: [{ id: "n", x: 1, y: 1, pages: [{ npc: "child", move: "wander", wanderRadius: 2, dialog: "nia_ask" }] }] }));
    const npc = Object.values(board(ctx).pieces).find((p) => p.faction === "npc")!;
    let moved = false;
    for (let i = 0; i < 10 && !moved; i++) moved = exploreWander(ctx).some((e) => e.type === "move");
    expect(moved).toBe(true);
    expect(npc.x !== 1 || npc.y !== 1).toBe(true);
  });
});

describe("changing terrain (§5.4)", () => {
  it("ice bridges water; other effects don't take on water", async () => {
    const { placeFieldEffect } = await import("../core/board/terrain");
    const { grid } = await import("../core/board/board");
    const ctx = arenaCtx(arena({ terrain: "sswwwss\nsswwwss\nsswwwss\nsswwwss\nsswwwss\nsswwwss\nsswwwss" }));
    place(ctx, "aldric", 1, 3);
    expect(moveOptions(ctx, "aldric").has(key({ x: 5, y: 3 }))).toBe(false); // the river blocks
    expect(placeFieldEffect(ctx, { x: 3, y: 3 }, "burning", 3)).toEqual([]); // water douses fire
    for (const x of [2, 3, 4]) placeFieldEffect(ctx, { x, y: 3 }, "frozen", 4);
    expect(grid(ctx).cell({ x: 3, y: 3 })?.walkable).toBe(true);
    expect(moveOptions(ctx, "aldric").has(key({ x: 5, y: 3 }))).toBe(true); // across the ice
  });

  it("walking onto ice slips to its end; melting ice sends the party back ashore", async () => {
    const { placeFieldEffect, tickFieldEffects } = await import("../core/board/terrain");
    const river = Array(7).fill("sswwwss").join("\n");
    const ctx = arenaCtx(arena({ terrain: river }));
    for (const x of [2, 3, 4]) placeFieldEffect(ctx, { x, y: 3 }, "frozen", 4);
    const p = mustPieceOf(ctx, "aldric");
    p.x = 1;
    p.y = 3;
    // stepping onto the ice ends the walk there and the party slips across to the far shore
    const res = executeMove(ctx, "aldric", { x: 2, y: 3 });
    expect(res.final).toEqual({ x: 5, y: 3 });
    expect(p.iceOrigin).toBeUndefined();
    // standing on ice over water when it melts (fire): back to where it stepped onto the ice
    p.x = 3;
    p.y = 3;
    p.iceOrigin = { x: 1, y: 3 };
    const melt = placeFieldEffect(ctx, { x: 3, y: 3 }, "burning", 3);
    expect(melt.some((e) => e.type === "melt")).toBe(true);
    expect([p.x, p.y]).toEqual([1, 3]);
    // same when it just wears off
    p.x = 4;
    p.y = 3;
    p.iceOrigin = { x: 5, y: 3 };
    for (let i = 0; i < 20; i++) tickFieldEffects(ctx);
    expect([p.x, p.y]).toEqual([5, 3]);
  });

  it("fire burns flowers and spreads ring by ring; the change is remembered", async () => {
    const { placeFieldEffect, tickFieldEffects } = await import("../core/board/terrain");
    const { grid, mapMemory } = await import("../core/board/board");
    const legend = { terrain: { s: "sand", f: "flowers", g: "grass", w: "water" } };
    const map = { ...arena({ terrain: "sssssss\nsssssss\nffffgss\nsssssss\nsssssss\nsssssss\nsssssss" }), legend };
    const ctx = arenaCtx(map);
    expect(grid(ctx).cell({ x: 1, y: 2 })?.walkable).toBe(false);
    placeFieldEffect(ctx, { x: 0, y: 2 }, "burning", 3);
    expect(grid(ctx).cell({ x: 0, y: 2 })?.terrain).toBe("scorched");
    expect(grid(ctx).cell({ x: 1, y: 2 })?.terrain).toBe("flowers");
    tickFieldEffects(ctx);
    expect(grid(ctx).cell({ x: 1, y: 2 })?.terrain).toBe("scorched");
    expect(grid(ctx).cell({ x: 2, y: 2 })?.terrain).toBe("flowers"); // one ring per round
    for (let i = 0; i < 4; i++) tickFieldEffects(ctx);
    expect(grid(ctx).cell({ x: 4, y: 2 })?.terrain).toBe("scorched"); // grass burns too
    expect(grid(ctx).cell({ x: 5, y: 2 })?.terrain).toBe("sand");
    expect(grid(ctx).cell({ x: 3, y: 2 })?.walkable).toBe(true);
    expect(mapMemory(ctx, "arena").terrain?.["2,2"]).toBe("scorched");
  });
});

describe("ice shapes (§5.4)", () => {
  const lake = () =>
    arenaCtx({
      ...arena({ terrain: "sssssss\nsswwwws\nsswwwws\nsswssss\nsssssss\nsssssss\nsssssss" }),
    });

  it("on water: the 3x3 around the target, water cells only", async () => {
    const { freezeCells } = await import("../core/board/terrain");
    const cells = freezeCells(lake(), { x: 3, y: 5 }, { x: 3, y: 2 }, 3).map(key).sort();
    expect(cells).toEqual(["2,1", "2,2", "2,3", "3,1", "3,2", "4,1", "4,2"].sort()); // (3,3),(4,3) are sand
  });

  it("elsewhere: a straight line along the caster → target direction", async () => {
    const { freezeCells } = await import("../core/board/terrain");
    const ctx = lake();
    expect(freezeCells(ctx, { x: 3, y: 6 }, { x: 3, y: 4 }, 3).map(key)).toEqual(["3,3", "3,4", "3,5"]);
    expect(freezeCells(ctx, { x: 0, y: 5 }, { x: 2, y: 5 }, 5).map(key)).toEqual(["0,5", "1,5", "2,5", "3,5", "4,5"]);
  });

  it("Ice and the Frost Shard use it; Ice 2 and 3 freeze 5 and 7 wide", async () => {
    const { itemTargeting, abilityTargeting } = await import("../core/board/actions");
    const ctx = lake();
    getChar(ctx, "mira").learned.push("ice", "ice2", "ice3");
    place(ctx, "aldric", 3, 5);
    expect(itemTargeting(ctx, "mira", "frost_shard")!.areaAt({ x: 3, y: 4 })).toHaveLength(3);
    expect(abilityTargeting(ctx, "mira", "ice")!.areaAt({ x: 5, y: 5 })).toHaveLength(3);
    expect(abilityTargeting(ctx, "mira", "ice2")!.areaAt({ x: 3, y: 4 }).length).toBe(5);
    expect(abilityTargeting(ctx, "mira", "ice3")!.areaAt({ x: 3, y: 2 }).length).toBe(9); // all the water there is
  });
});

describe("party actions share the ability action (§7.2, §8.1)", () => {
  it("after joining/leaving no ability this turn, and the other way round", () => {
    const ctx = arenaCtx(arena(WATCHED));
    useBoardAbility(ctx, "kit", "leave_party");
    expect(canUseBoardAbility(ctx, "kit", "hide")).toBe(false);
    expect(canUseBoardAbility(ctx, "kit", "join_party")).toBe(false);
    useBoardAbility(ctx, "tarek", "chakra", mustPieceOf(ctx, "tarek"));
    expect(canUseBoardAbility(ctx, "tarek", "leave_party")).toBe(false);
  });
});

describe("height limits for fire and ice (§5.4)", () => {
  it("fire only spreads to cells at most one level higher or lower", async () => {
    const { placeFieldEffect, tickFieldEffects } = await import("../core/board/terrain");
    const { grid } = await import("../core/board/board");
    const legend = { terrain: { s: "sand", g: "grass" } };
    const map = { ...arena({ terrain: "sssssss\nsssssss\nggggsss\nsssssss\nsssssss\nsssssss\nsssssss", height: "0000000\n0000000\n0130000\n0000000\n0000000\n0000000\n0000000" }), legend };
    const ctx = arenaCtx(map);
    placeFieldEffect(ctx, { x: 0, y: 2 }, "burning", 3);
    for (let i = 0; i < 4; i++) tickFieldEffects(ctx);
    expect(grid(ctx).cell({ x: 1, y: 2 })?.terrain).toBe("scorched"); // 0 → 1
    expect(grid(ctx).cell({ x: 2, y: 2 })?.terrain).toBe("grass"); // 1 → 3: too high
  });

  it("an ice line stops at a step of more than one level", async () => {
    const { freezeCells } = await import("../core/board/terrain");
    const ctx = arenaCtx(arena({ height: "0000000\n0000000\n0000000\n0002000\n0000000\n0000000\n0000000" }));
    // caster west of (2,3), line along x: (3,3) is 2 higher → the line stops before it
    expect(freezeCells(ctx, { x: 0, y: 3 }, { x: 2, y: 3 }, 5).map(key)).toEqual(["0,3", "1,3", "2,3"]);
  });
});

describe("skeletons uncovered by Discover wait for the next round (§7.5)", () => {
  it("takes no turn in the round it was uncovered", async () => {
    const { useBoardAbility } = await import("../core/board/actions");
    const { startTactics } = await import("../core/board/explore");
    const ctx = arenaCtx(arena({ enemies: [{ id: "sk", enemy: "skeleton", x: 5, y: 5 }] }));
    useBoardAbility(ctx, "kit", "discover", { x: 3, y: 3 });
    startTactics(ctx);
    expect(turnQueue(ctx).some((id) => id.startsWith("sk#"))).toBe(false); // round 1: waits
    for (let i = 0; i < 6; i++) {
      const { actor } = nextTurn(ctx);
      if (!actor || actor.startsWith("sk#")) break;
      endTurn(ctx, actor);
    }
    expect(board(ctx).turn.round).toBe(2);
    expect(turnQueue(ctx).some((id) => id.startsWith("sk#")) || board(ctx).turn.current?.startsWith("sk#")).toBe(true);
  });
});
