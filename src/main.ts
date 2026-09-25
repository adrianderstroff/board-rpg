import { loadDatabase } from "./content/loader";
import { validateContent } from "./core/data/validate";
import { createGame } from "./engine/boot";
import { BattleScene } from "./game/scenes/BattleScene";
import { BoardScene } from "./game/scenes/BoardScene";
import { BootScene } from "./game/scenes/BootScene";
import { GameOverScene, TitleScene } from "./game/scenes/TitleScene";
import { initSession, getSession } from "./game/session";
import { installDebug } from "./game/debug";

const db = loadDatabase();
const problems = validateContent(db);
if (problems.length) console.warn(`Content problems:\n${problems.join("\n")}`);
initSession(db);

const game = createGame("game", [BootScene, TitleScene, BoardScene, BattleScene, GameOverScene]);

// Play time counter (only while a game is running).
setInterval(() => {
  const s = getSession();
  if (s.game && document.hasFocus()) s.game.state.playTime += 1;
}, 1000);

// Debug handle for the console and automated browser tests (tools/e2e.mjs).
installDebug(game);
