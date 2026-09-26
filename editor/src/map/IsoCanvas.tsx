import Phaser from "phaser";
import { useEffect, useRef, useState } from "preact/hooks";
import { getGrid } from "../../../src/core/board/grid";
import type { Database } from "../../../src/core/data/database";
import type { Pos } from "../../../src/core/util/grid";
import { AxisGizmo, isoAxes } from "./Gizmo";
import { loadSheet } from "../../../src/engine/assets";
import { isoToScreen, LAYER } from "../../../src/engine/iso";
import { IsoMapView, type IsoMapSource } from "../../../src/engine/iso/IsoMapView";
import { CORNERS, isoMapSource, rotateContinuous, wallDecorSources } from "../../../src/game/board/mapSource";
import { cutSquare } from "../../../src/engine/iso/shapes";
import type { Corner } from "../../../src/core/data/types";
import { K } from "../../../src/game/keys";
import type { EntitySprite } from "../entities/visuals";

/**
 * The map exactly as the game draws it (editor-design §5.1): the engine's IsoMapView fed by the
 * game's own map source. Left / right mouse = the tool (right = its eraser), middle drag or
 * Space + drag = pan, wheel = zoom.
 */

export interface CanvasHandlers {
  /** button: 0 left, 2 right. */
  down(cell: Pos, button: number): void;
  move(cell: Pos | null, pressed: boolean): void;
  up(cell: Pos | null): void;
}

export interface Marker {
  x: number;
  y: number;
  /** highlight.png frame: 0 blue, 1 red, 2 green, 3 orange, 4 white, 5 grey. */
  frame: number;
}

/** A see-through preview of what the next click places, following the cursor. */
export interface Ghost {
  texture: string;
  frame: number;
  originY: number;
  /** "block": a terrain block drawn over the cell's top; default: an object standing on it. */
  kind?: "block" | "object";
  /** Blocks: the level the painted cell will have (default: the cell's own height). */
  level?: number;
  /** Blocks: the corners the piece cuts off – the ghost is cut the same way. */
  cut?: Corner[];
  /** Blocks: the frame for the blocks below the top. */
  fill?: number;
  /** The cells it covers (a rectangle being dragged, the area a fill reaches); default: the hovered cell. */
  cells?: Pos[];
}

/** Duration (ms) of a quarter turn of the view – eased like the game's board rotation. */
const TURN_MS = 650;

interface Props {
  db: Database;
  mapId: string;
  rotation: number;
  hideDecor: boolean;
  /** Grey one layer out so the other stands out: the terrain in decor mode, the decor in board mode. */
  /** The layer being edited; the others (board, decor, entities) are greyed out. */
  focus: "board" | "decor" | "entity";
  /** Cells to highlight (rect preview, selection…). */
  markers: Marker[];
  /** Events, exits, enemies… placed on the map (editor-design §6). */
  entities: EntitySprite[];
  ghost: Ghost | null;
  /** Thin grid lines on every cell's top (empty cells at ground level). */
  showGrid: boolean;
  /** A pending resize: the new size – added cells are marked green, dropped ones red. */
  resizeTo?: { w: number; h: number } | null;
  handlers: CanvasHandlers;
}

class MapScene extends Phaser.Scene {
  view?: IsoMapView;
  props!: Props;
  private shownMap?: string;
  private shownRotation = 0;
  hover?: Pos | null;
  private pan?: { x: number; y: number; sx: number; sy: number };
  private painting = false;
  private entityObjects: Phaser.GameObjects.GameObject[] = [];
  private ghostImages: Phaser.GameObjects.Image[] = [];
  /** A terrain ghost: a one-cell map view (so pieces are cut exactly like on the board), see-through. */
  private ghostView?: IsoMapView;
  /** The cell whose own blocks are hidden while the ghost stands in for them. */
  private replaced: Pos[] = [];
  /**
   * Grid lines: one thin, smooth outline per cell (holes at ground level) – drawn in the cell's place
   * in the drawing order, so blocks in front cover them; kept up to date while the view turns.
   */
  private gridLines: { x: number; y: number; hole: boolean; state: "keep" | "add" | "drop"; g: Phaser.GameObjects.Graphics }[] = [];
  /** Tells the component the view's (continuous) angle – for the axis gizmo. */
  onAngle?: (quarters: number) => void;
  private space = false;
  /** A running view turn (the blocks spin as one solid, like in the game). */
  private spin?: Phaser.Tweens.Tween;

