import type { Document } from "yaml";
import { rewriteRefs } from "../../../src/content/refs";
import { LIB, type RawContent } from "../../../src/core/data/database";
import type { ChipsetDef, DecorDef, MapDef, TerrainDef } from "../../../src/core/data/types";
import { entryIdFor, patchIn } from "../forms/entries";
import type { Project } from "../project";
import { blankSheet, copyFrame, fetchAsset, frameUsed, growTo, saveSheet, sheetCanvas, type SheetLayout } from "./sheets";

/**
 * Tiles (graphics.md §4): a chipset's terrains and decor – their rules, new pieces, copies of the
 * library's chipsets, imported tile sheets, and the little board the preview shows.
 */

export type Chip = Omit<ChipsetDef, "id">;
export type PieceKind = "terrain" | "decor";

const DIR = "data/chipsets/";
const HEADER = "# A chipset of the project (docs/graphics.md §4): block sheet + decor sheet, and each piece's rules.\n";

export const isOwnChipset = (id: string) => !id.startsWith(LIB);

/** The file that defines a chipset (the library's or the project's). */
export const chipsetFile = (project: Project, id: string) => (isOwnChipset(id) ? `${DIR}${id}.yaml` : `library/${project.info.library}/data/chipsets/${id.slice(LIB.length)}.yaml`);

/** The chipset as its file writes it (image paths relative to its layer's assets). */
export const chipsetData = (project: Project, id: string) => project.data<Chip>(chipsetFile(project, id));

/** Frames of the block sheet and the decor sheet (columns come from the image's width). */
export const blockLayout = (c: Chip, width: number): SheetLayout => ({ fw: c.frameWidth, fh: c.frameHeight, cols: Math.max(1, Math.floor(width / c.frameWidth)) });
export const decorLayout = (c: Chip, width: number): SheetLayout => ({ fw: c.decorFrameWidth, fh: c.decorFrameHeight, cols: Math.max(1, Math.floor(width / c.decorFrameWidth)) });

/** The first frame no piece uses. */
export function nextFrame(c: Chip, kind: PieceKind): number {
  if (kind === "terrain") return Math.max(-1, ...Object.values(c.terrains).flatMap((t) => [t.frame, ...(t.frames ?? []), t.fill ?? -1])) + 1;
  return Math.max(-1, ...Object.values(c.decor).map((d) => d.frame + (d.views ?? 1) - 1)) + 1;
}

/** Maps (and the chipset itself) that use a piece. */
export function pieceUsers(raw: RawContent, chipId: string, kind: PieceKind, pid: string): string[] {
  const out: string[] = [];
  for (const [id, m] of Object.entries(raw.maps)) {
    if ((m as MapDef).chipset !== chipId) continue;
    const legend = kind === "terrain" ? m.legend?.terrain : m.legend?.decor;
    if (Object.values(legend ?? {}).includes(pid)) out.push(m.name ?? id);
  }
  const c = raw.chipsets[chipId];
  if (kind === "terrain")
    for (const [tid, t] of Object.entries(c?.terrains ?? {})) if (tid !== pid && (t.burnsTo === pid || t.underlay === pid)) out.push(`terrain ${tid}`);
  return out;
}

/** Copies a library chipset (both sheets and its rules) into the project; the project's maps follow. */
export async function copyChipsetToProject(project: Project, libId: string): Promise<string> {
  const raw = project.content.raw;
  const src = chipsetData(project, libId);
  const resolved = raw.chipsets[libId];
  const id = entryIdFor(libId.slice(LIB.length), (x) => x in raw.chipsets, "tiles");
  const [blocks, decor] = await Promise.all([fetchAsset(resolved.image), fetchAsset(resolved.decorImage)]);
  const { putAsset } = await import("../project");
  await putAsset(project.info.id, `chipsets/${id}.png`, blocks);
  await putAsset(project.info.id, `chipsets/${id}_decor.png`, decor);
  project.transaction(`Copy ${libId} to the project`, () => {
    project.create(`${DIR}${id}.yaml`, HEADER);
    project.edit(`${DIR}${id}.yaml`, `Copy ${libId}`, (doc: Document) => {
      doc.contents = doc.createNode({ ...structuredClone(src), image: `chipsets/${id}.png`, decorImage: `chipsets/${id}_decor.png` }) as never;
    });
    for (const path of project.paths("data/")) project.edit(path, `Use ${id}`, (doc: Document) => void rewriteRefs(doc, "chipsets", libId, id));
  });
  return id;
}

/** Changes one piece's rules (only what changed is written). */
export function setPiece(project: Project, chipId: string, kind: PieceKind, pid: string, before: TerrainDef | DecorDef, after: TerrainDef | DecorDef, label: string, group?: string) {
  const key = kind === "terrain" ? "terrains" : "decor";
  project.edit(chipsetFile(project, chipId), label, (doc: Document) => patchIn(doc, [key, pid], before, after), group ? `${chipId}.${pid}.${group}` : undefined);
}

/**
 * A new piece: a new frame at the end of the sheet – a copy of `from`'s picture (and rules) or
 * blank – and its entry. Returns the new piece's id.
 */
