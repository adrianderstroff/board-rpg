import { copyResourceToProject } from "../copyToProject";
import { putAsset, type Project } from "../project";
import type { ImageTarget } from "./target";

/**
 * Image targets for the content's graphics (graphics.md §1): board and battle sprites, faces,
 * battle backgrounds. Tiles and the game's own images add theirs in tiles.ts and system.ts.
 */

export type GraphicKind = "charsets" | "battlers" | "faces" | "battlebacks";

const GRAPHICS_FILE = "data/graphics.yaml";
const plain = (id: string) => id.replace(/^lib:/, "");

/** Charset frames: 3 columns (step, idle, step) × 4 rows (facing SE, SW, NE, NW). */
export const CHARSET_NAMES: Record<number, string> = Object.fromEntries(
  ["SE", "SW", "NE", "NW"].flatMap((dir, row) => ["step", "idle", "step"].map((c, col) => [row * 3 + col, `${dir} ${c}`])),
);

/** The project's own graphic's file, relative to its assets (as graphics.yaml writes it). */
function ownImage(project: Project, kind: GraphicKind, id: string): string {
  const entry = project.data<Record<string, Record<string, { image: string }>>>(GRAPHICS_FILE)?.[kind]?.[id];
  if (!entry) throw new Error(`${id} isn't one of the project's ${kind}`);
  return entry.image;
}

export function graphicTarget(project: Project, kind: GraphicKind, id: string, onCopied?: (id: string) => void): ImageTarget {
  const g = project.content.raw.graphics;
  const sheet = g[kind][id] as { image: string; frameWidth?: number; frameHeight?: number; frames?: Record<string, number>; floor?: number };
  const lib = id.startsWith("lib:");
  const base = {
    key: `${kind}:${id}`,
    title: `${{ charsets: "Board sprite", battlers: "Battle sprite", faces: "Face", battlebacks: "Battle background" }[kind]} ${plain(id)}`,
    image: sheet.image,
    note: lib ? "Library image – saving makes an editable copy in the project (its uses follow)." : undefined,
    context: { id, floor: sheet.floor },
    async save(png: Blob): Promise<ImageTarget | void> {
      if (!lib) {
        await putAsset(project.info.id, ownImage(project, kind, id), png);
        return;
      }
      const copy = await copyResourceToProject(project, kind, id);
      await putAsset(project.info.id, ownImage(project, kind, copy), png);
      onCopied?.(copy);
      return graphicTarget(project, kind, copy, onCopied);
    },
  };
  switch (kind) {
    case "charsets":
      return { ...base, kind: "charset", layout: { fw: sheet.frameWidth!, fh: sheet.frameHeight!, cols: 3 }, frame: 4, frameNames: CHARSET_NAMES };
    case "battlers":
      return { ...base, kind: "battler", layout: { fw: sheet.frameWidth!, fh: sheet.frameHeight! }, frame: 0, frameNames: Object.fromEntries(Object.entries(sheet.frames ?? {}).map(([n, i]) => [i, n])) };
    case "faces":
      return { ...base, kind: "face", layout: { fw: 0, fh: 0 } };
    case "battlebacks":
      return { ...base, kind: "battleback", layout: { fw: 0, fh: 0 } };
  }
}

// ---------- tiles (graphics.md §4) and wall signs ----------

/**
 * A chipset's block sheet or decor sheet, on a piece's frame. The library's is copied into the
 * project (both sheets and the rules; its maps follow) on the first save.
 */
export function tileTarget(project: Project, chipId: string, kind: "terrain" | "decor", frame: number, onCopied?: (chipId: string) => void): ImageTarget {
  const raw = project.content.raw;
  const chip = raw.chipsets[chipId];
  const lib = chipId.startsWith("lib:");
  const pieces = kind === "terrain" ? chip.terrains : chip.decor;
  const names: Record<number, string> = {};
  for (const [id, p] of Object.entries(pieces)) names[p.frame] ??= id;
  const ground = (chip.terrains.sand ?? Object.values(chip.terrains).find((t) => t.walkable && !t.water))?.frame ?? 0;
  const pieceAt = (f: number) => Object.values(pieces).find((p) => p.frame === f || (kind === "terrain" && (p as { frames?: number[] }).frames?.includes(f)));
  return {
    key: `${kind}:${chipId}`,
    title: `${kind === "terrain" ? "Tiles" : "Decor"} of ${plain(chipId)}`,
    kind: kind === "terrain" ? "blocks" : "decor",
    image: kind === "terrain" ? chip.image : chip.decorImage,
    layout: kind === "terrain" ? { fw: chip.frameWidth, fh: chip.frameHeight } : { fw: chip.decorFrameWidth, fh: chip.decorFrameHeight },
    frame,
    frameNames: names,
    canAddFrames: true,
    note: lib ? "Library tiles – saving makes an editable copy of the chipset in the project (its maps use the copy)." : undefined,
    context: (f) => {
      const p = pieceAt(f) as { fill?: number; frames?: number[]; views?: number; frame: number } | undefined;
      const pieceId = Object.entries(pieces).find(([, x]) => x === p)?.[0];
      const shared = { chipId, pieceKind: kind, pieceId };
      return kind === "terrain" ? { ...shared, ground, fill: p?.fill, frames: p?.frames } : { ...shared, blocksImage: chip.image, ground, views: p?.views, baseFrame: p?.frame };
    },
    async save(png: Blob): Promise<ImageTarget | void> {
      const { chipsetData, copyChipsetToProject } = await import("../graphics/chipsets");
      let id = chipId;
      if (lib) {
        id = await copyChipsetToProject(project, chipId);
        onCopied?.(id);
      }
      const data = chipsetData(project, id);
      await putAsset(project.info.id, kind === "terrain" ? data.image : data.decorImage, png);
      if (lib) return tileTarget(project, id, kind, frame, onCopied);
    },
  };
}

/** The wall signs sheet (lettering painted onto wall faces); the library's is copied on the first save. */
export function signsTarget(project: Project): ImageTarget | null {
  const ws = project.content.raw.graphics.wallSigns;
  if (!ws) return null;
  const own = project.data<{ wallSigns?: { image: string } }>(GRAPHICS_FILE)?.wallSigns;
  return {
    key: "wallSigns",
    title: "Wall signs",
    kind: "signs",
    image: ws.image,
    layout: { fw: ws.frameWidth, fh: ws.frameHeight },
    frameNames: Object.fromEntries(Object.entries(ws.frames ?? {}).map(([n, i]) => [i, n])),
    note: own ? undefined : "Library image – saving makes the project's own copy.",
    async save(png: Blob): Promise<ImageTarget | void> {
      if (own) return void (await putAsset(project.info.id, own.image, png));
      await putAsset(project.info.id, "signs/wall_signs.png", png);
      const entry = { ...(project.data<{ wallSigns: object }>(`library/${project.info.library}/data/graphics.yaml`)?.wallSigns ?? {}), image: "signs/wall_signs.png" };
      project.transaction("Own wall signs", () => {
        if (!project.paths(GRAPHICS_FILE).length) project.create(GRAPHICS_FILE, "# The project's own graphics (docs/projects.md): image paths are relative to its assets/ folder.\n");
        project.edit(GRAPHICS_FILE, "Own wall signs", (doc) => doc.setIn(["wallSigns"], doc.createNode(entry, { flow: true })));
      });
      return signsTarget(project) ?? undefined;
    },
  };
}
