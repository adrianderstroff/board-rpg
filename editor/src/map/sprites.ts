import { assetPath } from "../../../src/engine/assets";
import { SITE_ROOT } from "../siteRoot";
import type { ChipsetDef } from "../../../src/core/data/types";

/** Sprite sheet helpers for palettes and the grid view (thumbnails straight from the game's sheets). */

/** Content paths are root-relative (library/…, projects/…); the runtime's own are below /assets/. */
export const assetUrl = (path: string) => {
  const url = assetPath(path);
  // blob: and absolute URLs as they are; paths from the site's root
  return /^([a-z]+:|\/)/.test(url) ? url : SITE_ROOT + url;
};

/** CSS for one frame of a sheet as a thumbnail (`scale` × its pixel size). */
export function frameStyle(sheet: string, frameW: number, frameH: number, cols: number, frame: number, scale = 1, cropH = frameH): Record<string, string> {
  return {
    width: `${frameW * scale}px`,
    height: `${cropH * scale}px`,
    backgroundImage: `url(${assetUrl(sheet)})`,
    backgroundPosition: `-${(frame % cols) * frameW * scale}px -${Math.floor(frame / cols) * frameH * scale}px`,
    backgroundSize: `${cols * frameW * scale}px auto`,
    imageRendering: "pixelated",
  };
}

const images = new Map<string, Promise<HTMLImageElement>>();

export function loadImage(path: string): Promise<HTMLImageElement> {
  let p = images.get(path);
  if (!p) {
    p = new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`Can't load ${path}`));
      img.src = assetUrl(path);
    });
    images.set(path, p);
  }
  return p;
}

/** Average colour of each terrain's top diamond (for the grid view), by terrain id. */
export async function terrainColors(chip: ChipsetDef): Promise<Record<string, string>> {
  const img = await loadImage(chip.image);
  const cv = document.createElement("canvas");
  cv.width = img.width;
  cv.height = img.height;
  const g = cv.getContext("2d", { willReadFrequently: true })!;
  g.drawImage(img, 0, 0);
  const cols = Math.floor(img.width / chip.frameWidth);
  const out: Record<string, string> = {};
  for (const [id, t] of Object.entries(chip.terrains)) {
    const fx = (t.frame % cols) * chip.frameWidth;
    const fy = Math.floor(t.frame / cols) * chip.frameHeight;
    // the middle of the top diamond
    const d = g.getImageData(fx + chip.frameWidth / 4, fy + chip.tileHeight / 4, chip.frameWidth / 2, chip.tileHeight / 2).data;
    let r = 0, gr = 0, b = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 128) continue;
      r += d[i];
      gr += d[i + 1];
      b += d[i + 2];
      n++;
    }
    out[id] = n ? `rgb(${Math.round(r / n)},${Math.round(gr / n)},${Math.round(b / n)})` : "#444";
  }
  return out;
}

/**
 * Each terrain's top face, "unwarped" from the isometric diamond into a square (for the flat grid
 * view): square (u, v) along grid (x, y) samples diamond pixel (16 + (u − v)·16, (u + v)·8).
 */
export async function terrainTops(chip: ChipsetDef, size = 16): Promise<Record<string, HTMLCanvasElement>> {
  const img = await loadImage(chip.image);
  const src = document.createElement("canvas");
  src.width = img.width;
  src.height = img.height;
  const sg = src.getContext("2d", { willReadFrequently: true })!;
  sg.drawImage(img, 0, 0);
  const data = sg.getImageData(0, 0, img.width, img.height).data;
  const cols = Math.floor(img.width / chip.frameWidth);
  const hw = chip.tileWidth / 2;
  const hh = chip.tileHeight / 2;
  const out: Record<string, HTMLCanvasElement> = {};
  for (const [id, t] of Object.entries(chip.terrains)) {
    const fx = (t.frame % cols) * chip.frameWidth;
    const fy = Math.floor(t.frame / cols) * chip.frameHeight + (t.sink ?? (t.frames ? 2 : 0));
    const cv = document.createElement("canvas");
    cv.width = size;
    cv.height = size;
    const g = cv.getContext("2d")!;
    const px = g.createImageData(size, size);
    for (let v = 0; v < size; v++)
      for (let u = 0; u < size; u++) {
        const U = (u + 0.5) / size;
        const V = (v + 0.5) / size;
        const x = Math.min(chip.tileWidth - 1, Math.floor(hw + (U - V) * hw));
        const y = Math.min(chip.tileHeight - 1, Math.floor((U + V) * hh));
        const i = ((fy + y) * img.width + fx + x) * 4;
        const o = (v * size + u) * 4;
        px.data[o] = data[i];
        px.data[o + 1] = data[i + 1];
        px.data[o + 2] = data[i + 2];
        px.data[o + 3] = data[i + 3] < 128 ? 255 : data[i + 3];
      }
    g.putImageData(px, 0, 0);
    out[id] = cv;
  }
  return out;
}
