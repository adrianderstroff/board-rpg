import { isMap, isPair, isScalar, isSeq, type Document, type YAMLMap } from "yaml";
import { placePrefab, prefabCells } from "../../../src/core/data/prefab";
import type { MapDef, MapEventDef, PrefabDef } from "../../../src/core/data/types";
import type { Pos } from "../../../src/core/util/grid";
import { mapSize } from "../map/layers";
import type { Project } from "../project";
import { projectIdFor } from "../projectFiles";
import { entitiesAt, listEntities, type EntityRef } from "./model";

/** Prefabs in the editor (editor-design §6.5): placing one on a map, and making one from entities. */

/** An event as the map files write it: its states and handlers one per line. */
function eventNode(doc: Document, ev: MapEventDef): YAMLMap {
  const node = doc.createNode(ev, { flow: false }) as YAMLMap;
  for (const pair of node.items)
    if (isScalar(pair.key) && (pair.key.value === "states" || pair.key.value === "on") && (isMap(pair.value) || isSeq(pair.value)))
      for (const item of pair.value.items) (isPair(item) ? (item.value as YAMLMap) : (item as YAMLMap)).flow = true;
  return node;
}

/** Where a prefab would go if placed at `at`: its cells, and whether each one is free and on the map. */
export function prefabFootprint(map: MapDef, prefab: PrefabDef, at: Pos): { cells: Pos[]; fits: boolean[] } {
  const { w, h } = mapSize(map);
  const cells = prefabCells(prefab, at);
  const fits = cells.map((c) => c.x >= 0 && c.y >= 0 && c.x < w && c.y < h && !entitiesAt(map, c).length && cells.filter((o) => o.x === c.x && o.y === c.y).length === 1);
  return { cells, fits };
}

/** Places a prefab on the map (fresh ids for its placeholders, references rewired); every entity it added. */
export function placePrefabOnMap(doc: Document, map: MapDef, prefab: PrefabDef, at: Pos): EntityRef[] {
  const taken = new Set([...(map.events ?? []), ...(map.enemies ?? [])].map((e) => e.id));
  const placed = placePrefab(prefab, at, (id) => taken.has(id));
  const firstEvent = map.events?.length ?? 0;
  if (placed.events.length && doc.getIn(["events"]) === undefined) doc.set("events", doc.createNode([], { flow: false }));
  for (const ev of placed.events) doc.addIn(["events"], eventNode(doc, ev));
  if (placed.enemies.length && doc.getIn(["enemies"]) === undefined) doc.set("enemies", doc.createNode([], { flow: false }));
  for (const e of placed.enemies) doc.addIn(["enemies"], doc.createNode(e, { flow: true }));
  if (placed.exits.length && doc.getIn(["exits"]) === undefined) doc.set("exits", doc.createNode([], { flow: false }));
  for (const e of placed.exits) doc.addIn(["exits"], doc.createNode(e, { flow: true }));
  const from = (kind: EntityRef["kind"], start: number, n: number): EntityRef[] => Array.from({ length: n }, (_, i) => ({ kind, key: start + i }));
  return [...from("event", firstEvent, placed.events.length), ...from("enemy", map.enemies?.length ?? 0, placed.enemies.length), ...from("exit", map.exits?.length ?? 0, placed.exits.length)];
}

/** A name the chosen entities use: an entity's id, a flag or a variable – per copy or shared in a prefab. */
export interface PrefabName {
  name: string;
  kind: "entity" | "flag" | "variable";
  /** What Save as prefab suggests: ids and flags / variables named after one of them per copy, the rest shared. */
  perCopy: boolean;
}

const pickEntities = (map: MapDef, refs: EntityRef[]) => {
  const pick = <T,>(kind: EntityRef["kind"], list: T[] | undefined) => refs.filter((r) => r.kind === kind).map((r) => structuredClone(list![r.key as number]));
  return { events: pick("event", map.events), enemies: pick("enemy", map.enemies), exits: pick("exit", map.exits) };
};

