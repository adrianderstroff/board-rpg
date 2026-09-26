import Phaser from "phaser";
import { board, exitEnabled, grid, pageOfPiece } from "../../core/board/board";
import { graphicsOf } from "../../core/chars/character";
import type { Ctx } from "../../core/context";
import type { Piece } from "../../core/state/types";
import { DIR_VEC, dirFromStep, type Dir, type Pos } from "../../core/util/grid";
import { LAYER } from "../../engine/iso";
import { IsoMapView, type OverlayCell } from "../../engine/iso/IsoMapView";
import { isoMapSource, rotateContinuous, wallDecorSources } from "./mapSource";
import { isFrozen } from "../../core/board/moves";
import { CharSprite } from "../../engine/sprites/CharSprite";
import { CURSOR_KEY, ICONS_KEY, UI_DEPTH } from "../../engine/ui/widgets";
import { DIR_ROW, EXIT_FRAME, K, icon, miniStatusIconsOf } from "../keys";
import { isFlyingPiece } from "../../core/board/moves";
import { markCells } from "../../core/board/entities";

interface PieceVisual {
  sprites: Map<string, Phaser.GameObjects.Sprite>;
  shadow: Phaser.GameObjects.Image;
  sign?: Phaser.GameObjects.Image;
  /** Status icons above the character/party, and the icon list they were built from. */
  statusIcons: Phaser.GameObjects.Image[];
  statusKey: string;
  x: number;
  y: number;
}

interface Highlight {
  cells: Pos[];
  frame: number;
  alpha: number;
}

/** Offsets for party members sharing a cell. */
const CLUSTER: Pos[][] = [
  [{ x: 0, y: 0 }],
  [{ x: -5, y: -1 }, { x: 5, y: 1 }],
  [{ x: -6, y: -1 }, { x: 6, y: -1 }, { x: 0, y: 2 }],
  [{ x: -6, y: -2 }, { x: 6, y: -2 }, { x: -4, y: 2 }, { x: 4, y: 2 }],
];

/** How high flying pieces hover (px). */
const FLY_HEIGHT = 10;

/** Map rotation (quarter turns) survives map changes within a session. */
let rotation = 0;

const rotate = (p: Pos, quarters: number): Pos => {
  let { x, y } = p;
  for (let i = 0; i < ((quarters % 4) + 4) % 4; i++) [x, y] = [-y, x];
  return { x, y };
};

/** Pixels of a character hidden below the surface in deep / shallow water. */
const SUBMERGED_DEEP = 13;
const SUBMERGED_SHALLOW = 3;

/** Duration of the animated map rotation (ms). */
const ROTATE_MS = 900;

/**
 * Renders the board state: map, pieces, field effects, exits, traps, cursor and highlights.
 * The public API speaks *world* grid coordinates; internally everything is drawn in *view*
 * coordinates so the map can be rotated in 90° steps (blocks are re-drawn from the new angle,
 * characters turn to their new screen direction, decor stays upright).
 */