  constructor(private readonly initial: () => Props) {
    super("editorMap");
  }

  preload() {
    this.props = this.initial();
    this.load.setBaseURL(`${location.origin}/`);
    for (const c of this.props.db.chipsets.values()) {
      loadSheet(this, { key: K.chipset(c.id), path: c.image, frameWidth: c.frameWidth, frameHeight: c.frameHeight });
      loadSheet(this, { key: K.decor(c.id), path: c.decorImage, frameWidth: c.decorFrameWidth, frameHeight: c.decorFrameHeight });
    }
    const ws = this.props.db.graphics.wallSigns;
    if (ws) loadSheet(this, { key: K.wallSigns, path: ws.image, frameWidth: ws.frameWidth, frameHeight: ws.frameHeight });
    loadSheet(this, { key: K.highlight, path: "system/highlight.png", frameWidth: 32, frameHeight: 16 });
    loadSheet(this, { key: K.boardCursor, path: "system/board_cursor.png", frameWidth: 32, frameHeight: 24 });
    loadSheet(this, { key: K.exitArrows, path: "system/exit_arrows.png", frameWidth: 32, frameHeight: 16 });
    loadSheet(this, { key: K.fieldEffects, path: "system/field_effects.png", frameWidth: 32, frameHeight: 24 });
    for (const [id, c] of Object.entries(this.props.db.graphics.charsets)) loadSheet(this, { key: K.charset(id), path: c.image, frameWidth: c.frameWidth, frameHeight: c.frameHeight });
  }

  /** Page position of a cell's top centre (for automated tests). */
  cellScreen(x: number, y: number): { x: number; y: number } | null {
    if (!this.view?.hasCell(x, y)) return null;
    const w = this.view.cellTop(x, y);
    const cam = this.cameras.main;
    const r = this.game.canvas.getBoundingClientRect();
    return { x: r.left + (w.x - cam.worldView.x) * cam.zoom, y: r.top + (w.y - cam.worldView.y) * cam.zoom };
  }

  create() {
    (window as unknown as { __editorMap?: MapScene }).__editorMap = this;
    this.input.mouse?.disableContextMenu();
    // Space + drag pans
    const keys = (e: KeyboardEvent) => {
      if (e.code === "Space") this.space = e.type === "keydown";
    };
    window.addEventListener("keydown", keys);
    window.addEventListener("keyup", keys);
    this.events.once("destroy", () => {
      window.removeEventListener("keydown", keys);
      window.removeEventListener("keyup", keys);
    });
    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => {
      if (p.middleButtonDown() || (this.space && p.leftButtonDown())) {
        const cam = this.cameras.main;
        this.pan = { x: p.x, y: p.y, sx: cam.scrollX, sy: cam.scrollY };
        return;
      }
      const cell = this.cellAt(p);
      if (cell) {
        this.painting = true;
        this.props.handlers.down(cell, p.rightButtonDown() ? 2 : 0);
      }
    });
    this.input.on("pointermove", (p: Phaser.Input.Pointer) => {
      if (this.pan) {
        const cam = this.cameras.main;
        cam.setScroll(this.pan.sx - (p.x - this.pan.x) / cam.zoom, this.pan.sy - (p.y - this.pan.y) / cam.zoom);
        return;
      }
      const cell = this.cellAt(p);
      if (cell?.x !== this.hover?.x || cell?.y !== this.hover?.y) {
        this.hover = cell;
        this.drawMarkers();
        this.drawGhost();
        this.props.handlers.move(cell, this.painting);
      }
    });
    const up = (p: Phaser.Input.Pointer) => {
      if (this.pan) {
        this.pan = undefined;
        return;
      }
      if (this.painting) {
        this.painting = false;
        this.props.handlers.up(this.cellAt(p));
      }
    };
    this.input.on("pointerup", up);
    this.input.on("pointerupoutside", up);
    this.input.on("gameout", () => {
      this.hover = null;
      this.drawMarkers();
      this.drawGhost();
      this.props.handlers.move(null, this.painting);
    });
    this.input.on("wheel", (p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => {
      const cam = this.cameras.main;
      const before = cam.getWorldPoint(p.x, p.y);
      cam.setZoom(Phaser.Math.Clamp(cam.zoom * (dy > 0 ? 0.85 : 1 / 0.85), 0.5, 6));
      const after = cam.getWorldPoint(p.x, p.y);
      cam.scrollX += before.x - after.x;
      cam.scrollY += before.y - after.y;
      this.drawGrid(); // lines stay one screen pixel wide
    });
    this.show(this.initial()); // the latest props: the map may have changed while loading
  }

