import { putAsset, type Project } from "../project";
import { assetUrl, loadImage } from "../map/sprites";

/**
 * Sheets of frames (graphics.md): reading a sheet into a canvas, copying frames, growing it and
 * writing it back as the project's PNG.
 */

export interface SheetLayout {
  fw: number;
  fh: number;
  /** Frames per row. */
  cols: number;
}

/** A sheet as an editable canvas (a copy of the image). */
export async function sheetCanvas(path: string): Promise<HTMLCanvasElement> {
  const img = await loadImage(path);
  const c = document.createElement("canvas");
  c.width = img.width;
  c.height = img.height;
  c.getContext("2d")!.drawImage(img, 0, 0);
  return c;
}

/** How many frames fit the sheet. */
export const frameCount = (c: { width: number; height: number }, l: SheetLayout) => Math.floor(c.width / l.fw) * Math.floor(c.height / l.fh);

/** The sheet grown by whole rows until frame `index` fits. */
export function growTo(c: HTMLCanvasElement, l: SheetLayout, index: number): HTMLCanvasElement {
  const rows = Math.floor(index / l.cols) + 1;
  const width = Math.max(c.width, l.cols * l.fw);
  const height = Math.max(c.height, rows * l.fh);
  if (width === c.width && height === c.height) return c;
  const n = document.createElement("canvas");
  n.width = width;
  n.height = height;
  n.getContext("2d")!.drawImage(c, 0, 0);
  return n;
}

/** Copies frame `from` onto frame `to` (clearing it first), or clears `to` when `from` is null. */
export function copyFrame(c: HTMLCanvasElement, l: SheetLayout, from: number | null, to: number) {
  const g = c.getContext("2d")!;
  const at = (i: number) => [(i % l.cols) * l.fw, Math.floor(i / l.cols) * l.fh] as const;
  const [tx, ty] = at(to);
  const pixels = from === null ? null : g.getImageData(...at(from), l.fw, l.fh);
  g.clearRect(tx, ty, l.fw, l.fh);
  if (pixels) g.putImageData(pixels, tx, ty);
}

/** A blank sheet. */
export function blankSheet(width: number, height: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  return c;
}

export const canvasPng = (c: HTMLCanvasElement) => new Promise<Blob>((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error("Can't write the image"))), "image/png"));

/** Writes a canvas as one of the project's assets (e.g. chipsets/town.png). */
export async function saveSheet(project: Project, assetPath: string, c: HTMLCanvasElement) {
  await putAsset(project.info.id, assetPath, await canvasPng(c));
}

/** A file of any source (the library's, the project's) as a Blob – for copying it into the project. */
export async function fetchAsset(path: string): Promise<Blob> {
  const r = await fetch(assetUrl(path));
  if (!r.ok) throw new Error(`Can't read ${path}`);
  return r.blob();
}

/** Whether a frame has any visible pixel. */
export function frameUsed(c: HTMLCanvasElement, l: SheetLayout, i: number): boolean {
  const d = c.getContext("2d")!.getImageData((i % l.cols) * l.fw, Math.floor(i / l.cols) * l.fh, l.fw, l.fh).data;
  for (let k = 3; k < d.length; k += 4) if (d[k]) return true;
  return false;
}
