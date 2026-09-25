import Phaser from "phaser";
import { planBoardTurn, planPreActions } from "../../core/board/ai";
import {
  abilityTargeting,
  boardAbilities,
  boardItems,
  canUseBoardAbility,
  itemTargeting,
  useBoardAbility,
  useBoardItem,
  type Targeting,
} from "../../core/board/actions";
import { board, charsAt, isGameOver, mustPieceOf, pieceOf, piecesAt, syncEvents } from "../../core/board/board";
import { engage, resolveEngagement } from "../../core/board/engage";
import { canPieceMove, executeMove, moveOptions, type MoveOption } from "../../core/board/moves";
import { abilityUsed, endTurn, nextTurn } from "../../core/board/turns";
import { battle as battleState, finishBattle, isAutoBattle } from "../../core/battle/battle";
import { autoResolve } from "../../core/battle/ai";
import { isAlive } from "../../core/chars/character";
import { getChar, type Ctx } from "../../core/context";
import type { GameEvent } from "../../core/events";
import type { EnterResult, Game } from "../../core/game";
import type { GameState } from "../../core/state/types";
import { itemCount } from "../../core/items/inventory";
import { merge, restParty, type ScriptResult, type UiRequest } from "../../core/script/actions";
import { autoTriggers, interactionsFor, performInteraction, stepTriggers, type InteractionOutcome } from "../../core/script/interact";
import { evaluateQuests } from "../../core/script/quests";
import { key, samePos, type Dir, type Pos } from "../../core/util/grid";
import { InputRouter, type InputAction } from "../../engine/input";
import { addTouchButtons, isTouchMode, type TouchButtons } from "../../engine/ui/TouchButtons";
import { fullscreenOnFirstTap } from "../../engine/fullscreen";
import { fadeIn, fadeOut, wait } from "../../engine/tween";
import { banner, COLORS, MENU_KEY_RESULT, pick, popup, UI_DEPTH } from "../../engine/ui/widgets";
import { BoardView } from "../board/BoardView";
import { Hud } from "../board/Hud";
import { faceKey, HL, icon, K, miniStatusIconsOf } from "../keys";
import { getSession } from "../session";
import { playDialog, showMessage, type RequestHandler } from "../ui/dialog";
import { pickAbility } from "../ui/abilityMenu";
import { CLOSE_UP, CloseUp } from "../ui/closeUp";
import { openMainMenu } from "../ui/mainMenu";
import { openShop } from "../ui/shop";
import { showStats } from "../ui/stats";
import { music, sfx, sfxForEvent } from "../sound";

type CellPick = Pos | null | "menu";

/** Did anything happen besides walking (damage, statuses, traps, sliding, items…)? */
function hadEffects(events: GameEvent[]): boolean {
  return events.some((e) => (e.type === "move" && e.mode === "slide") || !["move", "face", "pieces", "turnStart", "round"].includes(e.type));
}

/** The board (§5–§8): turn loop, player commands, AI turns and event playback. */
export class BoardScene extends Phaser.Scene implements RequestHandler {
  private view!: BoardView;
  private router!: InputRouter;
  private hud!: Hud;
  private cursor: Pos = { x: 0, y: 0 };
  private pendingEnter?: EnterResult;
  private travelling = false;
  /**
   * Undo for the last plain move (§7.3): kept while nothing else happened since – no ability, item,
   * interaction or turn end, and landing had no effect (trap, field effect, slide, event).
   */
  private undoMove: { actor: string; snapshot: GameState } | null = null;
  /** On-screen buttons (rotate; Back/Menu on touch) – hidden while text boxes/close-ups cover them. */
  private touchUi?: TouchButtons;
  /** Interaction close-up while talking/shopping with an NPC. */
  private closeUp?: CloseUp;
  /** Incremented per scene start; stale async loops from a previous start exit. */
  private generation = 0;

  constructor() {
    super("board");
  }

  get rpg(): Game {
    return getSession().current;
  }

  get ctx(): Ctx {
    return this.rpg.ctx;
  }

  init(data: { enter?: EnterResult }) {
    this.pendingEnter = data?.enter;
    this.travelling = false;
  }

