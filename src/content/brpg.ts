import { strFromU8, unzipSync } from "fflate";
import { parse } from "yaml";
import type { RawContent } from "../core/data/database";
import { layeredRaw } from "./raw";

/**
 * A game from a `.brpg` file (projects.md §5, distribution.md §2): the project and the library
 * content it bundles, read from the zip; its images and music become blob: URLs.
 */
export interface BrpgGame {
  name: string;
  /** For save slots: a folder-like id from the name. */
  id: string;
  raw: RawContent;
  /** Content asset paths (library/<v>/assets/…, projects/game/assets/…) → blob: URLs. */
  assets: Record<string, string>;
}

const TYPES: Record<string, string> = { png: "image/png", wav: "audio/wav", ogg: "audio/ogg", mp3: "audio/mpeg" };

export function readBrpg(bytes: Uint8Array): BrpgGame {
  let zip: Record<string, Uint8Array>;
  try {
    zip = unzipSync(bytes);
  } catch {
    throw new Error("This isn't a Board RPG game (.brpg)");
  }
  if (!zip["project.yaml"]) throw new Error("This isn't a Board RPG game (no project.yaml)");
  const def = (parse(strFromU8(zip["project.yaml"])) ?? {}) as { name?: string; library?: string };
  if (!def.library) throw new Error("project.yaml names no library version");
  const L = `library/${def.library}/`;
  const yaml = (prefix: string) =>
    Object.entries(zip)
      .filter(([p]) => p.startsWith(prefix) && p.endsWith(".yaml"))
      .map(([p, d]) => [p, parse(strFromU8(d))] as [string, unknown])
      .filter(([, data]) => data != null);
  const roots = { library: `${L}assets/`, project: "projects/game/assets/" };
  const raw = layeredRaw(yaml(`${L}data/`), yaml("data/"), roots);
  const assets: Record<string, string> = {};
  for (const [p, data] of Object.entries(zip)) {
    const ext = p.slice(p.lastIndexOf(".") + 1).toLowerCase();
    if (!TYPES[ext]) continue;
    const key = p.startsWith(`${L}assets/`) ? p : p.startsWith("assets/") ? `projects/game/${p}` : null;
    if (key) assets[key] = URL.createObjectURL(new Blob([data as BlobPart], { type: TYPES[ext] }));
  }
  const name = def.name ?? "Board RPG";
  const id = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "game";
  return { name, id, raw, assets };
}
