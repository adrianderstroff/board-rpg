import { describe, expect, it } from "vitest";
import { Game } from "../core/game";
import { parseMarkup, plainText } from "../core/script/markup";
import { DialogRunner } from "../core/script/dialog";
import { interactionsFor, performInteraction } from "../core/script/interact";
import { canSwitchQuest, currentObjective, evaluateQuests, switchQuest } from "../core/script/quests";
import { MemoryStorage, loadGame, saveGame } from "../core/state/save";
import { exitAt, exitEnabled, mapMemory } from "../core/board/board";
import { villageGame } from "./helpers";

function newGame(seed = 7) {
  return villageGame(seed);
}

function talk(game: Game, eventId: string) {
  // Elder Hamid lives in his house now: step in, talk, step out again.
  const home = eventId === "elder" && game.ctx.state.board!.mapId !== "elder_house";
  if (home) game.enter("elder_house", "from_town");
  const lines = talkHere(game, eventId);
  if (home) game.enter("sandhollow", "from_elder");
  return lines;
}

function talkHere(game: Game, eventId: string) {
  const ctx = game.ctx;
  const opts = interactionsFor(ctx, "lib:aldric", `n:${eventId}`);
  const talkOpt = opts.find((o) => o.interaction.type === "talk")!;
  const out = performInteraction(ctx, "lib:aldric", `n:${eventId}`, talkOpt);
  const runner = new DialogRunner(ctx, out.dialog!.id, out.dialog!.speaker);
  const lines: string[] = [];
  for (let step = runner.next(); step.type !== "end"; step = runner.next(0)) {
    if (step.type === "say") lines.push(step.text);
  }
  return lines;
}

describe("markup", () => {
  it("parses highlight, color, wave, pauses and variables", () => {
    const tokens = parseMarkup("Hi *{name}*|! [c=red]hot[/c] ~wavy~", (n) => (n === "name" ? "Kit" : undefined));
    expect(plainText(tokens)).toBe("Hi Kit! hot wavy");
    const k = tokens.find((t) => t.kind === "char" && t.ch === "K");
    expect(k && k.kind === "char" && k.style.color).toBe("#feae34");
    expect(tokens.some((t) => t.kind === "pause")).toBe(true);
    const w = tokens.find((t) => t.kind === "char" && t.ch === "w");
    expect(w && w.kind === "char" && w.style.wave).toBe(true);
    const h = tokens.find((t) => t.kind === "char" && t.ch === "h");
    expect(h && h.kind === "char" && h.style.color).toBe("#e43b44");
  });

  it("supports escapes", () => {
    expect(plainText(parseMarkup("a \\* b"))).toBe("a * b");
  });
});

describe("quests", () => {
  it("talking to the elder opens the gate and starts the sub quest", () => {
    const game = newGame();
    expect(currentObjective(game.ctx)).toBe("Talk to Elder Hamid");
    const exit = exitAt(game.ctx, { x: 13, y: 5 })!;
    expect(exitEnabled(game.ctx, exit)).toBe(false);
    const lines = talk(game, "elder");
    expect(lines[0]).toContain("Sandhollow");
    expect(exitEnabled(game.ctx, exit)).toBe(true);
    expect(game.state.quests.active).toBe("clear_dunes");
    expect(currentObjective(game.ctx)).toBe("Defeat the Emperor Scorpion");
  });

  it("finishing the sub quest returns to the parent; hidden ending when everything is cleared", () => {
    const game = newGame();
    talk(game, "elder");
    const ctx = game.ctx;
    ctx.state.records.kills["lib:emperor_scorpion"] = 1;
    mapMemory(ctx, "scorpion_dunes").defeated.push(...ctx.db.map("scorpion_dunes").enemies!.map((e) => e.id));
    evaluateQuests(ctx);
    expect(ctx.state.quests.entries.clear_dunes).toMatchObject({ status: "done", ending: "cleansed" });
    expect(ctx.state.flags.dunes_cleansed).toBe(true);
    expect(ctx.state.quests.active).toBe("road_to_oasis");
    expect(currentObjective(ctx)).toBe("Report back to Elder Hamid");
    talk(game, "elder");
    expect(ctx.state.quests.entries.road_to_oasis.status).toBe("done");
    expect(ctx.state.inventory["lib:flame_blade"]).toBe(1);
  });

  it("side quests can be switched to and completed", () => {
    const game = newGame();
    const ctx = game.ctx;
    const out = performInteraction(ctx, "lib:aldric", "n:nia", interactionsFor(ctx, "lib:aldric", "n:nia")[0]);
    const runner = new DialogRunner(ctx, out.dialog!.id);
    let step = runner.next();
    while (step.type !== "choice") step = runner.next();
    runner.next(0); // "We'll look for it."
    expect(ctx.state.quests.entries.nias_charm.status).toBe("started");
    expect(ctx.state.quests.active).toBe("road_to_oasis"); // not activated
    expect(canSwitchQuest(ctx)).toBe(true);
    switchQuest(ctx, "nias_charm");
    expect(currentObjective(ctx)).toBe("Find Nia's charm near the oasis");
    ctx.state.inventory["lib:village_charm"] = 1;
    evaluateQuests(ctx);
    expect(currentObjective(ctx)).toBe("Bring the charm back to Nia");
  });
});

describe("save/load", () => {
  it("round-trips the whole game state", () => {
    const game = newGame();
    talk(game, "elder");
    const storage = new MemoryStorage();
    saveGame(game.db, game.state, storage, 1);
    const loaded = loadGame(storage, 1)!;
    expect(loaded).toEqual(game.state);
  });
});

describe("buildings (§18)", () => {
  it("doors are walked into without a question; the inn counter rests the party upstairs", () => {
    const game = newGame();
    const ctx = game.ctx;
    const door = exitAt(ctx, { x: 10, y: 2 })!;
    expect(door.door).toBe(true);
    game.travel(door);
    expect(game.ctx.state.board!.mapId).toBe("sandhollow_inn");
    const opts = interactionsFor(game.ctx, "lib:aldric", "n:inn_counter");
    expect(opts.map((o) => o.label)).toEqual(["Rest", "Talk"]);
    const rest = performInteraction(game.ctx, "lib:aldric", "n:inn_counter", opts[0]);
    expect(rest.requests[0]).toMatchObject({ type: "inn", wakeAt: { map: "sandhollow_inn_upper", spawn: "bed" } });
    // stepping out puts the party one cell in front of the door, not on it
    const out = exitAt(game.ctx, { x: 3, y: 6 })!;
    game.travel(out);
    const p = Object.values(game.ctx.state.board!.pieces).find((x) => x.members.includes("lib:aldric"))!;
    expect([p.x, p.y]).toEqual([10, 3]);
    expect(exitAt(game.ctx, p)).toBeUndefined();
  });
});