  create() {
    this.router = new InputRouter(this);
    this.view = new BoardView(this, () => this.ctx);
    this.hud = new Hud(this, () => this.ctx);
    const cam = this.cameras.main;
    this.applyCameraBounds();
    cam.setRoundPixels(true);
    // Map rotation works in every state (menus, targeting, enemy turns).
    this.router.onGlobalAction = (a) => {
      if (a !== "rotateLeft" && a !== "rotateRight") return false;
      // Rotate around the cursor cell: it keeps its place on screen.
      const cam = this.cameras.main;
      cam.panEffect.reset();
      const before = this.screenOf(this.cursor);
      this.view.rotate(a === "rotateLeft" ? -1 : 1);
      this.applyCameraBounds();
      const after = this.view.cellTop(this.cursor);
      cam.setScroll(after.x - before.x, after.y - before.y);
      sfx("cursor");
      return true;
    };
    const hero = Object.values(board(this.ctx).pieces).find((p) => p.faction === "hero" && !p.fallen);
    if (hero) this.moveCursor(hero, true);
    this.hud.refresh();
    // Rotate buttons for everyone; Back / Menu only where there is no keyboard.
    const rotate = [
      { icon: "rotateRight" as const, action: "rotateRight" as const },
      { icon: "rotateLeft" as const, action: "rotateLeft" as const },
    ];
    if (isTouchMode(this)) {
      fullscreenOnFirstTap(this, true); // e.g. after returning from a minimised browser
      this.touchUi = addTouchButtons(this, this.router, [{ label: "Menu", action: "menu" }, { label: "Back", action: "cancel" }, ...rotate], this.scale.width - 4, this.scale.height - 26);
      this.hud.hint("Tap: select  Drag: scroll");
    } else {
      this.touchUi = addTouchButtons(this, this.router, rotate, this.scale.width - 4, this.scale.height - 26);
      this.hud.hint("Z: select  X: back  M: menu  Q/E: turn");
    }
    // Drag (finger or mouse) pans the camera.
    this.router.onDrag = (dx, dy) => {
      cam.scrollX -= dx;
      cam.scrollY -= dy;
    };
    this.events.on("update", this.edgeScroll, this);
    this.events.on("wake", () => this.hud.refresh(board(this.ctx).turn.current));
    music(this.ctx.db.map(board(this.ctx).mapId).music, this);
    this.events.on("wake", () => music(this.ctx.db.map(board(this.ctx).mapId).music, this));
    void fadeIn(this, 300).then(() => this.start());
  }

  private async start() {
    const gen = ++this.generation;
    try {
      if (this.pendingEnter) {
        const r = this.pendingEnter;
        this.pendingEnter = undefined;
        await this.handleResult(r);
        for (const d of r.dialogs) await this.dialog(d.id, d.speaker);
      }
      await this.loop(gen);
    } catch (e) {
      console.error(e);
      await showMessage(this, this.router, this.ctx, `[c=red]Error:[/c] ${(e as Error).message}`);
    }
  }

  // ---------- main loop ----------

  private async loop(gen: number) {
    while (gen === this.generation && !this.travelling) {
      const { actor, events } = nextTurn(this.ctx);
      await this.play(events);
      if (!actor) {
        await wait(this, 200);
        continue;
      }
      this.hud.refresh(actor);
      const piece = pieceOf(this.ctx, actor);
      if (!piece) {
        await this.play(endTurn(this.ctx, actor));
        continue;
      }
      if (piece.faction === "hero") await this.playerTurn(actor);
      else await this.aiTurn(actor);
      if (this.travelling) return;
      if (isGameOver(this.ctx)) return this.gameOver();
    }
  }

  // ---------- event playback ----------

