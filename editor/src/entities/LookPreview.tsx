import { useEffect, useRef } from "preact/hooks";
import type { Database } from "../../../src/core/data/database";
import type { ChipsetDef, EventPageDef } from "../../../src/core/data/types";
import { loadImage } from "../map/sprites";

/** Charset frame of a character standing idle, facing down-right (row 0, column 1). */
const IDLE_FRONT = 1;
/** Room for the sprite inside the preview box (px). */
const PREVIEW_PX = 84;

/**
 * What an event page looks like on the map: its character, its object, or both (a shop keeper
 * behind the counter) – standing on one ground line, cropped to what is drawn and scaled up by a
 * whole number (crisp pixels). Empty when the page shows nothing.
 */
export function LookPreview({ page, db, chip }: { page: EventPageDef | undefined; db: Database; chip: ChipsetDef | undefined }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const npcId = page?.npc ?? page?.keeper;
  const charset = npcId ? db.graphics.charsets[db.npcs.get(npcId)?.charset ?? ""] : undefined;
  const decor = page?.decor && chip ? chip.decor[page.decor] : undefined;

  useEffect(() => {
    const cv = canvas.current;
    if (!cv) return;
    cv.getContext("2d")!.clearRect(0, 0, cv.width, cv.height);
    if (!charset && !decor) return;
    let cancelled = false;
    void (async () => {
      const [ci, di] = await Promise.all([charset ? loadImage(charset.image) : null, decor && chip ? loadImage(chip.decorImage) : null]);
      if (cancelled) return;
      // everything on one ground line in a scratch canvas big enough for both
      const lift = decor ? 6 : 0; // a keeper stands a little behind the counter
      const w = Math.max(charset?.frameWidth ?? 1, chip?.decorFrameWidth ?? 1);
      const h = Math.max((charset?.frameHeight ?? 0) + lift, chip?.decorFrameHeight ?? 0) + 1;
      const ground = h - 1;
      const scratch = document.createElement("canvas");
      scratch.width = w;
      scratch.height = h;
      const s = scratch.getContext("2d")!;
      const frame = (img: HTMLImageElement, f: number, fw: number, fh: number, dx: number, dy: number) => {
        const cols = Math.floor(img.width / fw);
        s.drawImage(img, (f % cols) * fw, Math.floor(f / cols) * fh, fw, fh, dx, dy, fw, fh);
      };
      if (ci && charset) frame(ci, IDLE_FRONT, charset.frameWidth, charset.frameHeight, Math.round((w - charset.frameWidth) / 2), ground - charset.frameHeight - lift);
      if (di && decor && chip) frame(di, decor.frame, chip.decorFrameWidth, chip.decorFrameHeight, Math.round((w - chip.decorFrameWidth) / 2), ground - chip.decorAnchorY);
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
      const scale = Math.max(1, Math.floor(PREVIEW_PX / Math.max(cw, ch)));
      cv.width = cw;
      cv.height = ch;
      cv.style.width = `${cw * scale}px`;
      cv.style.height = `${ch * scale}px`;
      cv.getContext("2d")!.drawImage(scratch, x0, y0, cw, ch, 0, 0, cw, ch);
    })();
    return () => {
      cancelled = true;
    };
  }, [charset, decor, chip]);

  return (
    <div class={`look-preview ${charset || decor ? "" : "empty"}`}>
      <canvas ref={canvas} width={1} height={1} />
    </div>
  );
}
