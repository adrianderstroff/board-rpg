import { isMap, parse, parseDocument } from "yaml";
import { LIB } from "../core/data/database";
import { BUILTIN } from "../core/data/builtins";
import { dataPath } from "./raw";

/**
 * What a project takes from its library (projects.md §5): exports and builds bundle only that.
 * Library content is referenced as `lib:<id>` everywhere – in the project and inside the library –
 * so the used set is every `lib:` string reachable from the project's files (and from what the
 * rules rely on, builtins.ts), following each used entry's own references.
 */
export interface LibraryUsage {
  /** Used entries (`lib:<id>`), in whatever collection they are. */
  ids: Set<string>;
  /** Used music tracks (names below the library's audio/music/). */
  music: Set<string>;
}

type File = [path: string, text: string];

/** Collections of graphics sheets in graphics.yaml, by id. */
const GRAPHICS = ["charsets", "battlers", "faces", "battlebacks"];

/** Every string starting with `lib:` in some data. */
function libRefs(data: unknown, out: string[] = []): string[] {
  if (typeof data === "string") {
    if (data.startsWith(LIB)) out.push(data);
  } else if (Array.isArray(data)) data.forEach((v) => libRefs(v, out));
  else if (data && typeof data === "object")
    for (const [k, v] of Object.entries(data)) {
      if (k.startsWith(LIB)) out.push(k); // e.g. the start items: { lib:potion: 2 }
      libRefs(v, out);
    }
  return out;
}

/** The library's entries by `lib:` id (an id can name several things – a hero's charset, battler and face). */
function libraryEntries(library: File[]): Map<string, unknown[]> {
  const entries = new Map<string, unknown[]>();
  const add = (id: string, v: unknown) => entries.set(LIB + id, [...(entries.get(LIB + id) ?? []), v]);
  for (const [path, text] of library) {
    const rel = dataPath(path);
    if (!rel.includes("/") && rel !== "graphics.yaml" && path.includes("/data/")) {
      for (const [id, v] of Object.entries((parse(text) ?? {}) as Record<string, unknown>)) add(id, v);
    } else if (rel === "graphics.yaml") {
      const g = (parse(text) ?? {}) as Record<string, Record<string, unknown>>;
      for (const sub of GRAPHICS) for (const [id, v] of Object.entries(g[sub] ?? {})) add(id, v);
    } else if (rel.startsWith("chipsets/")) add(rel.slice("chipsets/".length).replace(/\.yaml$/, ""), parse(text));
  }
  return entries;
}

/**
 * Moving a project to another library version (projects.md §3): the `lib:` references in its files
 * that the other version doesn't have (entries or music tracks) – sorted, empty when it fits.
 */
export function missingInLibrary(library: File[], project: File[], tracks: string[]): string[] {
  const entries = libraryEntries(library);
  const refs = new Set(project.flatMap(([, text]) => libRefs(parse(text))));
  return [...refs].filter((id) => !entries.has(id) && !tracks.includes(id.slice(LIB.length))).sort();
}

/** What `project` uses of `library` (both as [path, text] of their data files). `tracks`: the library's music. */
export function libraryUsage(library: File[], project: File[], tracks: string[]): LibraryUsage {
  const entries = libraryEntries(library);
  const music = new Set<string>();
  const ids = new Set<string>();
  const queue = [...project.flatMap(([, text]) => libRefs(parse(text))), ...Object.values(BUILTIN)];
  while (queue.length) {
    const id = queue.pop()!;
    if (ids.has(id)) continue;
    // a name can be an entry and a music track at once (lib:village: a battle background and a song)
    if (tracks.includes(id.slice(LIB.length))) music.add(id.slice(LIB.length));
    const found = entries.get(id);
    if (!found) continue;
    ids.add(id);
    for (const v of found) queue.push(...libRefs(v));
  }
  return { ids, music };
}

/**
 * A library data file with only the used entries (null: the whole file isn't used – an unused
 * chipset). Comments stay; library.yaml and anything that isn't a collection stay as they are.
 */
export function trimLibraryFile(path: string, text: string, usage: LibraryUsage): string | null {
  if (!path.includes("/data/")) return text;
  const rel = dataPath(path);
  if (rel.startsWith("chipsets/")) return usage.ids.has(LIB + rel.slice("chipsets/".length).replace(/\.yaml$/, "")) ? text : null;
  if (rel.includes("/")) return text;
  const doc = parseDocument(text);
  const prune = (node: unknown) => {
    if (!isMap(node)) return;
    node.items = node.items.filter((pair) => usage.ids.has(LIB + String((pair.key as { value?: unknown })?.value ?? pair.key)));
  };
  if (rel === "graphics.yaml") for (const sub of GRAPHICS) prune(doc.get(sub, true));
  else prune(doc.contents);
  return doc.toString({ lineWidth: 0 });
}

/** The library asset files the used content needs (paths below the library's assets/). */
export function usedAssets(library: File[], usage: LibraryUsage): string[] {
  const out = new Set<string>();
  for (const [path, text] of library) {
    const rel = dataPath(path);
    if (rel === "graphics.yaml") {
      const g = (parse(text) ?? {}) as Record<string, Record<string, { image?: string }>> & { wallSigns?: { image?: string } };
      for (const sub of GRAPHICS) for (const [id, v] of Object.entries(g[sub] ?? {})) if (usage.ids.has(LIB + id) && v.image) out.add(v.image);
      if (g.wallSigns?.image) out.add(g.wallSigns.image);
    } else if (rel.startsWith("chipsets/") && usage.ids.has(LIB + rel.slice("chipsets/".length).replace(/\.yaml$/, ""))) {
      const c = parse(text) as { image?: string; decorImage?: string };
      for (const img of [c.image, c.decorImage]) if (img) out.add(img);
    }
  }
  for (const m of usage.music) out.add(`audio/music/${m}.wav`);
  return [...out].sort();
}