  async play(events: GameEvent[]) {
    let expTotal = 0;
    for (const e of events) {
      sfxForEvent(this.ctx, e);
      switch (e.type) {
        case "move": {
          const piece = board(this.ctx).pieces[e.piece];
          const npc = piece?.faction === "npc";
          if (!npc && piece) this.follow({ x: e.path[e.path.length - 1].x, y: e.path[e.path.length - 1].y });
          await this.view.animateMove(e.piece, e.path, e.mode, npc);
          break;
        }
        case "damage": {
          const a = this.view.charAnchor(e.target);
          if (a) popup(this, a.x, a.y, `${e.amount}`, COLORS.bad, UI_DEPTH - 5);
          this.view.flashChar(e.target);
          await wait(this, 250);
          break;
        }
        case "heal":
          if (e.amount > 0) {
            const a = this.view.charAnchor(e.target);
            if (a) popup(this, a.x, a.y, `+${e.amount}`, COLORS.good, UI_DEPTH - 5);
            await wait(this, 200);
          }
          break;
        case "mp":
          if (e.amount > 0) {
            const a = this.view.charAnchor(e.target);
            if (a) popup(this, a.x, a.y, `+${e.amount} MP`, COLORS.mp, UI_DEPTH - 5);
          }
          break;
        case "status": {
          const a = this.view.charAnchor(e.target);
          const name = this.ctx.db.status(e.status).name;
          if (a) popup(this, a.x, a.y - 8, e.added ? name : `-${name}`, e.added ? COLORS.highlight : COLORS.dim, UI_DEPTH - 5);
          await wait(this, 200);
          break;
        }
        case "miss": {
          const a = this.view.charAnchor(e.target);
          if (a) popup(this, a.x, a.y, "Miss", COLORS.dim, UI_DEPTH - 5);
          break;
        }
        case "ko": {
          const c = this.ctx.state.heroes[e.target] ?? board(this.ctx).chars[e.target];
          if (c) this.hud.toast(`${c.name} ${c.kind === "hero" ? "has fallen!" : "was defeated!"}`, COLORS.bad);
          break;
        }
        case "revive":
          this.hud.toast(`${this.ctx.state.heroes[e.target]?.name ?? ""} is back on their feet!`, COLORS.good);
          break;
        case "fieldEffect":
        case "trap":
          this.view.refreshOverlays();
          if (e.type === "trap" && e.triggeredBy) this.hud.toast("A trap snaps shut!", COLORS.highlight);
          break;
        case "join":
          await this.view.animateJoin(e.char, e.from, e.to);
          break;
        case "pieces":
          this.view.sync();
          break;
        case "steal":
          this.hud.toast(e.item ? `Stole ${this.ctx.db.item(e.item).name}!` : "Couldn't steal anything.", e.item ? COLORS.good : COLORS.dim);
          await wait(this, 300);
          break;
        case "itemGained":
          this.hud.toast(`Got ${this.ctx.db.item(e.item).name}${e.count > 1 ? ` x${e.count}` : ""}`, COLORS.good);
          break;
        case "gold":
          this.hud.toast(`+${e.amount} gold`, COLORS.highlight);
          break;
        case "exp":
          expTotal += e.amount;
          break;
        case "levelUp": {
          const h = this.ctx.state.heroes[e.target];
          const learned = e.abilities.map((a) => this.ctx.db.ability(a).name);
          this.hud.toast(`${h.name} reached level ${e.level}!${learned.length ? ` Learned ${learned.join(", ")}` : ""}`, COLORS.exp);
          break;
        }
        case "learn":
          this.hud.toast(`${this.ctx.state.heroes[e.target]?.name} learned ${this.ctx.db.ability(e.ability).name}!`, COLORS.exp);
          break;
        case "reveal":
          this.hud.toast("Enemy stats revealed", COLORS.mp);
          break;
        case "round":
          void banner(this, `Round ${e.round}`, 500);
          await wait(this, 300);
          break;
        case "turnSkipped": {
          const a = this.view.charAnchor(e.actor);
          if (a) popup(this, a.x, a.y, "Zzz", COLORS.dim, UI_DEPTH - 5);
          await wait(this, 400);
          break;
        }
        case "message":
          if (e.text !== "gameover") this.hud.toast(e.text);
          break;
        default:
          break;
      }
    }
    if (expTotal) this.hud.toast(`+${expTotal} EXP`, COLORS.exp);
    this.view.sync();
    this.view.refreshOverlays();
    this.hud.refresh(board(this.ctx).turn.current);
  }

  /** Plays script results: events, then UI requests in order. */
  private async handleResult(r: ScriptResult) {
    await this.play(r.events);
    for (const req of r.requests) await this.handle(req);
  }

  async handle(req: UiRequest): Promise<void> {
    switch (req.type) {
      case "message":
        this.hud.toast(req.text, COLORS.highlight);
        await wait(this, 400);
        break;
      case "dialog":
        await this.dialog(req.id);
        break;
      case "shop":
        this.hud.cellInfo(null);
        await openShop(this, this.router, this.ctx, req.id);
        break;
      case "inn": {
        const price = req.price;
        const r = await pick(this, this.router, [{ label: `Rest (${price} G)`, disabled: this.ctx.state.gold < price }, { label: "Leave" }], {
          x: 8,
          y: 8,
          title: `Gold: ${this.ctx.state.gold}`,
        });
        if (r === 0) {
          this.ctx.state.gold -= price;
          sfx("save");
          await fadeOut(this, 300);
          await this.play(restParty(this.ctx));
          await fadeIn(this, 300);
          await showMessage(this, this.router, this.ctx, "Everyone feels *refreshed*!");
        }
        break;
      }
      case "teleport":
        await this.travelTo(req.map, req.spawn);
        break;
    }
  }

  private async dialog(id: string, speaker?: string) {
    this.hud.cellInfo(null);
    this.touchUi?.setVisible(false);
    await playDialog(this, this.router, () => this.ctx, id, speaker, this);
    if (!this.closeUp) this.touchUi?.setVisible(true);
    await this.afterChange();
  }

  /** After any state change: event pages, quests, auto events. */
  private async afterChange() {
    const out: ScriptResult = { events: syncEvents(this.ctx), requests: [] };
    merge(out, evaluateQuests(this.ctx));
    const autos = autoTriggers(this.ctx);
    for (const a of autos) merge(out, a);
    await this.handleResult(out);
    for (const a of autos) if (a.dialog) await this.dialog(a.dialog.id, a.dialog.speaker);
  }

  // ---------- cursor & camera ----------

  /**
   * Camera limits: a wide margin around the map so any cell can sit anywhere on screen
   * (needed to rotate around the cursor near the map's edge); at least 40px of map stay visible.
   */
  private applyCameraBounds() {
    const bnd = this.view.bounds;
    const padX = this.scale.width - 40;
    const padY = this.scale.height - 40;
    this.cameras.main.setBounds(bnd.x - padX, bnd.y - padY, bnd.width + padX * 2, bnd.height + padY * 2);
  }

