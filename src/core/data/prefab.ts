import type { ExitDef, MapEnemyDef, MapEventDef, PrefabDef } from "./types";
import type { Pos } from "../util/grid";

/**
 * Placing a prefab (§10.5) – the same for the editor and for the game: its entities, enemies and
 * exits move to `at` (their cells are relative), and every `$placeholder` id gets a fresh one that
 * isn't `taken`. Every string naming a placeholder is rewired: a whole `$gate`, or one inside a
 * longer string (`$gate_open` → `gate_2_open` – the longest placeholder that fits wins).
 */
export interface Placed {
  events: MapEventDef[];
  enemies: MapEnemyDef[];
  exits: ExitDef[];
  /** Placeholder (without $) → the id it got. */
  ids: Record<string, string>;
}

export const isPlaceholder = (id: string) => id.startsWith("$");

/** The placeholders of a prefab (its events' and enemies' ids that start with $), without the $. */
export function placeholders(prefab: PrefabDef): string[] {
  return [...(prefab.events ?? []), ...(prefab.enemies ?? [])].map((e) => e.id).filter(isPlaceholder).map((id) => id.slice(1));
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

export function placePrefab(prefab: PrefabDef, at: Pos, taken: (id: string) => boolean): Placed {
  const ids: Record<string, string> = {};
  for (const name of placeholders(prefab)) ids[name] = freeIdFrom(name, (id) => taken(id) || Object.values(ids).includes(id));
  const move = <T extends { x: number; y: number }>(list: T[] | undefined): T[] => rewire(list ?? [], ids).map((e) => ({ ...e, x: e.x + at.x, y: e.y + at.y }));
  return { events: move(prefab.events), enemies: move(prefab.enemies), exits: move(prefab.exits), ids };
}

/** The cells a prefab covers when placed at `at` (its footprint). */
export function prefabCells(prefab: PrefabDef, at: Pos): Pos[] {
  return [...(prefab.events ?? []), ...(prefab.enemies ?? []), ...(prefab.exits ?? [])].map((e) => ({ x: e.x + at.x, y: e.y + at.y }));
}
