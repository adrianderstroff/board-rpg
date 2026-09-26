import { parse } from "yaml";
import { Database, type RawContent } from "../core/data/database";
import { assembleRaw } from "./raw";

/**
 * Loads every YAML file under /data (bundled at build time, works in tests too).
 * Where each file belongs: see assembleRaw.
 */
const files = import.meta.glob("/data/**/*.yaml", { query: "?raw", import: "default", eager: true }) as Record<string, string>;

export function loadRawContent(sources: Record<string, string> = files): RawContent {
  return assembleRaw(
    Object.entries(sources).map(([path, text]) => {
      try {
        return [path, parse(text)] as [string, unknown];
      } catch (e) {
        throw new Error(`YAML error in ${path}: ${(e as Error).message}`);
      }
    }),
  );
}

export function loadDatabase(): Database {
  return new Database(loadRawContent());
}
