import Phaser from "phaser";
import { FONT_KEY, fontSpec, measureText } from "../assets";
import type { InputHandler, InputRouter, PointerInfo } from "../input";

export const UI_DEPTH = 100000;

export const COLORS = {
  text: 0xffffff,
  dim: 0x8b9bb4,
  disabled: 0x5a6988,
  highlight: 0xfeae34,
  good: 0x63c74d,
  bad: 0xe43b44,
  mp: 0x0099db,
  exp: 0xfee761,
  gaugeBack: 0x181425,
};

export const WINDOW_KEY = "window";

/** Optional sound hook for UI feedback (set by the game layer; engine stays audio-agnostic). */
export type UiSound = "cursor" | "confirm" | "cancel" | "buzzer";
let uiSound: (s: UiSound) => void = () => {};
export function setUiSoundHook(fn: (s: UiSound) => void) {
  uiSound = fn;
}
export function playUiSound(s: UiSound) {
  uiSound(s);
}
export const CURSOR_KEY = "cursor";
export const ICONS_KEY = "icons";

// ---------- text ----------

export interface LabelOptions {
  color?: number;
  align?: "left" | "center" | "right";
  maxWidth?: number;
}

/** The pixel font is ASCII only: map common typographic characters to ASCII. */
export function toAscii(text: string): string {
  return text.replace(/[–—]/g, "-").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/…/g, "...");
}

export function label(scene: Phaser.Scene, x: number, y: number, text: string, opts: LabelOptions = {}): Phaser.GameObjects.BitmapText {
  const t = scene.add.bitmapText(x, y, FONT_KEY, toAscii(text), fontSpec(scene).cellHeight);
  if (opts.maxWidth) t.setMaxWidth(opts.maxWidth);
  if (opts.color !== undefined) t.setTint(opts.color);
  if (opts.align === "center") t.setOrigin(0.5, 0);
  if (opts.align === "right") t.setOrigin(1, 0);
  return t;
}

export function lineHeight(scene: Phaser.Scene) {
  return fontSpec(scene).lineHeight;
}

// ---------- windows ----------

/** 9-slice window, fixed to the camera. */
export function windowBox(scene: Phaser.Scene, x: number, y: number, w: number, h: number): Phaser.GameObjects.NineSlice {
  return scene.add.nineslice(x, y, WINDOW_KEY, undefined, w, h, 8, 8, 8, 8).setOrigin(0, 0);
}

/** A container with a window background; children are positioned relative to the window. */
export class Panel extends Phaser.GameObjects.Container {
  readonly bg: Phaser.GameObjects.NineSlice;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    readonly w: number,
    readonly h: number,
  ) {
    super(scene, x, y);
    this.bg = windowBox(scene, 0, 0, w, h);
    this.add(this.bg);
    this.setScrollFactor(0).setDepth(UI_DEPTH);
    scene.add.existing(this);
  }

  text(x: number, y: number, text: string, opts?: LabelOptions) {
    const t = label(this.scene, x, y, text, opts);
    this.add(t);
    return t;
  }

  icon(x: number, y: number, frame: number) {
    const i = this.scene.add.image(x, y, ICONS_KEY, frame).setOrigin(0, 0);
    this.add(i);
    return i;
  }

  contains(px: number, py: number) {
    return px >= this.x && py >= this.y && px < this.x + this.w && py < this.y + this.h;
  }
}

// ---------- gauges ----------

export class Gauge extends Phaser.GameObjects.Graphics {
  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    private readonly gw: number,
    private readonly color: number,
    private readonly gh = 3,
  ) {
    super(scene, { x, y });
    scene.add.existing(this);
  }

  set(value: number, max: number) {
    this.clear();
    this.fillStyle(COLORS.gaugeBack, 1).fillRect(0, 0, this.gw, this.gh);
    const f = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
    const color = this.color === COLORS.good && f < 0.25 ? COLORS.bad : this.color;
    this.fillStyle(color, 1).fillRect(0, 0, Math.round(this.gw * f), this.gh);
    this.fillStyle(0xffffff, 0.25).fillRect(0, 0, Math.round(this.gw * f), 1);
    return this;
  }
}

// ---------- menus ----------

export interface MenuItem {
  label: string;
  right?: string;
  icon?: number;
  disabled?: boolean;
  color?: number;
}

export interface MenuOptions {
  x: number;
  y: number;
  width?: number;
  maxRows?: number;
  title?: string;
  /** Called when the highlighted entry changes (for previews). */
  onHighlight?: (index: number) => void;
  /** Allow cancelling (default true). */
  cancellable?: boolean;
  initial?: number;
  /** Anchor the panel's bottom at y instead of its top. */
  anchorBottom?: boolean;
  /** Fixed panel height (rows are fitted inside; the list scrolls). */
  height?: number;
  /** Row height in px (default 15). */
  rowHeight?: number;
  /** Header with a portrait (texture key) before the title and icons (frame indices) right-aligned. */
  header?: { portrait?: string; icons?: number[]; iconTexture?: string; iconSize?: number };
  /** The menu key resolves the menu with MENU_KEY_RESULT (e.g. to open the main menu from a command box). */
  allowMenuKey?: boolean;
}

