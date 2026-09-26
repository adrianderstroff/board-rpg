import Phaser from "phaser";
import { isoDepth, isoToScreen, LAYER, type IsoMetrics } from "../iso";
import { coversSide, edgeNormal, edgeSide, flareMiters, flareOffset, SIDE_OFFSETS, UNIT_SQUARE, type Pt } from "./shapes";

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
  /** A directional object: one decor frame per view (quarter turns 0..3), chosen by the board's rotation. */
  decorViews?: number[];
  /** Clicking the decor's picture picks this cell (stairs rising over the wall behind them). */
  pickDecor?: boolean;
  /** Blocks floating above the cell (a door lintel): levels `from`…`to`, `top` frame on the last. */
  overhead?: { from: number; to: number; top: number; fill: number };
  /** Shaped block: the top is this convex polygon inside the unit square (see shapes.ts). */
  outline?: Pt[];
  /** Hull flare: sides without a flared neighbour lean inward by this much (grid units) at the bottom. */
  flare?: number;
  /** A flat surface drawn under a shaped column (the water around a hull); its sides start there. */
  under?: { frame: number; height: number; sink: number };
  /**
   * A low wall along the hull's outer edges (a ship's bulwark): `height` in levels, `thickness`
   * in cells; `open` = sides (0 +x, 1 +y, 2 -x, 3 -y) left open (a gangway).
   */
  bulwark?: { height: number; thickness: number; open: number[] };
}

const isShaped = (c: IsoCellSource) => !!c.outline || !!c.flare;

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
 * Flat artwork (lettering) painted onto one side face of a block: mapped onto the face as a quad,
 * so it is distorted like the wall, and only drawn while that side faces the camera.
 */
export interface WallDecorSource {
  x: number;
  y: number;
  /** Outward normal of the side in grid coordinates (e.g. {x:0,y:1}). */
  face: { x: number; y: number };
  /** Block level whose side it is painted on. */
  level: number;
  texture: string;
  frame: number;
}

/** Maps source grid coordinates to view grid coordinates (e.g. a rotation, possibly fractional). */
export type GridTransform = (x: number, y: number) => { x: number; y: number };

const IDENTITY: GridTransform = (x, y) => ({ x, y });

/** How far (px) spinning faces grow outward so neighbouring faces overlap without seams. */
const SEAM_GROW = 0.6;

/**
 * Appends a convex polygon (screen points + texture coords) as a triangle fan. Against hairline
 * seams the face grows ~0.6px outward and texture corners move half a texel inward.
 */
function pushPoly(verts: number[], idx: number[], pts: number[][], uvs: number[][], texW: number, texH: number) {
  const base = verts.length / 4;
  const n = pts.length;
  const cx = pts.reduce((s, p) => s + p[0], 0) / n;
  const cy = pts.reduce((s, p) => s + p[1], 0) / n;
  const cu = uvs.reduce((s, p) => s + p[0], 0) / n;
  const cv = uvs.reduce((s, p) => s + p[1], 0) / n;
  for (let i = 0; i < n; i++) {
    const dx = pts[i][0] - cx;
    const dy = pts[i][1] - cy;
    const len = Math.hypot(dx, dy) || 1;
    const u = uvs[i][0] + Math.sign(cu - uvs[i][0]) * (0.5 / texW);
    const v = uvs[i][1] + Math.sign(cv - uvs[i][1]) * (0.5 / texH);
    verts.push(pts[i][0] + (dx / len) * SEAM_GROW, pts[i][1] + (dy / len) * SEAM_GROW, u, v);
  }
  for (let i = 1; i < n - 1; i++) idx.push(base, base + i, base + i + 1, 0);
}

/** Rotates a grid offset by quarter turns (the same sense as the view's rotation). */
function rotQ(x: number, y: number, q: number): [number, number] {
  for (let i = 0; i < ((q % 4) + 4) % 4; i++) [x, y] = [-y, x];
  return [x, y];
}

/** One cell column drawn as a mesh while the map spins. */
interface SpinColumn {
  c: IsoCellSource;
  mesh: Phaser.GameObjects.Mesh2D;
  /** Neighbour heights on the +x, +y, -x, -y sides (-1 = no cell). */
  nb: number[];
}

interface Placed {
  obj: Phaser.GameObjects.Image | Phaser.GameObjects.Sprite;
  /** Source grid cell. */
  x: number;
  y: number;
  /** Block level (blocks), otherwise the cell height. */
  level: number;
  /** Extra screen y offset (water sink). */
  dy: number;
  layer: number;
  sub: number;
  /** Frames per view of a directional object (see IsoCellSource.decorViews). */
  views?: number[];
  /** Its picture picks the cell (see IsoCellSource.pickDecor). */
  pick?: boolean;
}

