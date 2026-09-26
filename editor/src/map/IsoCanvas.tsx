import Phaser from "phaser";
import { useEffect, useRef } from "preact/hooks";
import { getGrid } from "../../../src/core/board/grid";
import type { Database } from "../../../src/core/data/database";
import type { Pos } from "../../../src/core/util/grid";
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
}

/** Duration (ms) of a quarter turn of the view – eased like the game's board rotation. */
const TURN_MS = 650;

interface Props {
  db: Database;
  mapId: string;
  rotation: number;
  hideDecor: boolean;
  /** Grey one layer out so the other stands out: the terrain in decor mode, the decor in board mode. */
  dim: "board" | "decor" | null;
  /** Cells to highlight (rect preview, selection…). */
  markers: Marker[];
  /** Events, exits, enemies… placed on the map (editor-design §6). */
  entities: EntitySprite[];
  ghost: Ghost | null;
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
  private ghostImage?: Phaser.GameObjects.Image;
  /** A terrain ghost: a one-cell map view (so pieces are cut exactly like on the board), see-through. */
  private ghostView?: IsoMapView;
  /** The cell whose own blocks are hidden while the ghost stands in for them. */
  private replaced?: Pos;
  /** A faint white grid on the empty cells inside the map's size (holes, where nothing is placed). */
  private holeGrid: Phaser.GameObjects.Graphics[] = [];
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
    this.view.setBlockTint(props.dim === "board" ? 0x6f7086 : null);
    this.view.setDecorTint(props.dim === "decor" ? 0x8a8aa0 : null);
    this.drawMarkers();
    this.drawEntities();
    this.drawGhost();
    this.drawHoleGrid();
  }

  drawHoleGrid() {
    for (const g of this.holeGrid) g.destroy();
    this.holeGrid = [];
    const view = this.view;
    if (!view || this.spin) return;
    const grid = getGrid(this.props.db, this.props.mapId);
    const hw = grid.chipset.tileWidth / 2;
    const hh = grid.chipset.tileHeight / 2;
    for (let y = 0; y < grid.height; y++)
      for (let x = 0; x < grid.width; x++) {
        if (grid.has({ x, y })) continue;
        const c = view.cellTop(x, y);
        const g = this.add.graphics().setDepth(view.depthOf(x, y, LAYER.block, 0));
        g.lineStyle(1, 0xffffff, 0.28);
        g.strokePoints([new Phaser.Math.Vector2(c.x, c.y - hh), new Phaser.Math.Vector2(c.x + hw, c.y), new Phaser.Math.Vector2(c.x, c.y + hh), new Phaser.Math.Vector2(c.x - hw, c.y)], true, true);
        this.holeGrid.push(g);
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
    this.ghostImage?.setVisible(false);
    this.ghostView?.destroy();
    this.ghostView = undefined;
    for (const g of this.holeGrid) g.setVisible(false);
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
    if (this.replaced) view?.setCellVisible(this.replaced.x, this.replaced.y, true);
    this.replaced = undefined;
    if (!g || !view || !this.hover || this.spin || !this.textures.exists(g.texture)) {
      this.ghostImage?.setVisible(false);
      return;
    }
    const h = this.hover;
    if (g.kind === "block") {
      // the block as it will be: its terrain, its piece shape, at the height it will get
      this.ghostImage?.setVisible(false);
      const chip = getGrid(this.props.db, this.props.mapId).chipset;
      const src: IsoMapSource = {
        metrics: { tileWidth: chip.tileWidth, tileHeight: chip.tileHeight, blockHeight: chip.blockHeight },
        cells: [{ x: h.x, y: h.y, height: g.level ?? view.heightAt(h.x, h.y), top: g.frame, fill: g.fill ?? g.frame, outline: cutSquare((g.cut ?? []).map((k) => CORNERS[k])) }],
        blockTexture: g.texture,
        blockFrameHeight: chip.frameHeight,
        decorTexture: K.decor(chip.id),
        decorFrameHeight: chip.decorFrameHeight,
        decorAnchorY: chip.decorAnchorY,
      };
      // it replaces the cell's block for now: same place in the drawing order, the old block hidden
      this.ghostView = new IsoMapView(this, src, (x, y) => rotateContinuous(x, y, this.shownRotation));
      this.ghostView.setPreviewLook(0.92, 0.001);
      view.setCellVisible(h.x, h.y, false);
      this.replaced = { x: h.x, y: h.y };
      return;
    }
    const top = view.cellTop(h.x, h.y);
    if (!this.ghostImage) this.ghostImage = this.add.image(0, 0, g.texture, g.frame);
    this.ghostImage
      .setTexture(g.texture, g.frame)
      .setOrigin(0.5, g.originY)
      .setPosition(top.x, top.y)
      .setAlpha(0.65)
      .setDepth(view.depthOf(h.x, h.y, LAYER.decor, 0.9))
      .setVisible(true);
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

  useEffect(() => {
    const s = new MapScene(() => latest.current);
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
  const shown = useRef({ db: props.db, mapId: props.mapId, hideDecor: props.hideDecor, dim: props.dim, rotation: props.rotation });
  useEffect(() => {
    const s = scene.current;
    const prev = shown.current;
    shown.current = { db: props.db, mapId: props.mapId, hideDecor: props.hideDecor, dim: props.dim, rotation: props.rotation };
    if (!s?.view) return;
    const onlyTurned = prev.db === props.db && prev.mapId === props.mapId && prev.hideDecor === props.hideDecor && prev.dim === props.dim && prev.rotation !== props.rotation;
    if (onlyTurned) s.turnTo(props.rotation, latest.current);
    else s.show(latest.current);
  }, [props.db, props.mapId, props.rotation, props.hideDecor, props.dim]);

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

  // handlers change every render – keep the scene's copy fresh without redrawing
  if (scene.current) scene.current.props = { ...scene.current.props, handlers: props.handlers };

  return <div ref={host} class="iso-canvas" />;
}
