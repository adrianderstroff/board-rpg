import type { Document } from "yaml";
import defaultIcons from "../../../public/assets/system/icons.json";
import statusIcons from "../../../public/assets/system/status_icons.json";
import type { RawContent } from "../../../src/core/data/database";
import type { SystemImage } from "../../../src/core/data/types";
import { putAsset, type Project } from "../project";
import { openImage, type ImageKind, type ImageTarget } from "./target";

/**
 * The game's own images as the project's (graphics.md §2): each drawn in its layout, the first save
 * makes the project's copy (listed in graphics.yaml `system.images`); the icon sheet also takes its
 * names along (`system.icons`) so new icons can be named.
 */

const GRAPHICS_FILE = "data/graphics.yaml";
const HEADER = "# The project's own graphics (docs/projects.md): image paths are relative to its assets/ folder.\n";

export const SYSTEM_META: Record<SystemImage, { label: string; kind: ImageKind; fw: number; fh: number; cols?: number; hint: string }> = {
  icons: { label: "Icons", kind: "icons", fw: 16, fh: 16, cols: 16, hint: "Items, abilities, statuses and shop signs – 16 × 16, named" },
  status_icons: { label: "Status markers", kind: "statusIcons", fw: 10, fh: 10, hint: "Small markers above characters – 10 × 10" },
  title_bg: { label: "Title background", kind: "title", fw: 0, fh: 0, hint: "The title screen – 480 × 270" },
  window: { label: "Window skin", kind: "window", fw: 0, fh: 0, hint: "Text boxes and menus – 48 × 48, stretched (8 px borders)" },
  cursor: { label: "Menu cursor", kind: "cursor", fw: 16, fh: 16, hint: "The pointing glove – 2 frames" },
  board_cursor: { label: "Board cursor", kind: "boardCursor", fw: 32, fh: 24, hint: "The cell cursor on the board – 2 frames (blinking)" },
  highlight: { label: "Cell highlights", kind: "highlight", fw: 32, fh: 16, hint: "Move, attack, ability, area, path, disabled" },
  exit_arrows: { label: "Exit arrows", kind: "exitArrows", fw: 32, fh: 16, hint: "Arrows on exit cells – 4 directions, open and closed" },
  field_effects: { label: "Field effects", kind: "fieldEffects", fw: 32, fh: 24, cols: 8, hint: "Fire, poison, ice, glue, soaked, seeds – 4 frames each" },
  shadow: { label: "Shadow", kind: "shadow", fw: 0, fh: 0, hint: "Under characters – 16 × 8" },
  font: { label: "Font", kind: "font", fw: 8, fh: 12, cols: 16, hint: "The pixel font – ASCII 32–126 in 8 × 12 cells" },
};

const FRAME_NAMES: Partial<Record<SystemImage, Record<number, string>>> = {
  highlight: { 0: "move", 1: "attack", 2: "ability", 3: "area", 4: "path", 5: "disabled" },
  exit_arrows: { 0: "NE", 1: "SE", 2: "SW", 3: "NW", 4: "NE closed", 5: "SE closed", 6: "SW closed", 7: "NW closed" },
  cursor: { 0: "rest", 1: "nudge" },
  board_cursor: { 0: "yellow", 1: "white" },
  field_effects: Object.fromEntries(["burning", "poisonous", "frozen", "sticky", "trap", "soaked", "seeds"].map((n, row) => [row * 8, n])),
  status_icons: Object.fromEntries(Object.entries(statusIcons as Record<string, number>).map(([n, i]) => [i, n])),
  font: Object.fromEntries(Array.from({ length: 95 }, (_, i) => [i, String.fromCharCode(32 + i)])),
};

/** The icon names: the project's own (with its own sheet) or the game's. */
export const iconIndexOf = (raw: RawContent): Record<string, number> => raw.graphics.system?.icons ?? (defaultIcons as Record<string, number>);