export const MENU_KEY_RESULT = -1;

/** Default menu row height (roomy enough for touch); dense menus pass `rowHeight`. */
const ROW = 15;
const PAD = 7;
const HEADER_H = 28;

/** Vertical list menu with a hand cursor. `choose()` resolves with the index or null when cancelled. */
export class Menu {
  /** Menus currently on screen (topmost last) – used by automated tests to read UI state. */
  static readonly open: Menu[] = [];
  readonly panel: Panel;
  private index: number;
  private top = 0;
  private rows: Phaser.GameObjects.GameObject[] = [];
  private readonly cursor: Phaser.GameObjects.Sprite;
  private readonly maxRows: number;
  private readonly row: number;
  private readonly titleH: number;
  private release?: () => void;
  private resolve?: (v: number | null) => void;

  constructor(
    scene: Phaser.Scene,
    private readonly input: InputRouter,
    private items: MenuItem[],
    private readonly opts: MenuOptions,
  ) {
    const header = opts.header;
    this.row = opts.rowHeight ?? ROW;
    this.titleH = header ? HEADER_H : opts.title ? 14 : 0;
    const headerW = header ? (header.portrait ? 28 : 0) + (opts.title ? measureText(scene, opts.title) : 0) + (header.icons?.length ?? 0) * ((header.iconSize ?? 16) + 1) + 6 : 0;
    this.maxRows = opts.height ? Math.max(1, Math.floor((opts.height - PAD * 2 - this.titleH) / this.row)) : (opts.maxRows ?? 10);
    const width =
      opts.width ??
      Math.max(60, ...items.map((i) => measureText(scene, i.label) + (i.right ? measureText(scene, i.right) + 12 : 0) + (i.icon !== undefined ? 18 : 0)), opts.title ? measureText(scene, opts.title) : 0, headerW - 12) +
        PAD * 2 +
        12;
    const h = opts.height ?? Math.min(items.length, this.maxRows) * this.row + PAD * 2 + this.titleH;
    const y = opts.anchorBottom ? opts.y - h : opts.y;
    const x = Math.min(opts.x, scene.scale.width - width - 2);
    this.panel = new Panel(scene, Math.max(2, x), Math.max(2, Math.min(y, scene.scale.height - h - 2)), width, h);
    if (header) {
      let tx = PAD;
      if (header.portrait && scene.textures.exists(header.portrait)) {
        this.panel.add(scene.add.image(PAD - 1, PAD - 2, header.portrait).setOrigin(0, 0).setDisplaySize(24, 24));
        tx += 28;
      }
      if (opts.title) this.panel.text(tx, PAD + 5, opts.title, { color: COLORS.highlight });
      const size = header.iconSize ?? 16;
      (header.icons ?? []).forEach((ic, i, all) => {
        const img = scene.add.image(width - PAD - (all.length - i) * (size + 1) + 1, PAD + 12 - size / 2, header.iconTexture ?? ICONS_KEY, ic).setOrigin(0, 0);
        this.panel.add(img);
      });
    } else if (opts.title) this.panel.text(PAD, PAD - 1, opts.title, { color: COLORS.highlight });
    this.cursor = scene.add.sprite(0, 0, CURSOR_KEY, 0).setOrigin(0, 0);
    this.panel.add(this.cursor);
    Menu.open.push(this);
    // Scene shutdowns destroy the panel without calling destroy(): unregister then too.
    this.panel.once("destroy", () => {
      const i = Menu.open.indexOf(this);
      if (i >= 0) Menu.open.splice(i, 1);
      this.release?.();
    });
    this.index = Math.min(opts.initial ?? 0, items.length - 1);
    if (this.items[this.index]?.disabled) this.index = Math.max(0, this.items.findIndex((i) => !i.disabled));
    this.render();
  }

  private render() {
    for (const r of this.rows) r.destroy();
    this.rows = [];
    if (this.index < this.top) this.top = this.index;
    if (this.index >= this.top + this.maxRows) this.top = this.index - this.maxRows + 1;
    const visible = this.items.slice(this.top, this.top + this.maxRows);
    visible.forEach((item, i) => {
      const y = PAD + this.titleH + i * this.row + Math.floor((this.row - 12) / 2);
      let x = PAD + 12;
      if (item.icon !== undefined) {
        this.rows.push(this.panel.icon(x, y - 3, item.icon));
        x += 18;
      }
      const color = item.disabled ? COLORS.disabled : (item.color ?? COLORS.text);
      this.rows.push(this.panel.text(x, y, item.label, { color }));
      if (item.right) this.rows.push(this.panel.text(this.panel.w - PAD, y, item.right, { color, align: "right" }));
    });
    if (this.top > 0) this.rows.push(this.panel.text(this.panel.w / 2, 0, "^", { align: "center", color: COLORS.dim }));
    if (this.top + this.maxRows < this.items.length) this.rows.push(this.panel.text(this.panel.w / 2, this.panel.h - 9, "v", { align: "center", color: COLORS.dim }));
    this.cursor.setPosition(PAD - 4, PAD + this.titleH + (this.index - this.top) * this.row + Math.floor((this.row - 12) / 2) - 3);
    this.panel.bringToTop(this.cursor);
  }

