import type { ChipsetDef } from "../../../src/core/data/types";

/** Sprite sheet helpers for palettes and the grid view (thumbnails straight from the game's sheets). */

export const assetUrl = (path: string) => `/assets/${path}`;

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
