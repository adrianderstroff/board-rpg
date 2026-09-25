import { describe, expect, it } from "vitest";
import { board, mustPieceOf, pieceReach, piecesAt, reconcile } from "../core/board/board";
import { getGrid } from "../core/board/grid";
import { leapOffsets, resolveMoves, resolvePatternRef } from "../core/board/patterns";
import { executeMove, moveOptions } from "../core/board/moves";
import { endTurn, nextTurn, turnQueue } from "../core/board/turns";
import { joinParty, leaveParty, useBoardAbility, useBoardItem } from "../core/board/actions";
import { engage, resolveEngagement } from "../core/board/engage";
import { chooseAiAction } from "../core/battle/ai";
import { finishBattle, nextBattleTurn, performAction } from "../core/battle/battle";
import { hasStatus } from "../core/chars/character";
import { getChar, type Ctx } from "../core/context";
import { key } from "../core/util/grid";
import { arena, arenaCtx } from "./helpers";

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
    const ctx = arenaCtx();
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
    const ctx = arenaCtx();
    const { actor } = nextTurn(ctx);
    executeMove(ctx, actor!, { x: 3, y: 4 });
    endTurn(ctx, actor!);
    const next = nextTurn(ctx).actor!;
    expect(moveOptions(ctx, next).size).toBe(0);
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
    const ctx = arenaCtx(arena({ events: [{ id: "c", x: 4, y: 3, pages: [{ decor: "chest_closed", dialog: "chest_charm" }] }] }));
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

  it("a cell's effect hits a party once at the start of its turn, not once per member", () => {
    const ctx = arenaCtx();
    board(ctx).fieldEffects.push({ x: 3, y: 3, effect: "burning", rounds: 5 });
    const before = ctx.state.roster.map((id) => getChar(ctx, id).hp);
    const first = nextTurn(ctx);
    const burns = first.events.filter((e) => e.type === "damage").length;
    expect(burns).toBe(4); // every member once
    endTurn(ctx, first.actor!);
    const second = nextTurn(ctx);
    expect(second.events.filter((e) => e.type === "damage").length).toBe(0); // same party, same round
    endTurn(ctx, second.actor!);
    const after = ctx.state.roster.map((id) => getChar(ctx, id).hp);
    expect(after.every((h, i) => h < before[i])).toBe(true);
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