  private cellAt(p: Phaser.Input.Pointer): Pos | null {
    const w = this.cameras.main.getWorldPoint(p.x, p.y);
    return this.view?.cellAt(w.x, w.y) ?? this.holeAt(w.x, w.y);
  }

  /** A cell of the map without a block (a hole) under a world point, at ground level – holes can be painted too. */
  private holeAt(wx: number, wy: number): Pos | null {
    const g = getGrid(this.props.db, this.props.mapId);
    const m = { tileWidth: g.chipset.tileWidth, tileHeight: g.chipset.tileHeight, blockHeight: g.chipset.blockHeight };
    let best: { x: number; y: number; d: number } | null = null;
    for (let y = 0; y < g.height; y++)
      for (let x = 0; x < g.width; x++) {
        if (g.has({ x, y })) continue;
        const v = rotateContinuous(x, y, this.shownRotation);
        const c = isoToScreen(m, v.x, v.y, 0);
        if (Math.abs(wx - c.x) / (m.tileWidth / 2) + Math.abs(wy - c.y) / (m.tileHeight / 2) <= 1 && (!best || v.x + v.y > best.d)) best = { x, y, d: v.x + v.y };
      }
    return best ? { x: best.x, y: best.y } : null;
  }

  /** (Re)draws the map for new content, another map, rotation or layer visibility. */
  show(props: Props) {
    this.props = props;
    const grid = getGrid(props.db, props.mapId);
    const src: IsoMapSource = isoMapSource(grid);
    if (props.hideDecor) src.cells = src.cells.map((c) => ({ ...c, decor: undefined, decorViews: undefined }));
    this.view?.destroy();
    this.view = new IsoMapView(this, src, (x, y) => rotateContinuous(x, y, props.rotation));
    if (!props.hideDecor) this.view.setWallDecor(wallDecorSources(props.db, props.db.map(props.mapId), grid));
    if (this.shownMap !== props.mapId) {
      this.shownMap = props.mapId;
      const b = this.view.bounds;
      const cam = this.cameras.main;
      cam.setZoom(Phaser.Math.Clamp(Math.min(this.scale.width / (b.width + 40), this.scale.height / (b.height + 40)), 0.5, 3));
      cam.centerOn(b.centerX, b.centerY);
    } else if (this.shownRotation !== props.rotation) {
      // the map turns around the grid origin: keep it in view, at the same zoom
      const b = this.view.bounds;
      this.cameras.main.centerOn(b.centerX, b.centerY);
    }
    this.shownRotation = props.rotation;
    this.view.setBlockTint(props.focus !== "board" ? 0x6f7086 : null);
    this.view.setDecorTint(props.focus !== "decor" ? 0x8a8aa0 : null);
    this.drawMarkers();
    this.drawEntities();
    this.drawGhost();
    this.buildGrid();
    this.onAngle?.(props.rotation);
  }

