import { useEffect, useRef } from "preact/hooks";
import type { Database } from "../../../src/core/data/database";
import type { ChipsetDef, EventPageDef } from "../../../src/core/data/types";
import type { Dir } from "../../../src/core/util/grid";
import { DIR_ROW } from "../../../src/game/keys";
import { loadImage } from "../map/sprites";

/** One sprite frame standing on the common ground line. */
export interface SpriteLayer {
  image: string;
  frame: number;
  fw: number;
  fh: number;
  /** Frame row of the ground (a character's feet, a decor object's anchor). */
  anchor: number;
  /** Drawn this many px higher (a keeper behind the counter). */
  lift?: number;
}

/** A character standing idle, facing `dir` (charset rows by facing, column 1 = idle). */
export function characterLayer(db: Database, npcId: string | undefined, dir: Dir = "S", lift = 0): SpriteLayer | null {
  const sheet = npcId ? db.graphics.charsets[db.npcs.get(npcId)?.charset ?? ""] : undefined;
  return sheet ? { image: sheet.image, frame: DIR_ROW[dir] * 3 + 1, fw: sheet.frameWidth, fh: sheet.frameHeight, anchor: sheet.frameHeight, lift } : null;
}

export function decorLayer(chip: ChipsetDef | undefined, decorId: string | undefined): SpriteLayer | null {
  const d = decorId && chip ? chip.decor[decorId] : undefined;
  return d && chip ? { image: chip.decorImage, frame: d.frame, fw: chip.decorFrameWidth, fh: chip.decorFrameHeight, anchor: chip.decorAnchorY } : null;
}

/** An event page's look: its character (facing its way), its object, or a keeper behind a counter. */
export function pageLayers(db: Database, chip: ChipsetDef | undefined, page: EventPageDef | undefined): SpriteLayer[] {
  if (!page) return [];
  const decor = decorLayer(chip, page.decor);
  const who = characterLayer(db, page.npc ?? page.keeper, page.dir ?? "S", decor ? 6 : 0);
  return [who, decor].filter((l): l is SpriteLayer => !!l);
}

/**
 * Sprite layers on one ground line, cropped to what is drawn and scaled up by a whole number that
 * fits `box` px (crisp pixels). Nothing when there are no layers.
 */
export function SpriteView({ layers, box }: { layers: SpriteLayer[]; box: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const key = JSON.stringify(layers);

  useEffect(() => {
    const cv = canvas.current;
    if (!cv) return;
    cv.getContext("2d")!.clearRect(0, 0, cv.width, cv.height);
    if (!layers.length) return;
    let cancelled = false;
    void (async () => {
      const images = await Promise.all(layers.map((l) => loadImage(l.image)));
      if (cancelled) return;
      const ground = Math.max(...layers.map((l) => l.anchor + (l.lift ?? 0)));
      const w = Math.max(...layers.map((l) => l.fw));
      const h = ground + Math.max(...layers.map((l) => l.fh - l.anchor)) + 1;
      const scratch = document.createElement("canvas");
      scratch.width = w;
      scratch.height = h;
      const s = scratch.getContext("2d")!;
      layers.forEach((l, i) => {
        const img = images[i];
        const cols = Math.floor(img.width / l.fw);
        s.drawImage(img, (l.frame % cols) * l.fw, Math.floor(l.frame / cols) * l.fh, l.fw, l.fh, Math.round((w - l.fw) / 2), ground - (l.lift ?? 0) - l.anchor, l.fw, l.fh);
      });
      // crop to the drawn pixels
      const px = s.getImageData(0, 0, w, h).data;
      let x0 = w, y0 = h, x1 = -1, y1 = -1;
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++)
          if (px[(y * w + x) * 4 + 3]) {
            x0 = Math.min(x0, x);
            y0 = Math.min(y0, y);
            x1 = Math.max(x1, x);
            y1 = Math.max(y1, y);
          }
      if (x1 < 0) return;
      const cw = x1 - x0 + 1;
      const ch = y1 - y0 + 1;
      const scale = Math.max(1, Math.floor(box / Math.max(cw, ch)));
      cv.width = cw;
      cv.height = ch;
      cv.style.width = `${cw * scale}px`;
      cv.style.height = `${ch * scale}px`;
      cv.getContext("2d")!.drawImage(scratch, x0, y0, cw, ch, 0, 0, cw, ch);
    })();
    return () => {
      cancelled = true;
    };
  }, [key, box]);

  return <canvas class="sprite-view" ref={canvas} width={1} height={1} />;
}