  private moveCursor(p: Pos, snap = false) {
    this.cursor = { x: p.x, y: p.y };
    this.view.setCursor(p);
    this.hud.cellInfo(p);
    this.follow(p, snap);
  }

  private follow(p: Pos, snap = false) {
    const t = this.view.cellTop(p);
    const cam = this.cameras.main;
    const sx = t.x - cam.scrollX;
    const sy = t.y - cam.scrollY;
    const margin = 70;
    if (snap) {
      cam.centerOn(t.x, t.y);
      return;
    }
    if (sx < margin || sx > this.scale.width - margin || sy < margin || sy > this.scale.height - margin) cam.pan(t.x, t.y, 250, "Sine.easeInOut");
  }

  private edgeScroll() {
    const p = this.input.activePointer;
    // Mouse only: a finger resting near the edge (or on a touch button) must not scroll.
    if (!p || p.wasTouch || this.router.dragging || !this.sys.game.hasFocus || p.x <= 0 || p.y <= 0) return;
    const cam = this.cameras.main;
    const e = 10;
    if (p.x < e) cam.scrollX -= 3;
    else if (p.x > this.scale.width - e) cam.scrollX += 3;
    if (p.y < e) cam.scrollY -= 3;
    else if (p.y > this.scale.height - e) cam.scrollY += 3;
  }

  private screenOf(p: Pos) {
    const t = this.view.cellTop(p);
    const cam = this.cameras.main;
    return { x: t.x - cam.scrollX, y: t.y - cam.scrollY };
  }

  /**
   * Lets the player move the cursor and pick a cell. `valid` restricts selectable cells;
   * `onHover` is called when the cursor moves (for area previews).
   */
  private selectCell(opts: { valid?: Set<string>; onHover?: (p: Pos) => void; allowMenu?: boolean } = {}): Promise<CellPick> {
    return new Promise((resolve) => {
      // Cursor keys follow the screen, whatever the map rotation.
      const screenDirs: Partial<Record<InputAction, Dir>> = { up: "N", down: "S", left: "W", right: "E" };
      let armed: string | null = null;
      const hover = (p: Pos) => {
        this.moveCursor(p);
        opts.onHover?.(p);
      };
      const tryPick = (p: Pos) => {
        if (opts.valid && !opts.valid.has(key(p))) return false;
        release();
        resolve(p);
        return true;
      };
      const release = this.router.push({
        onAction: (a) => {
          const sd = screenDirs[a];
          const d = sd ? this.view.worldDir(sd) : undefined;
          if (d) {
            const n = { x: this.cursor.x + d.x, y: this.cursor.y + d.y };
            if (this.view.hasCell(n)) {
              sfx("cursor", { volume: 0.5 });
              hover(n);
            }
          } else if (a === "confirm") {
            if (!tryPick(this.cursor)) sfx("buzzer");
          }
          else if (a === "cancel") {
            release();
            resolve(null);
          } else if (a === "menu" && opts.allowMenu) {
            release();
            resolve("menu");
          }
          return true;
        },
        onPointerMove: (p) => {
          const c = this.view.cellAt(p.worldX, p.worldY);
          if (c && !samePos(c, this.cursor)) {
            this.cursor = c;
            this.view.setCursor(c);
            this.hud.cellInfo(c);
            opts.onHover?.(c);
          }
        },
        onPointerDown: (p) => {
          const c = this.view.cellAt(p.worldX, p.worldY);
          if (!c) return;
          // Touch has no hover: when choosing a target, the first tap previews, the second confirms.
          if (p.touch && opts.valid && armed !== key(c)) {
            armed = key(c);
            sfx("cursor", { volume: 0.5 });
            hover(c);
            return;
          }
          this.cursor = c;
          this.view.setCursor(c);
          if (!tryPick(c)) sfx("buzzer");
        },
      });
      opts.onHover?.(this.cursor);
    });
  }

  private async confirm(question: string, at?: Pos): Promise<boolean> {
    const s = at ? this.screenOf(at) : { x: 200, y: 100 };
    const r = await pick(this, this.router, [{ label: "Yes" }, { label: "No" }], { x: s.x + 20, y: s.y - 30, title: question });
    return r === 0;
  }

  // ---------- player turn (§7.2) ----------

