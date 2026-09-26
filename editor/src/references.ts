import { keyTarget, refTarget, type RefCollection } from "../../src/content/refs";
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
