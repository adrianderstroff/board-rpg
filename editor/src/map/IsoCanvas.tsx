import Phaser from "phaser";
import { useEffect, useRef } from "preact/hooks";
import { getGrid } from "../../../src/core/board/grid";
import type { Database } from "../../../src/core/data/database";
import type { Pos } from "../../../src/core/util/grid";
import { loadSheet } from "../../../src/engine/assets";
import { LAYER } from "../../../src/engine/iso";
import { IsoMapView, type IsoMapSource } from "../../../src/engine/iso/IsoMapView";
import { isoMapSource, rotateContinuous, wallDecorSources } from "../../../src/game/board/mapSource";
import { K } from "../../../src/game/keys";
import type { EntitySprite } from "../entities/visuals";

/**
 * The map exactly as the game draws it (editor-design §5.1): the engine's IsoMapView fed by the
 * game's own map source. Left mouse = the tool, right/middle drag = pan, wheel = zoom.
 */

export interface CanvasHandlers {
  down(cell: Pos): void;
  move(cell: Pos | null, buttons: boolean): void;
  up(cell: Pos | null): void;
}

export interface Marker {
  x: number;
  y: number;
  /** highlight.png frame: 0 blue, 1 red, 2 green, 3 orange, 4 white, 5 grey. */
  frame: number;
}

interface Props {
  db: Database;
  mapId: string;
  rotation: number;
  hideDecor: boolean;
  /** Cells to highlight (rect preview, selection…). */
  markers: Marker[];
  /** Events, exits, enemies… placed on the map (editor-design §6). */
  entities: EntitySprite[];
  handlers: CanvasHandlers;
}

class MapScene extends Phaser.Scene {
  view?: IsoMapView;
  props!: Props;
  private shownMap?: string;
  private shownRotation = 0;
  private hover?: Pos | null;
  private pan?: { x: number; y: number; sx: number; sy: number };
  private painting = false;
  private entityObjects: Phaser.GameObjects.GameObject[] = [];

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
    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => {
      if (p.rightButtonDown() || p.middleButtonDown()) {
        const cam = this.cameras.main;
        this.pan = { x: p.x, y: p.y, sx: cam.scrollX, sy: cam.scrollY };
        return;
      }
      const cell = this.cellAt(p);
      if (cell) {
        this.painting = true;
        this.props.handlers.down(cell);
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
    this.input.on("wheel", (p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => {
      const cam = this.cameras.main;
      const before = cam.getWorldPoint(p.x, p.y);
      cam.setZoom(Phaser.Math.Clamp(cam.zoom * (dy > 0 ? 0.85 : 1 / 0.85), 0.5, 6));
      const after = cam.getWorldPoint(p.x, p.y);
      cam.scrollX += before.x - after.x;
      cam.scrollY += before.y - after.y;
    });
    this.show(this.props);
  }

  private cellAt(p: Phaser.Input.Pointer): Pos | null {
    const w = this.cameras.main.getWorldPoint(p.x, p.y);
    return this.view?.cellAt(w.x, w.y) ?? null;
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
    this.drawMarkers();
    this.drawEntities();
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

  drawMarkers() {
    if (!this.view) return;
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

  // redraw when the content, the map, the angle or the visible layers change
  useEffect(() => {
    const s = scene.current;
    if (s?.view) s.show(latest.current);
  }, [props.db, props.mapId, props.rotation, props.hideDecor]);

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
      s.drawEntities();
    }
  }, [props.entities]);

  // handlers change every render – keep the scene's copy fresh without redrawing
  if (scene.current) scene.current.props = { ...scene.current.props, handlers: props.handlers };

  return <div ref={host} class="iso-canvas" />;
}