  private async playerTurn(actor: string) {
    const piece = mustPieceOf(this.ctx, actor);
    this.moveCursor(piece);
    await wait(this, 120);
    for (;;) {
      if (this.travelling || !pieceOf(this.ctx, actor) || !isAlive(this.ctx.state.heroes[actor])) {
        if (!this.travelling && board(this.ctx).turn.current === actor) await this.play(endTurn(this.ctx, actor));
        return;
      }
      const own = mustPieceOf(this.ctx, actor);
      // Default: open the command box on the actor; the player can also roam first.
      const pickCell = samePos(this.cursor, own) ? own : await this.selectCell({ allowMenu: true });
      if (pickCell === "menu") {
        await this.mainMenu();
        continue;
      }
      if (pickCell === null) {
        this.moveCursor(own);
        continue;
      }
      if (!samePos(pickCell, own)) {
        await this.inspect(pickCell, actor);
        continue;
      }
      const done = await this.commandBox(actor);
      if (done === "end") return;
      if (done === "roam") {
        const p = await this.selectCell({ allowMenu: true });
        if (p === "menu") await this.mainMenu();
        else if (p && !samePos(p, mustPieceOf(this.ctx, actor))) await this.inspect(p, actor);
        else if (p === null) this.moveCursor(mustPieceOf(this.ctx, actor));
      }
    }
  }

  /** Clicking another cell: show stats of a character there. */
  /**
   * Clicking another cell: for an enemy (or another hero) piece show where it can move/attack
   * this turn, with Stats / Close; otherwise show the stats of whoever is there.
   */
  private async inspect(p: Pos, actor: string) {
    const ctx = this.ctx;
    const chars = charsAt(ctx, p, { includeFallen: true });
    if (!chars.length) {
      this.moveCursor(mustPieceOf(ctx, actor));
      return;
    }
    const own = mustPieceOf(ctx, actor);
    const mover = piecesAt(ctx, p).find((pc) => pc.faction !== "npc" && !pc.fallen && pc.members.length && pc.id !== own.id);
    if (mover) {
      const reach = [...moveOptions(ctx, mover.members[0], { ignoreMoved: true }).values()].map((o) => o.pos);
      this.view.highlight("inspect", reach, mover.faction === "enemy" ? HL.attack : HL.move, 0.8);
    }
    try {
      for (;;) {
        let target = chars[0];
        if (mover) {
          const r = await pick(this, this.router, [{ label: "Stats" }, { label: "Close" }], {
            ...this.menuPos(p),
            title: chars.length > 1 ? `${chars[0].name} +${chars.length - 1}` : chars[0].name,
          });
          if (r !== 0) break;
        }
        if (chars.length > 1) {
          const r = await pick(this, this.router, chars.map((c) => ({ label: c.name })), { ...this.menuPos(p), title: "Stats" });
          if (r === null) {
            if (mover) continue;
            break;
          }
          target = chars[r];
        }
        await showStats(this, this.router, ctx, target);
        if (!mover) break;
      }
    } finally {
      this.view.clearHighlight("inspect");
    }
    this.moveCursor(mustPieceOf(this.ctx, actor));
  }

  private menuPos(p: Pos) {
    const s = this.screenOf(p);
    return { x: s.x + 22, y: Math.max(30, s.y - 40) };
  }

  /** Move / Ability / Item / Stats / End Turn. Returns "end" when the turn is over. */
  private async commandBox(actor: string): Promise<"end" | "roam" | "again"> {
    const ctx = this.ctx;
    const piece = mustPieceOf(ctx, actor);
    const canMove = canPieceMove(ctx, piece);
    const abilities = boardAbilities(ctx, actor);
    const canAbility = !abilityUsed(ctx, actor) && abilities.some((a) => canUseBoardAbility(ctx, actor, a));
    const items = boardItems(ctx);
    const partyRest = piece.members.filter((m) => m !== actor && isAlive(ctx.state.heroes[m]) && !board(ctx).turn.acted.includes(m));
    const hero = ctx.state.heroes[actor];
    const npcHere = this.npcOnCell(actor);
    const entries: { label: string; id: string; disabled?: boolean }[] = [
      ...(npcHere ? [{ label: "Act", id: "act" }] : []),
      this.undoMove?.actor === actor ? { label: "Undo Move", id: "undo" } : { label: "Move", id: "move", disabled: !canMove },
      { label: "Ability", id: "ability", disabled: !canAbility },
      { label: "Item", id: "item", disabled: items.length === 0 },
      { label: "Stats", id: "stats" },
      { label: "End Turn", id: "end" },
    ];
    if (partyRest.length) entries.push({ label: "End Party", id: "endParty" });
    const initial = !canMove && !canAbility ? entries.findIndex((e) => e.id === "end") : entries.findIndex((e) => !e.disabled && e.id !== "undo");
    const r = await pick(this, this.router, entries, {
      ...this.menuPos(piece),
      title: hero.name,
      header: { portrait: faceKey(ctx.db, hero), icons: miniStatusIconsOf(ctx.db, [hero]), iconTexture: K.statusMini, iconSize: 10 },
      initial,
      allowMenuKey: true,
    });
    if (r === null) return "roam";
    if (r === MENU_KEY_RESULT) {
      await this.mainMenu();
      return "again";
    }
    switch (entries[r].id) {
      case "move":
        await this.moveFlow(actor);
        return "again";
      case "undo":
        this.restoreUndo(actor);
        return "again";
      case "ability":
        await this.abilityFlow(actor);
        return "again";
      case "item":
        await this.itemFlow(actor);
        return "again";
      case "stats":
        await showStats(this, this.router, ctx, hero);
        return "again";
      case "act":
        if (npcHere) await this.closeUpSession(actor, npcHere);
        return "again";
      case "end":
        this.undoMove = null;
        await this.play(endTurn(ctx, actor));
        return "end";
      case "endParty":
        this.undoMove = null;
        for (const m of partyRest) await this.play(endTurn(ctx, m));
        await this.play(endTurn(ctx, actor));
        return "end";
    }
    return "again";
  }