  /** (Re)creates the grid lines for the current map. */
  buildGrid() {
    for (const l of this.gridLines) l.g.destroy();
    this.gridLines = [];
    const grid = getGrid(this.props.db, this.props.mapId);
    const r = this.props.resizeTo;
    const w = Math.max(grid.width, r?.w ?? 0);
    const h = Math.max(grid.height, r?.h ?? 0);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const state = x >= grid.width || y >= grid.height ? "add" : r && (x >= r.w || y >= r.h) ? "drop" : "keep";
        this.gridLines.push({ x, y, hole: !grid.has({ x, y }), state, g: this.add.graphics() });
      }
    this.drawGrid();
  }

  /** Draws the grid lines where the cells are now (also every frame of a turn): 1 screen pixel wide. */
  drawGrid() {
    const view = this.view;
    if (!view) return;
    const width = 1 / this.cameras.main.zoom;
    for (const l of this.gridLines) {
      l.g.clear();
      const shown = this.props.showGrid || l.state !== "keep";
      l.g.setVisible(shown);
      if (!shown) continue;
      l.g.setDepth(view.depthOf(l.x, l.y, LAYER.block, 0.9));
      const pts = view.topCorners(l.x, l.y).map((c) => new Phaser.Math.Vector2(c.x, c.y));
      if (l.state !== "keep") {
        // the resize preview: cells it adds green, cells it drops red
        const color = l.state === "add" ? 0x63c74d : 0xe43b44;
        l.g.fillStyle(color, l.state === "add" ? 0.2 : 0.35);
        l.g.fillPoints(pts, true);
        l.g.lineStyle(width * 1.5, color, 0.95);
        l.g.strokePoints(pts, true, true);
        continue;
      }
      // a light line on a slightly wider dark one: readable on bright sand and dark stone alike
      if (!l.hole) {
        l.g.lineStyle(width * 2.5, 0x000000, 0.22);
        l.g.strokePoints(pts, true, true);
      }
      l.g.lineStyle(width, 0xffffff, l.hole ? 0.35 : 0.4);
      l.g.strokePoints(pts, true, true);
    }
  }

  /**
   * Turns the view to `target` quarter turns: the map spins smoothly (eased, like the game) around
   * its centre cell, which stays where it is on screen; then everything is redrawn at the new angle.
   */
  turnTo(target: number, props: Props) {
    this.props = props;
    const view = this.view;
    if (!view) return;
    if (this.spin) {
      this.spin.complete(); // a new turn during a turn: finish the old one first
    }
    const from = this.shownRotation;
    let delta = (((target - from) % 4) + 4) % 4;
    if (delta === 3) delta = -1;
    if (delta === 0) return;
    const g = getGrid(props.db, props.mapId);
    const pivot = { x: Math.floor(g.width / 2), y: Math.floor(g.height / 2) };
    const cam = this.cameras.main;
    const start = view.cellTop(pivot.x, pivot.y);
    const offset = { x: cam.midPoint.x - start.x, y: cam.midPoint.y - start.y };
    for (const o of this.entityObjects) (o as unknown as { setVisible: (v: boolean) => void }).setVisible(false);
    for (const im of this.ghostImages) im.setVisible(false);
    this.ghostView?.destroy();
    this.ghostView = undefined;
    for (const p of this.replaced) view.setCellVisible(p.x, p.y, true);
    this.replaced = [];
    view.clearOverlay("hover");
    view.beginSpin();
    this.spin = this.tweens.addCounter({
      from: 0,
      to: 1,
      duration: TURN_MS * Math.abs(delta),
      ease: "Quad.easeOut", // starts turning at once, settles gently
      onUpdate: (tw) => {
        const q = from + delta * (tw.getValue() ?? 0);
        view.setTransform((x, y) => rotateContinuous(x, y, q));
        view.spinTo(q);
        view.relayout();
        const c = view.cellTop(pivot.x, pivot.y);
        cam.centerOn(c.x + offset.x, c.y + offset.y);
        this.drawGrid(); // the grid turns with the map
        this.onAngle?.(q);
      },
      onComplete: () => {
        this.spin = undefined;
        view.endSpin();
        this.shownRotation = target; // no re-centring: the camera already follows the pivot
        this.show(this.props);
        const c = this.view!.cellTop(pivot.x, pivot.y);
        cam.centerOn(c.x + offset.x, c.y + offset.y);
      },
    });
  }

  get spinning() {
    return !!this.spin;
  }

  /** Entities as the game's sprites; editor-only ones (spawns, invisible events…) as labels. */
  drawEntities() {
    for (const o of this.entityObjects) o.destroy();
    this.entityObjects = [];
    const view = this.view;
    if (!view) return;
    for (const e of this.props.entities) {
      if (!view.hasCell(e.x, e.y)) continue;
      const top = view.cellTop(e.x, e.y);
      if (e.texture && e.frame !== undefined && this.textures.exists(e.texture)) {
        const img = this.add.image(top.x, top.y + (e.flat ? 0 : 3), e.texture, e.frame);
        img.setOrigin(0.5, e.flat ? (e.texture === K.fieldEffects ? 16 / 24 : 0.5) : (e.originY ?? 1));
        img.setDepth(view.depthOf(e.x, e.y, e.flat ? LAYER.overlay + 1 : LAYER.char, 0.5));
        if (e.editorOnly) img.setAlpha(0.8);
        // outside Entity mode they are greyed out like the other layers not being edited
        if (this.props.focus !== "entity") img.setTint(0x8a8aa0).setAlpha(0.7);
        this.entityObjects.push(img);
      }
      if (e.label) {
        const t = this.add
          .text(top.x, top.y - (e.texture && !e.flat ? 30 : 4), e.label, {
            fontFamily: "system-ui, sans-serif",
            fontSize: "7px",
            color: e.selected ? "#181425" : e.editorOnly ? "#2ce8f5" : "#ffffff",
            backgroundColor: e.selected ? "#63c74d" : "#181425cc",
            padding: { x: 2, y: 1 },
          })
          .setOrigin(0.5, 1)
          .setResolution(6)
          .setDepth(view.depthOf(e.x, e.y, LAYER.marker + 1, 0));
        this.entityObjects.push(t);
      }
    }
  }

  /** The next placement, see-through, on the hovered cell. */
  drawGhost() {
    const g = this.props.ghost;
    const view = this.view;
    this.ghostView?.destroy();
    this.ghostView = undefined;
    for (const p of this.replaced) view?.setCellVisible(p.x, p.y, true);
    this.replaced = [];
    for (const im of this.ghostImages) im.setVisible(false);
    const cells = g?.cells ?? (this.hover ? [this.hover] : []);
    if (!g || !view || !cells.length || this.spin || !this.textures.exists(g.texture)) return;
    if (g.kind === "block") {
      // the blocks as they will be: their terrain, the piece shape, at the height they will get
      const chip = getGrid(this.props.db, this.props.mapId).chipset;
      const outline = cutSquare((g.cut ?? []).map((k) => CORNERS[k]));
      const src: IsoMapSource = {
        metrics: { tileWidth: chip.tileWidth, tileHeight: chip.tileHeight, blockHeight: chip.blockHeight },
        cells: cells.map((c) => ({ x: c.x, y: c.y, height: g.level ?? view.heightAt(c.x, c.y), top: g.frame, fill: g.fill ?? g.frame, outline })),
        blockTexture: g.texture,
        blockFrameHeight: chip.frameHeight,
        decorTexture: K.decor(chip.id),
        decorFrameHeight: chip.decorFrameHeight,
        decorAnchorY: chip.decorAnchorY,
      };
      // they replace the cells' blocks for now: same place in the drawing order, the old blocks hidden
      this.ghostView = new IsoMapView(this, src, (x, y) => rotateContinuous(x, y, this.shownRotation));
      this.ghostView.setPreviewLook(0.92, 0.001);
      for (const c of cells) view.setCellVisible(c.x, c.y, false);
      this.replaced = cells;
      return;
    }
    cells.forEach((c, i) => {
      const top = view.cellTop(c.x, c.y);
      const im = (this.ghostImages[i] ??= this.add.image(0, 0, g.texture, g.frame));
      im.setTexture(g.texture, g.frame)
        .setOrigin(0.5, g.originY)
        .setPosition(top.x, top.y)
        .setAlpha(0.65)
        .setDepth(view.depthOf(c.x, c.y, LAYER.decor, 0.9))
        .setVisible(true);
    });
  }

  drawMarkers() {
    if (!this.view || this.spin) return;
    this.view.setOverlay("markers", K.highlight, this.props.markers, { layer: LAYER.overlay, alpha: 0.75 });
    // the hovered cell: the game's board cursor, above decor and characters
    this.view.setOverlay("hover", K.boardCursor, this.hover ? [{ ...this.hover, frame: 0 }] : [], { layer: LAYER.marker, originY: 8 / 24 });
  }
}

