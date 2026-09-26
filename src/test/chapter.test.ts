import { describe, expect, it } from "vitest";
import { board, exitAt, exitEnabled, grid, mustPieceOf, reconcile } from "../core/board/board";
import { leaveParty } from "../core/board/actions";
import { executeMove } from "../core/board/moves";
import { entityTriggers, stateOf } from "../core/board/entities";
import type { Ctx } from "../core/context";
import { DialogRunner } from "../core/script/dialog";
import { autoTriggers, interactionsFor, performInteraction, stepTriggers } from "../core/script/interact";
import { runActions } from "../core/script/actions";
import { currentObjective, evaluateQuests } from "../core/script/quests";
import { villageGame } from "./helpers";

/** Runs a dialog to its end (first choice unless given); returns speakers, lines and UI requests. */
function runDialog(ctx: Ctx, id: string, choices: number[] = []) {
  const runner = new DialogRunner(ctx, id);
  const out = { speakers: [] as (string | undefined)[], lines: [] as string[], requests: [] as unknown[] };
  let choice: number | undefined;
  for (let step = runner.next(); step.type !== "end"; step = runner.next(choice)) {
    choice = undefined;
    if (step.type === "say") {
      out.speakers.push(step.speaker);
      out.lines.push(step.text);
    } else if (step.type === "choice") choice = choices.shift() ?? 0;
    else if (step.type === "request") out.requests.push(step.request);
  }
  return out;
}

function place(ctx: Ctx, charId: string, x: number, y: number) {
  Object.assign(mustPieceOf(ctx, charId), { x, y });
  reconcile(ctx);
  entityTriggers(ctx); // plates and gates (entities, §10.3)
}

const tokens = ["token_serenity", "token_foresight", "token_life"];