  // ---------- move (§7.3) ----------

  private async moveFlow(actor: string) {
    const ctx = this.ctx;
    const opts = moveOptions(ctx, actor);
    const cells = [...opts.values()];
    this.view.highlight("move", cells.filter((o) => o.kind === "move").map((o) => o.pos), HL.move);
    this.view.highlight("engage", cells.filter((o) => o.kind === "engage").map((o) => o.pos), HL.attack);
    this.view.highlight("special", cells.filter((o) => o.kind === "interact" || o.kind === "exit").map((o) => o.pos), HL.area);
    const target = await this.selectCell({
      valid: new Set(opts.keys()),
      onHover: (p) => {
        const o = opts.get(key(p));
        this.view.highlight("path", o && o.mode === "walk" ? o.path : [], HL.path, 0.8);
      },
    });
    this.view.clearHighlight("move", "engage", "special", "path");
    const piece = mustPieceOf(this.ctx, actor);
    if (!target || target === "menu") {
      this.moveCursor(piece);
      return;
    }
    const option = opts.get(key(target))!;
    switch (option.kind) {
      case "engage":
        if (await this.confirm("Attack?", target)) await this.battle(() => engage(this.ctx, actor, target));
        break;
      case "exit": {
        const label = option.exit!.label ?? this.ctx.db.map(option.exit!.to).name;
        if (await this.confirm(`Travel to ${label}?`, target)) {
          const res = executeMove(this.ctx, actor, target);
          await this.play(res.events);
          await this.travel(option);
        }
        break;
      }
      case "interact":
        await this.interactFlow(actor, option);
        break;
      case "move": {
        const snapshot = this.rpg.snapshot();
        const res = executeMove(this.ctx, actor, target);
        await this.play(res.events);
        // step-triggered events on the landing cell
        const triggers = stepTriggers(this.ctx, res.final);
        for (const out of triggers) await this.outcome(out);
        await this.afterChange();
        if (!triggers.length && !hadEffects(res.events)) this.undoMove = { actor, snapshot };
        break;
      }
    }
    const p = pieceOf(this.ctx, actor);
    if (p) this.moveCursor(p);
  }

  /**
   * Step onto the villager's cell (§8.8) and open the close-up. Backing out before doing anything
   * undoes the move, like cancelling a normal move.
   */
  private async interactFlow(actor: string, option: MoveOption) {
    const snapshot = this.rpg.snapshot();
    const res = executeMove(this.ctx, actor, option.pos);
    await this.play(res.events);
    const clean = !hadEffects(res.events);
    const result = await this.closeUpSession(actor, option.targets![0], clean ? snapshot : undefined);
    if (result === "undone") return;
    await this.afterChange();
    // Leaving without doing anything keeps the approach undoable from the command box.
    if (result === "left" && clean) this.undoMove = { actor, snapshot };
  }

  private restoreUndo(actor: string) {
    const u = this.undoMove;
    this.undoMove = null;
    if (!u || u.actor !== actor) return;
    this.rpg.restore(u.snapshot);
    this.view.sync();
    this.view.refreshOverlays();
    this.hud.refresh(actor);
    this.cursorBack(actor);
  }

  /** Interactable villager sharing the actor's cell (for the "Act" command). */
  private npcOnCell(actor: string): string | undefined {
    const own = pieceOf(this.ctx, actor);
    if (!own) return undefined;
    return piecesAt(this.ctx, own).find((p) => p.faction === "npc" && p.members.length && interactionsFor(this.ctx, actor, p.id).length)?.id;
  }