export async function addPiece(project: Project, chipId: string, kind: PieceKind, from?: string): Promise<string> {
  const c = chipsetData(project, chipId);
  const resolved = project.content.raw.chipsets[chipId];
  const image = kind === "terrain" ? resolved.image : resolved.decorImage;
  const asset = kind === "terrain" ? c.image : c.decorImage;
  let sheet = await sheetCanvas(image);
  const layout = kind === "terrain" ? blockLayout(c, sheet.width) : decorLayout(c, sheet.width);
  const frame = nextFrame(c, kind);
  const source = from ? (kind === "terrain" ? c.terrains[from] : c.decor[from]) : undefined;
  sheet = growTo(sheet, layout, frame);
  copyFrame(sheet, layout, source ? source.frame : null, frame);
  await saveSheet(project, asset, sheet);
  const pieces = kind === "terrain" ? c.terrains : c.decor;
  const name = source ? `${source.name} copy` : kind === "terrain" ? "New terrain" : "New decor";
  const id = entryIdFor(from ? `${from}_2` : kind === "terrain" ? "terrain" : "decor", (x) => x in pieces, kind);
  const def: TerrainDef | DecorDef =
    kind === "terrain"
      ? { ...(source ? structuredClone(source as TerrainDef) : { walkable: true }), name, frame, frames: undefined }
      : { ...(source ? structuredClone(source as DecorDef) : { blocks: true }), name, frame, views: undefined };
  const key = kind === "terrain" ? "terrains" : "decor";
  project.edit(chipsetFile(project, chipId), `New ${kind} ${id}`, (doc: Document) => {
    const node = doc.createNode(JSON.parse(JSON.stringify(def)));
    (node as { flow?: boolean }).flow = true;
    doc.setIn([key, id], node);
  });
  return id;
}

/** Removes a piece's rules (its frame stays in the sheet, unused). */
export function deletePiece(project: Project, chipId: string, kind: PieceKind, pid: string) {
  project.edit(chipsetFile(project, chipId), `Delete ${kind} ${pid}`, (doc: Document) => doc.deleteIn([kind === "terrain" ? "terrains" : "decor", pid]));
}

/**
 * A tile sheet as a new chipset of the project: a terrain per drawn frame (walkable, to be set
 * up), an empty decor sheet. Frames must be 32 × 24 (the block size of the game).
 */
export async function importChipset(project: Project, file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  if (bitmap.width % 32 || bitmap.height % 24) throw new Error(`a tile sheet is made of 32 × 24 blocks (this one is ${bitmap.width} × ${bitmap.height})`);
  const raw = project.content.raw;
  const id = entryIdFor(file.name.replace(/\.[^.]+$/, ""), (x) => x in raw.chipsets, "tiles");
  const sheet = blankSheet(bitmap.width, bitmap.height);
  sheet.getContext("2d")!.drawImage(bitmap, 0, 0);
  const layout: SheetLayout = { fw: 32, fh: 24, cols: bitmap.width / 32 };
  const terrains: Record<string, TerrainDef> = {};
  for (let i = 0; i < layout.cols * (bitmap.height / 24); i++) if (frameUsed(sheet, layout, i)) terrains[`tile_${i}`] = { name: `Tile ${i}`, frame: i, walkable: true };
  if (!Object.keys(terrains).length) throw new Error("the sheet is empty");
  const { putAsset } = await import("../project");
  await putAsset(project.info.id, `chipsets/${id}.png`, file);
  await saveSheet(project, `chipsets/${id}_decor.png`, blankSheet(256, 48));
  const def: Chip = { image: `chipsets/${id}.png`, frameWidth: 32, frameHeight: 24, tileWidth: 32, tileHeight: 16, blockHeight: 8, terrains, decorImage: `chipsets/${id}_decor.png`, decorFrameWidth: 32, decorFrameHeight: 48, decorAnchorY: 40, decor: {} };
  project.transaction(`Import ${id}`, () => {
    project.create(`${DIR}${id}.yaml`, HEADER);
    project.edit(`${DIR}${id}.yaml`, `Import ${id}`, (doc: Document) => {
      doc.contents = doc.createNode(def) as never;
      for (const t of Object.keys(terrains)) (doc.getIn(["terrains", t], true) as { flow?: boolean }).flow = true;
    });
  });
  return id;
}

// ---------- the preview board ----------

export const PREVIEW_MAP = "__tile_preview";

/**
 * A little board showing a piece (graphics.md §4): a terrain as a flat patch and a raised step on
 * other ground, a decor object standing in the middle.
 */
export function previewRaw(raw: RawContent, chipId: string, kind: PieceKind, pid: string): RawContent {
  const chip = raw.chipsets[chipId];
  const walkable = Object.entries(chip.terrains).filter(([t, d]) => d.walkable && !d.water && t !== pid);
  const ground = (walkable.find(([t]) => t === "sand") ?? walkable[0] ?? Object.entries(chip.terrains).find(([t]) => t !== pid) ?? [pid])[0];
  const terrain = kind === "terrain" ? ["ggggg", "gttgg", "gttgg", "gggtt", "gggtt"].join("\n") : ["ggggg", "ggggg", "ggggg", "ggggg", "ggggg"].join("\n");
  const height = kind === "terrain" ? ["00000", "00000", "00000", "00012", "00012"].join("\n") : undefined;
  const decor = kind === "decor" ? [".....", ".....", "..d..", ".....", "....."].join("\n") : undefined;
  const map = {
    name: "Preview",
    kind: "peaceful",
    chipset: chipId,
    battleback: Object.keys(raw.graphics.battlebacks)[0] ?? "",
    legend: { terrain: { g: ground, t: pid }, ...(kind === "decor" ? { decor: { d: pid } } : {}) },
    layers: { terrain, ...(height ? { height } : {}), ...(decor ? { decor } : {}) },
    spawns: { start: { x: 0, y: 0 } },
  } as unknown as Omit<MapDef, "id">;
  return { ...raw, maps: { ...raw.maps, [PREVIEW_MAP]: map } };
}