describe("the Mountain Temple chapter (§18.7-12)", () => {
  it("reporting to the elder opens the road east and starts The Mountain Temple", () => {
    const game = villageGame();
    const ctx = game.ctx;
    game.enter("elder_house", "from_town");
    const talkElder = () => {
      const opt = interactionsFor(ctx, "aldric", "n:elder").find((o) => o.interaction.type === "talk")!;
      const out = performInteraction(ctx, "aldric", "n:elder", opt);
      runDialog(ctx, out.dialog!.id);
      evaluateQuests(ctx);
    };
    talkElder(); // the task
    runActions(ctx, [{ completeQuest: "clear_dunes" }]);
    evaluateQuests(ctx);
    talkElder(); // the report
    expect(ctx.state.flags.road_beyond_open).toBe(true);
    expect(currentObjective(ctx)).toBe("Climb Temple Mountain to the temple");
    game.enter("scorpion_dunes", "from_village");
    const east = exitAt(game.ctx, { x: 17, y: 6 })!;
    expect(east.to).toBe("temple_mountain");
    expect(exitEnabled(game.ctx, east)).toBe(true);
    expect(exitEnabled(game.ctx, exitAt(game.ctx, { x: 9, y: 13 })!)).toBe(false); // the Endless Dunes need the monks' task
  });

  it("the free cushion starts the monks' talk in turns; the tokens open the hidden door", () => {
    const game = villageGame();
    runActions(game.ctx, [{ startQuest: { id: "mountain_temple", activate: true } }]);
    game.enter("temple", "from_mountain");
    const ctx = game.ctx;
    expect(grid(ctx).cell({ x: 8, y: 0 })?.walkable).toBe(false);
    const sat = stepTriggers(ctx, { x: 5, y: 5 });
    expect(sat[0].dialog?.id).toBe("monks_talk");
    const talk = runDialog(ctx, "monks_talk");
    const monks = talk.speakers.filter((s) => s?.startsWith("monk"));
    expect(new Set(monks)).toEqual(new Set(["monk_old", "monk_a", "monk_b"]));
    expect(monks.every((s, i) => i === 0 || s !== monks[i - 1])).toBe(true); // they take turns
    expect(ctx.state.flags.monks_trial).toBe(true);
    // sitting again repeats the task; with all three tokens they are returned
    expect(stepTriggers(ctx, { x: 5, y: 5 })[0].dialog?.id).toBe("monks_talk");
    for (const t of tokens) runActions(ctx, [{ giveItem: t }]);
    runDialog(ctx, "monks_talk");
    expect(tokens.every((t) => !ctx.state.inventory[t])).toBe(true);
    expect(ctx.state.flags.tokens_returned).toBe(true);
    reconcile(ctx);
    entityTriggers(ctx); // the hidden door (an entity) opens on the flag
    expect(grid(ctx).cell({ x: 8, y: 0 })?.walkable).toBe(true);
  });

  it("the Endless Dunes loop until the third crossing shows the Mirage Tower", () => {
    const game = villageGame();
    const dialogs: string[] = [];
    for (let i = 0; i < 4; i++) dialogs.push(...game.enter("endless_dunes", i ? "west" : "north").dialogs.map((d) => d.id));
    expect(dialogs.filter((d) => d === "mirage_appears")).toHaveLength(1);
    const res = runDialog(game.ctx, "mirage_appears");
    expect(res.requests).toContainEqual({ type: "teleport", map: "mirage_sands", spawn: "from_dunes" });
    game.enter("mirage_sands", "from_dunes");
    expect(game.ctx.state.vars.lost).toBe(0);
  });

  it("Mirage Tower 1F: stepping off the plate closes the gate – the heroes have to split up", () => {
    const game = villageGame();
    game.enter("mirage_tower_1", "start");
    const ctx = game.ctx;
    place(ctx, "aldric", 3, 8);
    expect(stateOf(ctx, "east_gate")).toBe("open");
    expect(autoTriggers(ctx).some((a) => a.dialog?.id === "tower_split_up")).toBe(false);
    place(ctx, "aldric", 6, 8);
    expect(ctx.state.flags.tower_split).toBe(true);
    expect(autoTriggers(ctx).some((a) => a.dialog?.id === "tower_split_up")).toBe(true);
    // one team holds the plate, the other passes; the inner plate opens the west gate
    for (const id of ["kit", "tarek"]) leaveParty(ctx, id);
    place(ctx, "kit", 3, 8);
    place(ctx, "aldric", 9, 2);
    expect(stateOf(ctx, "west_gate")).toBe("open");
  });

  it("Mirage Tower 3F: the ice lane slides a team up to its latching plate, which opens the other stairs", () => {
    const game = villageGame();
    game.enter("mirage_tower_3", "west");
    const ctx = game.ctx;
    executeMove(ctx, "aldric", { x: 3, y: 7 }); // onto the ice
    const p = mustPieceOf(ctx, "aldric");
    expect([p.x, p.y]).toEqual([3, 2]); // slid all the way up, onto the plate
    entityTriggers(ctx);
    expect(stateOf(ctx, "east_stairs")).toBe("open");
    board(ctx).turn.moved = [];
    executeMove(ctx, "aldric", { x: 2, y: 2 });
    entityTriggers(ctx);
    expect(stateOf(ctx, "east_stairs")).toBe("open"); // latched
    expect(stateOf(ctx, "west_stairs")).toBe("closed");
  });

  it("waking up at the inn: the party can face another way than the spawn point", () => {
    const game = villageGame();
    const spawnDir = game.ctx.db.map("sandhollow_inn_upper").spawns.bed.dir ?? "S";
    game.enter("sandhollow_inn_upper", "bed");
    expect(mustPieceOf(game.ctx, "aldric").facing).toBe(spawnDir);
    const other = spawnDir === "N" ? "E" : "N";
    game.enter("sandhollow_inn_upper", "bed", other);
    expect(mustPieceOf(game.ctx, "aldric").facing).toBe(other);
  });

  it("the cave half-way up the mountain stays sealed until the Holy Orb is claimed", () => {
    const game = villageGame();
    game.enter("temple_mountain", "from_dunes");
    expect(grid(game.ctx).cell({ x: 6, y: 13 })?.walkable).toBe(false);
    game.enter("hall_of_fears", "from_temple");
    runActions(game.ctx, [{ giveItem: "holy_orb" }, { setFlag: "orb_claimed" }]);
    game.enter("temple_mountain", "from_temple");
    expect(grid(game.ctx).cell({ x: 6, y: 13 })?.walkable).toBe(true);
  });
});