  /**
   * The interaction close-up: options (Talk, Shop, Rest, Steal…) plus "Leave", repeatable until
   * the player leaves. With `undo`, backing out before any option was used restores that state.
   * Returns true when the approach was undone.
   */
  private async closeUpSession(actor: string, npcPieceId: string, undo?: GameState): Promise<"undone" | "left" | "acted"> {
    const heroes = pieceOf(this.ctx, actor);
    const npc = board(this.ctx).pieces[npcPieceId];
    if (!heroes || !npc || !interactionsFor(this.ctx, actor, npcPieceId).length) return "left";
    this.hud.cellInfo(null);
    this.hud.setVisible(false);
    this.touchUi?.setVisible(false);
    this.closeUp = new CloseUp(this, this.ctx, heroes, npc);
    let acted = false;
    try {
      for (;;) {
        if (!board(this.ctx).pieces[npcPieceId]) break; // the NPC left (script)
        const options = interactionsFor(this.ctx, actor, npcPieceId);
        const r = await pick(this, this.router, [...options.map((o) => ({ label: o.label })), { label: "Leave" }], {
          x: CLOSE_UP.x + 8,
          y: CLOSE_UP.y + 34,
          title: "Choose",
        });
        if (r === null && undo && !acted) {
          this.rpg.restore(undo);
          this.view.sync();
          this.view.refreshOverlays();
          this.hud.refresh(actor);
          this.cursorBack(actor);
          return "undone";
        }
        if (r === null || r === options.length) break; // Back / Leave
        await this.outcome(performInteraction(this.ctx, actor, npcPieceId, options[r]));
        acted = true;
        this.undoMove = null;
        await this.afterChange();
      }
    } finally {
      this.closeUp?.destroy();
      this.closeUp = undefined;
      this.hud.setVisible(true);
      this.touchUi?.setVisible(true);
    }
    this.cursorBack(actor);
    return acted ? "acted" : "left";
  }

  private async outcome(out: InteractionOutcome) {
    await this.play(out.events);
    if (out.dialog) this.hud.cellInfo(null);
    if (out.dialog) await playDialog(this, this.router, () => this.ctx, out.dialog.id, out.dialog.speaker, this);
    for (const r of out.requests) await this.handle(r);
  }

  // ---------- abilities & items (§13, §14) ----------

  private async abilityFlow(actor: string) {
    const ctx = this.ctx;
    const all = boardAbilities(ctx, actor).map((id) => ctx.db.ability(id));
    const pos = this.menuPos(mustPieceOf(ctx, actor));
    const hero = ctx.state.heroes[actor];
    for (;;) {
      const ability = await pickAbility(this, this.router, all, {
        ...pos,
        title: `${hero.name}  MP ${hero.mp}`,
        usable: (a) => canUseBoardAbility(this.ctx, actor, a.id),
        onHighlight: (a) => this.preview(a ? abilityTargeting(this.ctx, actor, a.id) : null),
      });
      if (!ability) {
        this.cursorBack(actor);
        return;
      }
      if (ability.special === "leaveParty") {
        this.undoMove = null;
        await this.play(useBoardAbility(this.ctx, actor, ability.id));
        return;
      }
      const target = await this.pickTarget(abilityTargeting(this.ctx, actor, ability.id)!);
      if (!target) continue;
      this.undoMove = null;
      await this.play(useBoardAbility(this.ctx, actor, ability.id, target));
      await this.afterChange();
      this.cursorBack(actor);
      return;
    }
  }

  /** Returns the cursor to the acting hero so the command box reopens. */
  private cursorBack(actor: string) {
    const p = pieceOf(this.ctx, actor);
    if (p) this.moveCursor(p);
  }

  private async itemFlow(actor: string) {
    const ctx = this.ctx;
    const piece = mustPieceOf(ctx, actor);
    for (;;) {
      const ids = boardItems(this.ctx);
      if (!ids.length) return;
      const r = await pick(
        this,
        this.router,
        ids.map((id) => {
          const it = ctx.db.item(id);
          return { label: it.name, right: `x${itemCount(this.ctx, id)}`, icon: icon(it.icon), disabled: !itemTargeting(this.ctx, actor, id)?.valid.length };
        }),
        { ...this.menuPos(piece), title: "Items", onHighlight: (i) => this.preview(itemTargeting(this.ctx, actor, ids[i])) },
      );
      this.view.clearHighlight("range", "valid");
      if (r === null) {
        this.cursorBack(actor);
        return;
      }
      const t = itemTargeting(this.ctx, actor, ids[r])!;
      const target = await this.pickTarget(t);
      if (!target) continue;
      this.undoMove = null;
      await this.play(useBoardItem(this.ctx, actor, ids[r], target));
      await this.afterChange();
      this.cursorBack(actor);
    }
  }

  private preview(t: Targeting | null) {
    this.view.highlight("range", t?.range ?? [], HL.disabled, 0.5);
    this.view.highlight("valid", t?.valid ?? [], HL.ability);
  }

  private async pickTarget(t: Targeting): Promise<Pos | null> {
    this.preview(t);
    const validSet = new Set(t.valid.map(key));
    const first = t.valid[0];
    if (first) this.moveCursor(first);
    const r = await this.selectCell({
      valid: validSet,
      onHover: (p) => this.view.highlight("area", validSet.has(key(p)) ? t.areaAt(p) : [], HL.area),
    });
    this.view.clearHighlight("range", "valid", "area");
    return r && r !== "menu" ? r : null;
  }

