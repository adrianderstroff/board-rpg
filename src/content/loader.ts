import { parse } from "yaml";
import { Database, type RawContent } from "../core/data/database";

/**
 * Loads every YAML file under /data (bundled at build time, works in tests too).
 *   data/<collection>.yaml        → raw[collection]
 *   data/maps/<id>.yaml           → raw.maps[id]
 *   data/chipsets/<id>.yaml       → raw.chipsets[id]
 *   data/dialogs/*.yaml           → merged into raw.dialogs
 */
const files = import.meta.glob("/data/**/*.yaml", { query: "?raw", import: "default", eager: true }) as Record<string, string>;

export function loadRawContent(sources: Record<string, string> = files): RawContent {
  const raw: Record<string, unknown> = { maps: {}, chipsets: {}, dialogs: {} };
  for (const [path, text] of Object.entries(sources)) {
    const parts = path.replace(/^.*\/data\//, "").replace(/\.yaml$/, "").split("/");
    let data: unknown;
    try {
      data = parse(text);
    } catch (e) {
      throw new Error(`YAML error in ${path}: ${(e as Error).message}`);
    }
    if (parts.length === 1) raw[parts[0]] = data;
    else if (parts[0] === "maps" || parts[0] === "chipsets") (raw[parts[0]] as Record<string, unknown>)[parts[1]] = data;
    else if (parts[0] === "dialogs") Object.assign(raw.dialogs as object, data);
    else throw new Error(`Don't know where ${path} belongs`);
  }
  return raw as unknown as RawContent;
}

export function loadDatabase(): Database {
  return new Database(loadRawContent());
}
