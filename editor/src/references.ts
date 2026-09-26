import { isMap, isScalar, type Document } from "yaml";
import { keyTarget, refTarget, rewriteRefs, type RefCollection } from "../../src/content/refs";
import type { MapDef } from "../../src/core/data/types";
import { isLibraryFile, type Project } from "./project";

/**
 * Where content is used (editor-design §3, E9): every place in the project's files – and the
 * library's – that refers to an entry, found with the same field knowledge that repoints references
 * (content/refs.ts).
 */

export interface Usage {
  /** The file and the path to the value inside it. */
  file: string;
  path: (string | number)[];
  /** What refers to it, in words ("map Sandhollow, entity smith", "dialog elder_talk"). */
  label: string;
  /** Where to go to see it. */
  target: UsageTarget;
  /** In the library (read-only). */
  lib: boolean;
}

export type ContentScreen = "dialogs" | "quests" | "items" | "heroes" | "enemies" | "npcs" | "abilities" | "shops" | "settings";
export type UsageTarget = { screen: "maps"; map: string; entity?: { kind: "event" | "exit" | "enemy"; key: number } } | { screen: ContentScreen; id?: string };

const COLLECTION_SCREEN: Record<string, ContentScreen> = {
  items: "items",
  heroes: "heroes",
  classes: "heroes",
  enemies: "enemies",
  npcs: "npcs",
  abilities: "abilities",
  shops: "shops",
  quests: "quests",
  config: "settings",
};

/** Where a value in a file is, in words and as a place to go. */
function locate(project: Project, file: string, path: (string | number)[]): { label: string; target: UsageTarget } {
  const map = file.match(/^data\/maps\/(.+)\.yaml$/)?.[1];
  if (map) {
    const m = project.data<MapDef>(file);
    const name = m?.name ?? map;
    const [list, index] = path;
    if ((list === "events" || list === "exits" || list === "enemies") && typeof index === "number") {
      const what = list === "events" ? `entity ${m?.events?.[index]?.id ?? index}` : list === "exits" ? `exit ${index + 1}` : `enemy ${m?.enemies?.[index]?.id ?? index}`;
      return { label: `map ${name}, ${what}`, target: { screen: "maps", map, entity: { kind: list === "events" ? "event" : list === "exits" ? "exit" : "enemy", key: index } } };
    }
    return { label: `map ${name}${list === "on" ? " (on enter)" : ""}`, target: { screen: "maps", map } };
  }
  if (/\/dialogs\/[^/]+\.yaml$/.test(file)) return { label: `dialog ${path[0]}`, target: { screen: "dialogs", id: String(path[0]) } };
  const collection = file.match(/data\/(\w+)\.yaml$/)?.[1] ?? "";
  if (collection === "config") return { label: "Settings", target: { screen: "settings" } };
  const screen = COLLECTION_SCREEN[collection];
  const lib = isLibraryFile(file) ? "lib:" : "";
  const id = `${lib}${path[0]}`;
  const entry = (project.content.raw as unknown as Record<string, Record<string, { name?: string; title?: string }>>)[collection]?.[id];
  const singular = collection.replace(/ies$/, "y").replace(/s$/, "");
  return { label: `${singular} ${entry?.name ?? entry?.title ?? path[0]}`, target: screen ? { screen, id } : { screen: "settings" } };
}

/** Every place that refers to `id` of `collection`. */
export function findUsages(project: Project, collection: RefCollection, id: string): Usage[] {
  const out: Usage[] = [];
  for (const file of project.paths("")) {
    if (!file.endsWith(".yaml")) continue;
    const data = project.data<unknown>(file);
    const found: (string | number)[][] = [];
    const walk = (v: unknown, keys: string[], path: (string | number)[]) => {
      if (Array.isArray(v)) v.forEach((x, i) => walk(x, keys, [...path, i]));
      else if (v && typeof v === "object") {
        for (const [k, x] of Object.entries(v)) {
          if (k === id && keyTarget(keys) === collection) found.push([...path, k]);
          walk(x, [...keys, k], [...path, k]);
        }
      } else if (v === id && refTarget(keys).includes(collection)) found.push(path);
    };
    walk(data, [], []);
    for (const path of found) out.push({ file, path, lib: isLibraryFile(file), ...locate(project, file, path) });
  }
  return out;
}

