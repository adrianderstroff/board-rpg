import { isMap, isPair, isScalar, isSeq, type Document, type YAMLMap } from "yaml";
import { placePrefab, prefabCells, type PlaceOptions } from "../../../src/core/data/prefab";
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
export function placePrefabOnMap(doc: Document, map: MapDef, prefab: PrefabDef, at: Pos, opts: PlaceOptions = {}): EntityRef[] {
  const taken = new Set([...(map.events ?? []), ...(map.enemies ?? [])].map((e) => e.id));
  const placed = placePrefab(prefab, at, (id) => taken.has(id), opts);
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

/** What a value of the chosen entities becomes in a prefab (editor-design §6.5). */
export type SlotMode = "perCopy" | "fixed" | "input";

/**
 * A value the chosen entities use: their own ids, entities outside the selection they name, flags,
 * variables, and content (items, dialogs, shops, enemies, music) – with what it becomes when placed.
 */
export interface PrefabSlot {
  value: string;
  kind: "entity" | "outside" | "flag" | "variable" | "item" | "dialog" | "shop" | "enemy" | "music";
  mode: SlotMode;
  /** For an input: what the placing window asks. */
  label: string;
}

/** The modes a kind of value can take. */
export const SLOT_MODES: Record<PrefabSlot["kind"], SlotMode[]> = {
  entity: ["perCopy", "fixed"],
  // fixed is always the second choice
  outside: ["input", "fixed"],
  flag: ["perCopy", "fixed", "input"],
  variable: ["perCopy", "fixed", "input"],
  item: ["input", "fixed"],
  dialog: ["input", "fixed"],
  shop: ["input", "fixed"],
  enemy: ["input", "fixed"],
  music: ["input", "fixed"],
};

const pickEntities = (map: MapDef, refs: EntityRef[]) => {
  const pick = <T,>(kind: EntityRef["kind"], list: T[] | undefined) => refs.filter((r) => r.kind === kind).map((r) => structuredClone(list![r.key as number]));
  return { events: pick("event", map.events), enemies: pick("enemy", map.enemies), exits: pick("exit", map.exits) };
};

const LABELS: Record<PrefabSlot["kind"], string> = { entity: "Entity", outside: "Entity", flag: "Flag", variable: "Variable", item: "Item", dialog: "Dialog", shop: "Shop", enemy: "Enemy", music: "Music" };

/** Every value the chosen entities use that a prefab can treat on its own – its own entities per copy, the rest fixed. */
export function prefabSlots(map: MapDef, refs: EntityRef[]): PrefabSlot[] {
  const { events, enemies, exits } = pickEntities(map, refs);
  const ids = [...events, ...enemies].map((e) => e.id);
  const found = new Map<string, PrefabSlot["kind"]>();
  const add = (value: unknown, kind: PrefabSlot["kind"]) => {
    if (typeof value !== "string" || !value || found.has(`${kind}:${value}`)) return;
    found.set(`${kind}:${value}`, kind);
  };
  const entityRef = (v: unknown) => {
    if (typeof v !== "string" || v === "party" || v.startsWith("lib:")) return;
    add(v, ids.includes(v) ? "entity" : "outside");
  };
  const walk = (v: unknown): void => {
    if (Array.isArray(v)) return v.forEach(walk);
    if (!v || typeof v !== "object") return;
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
      if (k === "setFlag" || k === "clearFlag" || k === "flag") add(x, "flag");
      else if ((k === "setVar" || k === "addVar" || k === "var") && x && typeof x === "object") add((x as { name?: string }).name, "variable");
      else if ((k === "setState" || k === "state" || k === "heroesOn") && x && typeof x === "object") entityRef((x as { event?: string }).event);
      else if (k === "removeEvent" || k === "reveal" || k === "hide" || k === "show") entityRef(x);
      else if ((k === "move" || k === "face" || k === "emote" || k === "camera") && x && typeof x === "object") {
        const who = (x as { who?: string }).who;
        if (who && !who.startsWith("lib:")) entityRef(who);
      } else if (k === "giveItem" || k === "takeItem" || k === "item") add(typeof x === "object" && x ? (x as { id?: string }).id : x, "item");
      else if (k === "dialog") add(x, "dialog");
      else if (k === "shop") add(x, "shop");
      else if (k === "music") add(x, "music");
      walk(x);
    }
  };
  walk([...events.map((e) => ({ ...e, id: undefined })), ...exits]);
  for (const e of enemies) {
    add(e.enemy, "enemy");
    walk({ ...e, id: undefined, enemy: undefined });
  }
  // the prefab's own entities start per copy, everything else fixed
  const slots: PrefabSlot[] = ids.map((value) => ({ value, kind: "entity", mode: "perCopy", label: LABELS.entity }));
  for (const [key, kind] of found) {
    if (kind === "entity") continue; // listed above
    slots.push({ value: key.slice(kind.length + 1), kind, mode: "fixed", label: LABELS[kind] });
  }
  const order = Object.keys(LABELS);
  return slots.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind) || a.value.localeCompare(b.value));
}

/** A placeholder name for a slot: its value for per copy names, the label (made unique) for inputs. */
function tokenFor(slot: PrefabSlot, used: Set<string>): string {
  const base = slot.mode === "input" ? slot.label : slot.value;
  const clean = base.replace(/[^A-Za-z0-9_]+/g, "_").replace(/^_+|_+$/g, "").toLowerCase() || "value";
  let t = clean;
  for (let n = 2; used.has(t); n++) t = `${clean}_${n}`;
  used.add(t);
  return t;
}

/**
 * A prefab from a map's entities (events, enemies, exits – not arrivals): cells relative to `origin`;
 * `slots` say what each value becomes – per copy and inputs are replaced by `$placeholders` wherever
 * a value is exactly theirs, inputs are listed with their label, type and the current value as
 * default. Values not in `slots` stay as they are.
 */
export function prefabFrom(map: MapDef, refs: EntityRef[], origin: Pos, slots: PrefabSlot[] = prefabSlots(map, refs)): Omit<PrefabDef, "id" | "name"> {
  const { events, enemies, exits } = pickEntities(map, refs);
  const used = new Set<string>();
  const replace = new Map<string, string>();
  const inputs: NonNullable<PrefabDef["inputs"]> = {};
  // entities first: their tokens are their ids (per copy names named after them follow them when placed)
  for (const slot of [...slots].sort((a, b) => Number(b.kind === "entity") - Number(a.kind === "entity"))) {
    if (slot.mode === "fixed" || replace.has(slot.value)) continue;
    const token = tokenFor(slot, used);
    replace.set(slot.value, `$${token}`);
    if (slot.mode === "input") inputs[token] = { label: slot.label, type: slot.kind === "outside" ? "entity" : (slot.kind as NonNullable<PrefabDef["inputs"]>[string]["type"]), default: slot.value };
  }
  const toPlaceholder = (v: unknown): unknown => {
    if (typeof v === "string") return replace.get(v) ?? v;
    if (Array.isArray(v)) return v.map(toPlaceholder);
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, toPlaceholder(x)]));
    return v;
  };
  const rel = <T extends { x: number; y: number }>(e: T): T => ({ ...(toPlaceholder(e) as T), x: e.x - origin.x, y: e.y - origin.y });
  return {
    ...(Object.keys(inputs).length ? { inputs } : {}),
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
      if (body.inputs) doc.setIn([id, "inputs"], doc.createNode(body.inputs));
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
