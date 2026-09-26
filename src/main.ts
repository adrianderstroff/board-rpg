import { loadDatabase } from "./content/loader";
import { Database } from "./core/data/database";
import { isEditorPlaytest, receiveFromEditor } from "./game/editorLink";
import { setAssetResolver } from "./engine/assets";
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
const db = playtest ? new Database(playtest.raw) : loadDatabase();
// the editor's own files (a project kept in the browser or a folder) come as blob: URLs
if (playtest?.assets) setAssetResolver((path) => playtest.assets![path]);
const problems = validateContent(db);
if (problems.length) console.warn(`Content problems:\n${problems.join("\n")}`);
const session = initSession(db, { playtest: !!playtest });
if (playtest?.mode === "quick" && playtest.map) session.pendingQuickPlay = playtest.map;

const game = createGame("game", [BootScene, TitleScene, BoardScene, BattleScene, GameOverScene]);

// Play time counter (only while a game is running).
setInterval(() => {
  const s = getSession();
  if (s.game && document.hasFocus()) s.game.state.playTime += 1;
}, 1000);

// Debug handle for the console and automated browser tests (tools/e2e.mjs).
installDebug(game);