/** The names the chosen entities use (their ids, the flags and variables their scripts and conditions name). */
export function prefabNames(map: MapDef, refs: EntityRef[]): PrefabName[] {
  const { events, enemies, exits } = pickEntities(map, refs);
  const ids = [...events, ...enemies].map((e) => e.id);
  const flags = new Set<string>();
  const vars = new Set<string>();
  const walk = (v: unknown): void => {
    if (Array.isArray(v)) return v.forEach(walk);
    if (!v || typeof v !== "object") return;
    for (const [k, x] of Object.entries(v)) {
      if ((k === "setFlag" || k === "clearFlag" || k === "flag") && typeof x === "string") flags.add(x);
      else if ((k === "setVar" || k === "addVar" || k === "var") && x && typeof x === "object" && typeof (x as { name?: unknown }).name === "string") vars.add((x as { name: string }).name);
      walk(x);
    }
  };
  walk([...events, ...enemies, ...exits]);
  const named = (n: string) => ids.some((id) => n === id || n.startsWith(`${id}_`));
  return [
    ...ids.map((name) => ({ name, kind: "entity" as const, perCopy: true })),
    ...[...flags].sort().map((name) => ({ name, kind: "flag" as const, perCopy: named(name) })),
    ...[...vars].sort().map((name) => ({ name, kind: "variable" as const, perCopy: named(name) })),
  ];
}

/**
 * A prefab from a map's entities (events, enemies, exits – not arrivals): cells relative to `origin`,
 * and the `perCopy` names (ids, flags, variables) become placeholders wherever a value is exactly
 * one of them – each placement gets its own. The rest stays as it is, shared by every copy.
 */
export function prefabFrom(map: MapDef, refs: EntityRef[], origin: Pos, perCopy: Iterable<string> = prefabNames(map, refs).filter((n) => n.perCopy).map((n) => n.name)): Omit<PrefabDef, "id" | "name"> {
  const { events, enemies, exits } = pickEntities(map, refs);
  const names = new Set(perCopy);
  const toPlaceholder = (v: unknown): unknown => {
    if (typeof v === "string") return names.has(v) ? `$${v}` : v;
    if (Array.isArray(v)) return v.map(toPlaceholder);
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, toPlaceholder(x)]));
    return v;
  };
  // variables are named in objects ({ var: { name } }) – the same exact rule covers them
  const rel = <T extends { x: number; y: number }>(e: T): T => ({ ...(toPlaceholder(e) as T), x: e.x - origin.x, y: e.y - origin.y });
  return {
    ...(events.length ? { events: events.map(rel) } : {}),
    ...(enemies.length ? { enemies: enemies.map(rel) } : {}),
    ...(exits.length ? { exits: exits.map(rel) } : {}),
  };
}

/** The entities (not arrivals) inside a rectangle of cells. */
export function entitiesIn(map: MapDef, r: { x: number; y: number; w: number; h: number }): EntityRef[] {
  return listEntities(map)
    .filter((e) => e.kind !== "spawn" && e.x >= r.x && e.y >= r.y && e.x < r.x + r.w && e.y < r.y + r.h)
    .map((e) => ({ kind: e.kind, key: e.key }));
}

const PREFABS_FILE = "data/prefabs.yaml";

/** Saves a prefab into the project's data/prefabs.yaml (a free id from its name); returns the id. */
export function savePrefab(project: Project, name: string, category: string | undefined, body: Omit<PrefabDef, "id" | "name">, extra: { icon?: string; description?: string } = {}): string {
  const own = project.paths(PREFABS_FILE).length ? (project.data<Record<string, unknown>>(PREFABS_FILE) ?? {}) : {};
  const base = projectIdFor(name);
  let id = base;
  for (let n = 2; id in own; n++) id = `${base}_${n}`;
  const entry = { name, ...(category ? { category } : {}), icon: extra.icon ?? (body.events?.length ? "event" : body.enemies?.length ? "enemy" : "exit"), ...body };
  project.transaction(`Save prefab ${name}`, () => {
    if (!project.paths(PREFABS_FILE).length) project.create(PREFABS_FILE, "# The project's own prefabs (game-design §10.5): cells relative to where they are placed; $ids get fresh ids.\n");
    project.edit(PREFABS_FILE, `Save prefab ${name}`, (doc: Document) => {
      doc.setIn([id], doc.createNode({ name: entry.name, ...(entry.category ? { category: entry.category } : {}), icon: entry.icon, ...(extra.description ? { description: extra.description } : {}) }));
      for (const list of ["events", "enemies", "exits"] as const) {
        const items = body[list];
        if (!items?.length) continue;
        doc.setIn([id, list], doc.createNode([], { flow: false }));
        for (const item of items) doc.addIn([id, list], list === "events" ? eventNode(doc, item as MapEventDef) : doc.createNode(item, { flow: true }));
      }
    });
  });
  return id;
}