  // ---------- battle ----------

  private async battle(start: () => void) {
    start();
    if (isAutoBattle(this.ctx)) {
      // Enemies attacking a lone NPC: resolved without the battle screen (§8.9).
      const names = battleState(this.ctx).combatants.filter((c) => c.side === "hero").map((c) => getChar(this.ctx, c.id).name).join(", ");
      this.hud.toast(`${names} is attacked!`, COLORS.bad);
      autoResolve(this.ctx);
      const r = finishBattle(this.ctx);
      const won = r.result === "victory";
      this.hud.toast(won ? `${names} fought them off!` : `${names} was overwhelmed...`, won ? COLORS.good : COLORS.bad);
      await this.play(resolveEngagement(this.ctx, r));
      await this.afterChange();
      return;
    }
    // the attacker walks up to its target and lunges before the screen flashes
    const src = battleState(this.ctx).source;
    if (src) await this.view.approach(src.attackerPiece, src.path, src.mode);
    sfx("encounter");
    await fadeOut(this, 250, 0xffffff);
    await new Promise<void>((resolve) => {
      this.scene.launch("battle", { onDone: resolve });
      this.scene.sleep();
    });
    const b = finishBattle(this.ctx);
    this.cameras.main.fadeIn(250);
    const events = resolveEngagement(this.ctx, b);
    await this.view.afterBattle();
    await this.play(events);
    await this.afterChange();
  }

  // ---------- AI (§12.5) ----------

  private async aiTurn(actor: string) {
    const ctx = this.ctx;
    const piece = mustPieceOf(ctx, actor);
    const npc = piece.faction === "npc";
    if (!npc) {
      this.moveCursor(piece);
      await wait(this, 200);
    }
    // Party changes and board abilities come first (§8.7, §12.5).
    for (const pre of planPreActions(ctx, actor)) {
      const name = pre.type === "ability" ? ctx.db.ability(pre.ability).name : pre.type === "join" ? "Join Party" : "Leave Party";
      const a = this.view.pieceAnchor(piece.id);
      if (a) popup(this, a.x, a.y - 36, name, COLORS.bad, UI_DEPTH - 5);
      if (pre.type === "ability") {
        this.moveCursor(pre.target);
        await this.previewFor(actor, pre.ability, pre.target);
        await this.play(useBoardAbility(this.ctx, actor, pre.ability, pre.target));
      } else if (pre.type === "join") await this.play(useBoardAbility(this.ctx, actor, "join_party", pre.target));
      else await this.play(useBoardAbility(this.ctx, actor, "leave_party"));
    }
    if (!pieceOf(this.ctx, actor)) return;
    const d = planBoardTurn(this.ctx, actor);
    if (d.type === "move") await this.play(executeMove(this.ctx, actor, d.dest).events);
    else if (d.type === "engage") {
      const a = this.view.pieceAnchor(mustPieceOf(this.ctx, actor).id);
      if (a) popup(this, a.x, a.y - 34, "!", COLORS.bad, UI_DEPTH - 5);
      await wait(this, 400);
      await this.battle(() => engage(this.ctx, actor, d.dest));
    }
    if (board(this.ctx).turn.current === actor) await this.play(endTurn(this.ctx, actor));
    await this.afterChange();
  }

  /** Briefly shows an enemy ability's area before it lands. */
  private async previewFor(actor: string, abilityId: string, target: Pos) {
    const t = abilityTargeting(this.ctx, actor, abilityId);
    if (!t) return;
    this.view.highlight("enemyArea", t.areaAt(target), HL.attack);
    await wait(this, 500);
    this.view.clearHighlight("enemyArea");
  }

  // ---------- menus ----------

  private async mainMenu() {
    this.undoMove = null; // items/equipment may change things
    this.hud.cellInfo(null);
    const r = await openMainMenu(this, this.router);
    this.view.sync();
    this.hud.refresh(board(this.ctx).turn.current);
    if (r === "title") {
      this.travelling = true;
      await fadeOut(this, 300);
      this.scene.start("title");
    } else if (r === "loaded") {
      this.travelling = true;
      await fadeOut(this, 300);
      this.scene.restart({});
    }
  }

  // ---------- travel & game over ----------

  private async travel(option: MoveOption) {
    this.travelling = true;
    sfx("travel");
    await fadeOut(this, 350);
    const result = this.rpg.travel(option.exit!);
    this.scene.restart({ enter: result });
  }

  private async travelTo(map: string, spawn: string) {
    this.travelling = true;
    sfx("travel");
    await fadeOut(this, 350);
    const result = this.rpg.enter(map, spawn);
    this.scene.restart({ enter: result });
  }

  private async gameOver() {
    this.travelling = true;
    await fadeOut(this, 600);
    this.scene.start("gameover");
  }

  /** Test hook: pieces on a cell. */
  debugPieces(p: Pos) {
    return piecesAt(this.ctx, p);
  }
}
