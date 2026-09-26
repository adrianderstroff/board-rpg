import { describe, expect, it } from "vitest";
import { Game } from "../core/game";
import { exitAt, mustPieceOf, pieces } from "../core/board/board";
import { executeMove, moveOptions } from "../core/board/moves";
import { endTurn, nextTurn } from "../core/board/turns";
import { planBoardTurn } from "../core/board/ai";
import { engage, resolveEngagement } from "../core/board/engage";
import { chooseAiAction } from "../core/battle/ai";
import { finishBattle, nextBattleTurn, performAction } from "../core/battle/battle";
import { interactionsFor, performInteraction } from "../core/script/interact";
import { evaluateQuests } from "../core/script/quests";
import { chebyshev, type Pos } from "../core/util/grid";
import { villageGame } from "./helpers";

/** Runs a battle with AI on both sides and applies it to the board. */
function autoBattle(game: Game, start: () => ReturnType<typeof engage>) {
  const b = start();
  for (let i = 0; i < 300 && !b.result; i++) {
    const t = nextBattleTurn(game.ctx);
    if (!t.actor) break;
    performAction(game.ctx, t.actor, chooseAiAction(game.ctx, t.actor));
  }
  finishBattle(game.ctx);
  resolveEngagement(game.ctx, b);
  return b.result;
}

/** Heroes walk greedily toward a target; enemies/NPCs use their AI. */
function playRound(game: Game, goal: Pos) {
  const ctx = game.ctx;
  for (let guard = 0; guard < 50; guard++) {
    const { actor } = nextTurn(ctx);
    if (!actor) return;
    const piece = mustPieceOf(ctx, actor);
    if (piece.faction === "hero") {
      const opts = [...moveOptions(ctx, actor).values()];
      const engageOpt = opts.find((o) => o.kind === "engage");
      if (engageOpt) {
        autoBattle(game, () => engage(ctx, actor, engageOpt.pos));
      } else {
        const moves = opts.filter((o) => o.kind === "move");
        if (moves.length) {
          const best = moves.reduce((a, b) => (chebyshev(b.pos, goal) < chebyshev(a.pos, goal) ? b : a));
          if (chebyshev(best.pos, goal) < chebyshev(piece, goal)) executeMove(ctx, actor, best.pos);
        }
      }
    } else {
      const d = planBoardTurn(ctx, actor);
      if (d.type === "move") executeMove(ctx, actor, d.dest);
      if (d.type === "engage") autoBattle(game, () => engage(ctx, actor, d.dest));
    }
    if (ctx.state.board) endTurn(ctx, actor);
    evaluateQuests(ctx);
    if (ctx.state.board!.turn.acted.length === 0) return; // new round started
  }
}

describe("scripted playthrough", () => {
  it("village → talk to elder → dunes → fight", () => {
    const game = villageGame(1234);
    const ctx = game.ctx;
    expect(ctx.state.board!.mapId).toBe("sandhollow");

    // Visit the elder in his house and talk to him (as if the party walked up to him).
    game.enter("elder_house", "from_town");
    const talk = interactionsFor(game.ctx, "lib:aldric", "n:elder").find((o) => o.interaction.type === "talk")!;
    performInteraction(game.ctx, "lib:aldric", "n:elder", talk);
    evaluateQuests(game.ctx);
    expect(ctx.state.flags.gate_open).toBe(true);
    game.enter("sandhollow", "from_elder");

    // Travel through the east exit.
    const exit = exitAt(game.ctx, { x: 13, y: 5 })!;
    game.travel(exit);
    expect(game.ctx.state.board!.mapId).toBe("scorpion_dunes");
    expect(pieces(game.ctx).filter((p) => p.faction === "enemy").length).toBe(6);

    // March east; enemies engage or get engaged along the way.
    for (let r = 0; r < 25; r++) playRound(game, { x: 15, y: 6 });
    const kills = Object.values(game.ctx.state.records.kills).reduce((a, b) => a + b, 0);
    expect(kills).toBeGreaterThan(0);
    const levels = game.ctx.state.roster.map((id) => game.ctx.state.heroes[id].exp);
    expect(Math.max(...levels)).toBeGreaterThan(0);
  });
});
