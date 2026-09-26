import type { RawContent } from "../core/data/database";

/**
 * Where a data file belongs in the raw content, by its path below `data/`:
 *   <collection>.yaml → raw[collection], maps/<id>.yaml → raw.maps[id],
 *   chipsets/<id>.yaml → raw.chipsets[id], dialogs/*.yaml → merged into raw.dialogs.
 * Shared by the game (bundled files) and the editor (files it edits), so both build the same content.
 */
export function assembleRaw(files: Iterable<[path: string, data: unknown]>): RawContent {
  const raw: Record<string, unknown> = { maps: {}, chipsets: {}, dialogs: {} };
  for (const [path, data] of files) {
    const parts = dataPath(path).replace(/\.yaml$/, "").split("/");
    if (parts.length === 1) raw[parts[0]] = data;
    else if (parts[0] === "maps" || parts[0] === "chipsets") (raw[parts[0]] as Record<string, unknown>)[parts[1]] = data;
    else if (parts[0] === "dialogs") Object.assign(raw.dialogs as object, data);
    else throw new Error(`Don't know where ${path} belongs`);
  }
  return raw as unknown as RawContent;
}

/** A path relative to the data folder ("/data/maps/x.yaml" → "maps/x.yaml"). */
export function dataPath(path: string): string {
  return path.replace(/^.*?\/?data\//, "");
}
