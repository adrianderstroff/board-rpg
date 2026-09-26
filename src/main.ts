import { loadDatabase } from "./content/loader";
import { Database } from "./core/data/database";
import { isEditorPlaytest, receiveFromEditor } from "./game/editorLink";
import { setAssetResolver } from "./engine/assets";
import { playerGame } from "./game/playerStart";
import { validateContent } from "./core/data/validate";
import { createGame } from "./engine/boot";
import { BattleScene } from "./game/scenes/BattleScene";
import { BoardScene } from "./game/scenes/BoardScene";
import { BootScene } from "./game/scenes/BootScene";
import { GameOverScene, TitleScene } from "./game/scenes/TitleScene";
import { initSession, getSession } from "./game/session";
import { installDebug } from "./game/debug";

// Play-testing from the editor: its (possibly unsaved) content instead of the bundled files.
const playtest = isEditorPlaytest() ? await receiveFromEditor() : null;
// The player (distribution.md §2): no game of its own – a .brpg it was started with or is given.
const player = !playtest && import.meta.env.VITE_PLAYER === "1" ? await playerGame() : null;
const db = playtest ? new Database(playtest.raw) : player ? new Database(player.raw) : loadDatabase();
// the editor's own files (a project kept in the browser or a folder), a .brpg's files: blob: URLs
if (playtest?.assets) setAssetResolver((path) => playtest.assets![path]);
if (player) {
  setAssetResolver((path) => player.assets[path]);
  document.title = player.name;
}
const problems = validateContent(db);
if (problems.length) console.warn(`Content problems:\n${problems.join("\n")}`);
const session = initSession(db, { playtest: !!playtest, saveKey: player?.id });
if (playtest?.mode === "quick" && playtest.map) session.pendingQuickPlay = playtest.map;

const game = createGame("game", [BootScene, TitleScene, BoardScene, BattleScene, GameOverScene]);

// Play time counter (only while a game is running).
setInterval(() => {
  const s = getSession();
  if (s.game && document.hasFocus()) s.game.state.playTime += 1;
}, 1000);

// Debug handle for the console and automated browser tests (tools/e2e.mjs).
installDebug(game);
