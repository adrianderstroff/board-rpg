import type Phaser from "phaser";
import { board, isExploring, mustPieceOf, reconcile } from "../core/board/board";
import { engage } from "../core/board/engage";
import { executeMove, moveOptions, movePiece } from "../core/board/moves";
import { gainExp, expForLevel, computeStats } from "../core/chars/character";
import type { Ctx } from "../core/context";
import { addItem } from "../core/items/inventory";
import { stateOf } from "../core/board/entities";
import { runActions } from "../core/script/actions";
import { getSession } from "./session";
import { Menu } from "../engine/ui/widgets";
import { entityTriggers } from "../core/board/entities";

/**
 * Console / automated-test helpers (window.__game). Setup shortcuts only – tests still drive
 * the real UI with keyboard input for the flows they verify.
 */
export function installDebug(game: Phaser.Game) {
  const ctx = (): Ctx => getSession().current.ctx;
  const boardScene = () => game.scene.getScene("board") as unknown as {
    view: { sync(): void; refreshOverlays(): void };
    hud: { refresh(a?: string | null): void };
    moveCursor(p: { x: number; y: number }, snap?: boolean): void;
    explorer?: string;
    exploreIdle: boolean;
  };
  const resync = () => {
    const s = boardScene();
    if (!s?.view) return;
    s.view.sync();
    s.view.refreshOverlays();
    s.hud.refresh(board(ctx()).turn.current);
  };
  const api = {
    ctx,
    state: () => ctx().state,
    activeScenes: () => game.scene.getScenes(true).map((s) => s.sys.settings.key),
    /** Current actor if it's a hero waiting for input. */
    heroTurn: () => {
      const s = ctx().state;
      const cur = s.board?.turn.current;
      return cur && s.heroes[cur] ? cur : null;
    },
    exploring: () => !!ctx().state.board && isExploring(ctx()),
    /** Free exploration: the selected hero while the game waits for a tap on the map. */
    explorer: () => {
      const s = boardScene();
      return s?.exploreIdle && isExploring(ctx()) ? (s.explorer ?? null) : null;
    },
    /** Moves the piece containing `charId` to a cell (no rules) and puts the cursor there. */
    place(charId: string, x: number, y: number) {
      const p = mustPieceOf(ctx(), charId);
      p.x = x;
      p.y = y;
      resync();
      boardScene().moveCursor(p, true);
    },
    setHp(charId: string, hp: number) {
      const c = ctx().state.heroes[charId] ?? board(ctx()).chars[charId];
      c.hp = hp;
      if (hp <= 0) c.statuses = [];
      reconcile(ctx(), { rewardKills: false });
      resync();
    },
    fullHeal() {
      for (const h of Object.values(ctx().state.heroes)) {
        const s = computeStats(ctx().db, h);
        h.hp = s.maxHp;
        h.mp = s.maxMp;
      }
      resync();
    },
    setLevel(charId: string, level: number) {
      const h = ctx().state.heroes[charId];
      gainExp(ctx().db, h, expForLevel(ctx().db, level) - h.exp);
      api.fullHeal();
    },
    give(item: string, count = 1) {
      addItem(ctx(), item, count);
    },
    setFlag(flag: string, on = true) {
      if (on) ctx().state.flags[flag] = true;
      else delete ctx().state.flags[flag];
      resync();
    },
    /** Walks a piece onto a cell with full landing rules (field effects, traps). */
    stepOnto(charId: string, x: number, y: number) {
      // the move, then what reacts to it (traps are entities: their handlers run when things settle)
      const events = [...movePiece(ctx(), mustPieceOf(ctx(), charId), [{ x, y }], "walk").events, ...entityTriggers(ctx()).events];
      resync();
      return events;
    },
    /** Virtual screen coordinates (480x270) of a cell's top face, for mouse clicks. */
    cellScreen(x: number, y: number) {
      const s = game.scene.getScene("board") as unknown as { view: { cellTop(p: { x: number; y: number }): { x: number; y: number } }; cameras: { main: { scrollX: number; scrollY: number } } };
      const p = s.view.cellTop({ x, y });
      return { x: p.x - s.cameras.main.scrollX, y: p.y - s.cameras.main.scrollY };
    },
    /** The state an entity of the current map is in (a gate "open", a plate "down"). */
    entityState(id: string) {
      return stateOf(ctx(), id);
    },
    /** Is the centre of a cell's top face visible – does a click there pick that cell (not a wall in front)? */
    pickable(x: number, y: number) {
      const s = game.scene.getScene("board") as unknown as { view: { cellTop(p: { x: number; y: number }): { x: number; y: number }; cellAt(wx: number, wy: number): { x: number; y: number } | null } };
      const t = s.view.cellTop({ x, y });
      const c = s.view.cellAt(t.x, t.y);
      return !!c && c.x === x && c.y === y;
    },
    /** Skips the journey inland: main quest active, party in Sandhollow (the original demo start). */
    skipPrologue() {
      runActions(ctx(), [{ completeQuest: "into_the_desert" }, { startQuest: { id: "road_to_oasis", activate: true } }]);
      api.travel("sandhollow", "start");
    },
    travel(map: string, spawn: string) {
      (game.scene.getScene("board") as unknown as { travelTo(m: string, s: string): Promise<void> }).travelTo(map, spawn);
    },
    /** The topmost open menu (title, items, highlighted index) or null. */
    menu: () => Menu.open[Menu.open.length - 1]?.describe() ?? null,
    /** Active highlight overlays on the board (name → cell count). */
    highlights: () => Object.fromEntries([...((game.scene.getScene("board") as unknown as { view: { highlights: Map<string, { cells: unknown[] }> } }).view.highlights)].map(([k, v]) => [k, v.cells.length])),
    /** Puts the board cursor on a cell (Enter then picks it). */
    cursorTo(x: number, y: number) {
      boardScene().moveCursor({ x, y });
    },
    /** Board cursor cell. */
    cursor: () => ({ ...(game.scene.getScene("board") as unknown as { cursor: { x: number; y: number } }).cursor }),
    /** Board view rotation in quarter turns. */
    rotation: () => (game.scene.getScene("board") as unknown as { view: { rotation: number } }).view.rotation,
    /** Camera scroll of the board scene. */
    camera: () => {
      const c = (game.scene.getScene("board") as unknown as { cameras: { main: { scrollX: number; scrollY: number } } }).cameras.main;
      return { x: c.scrollX, y: c.scrollY };
    },
    resync,
    core: { engage, executeMove, moveOptions, reconcile },
  };
  const w = window as unknown as { __game: Record<string, unknown> };
  w.__game = { phaser: game, session: getSession, core: api.core, debug: api };
}
