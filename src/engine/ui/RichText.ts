import Phaser from "phaser";
import { fontSpec } from "../assets";

/** Structural twin of core/script/markup RichToken (engine stays independent of game rules). */
export interface GlyphStyle {
  color?: string;
  scale: number;
  wave: boolean;
  shake: boolean;
  rainbow: boolean;
  speed: number;
}
export type RichTextToken = { kind: "char"; ch: string; style: GlyphStyle } | { kind: "pause"; ms: number } | { kind: "newline" };

interface Glyph {
  img: Phaser.GameObjects.Image | null;
  x: number;
  y: number;
  style: GlyphStyle;
  /** Extra delay before this glyph appears (pauses). */
  delay: number;
}

const hexToInt = (c: string) => parseInt(c.replace("#", ""), 16);

/**
 * Per-glyph rich text: color, scale, wave, shake, rainbow and a typewriter reveal.
 * Uses the pixel font frames registered by `registerFont` ("g<charCode>").
 */
export class RichText extends Phaser.GameObjects.Container {
  private glyphs: Glyph[] = [];
  private shown = 0;
  private timer = 0;
  private cps = 45;
  private typing = false;
  private onDone?: () => void;
  /** Called for every glyph revealed by the typewriter (e.g. text blips). */
  onGlyph?: (index: number) => void;
  private readonly fontImage: string;

  constructor(scene: Phaser.Scene, x: number, y: number, public maxWidth: number, fontImage = "fontImage") {
    super(scene, x, y);
    this.fontImage = fontImage;
    scene.add.existing(this);
    scene.events.on("update", this.tick, this);
    this.once("destroy", () => scene.events.off("update", this.tick, this));
  }

  setTokens(tokens: RichTextToken[]) {
    this.removeAll(true);
    this.glyphs = [];
    this.shown = 0;
    const spec = fontSpec(this.scene);
    const lh = spec.lineHeight;
    let x = 0;
    let y = 0;
    let pendingDelay = 0;

    // Group chars into words for wrapping.
    type W = { chars: { ch: string; style: GlyphStyle; delay: number }[]; width: number; space: boolean };
    const words: (W | "nl")[] = [];
    let cur: W | null = null;
    for (const t of tokens) {
      if (t.kind === "pause") {
        pendingDelay += t.ms;
        continue;
      }
      if (t.kind === "newline") {
        cur = null;
        words.push("nl");
        continue;
      }
      const isSpace = t.ch === " ";
      if (!cur || cur.space !== isSpace) {
        cur = { chars: [], width: 0, space: isSpace };
        words.push(cur);
      }
      cur.chars.push({ ch: t.ch, style: t.style, delay: pendingDelay });
      pendingDelay = 0;
      cur.width += (spec.widths[t.ch] ?? spec.cellWidth) * t.style.scale;
    }

    for (const w of words) {
      if (w === "nl") {
        x = 0;
        y += lh;
        continue;
      }
      if (!w.space && x > 0 && x + w.width > this.maxWidth) {
        x = 0;
        y += lh;
      }
      if (w.space && x === 0) {
        // swallow leading spaces but keep their pauses
        for (const c of w.chars) this.glyphs.push({ img: null, x, y, style: c.style, delay: c.delay });
        continue;
      }
      for (const c of w.chars) {
        const code = c.ch.charCodeAt(0);
        const frame = `g${code}`;
        const has = this.scene.textures.get(this.fontImage).has(frame);
        let img: Phaser.GameObjects.Image | null = null;
        if (c.ch !== " " && has) {
          img = this.scene.add.image(x, y + spec.cellHeight * (1 - c.style.scale), this.fontImage, frame).setOrigin(0, 0);
          img.setScale(c.style.scale);
          if (c.style.color) img.setTint(hexToInt(c.style.color));
          img.setVisible(false);
          this.add(img);
        }
        this.glyphs.push({ img, x, y: img?.y ?? y, style: c.style, delay: c.delay });
        x += (spec.widths[c.ch] ?? spec.cellWidth) * c.style.scale;
      }
    }
    return this;
  }

  /** Starts the typewriter; resolves when all glyphs are visible. */
  typeOut(cps = 45): Promise<void> {
    this.cps = cps;
    this.typing = true;
    this.timer = 0;
    return new Promise((resolve) => {
      this.onDone = resolve;
      if (!this.glyphs.length) this.finishTyping();
    });
  }

  get done() {
    return !this.typing;
  }

  revealAll() {
    for (const g of this.glyphs) g.img?.setVisible(true);
    this.shown = this.glyphs.length;
    this.finishTyping();
  }

  private finishTyping() {
    this.typing = false;
    const cb = this.onDone;
    this.onDone = undefined;
    cb?.();
  }

  private tick(time: number, delta: number) {
    if (!this.active) return;
    if (this.typing) {
      this.timer += delta;
      while (this.shown < this.glyphs.length) {
        const g = this.glyphs[this.shown];
        const need = g.delay + 1000 / (this.cps * (g.style.speed || 1));
        if (this.timer < need) break;
        this.timer -= need;
        g.img?.setVisible(true);
        if (g.img) this.onGlyph?.(this.shown);
        this.shown++;
      }
      if (this.shown >= this.glyphs.length) this.finishTyping();
    }
    for (let i = 0; i < this.shown; i++) {
      const g = this.glyphs[i];
      if (!g.img) continue;
      const s = g.style;
      if (s.wave) g.img.y = g.y + Math.round(Math.sin(time * 0.008 + i * 0.7) * 2);
      if (s.shake) {
        g.img.x = g.x + Math.round(Math.random() * 2 - 1);
        g.img.y = g.y + Math.round(Math.random() * 2 - 1);
      }
      if (s.rainbow) {
        const c = Phaser.Display.Color.HSVToRGB(((time * 0.0004 + i * 0.07) % 1 + 1) % 1, 0.6, 1) as Phaser.Types.Display.ColorObject;
        g.img.setTint(Phaser.Display.Color.GetColor(c.r, c.g, c.b));
      }
    }
  }
}
