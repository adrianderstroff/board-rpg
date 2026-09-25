import Phaser from "phaser";
import { isoDepth, isoToScreen, LAYER, type IsoMetrics } from "../iso";

/** Engine-level description of one cell to draw (no game rules). */
export interface IsoCellSource {
  x: number;
  y: number;
  height: number;
  /** Frame of the surface block. */
  top: number;
  /** Optional animation frames for the surface. */
  topFrames?: number[];
  /** Frame for blocks below the surface. */
  fill: number;
  /** Surface drawn lower by this many pixels (water). */
  sink?: number;
  decor?: number;
}

export interface IsoMapSource {
  metrics: IsoMetrics;
  cells: IsoCellSource[];
  blockTexture: string;
  /** Frame size of block frames; the top diamond centre is at (w/2, tileHeight/2). */
  blockFrameHeight: number;
  decorTexture: string;
  decorFrameHeight: number;
  decorAnchorY: number;
}

export interface OverlayCell {
  x: number;
  y: number;
  frame: number;
}

/**
 * Draws an isometric height map as stacked blocks plus decor, and manages named overlay layers
 * (highlights, field effects, exit arrows...). Positions returned are world coordinates.
 */
export class IsoMapView {
  private readonly heights = new Map<string, number>();
  private readonly animated: { img: Phaser.GameObjects.Image; frames: number[] }[] = [];
  private readonly overlays = new Map<string, Phaser.GameObjects.GameObject[]>();
  private readonly images: Phaser.GameObjects.Image[] = [];
  private animTimer?: Phaser.Time.TimerEvent;
  readonly bounds: Phaser.Geom.Rectangle;

  constructor(
    private readonly scene: Phaser.Scene,
    readonly source: IsoMapSource,
  ) {
    const m = source.metrics;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const c of source.cells) {
      this.heights.set(`${c.x},${c.y}`, c.height);
      const base = isoToScreen(m, c.x, c.y, 0);
      for (let level = 0; level <= c.height; level++) {
        const top = level === c.height;
        const p = isoToScreen(m, c.x, c.y, level);
        const frame = top ? c.top : c.fill;
        const img = scene.add
          .image(p.x, p.y + (top ? (c.sink ?? 0) : 0), source.blockTexture, frame)
          .setOrigin(0.5, m.tileHeight / 2 / source.blockFrameHeight)
          .setDepth(isoDepth(c.x, c.y, LAYER.block, level * 0.01));
        this.images.push(img);
        if (top && c.topFrames && c.topFrames.length > 1) this.animated.push({ img, frames: c.topFrames });
      }
      if (c.decor !== undefined) {
        const p = isoToScreen(m, c.x, c.y, c.height);
        this.images.push(
          scene.add
            .image(p.x, p.y, source.decorTexture, c.decor)
            .setOrigin(0.5, source.decorAnchorY / source.decorFrameHeight)
            .setDepth(isoDepth(c.x, c.y, LAYER.decor)),
        );
      }
      const top = isoToScreen(m, c.x, c.y, c.height);
      minX = Math.min(minX, base.x - m.tileWidth / 2);
      maxX = Math.max(maxX, base.x + m.tileWidth / 2);
      minY = Math.min(minY, top.y - 48);
      maxY = Math.max(maxY, base.y + m.tileHeight / 2 + m.blockHeight);
    }
    this.bounds = new Phaser.Geom.Rectangle(minX, minY, maxX - minX, maxY - minY);
    if (this.animated.length) {
      let tick = 0;
      this.animTimer = scene.time.addEvent({
        delay: 600,
        loop: true,
        callback: () => {
          tick++;
          for (const a of this.animated) a.img.setFrame(a.frames[tick % a.frames.length]);
        },
      });
    }
  }

  heightAt(x: number, y: number): number {
    return this.heights.get(`${x},${y}`) ?? 0;
  }

  hasCell(x: number, y: number) {
    return this.heights.has(`${x},${y}`);
  }

  /** World position of the centre of a cell's top face. */
  cellTop(x: number, y: number): { x: number; y: number } {
    return isoToScreen(this.source.metrics, x, y, this.heightAt(x, y));
  }

  /** Cell under a world point, preferring the highest (front-most) cell whose top face contains it. */
  cellAt(wx: number, wy: number): { x: number; y: number } | null {
    const m = this.source.metrics;
    let best: { x: number; y: number; d: number } | null = null;
    for (const key of this.heights.keys()) {
      const [x, y] = key.split(",").map(Number);
      const p = this.cellTop(x, y);
      const dx = Math.abs(wx - p.x) / (m.tileWidth / 2);
      const dy = Math.abs(wy - p.y) / (m.tileHeight / 2);
      if (dx + dy <= 1) {
        const d = x + y; // front-most wins
        if (!best || d > best.d) best = { x, y, d };
      }
    }
    return best ? { x: best.x, y: best.y } : null;
  }

  /**
   * Replaces a named overlay layer. `originY` is the diamond centre inside the frame (0..1).
   * Animated overlays cycle through `frames` (frame + i).
   */
  setOverlay(name: string, texture: string, cells: OverlayCell[], opts: { originY?: number; layer?: number; alpha?: number; animFrames?: number; blink?: boolean } = {}) {
    this.clearOverlay(name);
    const objs: Phaser.GameObjects.GameObject[] = [];
    for (const c of cells) {
      const p = this.cellTop(c.x, c.y);
      const img = this.scene.add
        .sprite(p.x, p.y, texture, c.frame)
        .setOrigin(0.5, opts.originY ?? 0.5)
        .setDepth(isoDepth(c.x, c.y, opts.layer ?? LAYER.overlay))
        .setAlpha(opts.alpha ?? 1);
      if (opts.animFrames && opts.animFrames > 1) {
        let i = 0;
        const base = c.frame;
        const ev = this.scene.time.addEvent({ delay: 160, loop: true, callback: () => img.setFrame(base + (++i % opts.animFrames!)) });
        img.once("destroy", () => ev.remove());
      }
      if (opts.blink) this.scene.tweens.add({ targets: img, alpha: { from: opts.alpha ?? 1, to: (opts.alpha ?? 1) * 0.55 }, yoyo: true, repeat: -1, duration: 500 });
      objs.push(img);
    }
    this.overlays.set(name, objs);
  }

  clearOverlay(name: string) {
    for (const o of this.overlays.get(name) ?? []) o.destroy();
    this.overlays.delete(name);
  }

  destroy() {
    this.animTimer?.remove();
    for (const k of [...this.overlays.keys()]) this.clearOverlay(k);
    for (const img of this.images) img.destroy();
    this.images.length = 0;
  }
}
