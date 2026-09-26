import type { Document } from "yaml";
import { putAsset, type Project } from "../project";
import { resourceId, sheetFor, type ResourceKind } from "../resources";
import { blankSheet, canvasPng } from "./sheets";

/**
 * New blank sheets (graphics.md §3a, G7): the kind's layout, transparent (a face or a background
 * filled with a plain colour), registered like an import – then drawn in the pixel editor.
 */

const GRAPHICS_FILE = "data/graphics.yaml";
const HEADER = "# The project's own graphics (docs/projects.md): image paths are relative to its assets/ folder.\n";

export interface NewSheet {
  kind: Exclude<ResourceKind, "music">;
  label: string;
  width: number;
  height: number;
  /** Filled (opaque images: faces, backgrounds). */
  fill?: string;
}

export const NEW_SHEETS: NewSheet[] = [
  { kind: "charsets", label: "Board sprite (24 × 32 frames)", width: 72, height: 128 },
  { kind: "charsets", label: "Big board sprite (32 × 32 frames)", width: 96, height: 128 },
  { kind: "battlers", label: "Battle sprite – hero or humanoid (6 poses, 32 × 32)", width: 192, height: 32 },
  { kind: "battlers", label: "Battle sprite – creature (4 poses, 48 × 48)", width: 192, height: 48 },
  { kind: "faces", label: "Face (48 × 48)", width: 48, height: 48, fill: "#3a4466" },
  { kind: "battlebacks", label: "Battle background (480 × 190)", width: 480, height: 190, fill: "#5a6988" },
];

/** Makes a blank sheet in the project and registers it; returns its id. */
export async function newSheet(project: Project, s: NewSheet, name: string, taken: (id: string) => boolean): Promise<string> {
  const id = resourceId(name, taken);
  const c = blankSheet(s.width, s.height);
  if (s.fill) {
    const g = c.getContext("2d")!;
    g.fillStyle = s.fill;
    g.fillRect(0, 0, s.width, s.height);
  }
  const path = `${s.kind}/${id}.png`;
  const entry = sheetFor(s.kind, path, s.width, s.height);
  if ("error" in entry) throw new Error(entry.error);
  await putAsset(project.info.id, path, await canvasPng(c));
  project.transaction(`New ${id}`, () => {
    if (!project.paths(GRAPHICS_FILE).length) project.create(GRAPHICS_FILE, HEADER);
    project.edit(GRAPHICS_FILE, `New ${id}`, (doc: Document) => doc.setIn([s.kind, id], doc.createNode(entry.entry)));
  });
  return id;
}
