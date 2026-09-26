import type { AssetRoots } from "../core/data/database";
import { SYSTEM_IMAGES, type GraphicsDb } from "../core/data/types";

export { SYSTEM_IMAGES };

/**
 * The runtime's own images (public/assets/system/, ASSETS.md §6) and a project's copies of them
 * (graphics.md §2): which game image paths a project replaces, and with which file.
 */


/** "system/<name>.png" → the project's file, for every image the project replaces. */
export function systemOverrides(graphics: Pick<GraphicsDb, "system">, roots: AssetRoots | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of graphics.system?.images ?? []) if ((SYSTEM_IMAGES as readonly string[]).includes(name)) out[`system/${name}.png`] = `${roots?.project ?? ""}system/${name}.png`;
  return out;
}