/** Usages grouped by what refers (one line per entity, dialog …). */
export function usagePlaces(usages: Usage[]): Usage[] {
  const seen = new Set<string>();
  return usages.filter((u) => {
    const k = `${u.file}#${u.label}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

// ---------- rename, delete protection (E9) ----------

/** The collections an entry can be renamed in, and the file that holds a project's entry. */
const ENTRY_FILES: Partial<Record<RefCollection, string>> = {
  items: "data/items.yaml",
  heroes: "data/heroes.yaml",
  classes: "data/classes.yaml",
  enemies: "data/enemies.yaml",
  npcs: "data/npcs.yaml",
  abilities: "data/abilities.yaml",
  shops: "data/shops.yaml",
  quests: "data/quests.yaml",
};

/** The file of a project entry (a dialog's file, a map's own file), if the project has it. */
export function entryFile(project: Project, collection: RefCollection, id: string): string | undefined {
  if (id.startsWith("lib:")) return undefined;
  if (collection === "maps") return project.paths(`data/maps/${id}.yaml`)[0];
  if (collection === "dialogs") return project.paths("data/dialogs/").find((f) => id in (project.data<Record<string, unknown>>(f) ?? {}));
  const file = ENTRY_FILES[collection];
  return file && id in (project.data<Record<string, unknown>>(file) ?? {}) ? file : undefined;
}

/** Whether an entry of `collection` with this id exists (project or library). */
function exists(project: Project, collection: RefCollection, id: string): boolean {
  const raw = project.content.raw as unknown as Record<string, Record<string, unknown> | undefined>;
  if (collection === "dialogs") return !!entryFile(project, "dialogs", id);
  return !!raw[collection]?.[id];
}

/** Why an id can't be used for a renamed entry, or null. */
export function renameProblem(project: Project, collection: RefCollection, from: string, to: string): string | null {
  if (to === from) return "That's its id already";
  if (!/^[a-z0-9_]+$/.test(to)) return "Ids use a–z, 0–9 and _";
  if (exists(project, collection, to)) return `There is a ${to} already`;
  return null;
}

/** The usages outside the entry itself (its own references to itself don't keep it alive). */
export function outsideUsages(project: Project, collection: RefCollection, id: string): Usage[] {
  const own = entryFile(project, collection, id);
  return findUsages(project, collection, id).filter((u) => !(u.file === own && (collection === "maps" || u.path[0] === id)));
}

/**
 * Renames a project entry and repoints every reference to it in the project's files – one undo
 * step. A map is its file: the file is moved (deleted on Save). Returns how many references moved.
 */
export function renameEntry(project: Project, collection: RefCollection, from: string, to: string): number {
  const problem = renameProblem(project, collection, from, to);
  if (problem) throw new Error(problem);
  const file = entryFile(project, collection, from);
  if (!file) throw new Error(`${from} isn't the project's own (library entries can't be renamed)`);
  let moved = 0;
  project.transaction(`Rename ${from} to ${to}`, () => {
    if (collection === "maps") {
      const text = project.doc(file).toString({ lineWidth: 0 });
      project.create(`data/maps/${to}.yaml`, project.paths(file).length ? text : "");
      project.remove(file, `Rename ${from} to ${to}`);
    } else
      project.edit(file, `Rename ${from} to ${to}`, (doc: Document) => {
        // the key keeps its place in the file
        const pair = isMap(doc.contents) ? doc.contents.items.find((p) => isScalar(p.key) && p.key.value === from) : undefined;
        if (pair && isScalar(pair.key)) pair.key.value = to;
      });
    for (const path of project.paths("data/")) {
      if (!path.endsWith(".yaml")) continue;
      project.edit(path, `Rename ${from} to ${to}`, (doc: Document) => void (moved += rewriteRefs(doc, collection, from, to)));
    }
  });
  return moved;
}
