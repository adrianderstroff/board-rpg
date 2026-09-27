import type { Database } from "../../src/core/data/database";
import { projectIdFor } from "./projectFiles";

/**
 * Resources a project can bring (projects.md §6): graphics sheets registered in its
 * data/graphics.yaml, and music tracks (files only). Sheet layouts: public/assets/ASSETS.md.
 */
export type ResourceKind = "charsets" | "battlers" | "faces" | "battlebacks" | "music";

export const RESOURCE_KINDS: { id: ResourceKind; label: string; hint?: string }[] = [
  { id: "charsets", label: "Charsets" },
  { id: "battlers", label: "Battlers", hint: "One row of square frames: heroes 6 (idle, breathe, attack, cast, hurt, KO), enemies 4 (idle, idle 2, attack, hurt)." },
  { id: "faces", label: "Faces", hint: "One portrait, 48×48." },
  { id: "battlebacks", label: "Battle backgrounds", hint: "480×190; the ground where the combatants stand starts at the floor row (about y 110)." },
  { id: "music", label: "Music", hint: "A WAV file that loops as a whole." },
];

/** A sheet's entry in graphics.yaml, from the image's size – or why the image doesn't fit. */
export function sheetFor(kind: Exclude<ResourceKind, "music">, image: string, w: number, h: number): { entry: Record<string, unknown>; warning?: string } | { error: string } {
  switch (kind) {
    case "charsets":
      if (w % 3 || h % 4) return { error: `A charset is 3 × 4 frames – ${w}×${h} doesn't divide` };
      return { entry: { image, frameWidth: w / 3, frameHeight: h / 4 } };
    case "battlers": {
      if (w % h) return { error: `A battler is one row of square frames – ${w}×${h} isn't` };
      const count = w / h;
      const frames =
        count >= 6
          ? { idle: 0, idle2: 1, attack: 2, cast: 3, hurt: 4, ko: 5 }
          : count >= 4
            ? { idle: 0, idle2: 1, attack: 2, hurt: 3 }
            : Object.fromEntries(["idle", "attack", "hurt"].slice(0, count).map((n, i) => [n, i]));
      return { entry: { image, frameWidth: h, frameHeight: h, frames }, ...(count < 4 ? { warning: `only ${count} frame(s) – battles use idle, attack and hurt` } : {}) };
    }
    case "faces":
      return { entry: { image }, ...(w !== 48 || h !== 48 ? { warning: `faces are 48×48 (this one is ${w}×${h}) – it will be scaled` } : {}) };
    case "battlebacks":
      return { entry: { image, floor: Math.round((h * 110) / 190) }, ...(w !== 480 || h !== 190 ? { warning: `battle backgrounds are 480×190 (this one is ${w}×${h})` } : {}) };
  }
}

/** A free id for an imported file: from its name, not taken by the project or the library. */
export function resourceId(fileName: string, taken: (id: string) => boolean): string {
  const base = projectIdFor(fileName.replace(/\.[^.]+$/, ""));
  let id = base;
  for (let n = 2; taken(id); n++) id = `${base}_${n}`;
  return id;
}

/** Every resource of a kind in the content, and whether it is the library's. */
export function resourcesOf(db: Database, music: string[], kind: ResourceKind): { id: string; lib: boolean }[] {
  const ids = kind === "music" ? music : Object.keys(db.graphics[kind]);
  // the project's own first, then the library's
  return ids.map((id) => ({ id, lib: id.startsWith("lib:") })).sort((a, b) => Number(a.lib) - Number(b.lib) || a.id.localeCompare(b.id));
}
