import type { ExitDef, MapEnemyDef, MapEventDef, PrefabDef } from "./types";
import type { Pos } from "../util/grid";

/**
 * Placing a prefab (§10.5) – the same for the editor and for the game: its entities, enemies and
 * exits move to `at` (their cells are relative) and every `$name` value is filled in:
 * - the prefab's own entities get fresh ids (not `taken`),
 * - its inputs get the values given (else their defaults),
 * - any other name is per copy: named after one of its entities it follows it (`$gate_open` →
 *   `gate_2_open`), otherwise it gets a free name of its own.
 * A `$name` inside a longer string is replaced too (the longest name that fits wins).
 */
export interface Placed {
  events: MapEventDef[];
  enemies: MapEnemyDef[];
  exits: ExitDef[];
  /** Placeholder (without $) → what it became. */
  ids: Record<string, string>;
}

export const isPlaceholder = (id: string) => id.startsWith("$");

/** The prefab's own entities' placeholders (their ids that start with $), without the $. */
export function placeholders(prefab: PrefabDef): string[] {
  return [...(prefab.events ?? []), ...(prefab.enemies ?? [])].map((e) => e.id).filter(isPlaceholder).map((id) => id.slice(1));
}

/** Every `$name` a prefab uses as a whole value, without the $ (its entities' ids, per copy names, inputs). */
export function prefabTokens(prefab: PrefabDef): string[] {
  const out = new Set<string>();
  const walk = (v: unknown): void => {
    if (typeof v === "string") {
      if (/^\$[A-Za-z0-9_]+$/.test(v)) out.add(v.slice(1));
    } else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  walk([prefab.events, prefab.enemies, prefab.exits]);
  return [...out];
}

/** A free id from `base`: base, base_2, base_3 … */
export function freeIdFrom(base: string, taken: (id: string) => boolean): string {
  let id = base;
  for (let n = 2; taken(id); n++) id = `${base}_${n}`;
  return id;
}

/** Replaces placeholders in every string of `data` (a copy). */
export function rewire<T>(data: T, ids: Record<string, string>): T {
  const names = Object.keys(ids).sort((a, b) => b.length - a.length); // longest first
  if (!names.length) return structuredClone(data);
  const pattern = new RegExp(`\\$(${names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "g");
  const walk = (v: unknown): unknown => {
    if (typeof v === "string") return v.includes("$") ? v.replace(pattern, (_, name: string) => ids[name]) : v;
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [walk(k) as string, walk(x)]));
    return v;
  };
  return walk(data) as T;
}

export interface PlaceOptions {
  /** The inputs' values (else their defaults). */
  inputs?: Record<string, string>;
  /** Names already in use for per copy flags / variables (else only the placement's own count). */
  takenName?: (name: string) => boolean;
  /** Names every placeholder itself (entities and per copy names) – the game's numbered ids. */
  name?: (placeholder: string) => string;
}

/** What every `$name` of a prefab becomes when placed. */
export function prefabValues(prefab: PrefabDef, taken: (id: string) => boolean, opts: PlaceOptions = {}): Record<string, string> {
  const ids: Record<string, string> = {};
  const used = (id: string) => Object.values(ids).includes(id);
  const entities = placeholders(prefab);
  for (const name of entities) ids[name] = opts.name ? opts.name(name) : freeIdFrom(name, (id) => taken(id) || used(id));
  for (const [name, input] of Object.entries(prefab.inputs ?? {})) ids[name] = opts.inputs?.[name] ?? input.default ?? "";
  for (const token of prefabTokens(prefab)) {
    if (token in ids) continue;
    // named after one of its entities: it follows that entity's new id
    const owner = entities.filter((e) => token.startsWith(`${e}_`)).sort((a, b) => b.length - a.length)[0];
    if (owner) ids[token] = ids[owner] + token.slice(owner.length);
    else ids[token] = opts.name ? opts.name(token) : freeIdFrom(token, (n) => !!opts.takenName?.(n) || used(n));
  }
  return ids;
}

export function placePrefab(prefab: PrefabDef, at: Pos, taken: (id: string) => boolean, opts: PlaceOptions = {}): Placed {
  const ids = prefabValues(prefab, taken, opts);
  const move = <T extends { x: number; y: number }>(list: T[] | undefined): T[] => rewire(list ?? [], ids).map((e) => ({ ...e, x: e.x + at.x, y: e.y + at.y }));
  return { events: move(prefab.events), enemies: move(prefab.enemies), exits: move(prefab.exits), ids };
}

/** The cells a prefab covers when placed at `at` (its footprint). */
export function prefabCells(prefab: PrefabDef, at: Pos): Pos[] {
  return [...(prefab.events ?? []), ...(prefab.enemies ?? []), ...(prefab.exits ?? [])].map((e) => ({ x: e.x + at.x, y: e.y + at.y }));
}