  private move(delta: number) {
    if (!this.items.length) return;
    let i = this.index;
    for (let n = 0; n < this.items.length; n++) {
      i = (i + delta + this.items.length) % this.items.length;
      if (!this.items[i].disabled) break;
    }
    if (i !== this.index) {
      this.index = i;
      this.render();
      uiSound("cursor");
      this.opts.onHighlight?.(i);
    }
  }

  private rowAt(p: PointerInfo): number | null {
    const lx = p.x - this.panel.x;
    const ly = p.y - this.panel.y - PAD - this.titleH;
    if (lx < 0 || lx > this.panel.w || ly < 0) return null;
    const r = Math.floor(ly / this.row);
    if (r >= Math.min(this.maxRows, this.items.length - this.top)) return null;
    return this.top + r;
  }

  get highlighted() {
    return this.index;
  }

  setItems(items: MenuItem[]) {
    this.items = items;
    this.index = Math.min(this.index, items.length - 1);
    this.render();
  }

  choose(): Promise<number | null> {
    this.opts.onHighlight?.(this.index);
    return new Promise((resolve) => {
      this.resolve = resolve;
      const handler: InputHandler = {
        onAction: (a) => {
          if (a === "up") this.move(-1);
          else if (a === "down") this.move(1);
          else if (a === "confirm") {
            if (!this.items[this.index]?.disabled && this.items.length) this.finish(this.index);
            else uiSound("buzzer");
          } else if (a === "cancel" && this.opts.cancellable !== false) this.finish(null);
          else if (a === "menu" && this.opts.allowMenuKey) {
            this.release?.();
            this.resolve?.(MENU_KEY_RESULT);
          }
          return true;
        },
        onPointerMove: (p) => {
          const r = this.rowAt(p);
          if (r !== null && r !== this.index && !this.items[r].disabled) {
            this.index = r;
            this.render();
            uiSound("cursor");
            this.opts.onHighlight?.(r);
          }
          return true;
        },
        onPointerDown: (p) => {
          const r = this.rowAt(p);
          if (r !== null && !this.items[r].disabled) this.finish(r);
          else if (r === null && !this.panel.contains(p.x, p.y) && this.opts.cancellable !== false) this.finish(null);
          return true;
        },
        onWheel: (dy) => this.move(dy > 0 ? 1 : -1),
      };
      this.release = this.input.push(handler);
    });
  }

  private finish(v: number | null) {
    uiSound(v === null ? "cancel" : "confirm");
    this.release?.();
    this.resolve?.(v);
  }

  /** Snapshot for tests. */
  describe() {
    const rows = Math.min(this.maxRows, this.items.length - this.top);
    return {
      title: this.opts.title,
      items: this.items.map((i) => ({ label: i.label, disabled: !!i.disabled })),
      index: this.index,
      /** Screen rectangles (virtual px) of the visible rows. */
      rects: Array.from({ length: rows }, (_, r) => ({
        index: this.top + r,
        x: this.panel.x,
        y: this.panel.y + PAD + this.titleH + r * this.row,
        w: this.panel.w,
        h: this.row,
      })),
    };
  }

  destroy() {
    this.release?.();
    const i = Menu.open.indexOf(this);
    if (i >= 0) Menu.open.splice(i, 1);
    this.panel.destroy();
  }
}

/** Convenience: show a menu, wait for a choice, destroy it. */
export async function pick(scene: Phaser.Scene, input: InputRouter, items: MenuItem[], opts: MenuOptions): Promise<number | null> {
  const m = new Menu(scene, input, items, opts);
  const r = await m.choose();
  m.destroy();
  return r;
}

// ---------- popups ----------

/** Floating number/text that rises and fades (damage, heals). */
export function popup(scene: Phaser.Scene, x: number, y: number, text: string, color: number, depth = UI_DEPTH - 1) {
  const t = label(scene, x, y, text, { color, align: "center" }).setDepth(depth);
  scene.tweens.add({ targets: t, y: y - 14, duration: 500, ease: "Cubic.easeOut" });
  scene.tweens.add({ targets: t, alpha: 0, delay: 700, duration: 300, onComplete: () => t.destroy() });
  return t;
}

/** A centred one-line banner (e.g. "Ambush!"). */
export async function banner(scene: Phaser.Scene, text: string, ms = 1000, color: number = COLORS.text) {
  const w = measureText(scene, text) + 24;
  const p = new Panel(scene, (scene.scale.width - w) / 2, 60, w, 22);
  p.text(w / 2, 6, text, { align: "center", color });
  p.setAlpha(0);
  await new Promise<void>((r) => scene.tweens.add({ targets: p, alpha: 1, duration: 150, onComplete: () => r() }));
  await new Promise<void>((r) => scene.time.delayedCall(ms, () => r()));
  await new Promise<void>((r) => scene.tweens.add({ targets: p, alpha: 0, duration: 150, onComplete: () => r() }));
  p.destroy();
}