export class BoardView {
  private map!: IsoMapView;
  readonly cursor: Phaser.GameObjects.Sprite;
  /** Bouncing pointer above the cursor cell (the diamond alone is hard to spot under characters). */
  private readonly pointer: Phaser.GameObjects.Sprite;
  private readonly visuals = new Map<string, PieceVisual>();
  private readonly animating = new Set<string>();
  private readonly highlights = new Map<string, Highlight>();
  /** Cells an attacker walked through visually before a battle (origin first). */
  private approachWalk: { pieceId: string; cells: Pos[] } | null = null;
  private cursorCell: Pos = { x: 0, y: 0 };
  /** Current view angle in quarter turns (fractional during a rotation animation). */
  private angle = rotation;
  private rotating = false;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly ctx: () => Ctx,
  ) {
    this.buildMap();
    this.cursor = scene.add.sprite(0, 0, K.boardCursor, 0).setOrigin(0.5, 8 / 24);
    this.cursor.play(this.cursorAnim());
    this.pointer = scene.add.sprite(0, 0, CURSOR_KEY, 0).setAngle(90).setOrigin(0.5, 0.5);
    scene.events.on("update", this.bob, this);
    scene.events.once("shutdown", () => scene.events.off("update", this.bob, this));
    this.refreshOverlays();
    this.sync();
  }

  // ---------- rotation ----------

  get rotation() {
    return rotation;
  }

  /** World grid → view grid for the current (possibly fractional) angle. */
  toView(p: Pos): Pos {
    return rotateContinuous(p.x, p.y, this.angle);
  }

  get isRotating() {
    return this.rotating;
  }

  /** A world direction as seen on screen (characters switch half-way through a rotation). */
  viewDir(d: Dir): Dir {
    return dirFromStep({ x: 0, y: 0 }, rotate(DIR_VEC[d], Math.round(this.angle)));
  }

  /** A screen-space direction (cursor keys) in world terms. */
  worldDir(d: Dir): Pos {
    return rotate(DIR_VEC[d], -rotation);
  }

  /**
   * Turns the map by quarter turns, animated: the terrain spins as one solid (see
   * IsoMapView.beginSpin) while characters and decor ride along upright. `onFrame` runs after
   * every step (the scene keeps the pivot cell in place with it).
   */
  async rotate(quarters: number, onFrame?: () => void, ms = ROTATE_MS): Promise<void> {
    if (this.rotating) return;
    this.rotating = true;
    const from = this.angle;
    const to = from + quarters;
    this.map.beginSpin();
    this.setAngle(from);
    this.cursor.setVisible(false);
    this.pointer.setVisible(false);
    await new Promise<void>((resolve) => {
      this.scene.tweens.addCounter({
        from: 0,
        to: 1,
        duration: ms,
        ease: "Quad.easeOut", // starts turning at once, settles gently
        onUpdate: (tw) => {
          this.setAngle(from + (to - from) * (tw.getValue() ?? 0));
          onFrame?.();
        },
        onComplete: () => resolve(),
      });
    });
    rotation = (((Math.round(to) % 4) + 4) % 4);
    this.map.endSpin();
    this.setAngle(rotation);
    this.cursor.setVisible(true);
    this.pointer.setVisible(true);
    this.refreshOverlays();
    this.rotating = false;
    onFrame?.();
  }

  private setAngle(q: number) {
    this.angle = q;
    this.map.setTransform((x, y) => rotateContinuous(x, y, q));
    this.map.spinTo(q);
    this.map.relayout();
    for (const piece of Object.values(board(this.ctx()).pieces)) {
      const v = this.visuals.get(piece.id);
      if (v) this.place(piece, v);
    }
    this.setCursor(this.cursorCell);
  }

  private buildMap() {
    const c = this.ctx();
    const g = grid(c);
    this.map = new IsoMapView(this.scene, isoMapSource(g), (x, y) => rotateContinuous(x, y, this.angle));
    // lettering painted on one side of a block (shop signs)
    this.map.setWallDecor(wallDecorSources(c.db, c.db.map(board(c).mapId), g));
  }

  // ---------- coordinates (world API) ----------

  get bounds() {
    return this.map.bounds;
  }

  /** Screen (world-camera) position of a world cell's top face. */
  cellTop(p: Pos): { x: number; y: number } {
    return this.map.cellTop(p.x, p.y);
  }

  hasCell(p: Pos): boolean {
    return this.map.hasCell(p.x, p.y);
  }

  /** World cell under a camera-world point. */
  cellAt(wx: number, wy: number): Pos | null {
    return this.map.cellAt(wx, wy);
  }

  private depth(p: Pos, layer: number, sub = 0) {
    return this.map.depthOf(p.x, p.y, layer, sub);
  }

  private cursorAnim() {
    const key = "board_cursor:blink";
    if (!this.scene.anims.exists(key)) {
      this.scene.anims.create({ key, frames: this.scene.anims.generateFrameNumbers(K.boardCursor, { start: 0, end: 1 }), frameRate: 3, repeat: -1 });
    }
    return key;
  }

  setCursor(p: Pos) {
    this.cursorCell = { x: p.x, y: p.y };
    const t = this.cellTop(p);
    this.cursor.setPosition(t.x, t.y).setDepth(this.depth(p, LAYER.marker));
    // hover above status icons (and shop signs) of whoever stands there
    let lift = 0;
    for (const v of this.visuals.values()) {
      if (v.x === p.x && v.y === p.y) lift = Math.max(lift, v.statusIcons.length ? (v.sign ? 34 : 18) : v.sign ? 16 : 0);
    }
    const py = t.y - 40 - lift;
    this.scene.tweens.killTweensOf(this.pointer);
    this.pointer.setPosition(t.x, py).setDepth(UI_DEPTH - 10);
    this.scene.tweens.add({ targets: this.pointer, y: py + 3, yoyo: true, repeat: -1, duration: 350, ease: "Sine.easeInOut" });
  }

  // ---------- overlays ----------

  private overlay(name: string, texture: string, cells: OverlayCell[], opts: Parameters<IsoMapView["setOverlay"]>[3] = {}) {
    this.map.setOverlay(name, texture, cells, opts);
  }

  refreshOverlays() {
    const c = this.ctx();
    const b = board(c);
    const byRow = new Map<number, OverlayCell[]>();
    for (const f of b.fieldEffects) {
      const row = c.db.fieldEffect(f.effect).overlayRow;
      if (!byRow.has(row)) byRow.set(row, []);
      byRow.get(row)!.push({ x: f.x, y: f.y, frame: row * 8 });
    }
    const rows = Math.max(...[...c.db.fieldEffects.values()].map((f) => f.overlayRow)) + 1;
    for (let row = 0; row < rows; row++) {
      this.overlay(`fx${row}`, K.fieldEffects, byRow.get(row) ?? [], { originY: 16 / 24, layer: LAYER.effect, animFrames: 4 });
    }
    // the heroes' own traps and trap entities the heroes know about (a mark, §7.5)
    const traps = [...b.traps, ...markCells(c)];
    this.overlay("traps", K.fieldEffects, traps.map((t) => ({ x: t.x, y: t.y, frame: 4 * 8 })), { originY: 16 / 24, layer: LAYER.effect });
    const exits = (c.db.map(b.mapId).exits ?? []).filter((e) => !e.door); // doors need no arrow
    this.overlay(
      "exits",
      K.exitArrows,
      exits.map((e) => ({ x: e.x, y: e.y, frame: EXIT_FRAME[this.viewDir(e.dir)] + (exitEnabled(c, e) ? 0 : 4) })),
      { layer: LAYER.overlay - 1, blink: true },
    );
  }

  /** A cell's decor changed: burnt, cut or grown (§5.4, §5.7). */
  setDecor(p: Pos, decor: string | null) {
    const chip = grid(this.ctx()).chipset;
    this.map.setDecor(p.x, p.y, decor ? chip.decor[decor]?.frame : undefined);
  }

  /** A cell's terrain changed (burnt flowers, §5.4). */
  setTerrain(p: Pos, terrain: string) {
    const t = grid(this.ctx()).chipset.terrains[terrain];
    if (t) this.map.setTop(p.x, p.y, t.frame, t.frames);
  }

  highlight(name: string, cells: Pos[], frame: number, alpha = 0.9) {
    const h = { cells, frame, alpha };
    this.highlights.set(name, h);
    this.applyHighlight(name, h);
  }

  private applyHighlight(name: string, h: Highlight) {
    this.overlay(name, K.highlight, h.cells.map((p) => ({ ...p, frame: h.frame })), { alpha: h.alpha });
  }

  clearHighlight(...names: string[]) {
    for (const n of names) {
      this.highlights.delete(n);
      this.map.clearOverlay(n);
    }
  }

  // ---------- pieces ----------

  private textureFor(charId: string, fallen: boolean): { key: string; frame: number } {
    const c = this.ctx();
    const ch = c.state.heroes[charId] ?? board(c).chars[charId];
    const gfx = graphicsOf(c.db, ch);
    if (fallen && gfx.battler) {
      const b = c.db.graphics.battlers[gfx.battler];
      return { key: K.battler(gfx.battler), frame: b.frames.ko ?? 0 };
    }
    return { key: K.charset(gfx.charset), frame: 4 };
  }

  /** Brings sprites in line with the current state (creates/removes/snaps). */
  sync() {
    const c = this.ctx();
    const b = board(c);
    const alive = new Set(Object.keys(b.pieces));
    for (const [id, v] of this.visuals) {
      if (!alive.has(id)) {
        for (const s of v.sprites.values()) s.destroy();
        for (const img of v.statusIcons) img.destroy();
        v.shadow.destroy();
        v.sign?.destroy();
        this.visuals.delete(id);
      }
    }
    for (const piece of Object.values(b.pieces)) this.syncPiece(piece);
  }

  private syncPiece(piece: Piece) {
    const c = this.ctx();
    let v = this.visuals.get(piece.id);
    if (!v) {
      const shadow = this.scene.add.image(0, 0, K.shadow).setAlpha(0.6);
      v = { sprites: new Map(), shadow, statusIcons: [], statusKey: "", x: piece.x, y: piece.y };
      this.visuals.set(piece.id, v);
    }
    // Dormant enemies look exactly like the remains decor they imitate (§7.5).
    const dormantDecor = piece.dormant ? this.dormantDecor(piece) : undefined;
    const members = piece.dormant ? [] : piece.members.filter((m) => c.state.heroes[m] ?? board(c).chars[m]);
    for (const [id, s] of v.sprites) {
      if (id !== "decor" && !members.includes(id)) {
        s.destroy();
        v.sprites.delete(id);
      }
    }
    for (const id of members) {
      if (v.sprites.has(id)) continue;
      const tex = this.textureFor(id, !!piece.fallen);
      const s = piece.fallen
        ? this.scene.add.sprite(0, 0, tex.key, tex.frame).setOrigin(0.5, 0.8).setTint(0xb0b0c0)
        : new CharSprite(this.scene, 0, 0, tex.key);
      v.sprites.set(id, s);
    }
    // object pieces (chests) use decor graphics
    const page = pageOfPiece(c, piece);
    const decor = dormantDecor ?? (!members.length ? page?.decor : undefined);
    if (decor) {
      const chip = grid(c).chipset;
      if (!v.sprites.has("decor")) {
        v.sprites.set("decor", this.scene.add.sprite(0, 0, K.decor(chip.id), chip.decor[decor].frame).setOrigin(0.5, chip.decorAnchorY / chip.decorFrameHeight));
      } else v.sprites.get("decor")!.setFrame(chip.decor[decor].frame);
    } else if (v.sprites.has("decor")) {
      v.sprites.get("decor")!.destroy();
      v.sprites.delete("decor");
    }
    const signIcon = icon(page?.sign);
    if (signIcon !== undefined && !v.sign) v.sign = this.scene.add.image(0, 0, ICONS_KEY, signIcon).setOrigin(0.5, 1);
    if (signIcon === undefined && v.sign) {
      v.sign.destroy();
      v.sign = undefined;
    }
    v.shadow.setVisible(members.length > 0 && !piece.fallen);
    // status icons of everyone in the piece, side by side
    const chars = piece.fallen ? [] : members.map((m) => c.state.heroes[m] ?? board(c).chars[m]).filter((ch) => ch && ch.hp > 0);
    const icons = miniStatusIconsOf(c.db, chars);
    const iconKey = icons.join(",");
    if (iconKey !== v.statusKey) {
      for (const img of v.statusIcons) img.destroy();
      v.statusIcons = icons.map((ic) => this.scene.add.image(0, 0, K.statusMini, ic).setOrigin(0.5, 1));
      v.statusKey = iconKey;
    }
    if (!this.animating.has(piece.id)) {
      v.x = piece.x;
      v.y = piece.y;
      this.place(piece, v);
    }
  }

  private dormantDecor(piece: Piece): string | undefined {
    const c = this.ctx();
    const leader = piece.members[0] ? board(c).chars[piece.members[0]] : undefined;
    return leader ? c.db.enemy(leader.def).boardAi.dormant?.decor : undefined;
  }

  /** When a villager and heroes share a cell, the villager steps back and the heroes forward. */
  private shareOffset(piece: Piece, cell: Pos): Pos {
    const others = Object.values(board(this.ctx()).pieces).some(
      (p) => p.id !== piece.id && !p.fallen && p.x === cell.x && p.y === cell.y && p.members.length && (p.faction === "npc") !== (piece.faction === "npc"),
    );
    if (!others || !piece.members.length) return { x: 0, y: 0 };
    return piece.faction === "npc" ? { x: -7, y: -4 } : { x: 6, y: 2 };
  }

  private place(piece: Piece, v: PieceVisual, at?: { x: number; y: number }, depthCell?: Pos) {
    const cell = depthCell ?? { x: v.x, y: v.y };
    const top = at ?? this.cellTop({ x: v.x, y: v.y });
    const shift = at ? { x: 0, y: 0 } : this.shareOffset(piece, { x: v.x, y: v.y });
    const base = { x: top.x + shift.x, y: top.y + shift.y };
    // Flying pieces hover above their cell and bob gently; the shadow stays on the ground.
    const flying = !piece.fallen && piece.members.length > 0 && isFlyingPiece(this.ctx(), piece);
    const lift = flying ? FLY_HEIGHT : 0;
    const sunk = flying || piece.fallen ? 0 : this.immersion(cell);
    const sprites = [...v.sprites.entries()];
    const offsets = CLUSTER[Math.min(sprites.length, 4) - 1] ?? CLUSTER[0];
    // things one walks onto (a floor plate) lie on the ground, under whoever stands there (§10.3)
    const ground = piece.faction === "npc" && !piece.members.length && pageOfPiece(this.ctx(), piece)?.pass === "walk";
    sprites.forEach(([, s], i) => {
      const o = offsets[i] ?? { x: 0, y: 0 };
      const y = base.y + (ground ? 0 : 3) + o.y - lift + sunk;
      s.setPosition(base.x + o.x, y).setDepth(this.depth(cell, ground ? LAYER.decor : LAYER.char, (o.y + shift.y + 3) * 0.1));
      // in water the lower body is hidden below the surface
      if (sunk) s.setCrop(0, 0, s.width, s.height - sunk);
      else if (s.isCropped) s.setCrop();
      s.setData("baseY", y).setData("bob", flying ? 2 : 0).setData("phase", i * 0.9);
      if (s instanceof CharSprite) s.face(DIR_ROW[this.viewDir(piece.facing)]);
    });
    v.shadow
      .setPosition(base.x, base.y + 2)
      .setDepth(this.depth(cell, LAYER.char - 1))
      .setScale(flying ? 1.1 : 1, flying ? 1.1 : 1)
      .setAlpha(sunk > 4 ? 0 : flying ? 0.35 : 0.6);
    v.sign?.setPosition(base.x, base.y - 30).setDepth(this.depth(cell, LAYER.marker));
    const n = v.statusIcons.length;
    v.statusIcons.forEach((img, i) => {
      // small icons side by side, above all world objects (palms, walls) but below the UI
      const y = base.y - (v.sign ? 44 : 30) - lift;
      img.setPosition(base.x + (i - (n - 1) / 2) * 11, y).setDepth(UI_DEPTH - 20 + this.depth(cell, 0) / 1e5);
      img.setData("baseY", y).setData("bob", 1).setData("phase", i * 1.3);
    });
  }

  /** How many pixels of a standing character are under water on a cell (deep: the lower body, shallow: the feet). */
  private immersion(p: Pos): number {
    const c = this.ctx();
    const water = grid(c).terrain(p)?.water;
    if (!water || isFrozen(c, p)) return 0;
    return water === "deep" ? SUBMERGED_DEEP : SUBMERGED_SHALLOW;
  }

  /** Per-frame gentle up/down motion of flying sprites and status icons. */
  private bob(time: number) {
    for (const v of this.visuals.values()) {
      for (const s of v.sprites.values()) {
        const amp = s.getData("bob") as number | undefined;
        if (amp) s.y = (s.getData("baseY") as number) + Math.round(Math.sin(time * 0.003 + (s.getData("phase") as number)) * amp);
      }
      for (const img of v.statusIcons) {
        img.y = (img.getData("baseY") as number) + Math.round(Math.sin(time * 0.004 + (img.getData("phase") as number)) * (img.getData("bob") as number));
      }
    }
  }

  /** Camera-world position above a character (for popups). */
  charAnchor(charId: string): { x: number; y: number } | null {
    for (const v of this.visuals.values()) {
      const s = v.sprites.get(charId);
      if (s) return { x: s.x, y: s.y - 30 };
    }
    return null;
  }

  pieceAnchor(pieceId: string): { x: number; y: number } | null {
    const v = this.visuals.get(pieceId);
    return v ? this.cellTop({ x: v.x, y: v.y }) : null;
  }

  /** Draw-order cell of a step between two cells: the one further in front on screen. */
  private frontCell(a: Pos, b: Pos): Pos {
    const va = this.toView(a);
    const vb = this.toView(b);
    return vb.x + vb.y > va.x + va.y ? b : a;
  }

  /**
   * Animates a piece along a path (walk / leap / slide). If the sprite already stands on a cell of
   * the path (e.g. it walked up to an enemy before a battle), the animation continues from there.
   * `visualOnly` leaves the sprite where it ends instead of snapping it to the state afterwards.
   */
  async animateMove(pieceId: string, path: Pos[], mode: "walk" | "leap" | "slide" | "warp", fast = false, visualOnly = false) {
    const c = this.ctx();
    const piece = board(c).pieces[pieceId];
    const v = this.visuals.get(pieceId);
    if (!piece || !v) return;
    const at = path.findIndex((p) => p.x === v.x && p.y === v.y);
    if (at >= 0) path = path.slice(at + 1);
    if (!path.length) {
      if (!visualOnly) {
        this.animating.delete(pieceId);
        this.syncPiece(piece);
      }
      return;
    }
    this.animating.add(pieceId);
    // sliding on ice is slow and deliberate so the slip reads clearly (~2-3 s over a 3-wide river)
    const ms = mode === "slide" ? 280 : fast ? 110 : 160;
    let from = { x: v.x, y: v.y };
    let lastFacing = piece.facing;
    for (const step of path) {
      const fakePiece = { ...piece, facing: dirFromStep(from, step) };
      lastFacing = fakePiece.facing;
      const a = this.cellTop(from);
      const b = this.cellTop(step);
      const depthCell = this.frontCell(from, step);
      if (mode === "leap") {
        await this.tweenCounter(320, (t) => {
          const p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t - Math.sin(t * Math.PI) * 18 };
          this.place(fakePiece, v, p, depthCell);
        });
      } else if (mode === "warp") {
        this.place(fakePiece, v, b, step);
      } else {
        for (const s of v.sprites.values()) if (s instanceof CharSprite && mode === "walk") s.setStepping(true);
        await this.tweenCounter(ms, (t) => this.place(fakePiece, v, { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, depthCell));
      }
      v.x = step.x;
      v.y = step.y;
      from = step;
    }
    for (const s of v.sprites.values()) if (s instanceof CharSprite) s.setStepping(false);
    if (visualOnly) return;
    this.animating.delete(pieceId);
    // Stay where this path ended: a move can come in several parts (crossing effects, the ice
    // slide) and the state already holds the final cell. The full sync after playback settles it.
    const now = board(c).pieces[pieceId] ?? piece;
    this.place({ ...now, facing: lastFacing }, v);
  }

  /**
   * Before a battle: the attacker walks up to the defender (all but the last step) and lunges at it.
   * The state is unchanged; `afterBattle` resolves the visuals.
   */
  async approach(pieceId: string, path: Pos[], mode: "walk" | "leap") {
    const piece = board(this.ctx()).pieces[pieceId];
    const v = this.visuals.get(pieceId);
    if (!piece || !v || !path.length) return;
    const walk = mode === "walk" ? path.slice(0, -1) : [];
    this.approachWalk = { pieceId, cells: [{ x: v.x, y: v.y }, ...walk] };
    this.animating.add(pieceId);
    await this.animateMove(pieceId, walk, "walk", false, true);
    // lunge: hop part of the way towards the target
    const from = { x: v.x, y: v.y };
    const target = path[path.length - 1];
    const a = this.cellTop(from);
    const b = this.cellTop(target);
    const fake = { ...piece, facing: dirFromStep(from, target) };
    await this.tweenCounter(220, (k) => {
      const t = k * 0.5;
      this.place(fake, v, { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t - Math.sin(k * Math.PI) * 12 }, this.frontCell(from, target));
    });
  }

  /** After a battle: a winner's capture move continues from where it lunged; otherwise walk back. */
  async afterBattle() {
    const w = this.approachWalk;
    this.approachWalk = null;
    if (!w) return;
    const piece = board(this.ctx()).pieces[w.pieceId];
    const v = this.visuals.get(w.pieceId);
    if (!piece || !v) {
      this.animating.delete(w.pieceId);
      this.sync();
      return;
    }
    if (piece.x === w.cells[0].x && piece.y === w.cells[0].y) {
      // lost or escaped: back to the origin along the way it came
      await this.animateMove(w.pieceId, [...w.cells].reverse(), "walk", true);
    }
    // a capture is animated by the rule event (continuing from the current cell)
  }

  private tweenCounter(ms: number, onUpdate: (t: number) => void): Promise<void> {
    return new Promise((resolve) => {
      this.scene.tweens.addCounter({ from: 0, to: 1, duration: ms, onUpdate: (tw) => onUpdate(tw.getValue() ?? 0), onComplete: () => resolve() });
    });
  }

  /**
   * A character walks from its cell onto a party's cell (Join Party). Runs before the visual
   * re-sync, so the member's sprite still exists at its old place.
   */
  async animateJoin(charId: string, from: Pos, to: Pos) {
    let sprite: Phaser.GameObjects.Sprite | undefined;
    for (const v of this.visuals.values()) sprite ??= v.sprites.get(charId);
    if (!sprite) return;
    const a = { x: sprite.x, y: sprite.y };
    const b = this.cellTop(to);
    const cs = sprite instanceof CharSprite ? sprite : undefined;
    cs?.face(DIR_ROW[this.viewDir(dirFromStep(from, to))]).setStepping(true);
    sprite.setDepth(this.depth(this.frontCell(from, to), LAYER.char, 5));
    await this.tweenCounter(260, (t) => sprite!.setPosition(a.x + (b.x - a.x) * t, a.y + (b.y + 3 - a.y) * t));
    cs?.setStepping(false);
  }

  /** Brief flash on a piece (hit on the board). */
  flashChar(charId: string) {
    for (const v of this.visuals.values()) {
      const s = v.sprites.get(charId);
      if (s) this.scene.tweens.add({ targets: s, alpha: 0.2, yoyo: true, repeat: 2, duration: 60 });
    }
  }

  destroy() {
    this.map.destroy();
  }
}
