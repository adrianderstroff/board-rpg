import { LIB, type AssetRoots, type RawContent } from "../core/data/database";

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

/** Collections whose entries are keyed by id (the library's get the `lib:` prefix). */
const KEYED = ["classes", "heroes", "patterns", "statuses", "fieldEffects", "abilities", "items", "enemies", "npcs", "shops", "quests", "chipsets", "maps", "dialogs", "prefabs"] as const;
const GRAPHICS = ["charsets", "battlers", "faces", "battlebacks"] as const;

type Rec = Record<string, Record<string, unknown>>;

/** A layer's content with its asset paths made root-relative ("charsets/x.png" → "library/v1/assets/charsets/x.png"). */
function rooted(raw: RawContent, root: string): RawContent {
  const r = raw as unknown as Rec & { graphics?: Rec };
  const at = (e: Record<string, unknown>, ...keys: string[]) => {
    const out = { ...e };
    for (const k of keys) if (typeof out[k] === "string") out[k] = root + out[k];
    return out;
  };
  const chipsets = Object.fromEntries(Object.entries(r.chipsets ?? {}).map(([id, c]) => [id, at(c as Record<string, unknown>, "image", "decorImage")]));
  const g = r.graphics;
  const graphics = g && {
    ...g,
    ...Object.fromEntries(GRAPHICS.map((k) => [k, Object.fromEntries(Object.entries((g[k] ?? {}) as Rec).map(([id, e]) => [id, at(e, "image")]))])),
    ...(g.wallSigns ? { wallSigns: at(g.wallSigns as Record<string, unknown>, "image") } : {}),
  };
  return { ...raw, chipsets, ...(graphics ? { graphics } : {}) } as unknown as RawContent;
}

/** The library's ids get the `lib:` prefix (its files write their own keys plain, references in full). */
function prefixed(raw: RawContent): RawContent {
  const r = raw as unknown as Rec & { graphics?: Rec };
  const pre = (rec: Record<string, unknown> | undefined) => Object.fromEntries(Object.entries(rec ?? {}).map(([id, v]) => [LIB + id, v]));
  const out: Record<string, unknown> = { ...raw };
  for (const k of KEYED) out[k] = pre(r[k]);
  if (r.graphics) out.graphics = { ...r.graphics, ...Object.fromEntries(GRAPHICS.map((k) => [k, pre(r.graphics![k] as Record<string, unknown>)])) };
  return out as unknown as RawContent;
}

/**
 * One game's content (projects.md §4): the library version's files, then the project's on top.
 * Library ids are prefixed `lib:`; every asset path is made root-relative to its layer's folder.
 */
export function layeredRaw(library: Iterable<[path: string, data: unknown]>, project: Iterable<[path: string, data: unknown]>, roots: AssetRoots): RawContent {
  const lib = prefixed(rooted(assembleRaw(library), roots.library)) as unknown as Rec & { graphics?: Rec; config?: unknown };
  const own = rooted(assembleRaw(project), roots.project) as unknown as Rec & { graphics?: Rec; config?: unknown };
  const out: Record<string, unknown> = {};
  for (const k of KEYED) out[k] = { ...(lib[k] ?? {}), ...(own[k] ?? {}) };
  const lg = lib.graphics ?? {};
  const og = own.graphics ?? {};
  out.graphics = {
    ...Object.fromEntries(GRAPHICS.map((k) => [k, { ...(lg[k] ?? {}), ...(og[k] ?? {}) }])),
    wallSigns: og.wallSigns ?? lg.wallSigns,
    // the runtime's images a project replaces are the project's alone (graphics.md §2)
    ...(og.system ? { system: og.system } : {}),
  };
  out.config = own.config ?? lib.config;
  out.roots = roots;
  return out as unknown as RawContent;
}