export function IsoCanvas(props: Props) {
  const host = useRef<HTMLDivElement>(null);
  const latest = useRef(props);
  latest.current = props;
  const scene = useRef<MapScene | null>(null);

  const [angle, setAngle] = useState(props.rotation);

  useEffect(() => {
    const s = new MapScene(() => latest.current);
    s.onAngle = setAngle;
    scene.current = s;
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: host.current!,
      backgroundColor: "#14161c",
      pixelArt: true,
      scale: { mode: Phaser.Scale.RESIZE },
      input: { mouse: { preventDefaultWheel: true } },
      scene: s,
    });
    // Phaser only re-measures its canvas on window resizes; the editor's layout can move or resize
    // it (a toolbar wrapping, the inspector) – keep sizes and pointer positions right
    const observer = new ResizeObserver(() => game.scale.refresh());
    observer.observe(host.current!);
    const onScroll = () => game.scale.refresh();
    window.addEventListener("scroll", onScroll, true);
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", onScroll, true);
      scene.current = null;
      game.destroy(true);
    };
  }, []);

  // redraw when the content, the map or the visible layers change; a new angle alone turns smoothly
  const shown = useRef({ db: props.db, mapId: props.mapId, hideDecor: props.hideDecor, focus: props.focus, rotation: props.rotation });
  useEffect(() => {
    const s = scene.current;
    const prev = shown.current;
    shown.current = { db: props.db, mapId: props.mapId, hideDecor: props.hideDecor, focus: props.focus, rotation: props.rotation };
    if (!s?.view) return;
    const onlyTurned = prev.db === props.db && prev.mapId === props.mapId && prev.hideDecor === props.hideDecor && prev.focus === props.focus && prev.rotation !== props.rotation;
    if (onlyTurned) s.turnTo(props.rotation, latest.current);
    else s.show(latest.current);
  }, [props.db, props.mapId, props.rotation, props.hideDecor, props.focus]);

  useEffect(() => {
    const s = scene.current;
    if (s?.view) {
      s.props = latest.current;
      s.drawMarkers();
    }
  }, [props.markers]);

  useEffect(() => {
    const s = scene.current;
    if (s?.view) {
      s.props = latest.current;
      if (!s.spinning) s.drawEntities();
    }
  }, [props.entities]);

  useEffect(() => {
    const s = scene.current;
    if (s?.view) {
      s.props = latest.current;
      s.drawGhost();
    }
  }, [props.ghost]);

  useEffect(() => {
    const s = scene.current;
    if (s?.view) {
      s.props = latest.current;
      s.drawGrid();
    }
  }, [props.showGrid]);

  useEffect(() => {
    const s = scene.current;
    if (s?.view) {
      s.props = latest.current;
      s.buildGrid();
    }
  }, [props.resizeTo?.w, props.resizeTo?.h]);

  // handlers change every render – keep the scene's copy fresh without redrawing
  if (scene.current) scene.current.props = { ...scene.current.props, handlers: props.handlers };

  const chip = getGrid(props.db, props.mapId).chipset;
  return (
    <div class="iso-canvas">
      <div ref={host} class="phaser-host" />
      <AxisGizmo axes={isoAxes(angle, chip.tileHeight / chip.tileWidth)} />
    </div>
  );
}