/**
 * Draws an isometric height map as stacked blocks plus decor, and manages named overlay layers
 * (highlights, field effects, exit arrows...). All coordinates in the API are *source* grid
 * coordinates; a {@link GridTransform} decides where they end up on screen, which allows the map
 * to be rotated – also smoothly, frame by frame, via `setTransform` + `relayout`.
 */
export class IsoMapView {
  private readonly heights = new Map<string, number>();
  private readonly animated: { img: Phaser.GameObjects.Image; frames: number[] }[] = [];
  private readonly overlays = new Map<string, Placed[]>();
  private readonly placed: Placed[] = [];
  private readonly wallDecor: { src: WallDecorSource; mesh: Phaser.GameObjects.Mesh2D }[] = [];
  /** Surface block of each cell (for terrain changes). */
  private readonly tops = new Map<string, Phaser.GameObjects.Image>();
  private animTimer?: Phaser.Time.TimerEvent;
  /** Shaped columns (ship hulls…) are always meshes. */
  private readonly shaped: { c: IsoCellSource; mesh: Phaser.GameObjects.Mesh2D }[] = [];
  private readonly byPos = new Map<string, IsoCellSource>();
  private miters = new Map<string, Pt>();
  private transform: GridTransform = IDENTITY;
  /** Sprite-stacked terrain while the map spins (see beginSpin). */
  private spin?: { cols: SpinColumn[]; texW: number; texH: number; frame: (i: number) => Phaser.Textures.Frame };
  bounds = new Phaser.Geom.Rectangle();

