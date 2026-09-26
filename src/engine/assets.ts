import Phaser from "phaser";

/** The runtime's own asset paths are relative to public/assets/; content comes with root-relative paths (library/…, projects/…). */
export const ASSET_ROOT = "assets/";

/** The URL of an asset path. */
export const assetPath = (p: string) => (/^(library|projects)\//.test(p) ? p : ASSET_ROOT + p);

export interface SheetSpec {
  key: string;
  path: string;
  frameWidth: number;
  frameHeight: number;
}

export function loadSheet(scene: Phaser.Scene, s: SheetSpec) {
  scene.load.spritesheet(s.key, assetPath(s.path), { frameWidth: s.frameWidth, frameHeight: s.frameHeight });
}

export function loadAudio(scene: Phaser.Scene, key: string, path: string) {
  scene.load.audio(key, assetPath(path));
}

export function loadImage(scene: Phaser.Scene, key: string, path: string) {
  scene.load.image(key, assetPath(path));
}

export interface FontSpec {
  cellWidth: number;
  cellHeight: number;
  first: number;
  lineHeight: number;
  widths: Record<string, number>;
  columns?: number;
}

export const FONT_KEY = "font";

/**
 * Registers the proportional pixel font (font.png + font.json) as a Phaser bitmap font
 * (key FONT_KEY) and adds one texture frame per glyph ("g<code>") for the rich text renderer.
 */
export function registerFont(scene: Phaser.Scene, imageKey: string, spec: FontSpec) {
  if (scene.cache.bitmapFont.exists(FONT_KEY)) return;
  const texture = scene.textures.get(imageKey);
  const src = texture.getSourceImage() as HTMLImageElement;
  const tw = src.width;
  const th = src.height;
  const cols = spec.columns ?? Math.floor(tw / spec.cellWidth);
  const chars: Record<number, unknown> = {};
  for (let code = spec.first; code < 127; code++) {
    const i = code - spec.first;
    const x = (i % cols) * spec.cellWidth;
    const y = Math.floor(i / cols) * spec.cellHeight;
    if (y + spec.cellHeight > th) break;
    const ch = String.fromCharCode(code);
    const adv = spec.widths[ch] ?? spec.cellWidth;
    const w = Math.min(spec.cellWidth, adv + 1);
    chars[code] = {
      x,
      y,
      width: w,
      height: spec.cellHeight,
      centerX: Math.floor(w / 2),
      centerY: Math.floor(spec.cellHeight / 2),
      xOffset: 0,
      yOffset: 0,
      xAdvance: adv,
      data: {},
      kerning: {},
      u0: x / tw,
      v0: 1 - y / th,
      u1: (x + w) / tw,
      v1: 1 - (y + spec.cellHeight) / th,
    };
    texture.add(`g${code}`, 0, x, y, w, spec.cellHeight);
  }
  scene.cache.bitmapFont.add(FONT_KEY, {
    data: { font: FONT_KEY, size: spec.cellHeight, lineHeight: spec.lineHeight, retroFont: false, chars },
    frame: null,
    texture: imageKey,
  });
  scene.registry.set("fontSpec", spec);
}

export function fontSpec(scene: Phaser.Scene): FontSpec {
  return scene.registry.get("fontSpec") as FontSpec;
}

/** Width in pixels of plain text in the pixel font. */
export function measureText(scene: Phaser.Scene, text: string): number {
  const spec = fontSpec(scene);
  let w = 0;
  for (const ch of text) w += spec.widths[ch] ?? spec.cellWidth;
  return w;
}