/** Whether the project has its own copy of a game image. */
export const ownsSystem = (raw: RawContent, name: SystemImage) => !!raw.graphics.system?.images?.includes(name);

/** Where the image is drawn from: the project's copy or the game's. */
export const systemImagePath = (name: SystemImage) => `system/${name}.png`;

/** Adds (or removes) a game image to the project's own list; the icon names come along. */
function register(project: Project, name: SystemImage, own: boolean) {
  project.transaction(own ? `Own ${name}` : `Game's ${name} again`, () => {
    if (!project.paths(GRAPHICS_FILE).length) project.create(GRAPHICS_FILE, HEADER);
    project.edit(GRAPHICS_FILE, own ? `Own ${name}` : `Game's ${name}`, (doc: Document) => {
      const list = ((doc.getIn(["system", "images"]) as { toJSON?: () => string[] } | undefined)?.toJSON?.() ?? []).filter((n) => n !== name);
      const next = own ? [...list, name] : list;
      if (next.length) doc.setIn(["system", "images"], doc.createNode(next, { flow: true }));
      else doc.deleteIn(["system", "images"]);
      if (name === "icons") {
        if (own) doc.setIn(["system", "icons"], doc.createNode({ ...(defaultIcons as Record<string, number>) }, { flow: true }));
        else doc.deleteIn(["system", "icons"]);
      }
      if (!doc.getIn(["system", "images"]) && !doc.getIn(["system", "icons"])) doc.deleteIn(["system"]);
    });
  });
}

/** Back to the game's own image: the project's copy is removed. */
export async function dropSystemCopy(project: Project, name: SystemImage) {
  await putAsset(project.info.id, `system/${name}.png`, null);
  register(project, name, false);
}

/** Why an icon can't get this name, or null (and the name is set). */
function renameIcon(project: Project, frame: number, name: string): string | null {
  const raw = project.content.raw;
  if (!ownsSystem(raw, "icons")) return "Save the icon sheet first (it becomes the project's own)";
  if (!/^[a-z0-9_]+$/.test(name)) return "Names use a–z, 0–9 and _";
  const index = iconIndexOf(raw);
  if (name in index && index[name] !== frame) return `"${name}" is another icon's name`;
  const old = Object.entries(index).find(([, i]) => i === frame)?.[0];
  const used = (n: string) => [...Object.values(raw.items), ...Object.values(raw.abilities), ...Object.values(raw.statuses)].some((x) => (x as { icon?: string }).icon === n);
  if (old && used(old)) return `"${old}" is in use (items, abilities or statuses show it) – name another frame instead`;
  project.edit(GRAPHICS_FILE, `Name icon ${name}`, (doc: Document) => {
    if (old) doc.deleteIn(["system", "icons", old]);
    doc.setIn(["system", "icons", name], frame);
  });
  return null;
}

export function systemTarget(project: Project, name: SystemImage, frame?: number): ImageTarget {
  const m = SYSTEM_META[name];
  const raw = project.content.raw;
  const own = ownsSystem(raw, name);
  const names = name === "icons" ? Object.fromEntries(Object.entries(iconIndexOf(raw)).map(([n, i]) => [i, n])) : FRAME_NAMES[name];
  return {
    key: `system:${name}`,
    title: m.label,
    kind: m.kind,
    image: systemImagePath(name),
    layout: { fw: m.fw, fh: m.fh, cols: m.cols },
    frame,
    frameNames: names,
    canAddFrames: name === "icons",
    rename:
      name === "icons"
        ? (f, n) => {
            const problem = renameIcon(project, f, n);
            // the strip and the preview show the new name
            if (!problem) openImage(systemTarget(project, name, f));
            return problem;
          }
        : undefined,
    async save(png: Blob): Promise<ImageTarget | void> {
      await putAsset(project.info.id, `system/${name}.png`, png);
      if (!own) {
        register(project, name, true);
        return systemTarget(project, name, frame);
      }
    },
  };
}