  constructor(
    private readonly scene: Phaser.Scene,
    readonly source: IsoMapSource,
    transform?: GridTransform,
  ) {
    const m = source.metrics;
    if (transform) this.transform = transform;
    for (const c of source.cells) this.byPos.set(`${c.x},${c.y}`, c);
    this.miters = flareMiters(source.cells.filter((c) => c.flare).map((c) => ({ x: c.x, y: c.y, outline: c.outline ?? UNIT_SQUARE })));
    for (const c of source.cells) {
      this.heights.set(`${c.x},${c.y}`, c.height);
      if (isShaped(c)) {
        const mesh = scene.add.mesh2d(0, 0, source.blockTexture, [], []);
        mesh.setRenderAsTriangles(true);
        this.shaped.push({ c, mesh });
      }
      for (let level = 0; level <= c.height && !isShaped(c); level++) {
        const top = level === c.height;
        const img = scene.add
          .image(0, 0, source.blockTexture, top ? c.top : c.fill)
          .setOrigin(0.5, m.tileHeight / 2 / source.blockFrameHeight);
        this.placed.push({ obj: img, x: c.x, y: c.y, level, dy: top ? (c.sink ?? 0) : 0, layer: LAYER.block, sub: level * 0.01 });
        if (top) this.tops.set(`${c.x},${c.y}`, img);
        if (top && c.topFrames && c.topFrames.length > 1) this.animated.push({ img, frames: c.topFrames });
      }
      const oh = c.overhead;
      if (oh) {
        for (let level = oh.from; level <= oh.to; level++) {
          const img = scene.add
            .image(0, 0, source.blockTexture, level === oh.to ? oh.top : oh.fill)
            .setOrigin(0.5, m.tileHeight / 2 / source.blockFrameHeight);
          // same draw layer as the cell's own blocks; characters in the doorway use a higher layer
          this.placed.push({ obj: img, x: c.x, y: c.y, level, dy: 0, layer: LAYER.block, sub: level * 0.01 });
        }
      }
      if (c.decor !== undefined) {
        const img = scene.add.image(0, 0, source.decorTexture, c.decor).setOrigin(0.5, source.decorAnchorY / source.decorFrameHeight);
        // on a door with a lintel, decor (a shop sign) sits on top of the lintel
        this.placed.push({ obj: img, x: c.x, y: c.y, level: c.overhead ? c.overhead.to : c.height, dy: 0, layer: LAYER.decor, sub: 0, views: c.decorViews, pick: c.pickDecor });
      }
    }
    this.relayout();
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

  setTransform(t: GridTransform) {
    this.transform = t;
  }

  /** Removes a cell's decor (burnt away). */
  /** Sets (frame) or removes (undefined) a cell's decor – burnt, cut or grown plants, gates, switches. */
  setDecor(x: number, y: number, frame: number | undefined, opts: { ground?: boolean } = {}) {
    const i = this.placed.findIndex((p) => p.layer === LAYER.decor && p.x === x && p.y === y);
    if (frame === undefined) {
      if (i < 0) return;
      this.placed[i].obj.destroy();
      this.placed.splice(i, 1);
      return;
    }
    if (i >= 0) {
      (this.placed[i].obj as Phaser.GameObjects.Image).setFrame(frame);
      return;
    }
    const src = this.source.cells.find((c) => c.x === x && c.y === y);
    const img = this.scene.add.image(0, 0, this.source.decorTexture, frame).setOrigin(0.5, this.source.decorAnchorY / this.source.decorFrameHeight);
    // on a door with a lintel, decor sits on top of the lintel (a sign) – unless it belongs on the floor (a gate)
    const level = src?.overhead && !opts.ground ? src.overhead.to : (src?.height ?? this.heightAt(x, y));
    const p: Placed = { obj: img, x, y, level, dy: 0, layer: LAYER.decor, sub: 0 };
    this.placed.push(p);
    this.position(p);
  }

  /** Changes a cell's surface graphic (terrain changed, e.g. burnt). */
  setTop(x: number, y: number, frame: number, frames?: number[]) {
    const src = this.source.cells.find((c) => c.x === x && c.y === y);
    const img = this.tops.get(`${x},${y}`);
    if (src && isShaped(src)) {
      src.top = frame;
      this.relayout();
      return;
    }
    if (!src || !img) return;
    src.top = frame;
    src.topFrames = frames;
    img.setFrame(frame);
    const i = this.animated.findIndex((a) => a.img === img);
    if (i >= 0) this.animated.splice(i, 1);
    if (frames && frames.length > 1) this.animated.push({ img, frames });
  }

  /** Repositions every block, decor and overlay for the current transform and updates `bounds`. */
  relayout() {
    const m = this.source.metrics;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    // While spinning the blocks are hidden (the slice stack stands in for them): only move decor.
    for (const p of this.placed) if (!this.spin || p.layer !== LAYER.block) this.position(p);
    if (!this.spin) {
      const r = this.staticQuarter();
      for (const s of this.shaped) this.drawShaped(s.c, s.mesh, r);
    }
    for (const c of this.source.cells) {
      const v = this.transform(c.x, c.y);
      const base = isoToScreen(m, v.x, v.y, 0);
      const top = isoToScreen(m, v.x, v.y, c.height);
      minX = Math.min(minX, base.x - m.tileWidth / 2);
      maxX = Math.max(maxX, base.x + m.tileWidth / 2);
      minY = Math.min(minY, top.y - 48);
      maxY = Math.max(maxY, base.y + m.tileHeight / 2 + m.blockHeight);
    }
    this.bounds.setTo(minX, minY, maxX - minX, maxY - minY);
    for (const list of this.overlays.values()) for (const p of list) this.position(p);
    for (const w of this.wallDecor) this.positionWall(w);
  }

  /** Paints artwork onto block sides (see WallDecorSource). */
  setWallDecor(list: WallDecorSource[]) {
    for (const w of this.wallDecor) w.mesh.destroy();
    this.wallDecor.length = 0;
    for (const src of list) {
      const mesh = this.scene.add.mesh2d(0, 0, src.texture, [], []);
      mesh.setRenderAsTriangles(true);
      const w = { src, mesh };
      this.wallDecor.push(w);
      this.positionWall(w);
    }
  }

  private positionWall(w: { src: WallDecorSource; mesh: Phaser.GameObjects.Mesh2D }) {
    const { src, mesh } = w;
    const m = this.source.metrics;
    const c = this.transform(src.x, src.y);
    const f = this.transform(src.x + src.face.x * 0.5, src.y + src.face.y * 0.5);
    // visible only while the side faces the camera (its normal points toward +x+y in view)
    const facing = f.x - c.x + (f.y - c.y) > 0.05;
    mesh.setVisible(facing);
    if (!facing) return;
    // the side's two corners (offsets from the cell centre), left → right as seen on screen
    const tx = -src.face.y * 0.5;
    const ty = src.face.x * 0.5;
    const ends = [
      [src.face.x * 0.5 + tx, src.face.y * 0.5 + ty],
      [src.face.x * 0.5 - tx, src.face.y * 0.5 - ty],
    ]
      .map((o) => ({ o, v: this.transform(src.x + o[0], src.y + o[1]) }))
      .sort((a, b) => a.v.x - a.v.y - (b.v.x - b.v.y));
    // k = position along the side in cells from its centre (may reach past the cell)
    const at = (k: number, h: number) => {
      const t = 0.5 + k;
      const v = { x: ends[0].v.x + (ends[1].v.x - ends[0].v.x) * t, y: ends[0].v.y + (ends[1].v.y - ends[0].v.y) * t };
      return isoToScreen(m, v.x, v.y, h);
    };
    const tex = this.scene.textures.get(src.texture);
    const fr = tex.get(src.frame);
    const tw = tex.source[0].width;
    const th = tex.source[0].height;
    const u0 = fr.cutX / tw;
    const u1 = (fr.cutX + fr.cutWidth) / tw;
    const v0 = 1 - fr.cutY / th; // GL textures run bottom-up
    const v1 = 1 - (fr.cutY + fr.cutHeight) / th;
    // native pixel size, centred on the side, hanging down from the top of block `level`:
    // one cell along a side is tileWidth/2 px across, one level is blockHeight px tall
    const half = fr.cutWidth / m.tileWidth;
    const hTop = src.level;
    const hBot = src.level - fr.cutHeight / m.blockHeight;
    const p0 = at(-half, hTop), p1 = at(half, hTop), p2 = at(half, hBot), p3 = at(-half, hBot);
    mesh.vertices = [p0.x, p0.y, u0, v0, p1.x, p1.y, u1, v0, p2.x, p2.y, u1, v1, p3.x, p3.y, u0, v1];
    mesh.indices = [0, 1, 2, 0, 0, 2, 3, 0];
    mesh.setDepth(isoDepth(c.x, c.y, LAYER.block, src.level * 0.01 + 0.005));
  }

  private position(p: Placed) {
    // directional objects turn their facing at the half-way point of a spin, like characters
    if (p.views) (p.obj as Phaser.GameObjects.Image).setFrame(p.views[this.staticQuarter() % p.views.length]);
    const v = this.transform(p.x, p.y);
    const s = isoToScreen(this.source.metrics, v.x, v.y, p.level);
    p.obj.setPosition(s.x, s.y + p.dy).setDepth(isoDepth(v.x, v.y, p.layer, p.sub));
  }

  heightAt(x: number, y: number): number {
    return this.heights.get(`${x},${y}`) ?? 0;
  }

  hasCell(x: number, y: number) {
    return this.heights.has(`${x},${y}`);
  }

  /** Camera-world position of the centre of a (source) cell's top face. */
  cellTop(x: number, y: number): { x: number; y: number } {
    const v = this.transform(x, y);
    return isoToScreen(this.source.metrics, v.x, v.y, this.heightAt(x, y));
  }

  /** Draw order value of a (source) cell for a layer – for sprites placed by others. */
  depthOf(x: number, y: number, layer: number, sub = 0): number {
    const v = this.transform(x, y);
    return isoDepth(v.x, v.y, layer, sub);
  }

  /** Source cell under a camera-world point, preferring the front-most cell whose top face contains it. */
  cellAt(wx: number, wy: number): { x: number; y: number } | null {
    const m = this.source.metrics;
    let best: { x: number; y: number; d: number } | null = null;
    // walk-over decor that rises above its cell (stairs): its opaque pixels pick the cell
    for (const p of this.placed) {
      if (!p.pick || p.layer !== LAYER.decor) continue;
      const img = p.obj as Phaser.GameObjects.Image;
      const lx = Math.floor(wx - img.x + img.displayOriginX);
      const ly = Math.floor(wy - img.y + img.displayOriginY);
      if (lx < 0 || ly < 0 || lx >= img.width || ly >= img.height) continue;
      if (this.scene.textures.getPixelAlpha(lx, ly, img.texture.key, img.frame.name) <= 0) continue;
      const v = this.transform(p.x, p.y);
      const d = v.x + v.y;
      if (!best || d > best.d) best = { x: p.x, y: p.y, d };
    }
    for (const key of this.heights.keys()) {
      const [x, y] = key.split(",").map(Number);
      const p = this.cellTop(x, y);
      const dx = Math.abs(wx - p.x) / (m.tileWidth / 2);
      const dy = Math.abs(wy - p.y) / (m.tileHeight / 2);
      if (dx + dy <= 1) {
        const v = this.transform(x, y);
        const d = v.x + v.y; // front-most wins
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
    const list: Placed[] = [];
    for (const c of cells) {
      const img = this.scene.add
        .sprite(0, 0, texture, c.frame)
        .setOrigin(0.5, opts.originY ?? 0.5)
        .setAlpha(opts.alpha ?? 1);
      const p: Placed = { obj: img, x: c.x, y: c.y, level: this.heightAt(c.x, c.y), dy: 0, layer: opts.layer ?? LAYER.overlay, sub: 0 };
      this.position(p);
      if (opts.animFrames && opts.animFrames > 1) {
        let i = 0;
        const base = c.frame;
        const ev = this.scene.time.addEvent({ delay: 160, loop: true, callback: () => img.setFrame(base + (++i % opts.animFrames!)) });
        img.once("destroy", () => ev.remove());
      }
      if (opts.blink) this.scene.tweens.add({ targets: img, alpha: { from: opts.alpha ?? 1, to: (opts.alpha ?? 1) * 0.55 }, yoyo: true, repeat: -1, duration: 500 });
      list.push(p);
    }
    this.overlays.set(name, list);
  }

  // ---------- spinning as one solid (real geometry) ----------

  /**
   * Starts a smooth map rotation. Every cell column is replaced by a textured mesh – its top face
   * plus the side faces that face the camera, cut from the same chipset frames – whose corners
   * follow the grid transform. So the ground turns as one solid (the faces stay attached to their
   * cells, heights stay vertical) and looks exactly like the blocks at the start and the end.
   * Columns are depth-sorted per cell like the blocks, so decor and characters (positioned by
   * the transform, upright) still go in front of and behind them. Overlays are hidden.
   */
  beginSpin() {
    if (this.spin) return;
    const tex = this.scene.textures.get(this.source.blockTexture);
    const heights = this.heights;
    const cols: SpinColumn[] = this.source.cells.map((c) => {
      const mesh = this.scene.add.mesh2d(0, 0, this.source.blockTexture, [], []);
      mesh.setRenderAsTriangles(true);
      const nb = (dx: number, dy: number) => {
        const n = this.byPos.get(`${c.x + dx},${c.y + dy}`);
        if (!n) return -1;
        const side = SIDE_OFFSETS.findIndex(([ox, oy]) => ox === -dx && oy === -dy);
        return n.outline && !coversSide(n.outline, side) ? -1 : (heights.get(`${c.x + dx},${c.y + dy}`) ?? -1);
      };
      return { c, mesh, nb: [nb(1, 0), nb(0, 1), nb(-1, 0), nb(0, -1)] };
    });
    const src = tex.source[0];
    this.spin = { cols, texW: src.width, texH: src.height, frame: (i) => tex.get(i) };
    for (const p of this.placed) if (p.layer === LAYER.block) p.obj.setVisible(false);
    for (const s of this.shaped) s.mesh.setVisible(false);
    for (const list of this.overlays.values()) for (const p of list) p.obj.setVisible(false);
  }

  /** Current angle (quarter turns, absolute like the grid transform): rebuilds the column meshes. */
  spinTo(quarters: number) {
    const spin = this.spin;
    if (!spin) return;
    const m = this.source.metrics;
    const bh = m.blockHeight;
    const r = Math.round(quarters);
    const a = (quarters * Math.PI) / 2;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    // outward normals of the four sides (grid): +x, +y, -x, -y
    const NORMALS = [
      [1, 0],
      [0, 1],
      [-1, 0],
      [0, -1],
    ];
    // the two corners (offsets from the cell centre) of each side
    const SIDE_CORNERS = [
      [[0.5, -0.5], [0.5, 0.5]],
      [[0.5, 0.5], [-0.5, 0.5]],
      [[-0.5, 0.5], [-0.5, -0.5]],
      [[-0.5, -0.5], [0.5, -0.5]],
    ];
    const rot = (dx: number, dy: number, q: number) => {
      let x = dx;
      let y = dy;
      for (let i = 0; i < ((q % 4) + 4) % 4; i++) [x, y] = [-y, x];
      return [x, y];
    };
    for (const col of spin.cols) {
      const { c } = col;
      if (isShaped(c)) {
        this.drawShaped(c, col.mesh, r);
        continue;
      }
      const sink = c.sink ?? 0;
      const verts: number[] = [];
      const idx: number[] = [];
      const uv = (frame: number, px: number, py: number) => {
        const f = spin.frame(frame);
        return [(f.cutX + px) / spin.texW, 1 - (f.cutY + py) / spin.texH]; // GL textures run bottom-up
      };
      const corner = (dx: number, dy: number, h: number, extra = 0) => {
        const v = this.transform(c.x + dx, c.y + dy);
        const s = isoToScreen(m, v.x, v.y, 0);
        return [s.x, s.y - h * bh + extra];
      };
      const quad = (pts: number[][], uvs: number[][]) => {
        const base = verts.length / 4;
        // Against hairline seams: faces grow ~0.6px outward so neighbours overlap, and texture
        // corners move half a texel inward so no pixel of a neighbouring frame is sampled.
        const cx = (pts[0][0] + pts[1][0] + pts[2][0] + pts[3][0]) / 4;
        const cy = (pts[0][1] + pts[1][1] + pts[2][1] + pts[3][1]) / 4;
        const cu = (uvs[0][0] + uvs[1][0] + uvs[2][0] + uvs[3][0]) / 4;
        const cv = (uvs[0][1] + uvs[1][1] + uvs[2][1] + uvs[3][1]) / 4;
        for (let i = 0; i < 4; i++) {
          const dx = pts[i][0] - cx;
          const dy = pts[i][1] - cy;
          const len = Math.hypot(dx, dy) || 1;
          const u = uvs[i][0] + Math.sign(cu - uvs[i][0]) * (0.5 / spin.texW);
          const v = uvs[i][1] + Math.sign(cv - uvs[i][1]) * (0.5 / spin.texH);
          verts.push(pts[i][0] + (dx / len) * SEAM_GROW, pts[i][1] + (dy / len) * SEAM_GROW, u, v);
        }
        idx.push(base, base + 1, base + 2, 0, base, base + 2, base + 3, 0);
      };
      // side faces toward the camera, from the lowest visible level up
      for (let side = 0; side < 4; side++) {
        const [nx, ny] = NORMALS[side];
        const vx = nx * ca - ny * sa;
        const vy = nx * sa + ny * ca;
        if (vx + vy <= 1e-6) continue; // faces away
        const left = vy >= vx; // points down-left on screen → the frame's left face
        const [p, q] = SIDE_CORNERS[side];
        // order the two ends by screen x: texture u runs left → right
        const ends = [p, q].map((o) => ({ o, sx: corner(o[0], o[1], 0)[0] })).sort((e1, e2) => e1.sx - e2.sx);
        const [e0, e1] = [ends[0].o, ends[1].o];
        for (let level = Math.max(col.nb[side], -1) + 1; level <= c.height; level++) {
          const top = level === c.height;
          const frame = top ? c.top : c.fill;
          const dy = top ? sink : 0;
          // texture: left face = (0,8)-(16,16) top edge, 8px tall; right face = (16,16)-(32,8)
          const t0 = left ? [0, 8 + dy] : [16, 16 + dy];
          const t1 = left ? [16, 16 + dy] : [32, 8 + dy];
          const b0 = left ? [0, 16] : [16, 24];
          const b1 = left ? [16, 24] : [32, 16];
          quad(
            [corner(e0[0], e0[1], level, dy), corner(e1[0], e1[1], level, dy), corner(e1[0], e1[1], level - 1), corner(e0[0], e0[1], level - 1)],
            [uv(frame, t0[0], t0[1]), uv(frame, t1[0], t1[1]), uv(frame, b1[0], b1[1]), uv(frame, b0[0], b0[1])],
          );
        }
      }
      // a lintel above a door: its sides toward the camera and its top
      const oh = c.overhead;
      if (oh) {
        for (let side = 0; side < 4; side++) {
          const [nx, ny] = NORMALS[side];
          const vx = nx * ca - ny * sa;
          const vy = nx * sa + ny * ca;
          if (vx + vy <= 1e-6) continue;
          const left = vy >= vx;
          const [p, q] = SIDE_CORNERS[side];
          const ends = [p, q].map((o) => ({ o, sx: corner(o[0], o[1], 0)[0] })).sort((e1, e2) => e1.sx - e2.sx);
          const [e0, e1] = [ends[0].o, ends[1].o];
          for (let level = Math.max(oh.from, col.nb[side] + 1); level <= oh.to; level++) {
            const frame = level === oh.to ? oh.top : oh.fill;
            const t0 = left ? [0, 8] : [16, 16];
            const t1 = left ? [16, 16] : [32, 8];
            const b0 = left ? [0, 16] : [16, 24];
            const b1 = left ? [16, 24] : [32, 16];
            quad(
              [corner(e0[0], e0[1], level), corner(e1[0], e1[1], level), corner(e1[0], e1[1], level - 1), corner(e0[0], e0[1], level - 1)],
              [uv(frame, t0[0], t0[1]), uv(frame, t1[0], t1[1]), uv(frame, b1[0], b1[1]), uv(frame, b0[0], b0[1])],
            );
          }
        }
        const ocs = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]];
        const DIA: Record<string, number[]> = { "-1,-1": [16, 0], "1,-1": [32, 8], "1,1": [16, 16], "-1,1": [0, 8] };
        quad(
          ocs.map((o) => corner(o[0], o[1], oh.to)),
          ocs.map((o) => {
            const [rx, ry] = rot(Math.sign(o[0]), Math.sign(o[1]), r);
            const t = DIA[`${rx},${ry}`];
            return uv(oh.top, t[0], t[1]);
          }),
        );
      }
      // top face: the diamond stays upright in view (texture corners follow the nearest quarter turn)
      const DIAMOND: Record<string, number[]> = { "-1,-1": [16, 0], "1,-1": [32, 8], "1,1": [16, 16], "-1,1": [0, 8] };
      const cs = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]];
      quad(
        cs.map((o) => corner(o[0], o[1], c.height, sink)),
        cs.map((o) => {
          const [rx, ry] = rot(Math.sign(o[0]), Math.sign(o[1]), r);
          const t = DIAMOND[`${rx},${ry}`];
          return uv(c.top, t[0], t[1] + sink);
        }),
      );
      col.mesh.vertices = verts;
      col.mesh.indices = idx;
      const v = this.transform(c.x, c.y);
      col.mesh.setDepth(isoDepth(v.x, v.y, LAYER.block, c.height * 0.01));
    }
  }

  /** Back to normal blocks (call relayout with the final transform afterwards). */
  endSpin() {
    if (!this.spin) return;
    for (const col of this.spin.cols) col.mesh.destroy();
    this.spin = undefined;
    for (const p of this.placed) if (p.layer === LAYER.block) p.obj.setVisible(true);
    for (const s of this.shaped) s.mesh.setVisible(true);
    for (const list of this.overlays.values()) for (const p of list) p.obj.setVisible(true);
  }

  /** The ship's low wall on the column's outer hull edges: inner faces, outer faces, then the caps. */
  private drawBulwark(
    c: IsoCellSource,
    outline: Pt[],
    verts: number[],
    idx: number[],
    uv: (frame: number, px: number, py: number) => number[],
    topUv: (frame: number, p: Pt, dy: number) => number[],
    _r: number,
  ) {
    const bw = c.bulwark!;
    const m = this.source.metrics;
    const tex = this.scene.textures.get(this.source.blockTexture);
    const texW = tex.source[0].width;
    const texH = tex.source[0].height;
    const t0 = this.transform(c.x, c.y);
    const faces = (n: Pt) => {
      const t1 = this.transform(c.x + n[0], c.y + n[1]);
      return { vx: t1.x - t0.x, vy: t1.y - t0.y };
    };
    // a point of the wall: local p moved inward by `k` along the hull's mitred offset
    const pt = (p: Pt, k: number, level: number) => {
      const o = flareOffset(this.miters, c.x + p[0], c.y + p[1]);
      const v = this.transform(c.x + p[0] + o[0] * k, c.y + p[1] + o[1] * k);
      const s = isoToScreen(m, v.x, v.y, 0);
      return [s.x, s.y - level * m.blockHeight];
    };
    const local = (p: Pt, k: number): Pt => {
      const o = flareOffset(this.miters, c.x + p[0], c.y + p[1]);
      return [p[0] + o[0] * k, p[1] + o[1] * k];
    };
    const lo = c.height;
    const hi = c.height + bw.height;
    const rows = Math.max(1, Math.round(8 * bw.height)); // texture rows of the wall's height
    const edges: { a: Pt; b: Pt; n: Pt }[] = [];
    outline.forEach((a, i) => {
      const b = outline[(i + 1) % outline.length];
      const side = edgeSide(a, b);
      if (side >= 0) {
        if (bw.open.includes(side)) return;
        const nb = this.byPos.get(`${c.x + SIDE_OFFSETS[side][0]},${c.y + SIDE_OFFSETS[side][1]}`);
        if (nb?.flare && coversSide(nb.outline ?? UNIT_SQUARE, (side + 2) % 4)) return; // the deck continues
      }
      edges.push({ a, b, n: edgeNormal(a, b) });
    });
    const face = (a: Pt, b: Pt, k: number, n: Pt) => {
      const { vx, vy } = faces(n);
      if (vx + vy <= 1e-6) return;
      const left = vy >= vx;
      const [e0, e1] = [a, b].sort((p, q) => pt(p, k, 0)[0] - pt(q, k, 0)[0]);
      const tt0 = left ? [0, 8] : [16, 16];
      const tt1 = left ? [16, 16] : [32, 8];
      pushPoly(
        verts,
        idx,
        [pt(e0, k, hi), pt(e1, k, hi), pt(e1, k, lo), pt(e0, k, lo)],
        [uv(c.fill, tt0[0], tt0[1]), uv(c.fill, tt1[0], tt1[1]), uv(c.fill, tt1[0], tt1[1] + rows), uv(c.fill, tt0[0], tt0[1] + rows)],
        texW,
        texH,
      );
    };
    for (const e of edges) face(e.a, e.b, bw.thickness, [-e.n[0], -e.n[1]]); // inner side (far walls)
    for (const e of edges) face(e.a, e.b, 0, e.n); // outer side (near walls)
    for (const e of edges) {
      pushPoly(
        verts,
        idx,
        [pt(e.a, 0, hi), pt(e.b, 0, hi), pt(e.b, bw.thickness, hi), pt(e.a, bw.thickness, hi)],
        [e.a, e.b, local(e.b, bw.thickness), local(e.a, bw.thickness)].map((p) => topUv(c.fill, p, 0)),
        texW,
        texH,
      );
    }
  }

  /** The nearest quarter turn of the current transform (orients top textures). */
  private staticQuarter(): number {
    const o = this.transform(0, 0);
    const e = this.transform(1, 0);
    const d = [e.x - o.x, e.y - o.y];
    let best = 0;
    let bestDot = -Infinity;
    for (let q = 0; q < 4; q++) {
      const [x, y] = rotQ(1, 0, q);
      const dot = x * d[0] + y * d[1];
      if (dot > bestDot) [best, bestDot] = [q, dot];
    }
    return best;
  }

  /**
   * One shaped column as a mesh: water underneath, the sides of its outline (flared hull sides
   * lean inward toward the bottom), then the top polygon. `r` orients the top texture.
   */
  private drawShaped(c: IsoCellSource, mesh: Phaser.GameObjects.Mesh2D, r: number) {
    const m = this.source.metrics;
    const bh = m.blockHeight;
    const tex = this.scene.textures.get(this.source.blockTexture);
    const texW = tex.source[0].width;
    const texH = tex.source[0].height;
    const verts: number[] = [];
    const idx: number[] = [];
    const uv = (frame: number, px: number, py: number) => {
      const f = tex.get(frame);
      return [(f.cutX + px) / texW, 1 - (f.cutY + py) / texH]; // GL textures run bottom-up
    };
    const outline = c.outline ?? UNIT_SQUARE;
    const flare = c.flare ?? 0;
    const sink = c.sink ?? 0;
    const base = c.under ? c.under.height : -1;
    const inset = (level: number) => (flare ? (flare * Math.max(0, c.height - level)) / Math.max(1, c.height - base) : 0);
    const at = (p: Pt, level: number, extra = 0) => {
      const k = inset(level);
      const o = k ? flareOffset(this.miters, c.x + p[0], c.y + p[1]) : [0, 0];
      const v = this.transform(c.x + p[0] + o[0] * k, c.y + p[1] + o[1] * k);
      const s = isoToScreen(m, v.x, v.y, 0);
      return [s.x, s.y - level * bh + extra];
    };
    const hw = m.tileWidth / 2;
    const hh = m.tileHeight / 2;
    const topUv = (frame: number, p: Pt, dy: number) => {
      const [rx, ry] = rotQ(p[0], p[1], r);
      return uv(frame, hw + (rx - ry) * hw, hh + (rx + ry) * hh + dy);
    };
    if (c.under) {
      const u = c.under;
      pushPoly(verts, idx, UNIT_SQUARE.map((p) => { const v = this.transform(c.x + p[0], c.y + p[1]); const s = isoToScreen(m, v.x, v.y, u.height); return [s.x, s.y + u.sink]; }), UNIT_SQUARE.map((p) => topUv(u.frame, p, u.sink)), texW, texH);
    }
    const t0 = this.transform(c.x, c.y);
    outline.forEach((a, i) => {
      const b = outline[(i + 1) % outline.length];
      const n = edgeNormal(a, b);
      const t1 = this.transform(c.x + n[0], c.y + n[1]);
      const vx = t1.x - t0.x;
      const vy = t1.y - t0.y;
      if (vx + vy <= 1e-6) return; // faces away
      const left = vy >= vx;
      let from = base;
      const side = edgeSide(a, b);
      if (side >= 0) {
        const nb = this.byPos.get(`${c.x + SIDE_OFFSETS[side][0]},${c.y + SIDE_OFFSETS[side][1]}`);
        if (nb && coversSide(nb.outline ?? UNIT_SQUARE, (side + 2) % 4)) from = Math.max(from, nb.height);
      }
      const [e0, e1] = [a, b].sort((p, q) => at(p, 0)[0] - at(q, 0)[0]);
      for (let level = from + 1; level <= c.height; level++) {
        const top = level === c.height;
        const frame = top ? c.top : c.fill;
        const dy = top ? sink : 0;
        const tt0 = left ? [0, 8 + dy] : [16, 16 + dy];
        const tt1 = left ? [16, 16 + dy] : [32, 8 + dy];
        const b0 = left ? [0, 16] : [16, 24];
        const b1 = left ? [16, 24] : [32, 16];
        pushPoly(
          verts,
          idx,
          [at(e0, level, dy), at(e1, level, dy), at(e1, level - 1), at(e0, level - 1)],
          [uv(frame, tt0[0], tt0[1]), uv(frame, tt1[0], tt1[1]), uv(frame, b1[0], b1[1]), uv(frame, b0[0], b0[1])],
          texW,
          texH,
        );
      }
    });
    pushPoly(verts, idx, outline.map((p) => at(p, c.height, sink)), outline.map((p) => topUv(c.top, p, sink)), texW, texH);
    if (c.bulwark) this.drawBulwark(c, outline, verts, idx, uv, topUv, r);
    mesh.vertices = verts;
    mesh.indices = idx;
    mesh.setDepth(isoDepth(t0.x, t0.y, LAYER.block, c.height * 0.01));
  }

  clearOverlay(name: string) {
    for (const p of this.overlays.get(name) ?? []) p.obj.destroy();
    this.overlays.delete(name);
  }

  destroy() {
    this.endSpin();
    for (const w of this.wallDecor) w.mesh.destroy();
    for (const s of this.shaped) s.mesh.destroy();
    this.animTimer?.remove();
    for (const k of [...this.overlays.keys()]) this.clearOverlay(k);
    for (const p of this.placed) p.obj.destroy();
    this.placed.length = 0;
  }
}
