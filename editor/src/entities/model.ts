import { isMap, isPair, isScalar, isSeq, type Document, type YAMLMap } from "yaml";
import type { MapDef } from "../../../src/core/data/types";
import type { Dir, Pos } from "../../../src/core/util/grid";

/**
 * Entities (editor-design §6): everything placed on a map, shown and edited alike, while each kind
 * stays in its own list in the map file.
 */

export type EntityKind = "event" | "exit" | "spawn" | "enemy" | "trap";

/** What the Add buttons place: entity kinds, a teleport (exit + arrival) and the starts (arrivals with a role). */
export type AddKind = "event" | "teleport" | "enemy" | "gate" | "switch" | "trap" | "start" | "quickplay";

export const ADD_INFO: Record<AddKind, { label: string; icon: string; hint: string }> = {
  event: { label: "Event", icon: "event", hint: "An NPC, an object or an invisible trigger – with pages of conditions and actions." },
  teleport: { label: "Teleport", icon: "exit", hint: "An exit to another map; its arrival there is placed right after (and a way back, if wanted)." },
  enemy: { label: "Enemy", icon: "enemy", hint: "An enemy piece (or party) on the map." },
  gate: { label: "Gate", icon: "gate", hint: "An entity with bars (closed: solid) and open – it opens when its condition turns true (a flag, a plate that is down)." },
  switch: { label: "Floor switch", icon: "switch", hint: "An entity plate: down while a hero stands on it, up again when they step off – gates can open on it." },
  trap: { label: "Hidden trap", icon: "trap", hint: "Stops heroes walking over it until found with Discover." },
  start: { label: "Game start", icon: "start", hint: "Where a new game begins (one for the whole game – placing it again moves it)." },
  quickplay: { label: "Quick Play start", icon: "quickplay", hint: "Where ▶ Quick Play starts on this map, with its party and items (editor only)." },
};

export interface EntityRef {
  kind: EntityKind;
  /** Index in its list, or the spawn id. */
  key: number | string;
}

export interface Entity extends EntityRef {
  x: number;
  y: number;
  /** Short text for lists and canvas labels. */
  label: string;
}

export const KIND_INFO: Record<EntityKind, { label: string; list: string; editorOnly?: boolean; hint: string }> = {
  event: { label: "Event", list: "events", hint: "An NPC, an object or an invisible trigger – with pages of conditions and actions." },
  exit: { label: "Teleport", list: "exits", hint: "Walking onto it travels to its arrival on another map." },
  spawn: { label: "Arrival", list: "spawns", editorOnly: true, hint: "Where the party lands – it comes with the teleport, start or wake-up that leads here." },
  enemy: { label: "Enemy", list: "enemies", hint: "An enemy piece (or party) on the map." },
  trap: { label: "Hidden trap", list: "traps", editorOnly: true, hint: "Stops heroes walking over it until found with Discover." },
};

/** Every entity on the map, in a stable order. */
export function listEntities(map: MapDef): Entity[] {
  const out: Entity[] = [];
  (map.events ?? []).forEach((e, i) => out.push({ kind: "event", key: i, x: e.x, y: e.y, label: e.id }));
  (map.exits ?? []).forEach((e, i) => out.push({ kind: "exit", key: i, x: e.x, y: e.y, label: `→ ${e.label ?? e.to}` }));
  for (const [id, s] of Object.entries(map.spawns ?? {})) out.push({ kind: "spawn", key: id, x: s.x, y: s.y, label: id });
  (map.enemies ?? []).forEach((e, i) => out.push({ kind: "enemy", key: i, x: e.x, y: e.y, label: `${e.id} (${e.enemy}${e.party?.length ? ` +${e.party.length}` : ""})` }));
  (map.traps ?? []).forEach((t, i) => out.push({ kind: "trap", key: i, x: t.x, y: t.y, label: t.id }));
  return out;
}

/** YAML path of an entity in the map file. */
export function entityPath(ref: EntityRef): (string | number)[] {
  if (ref.kind === "spawn") return ["spawns", ref.key];
  return [KIND_INFO[ref.kind].list, ref.key];
}

export const sameRef = (a: EntityRef | null | undefined, b: EntityRef | null | undefined) => !!a && !!b && a.kind === b.kind && a.key === b.key;

export function entitiesAt(map: MapDef, p: Pos): Entity[] {
  return listEntities(map).filter((e) => e.x === p.x && e.y === p.y);
}

export function moveEntity(doc: Document, ref: EntityRef, to: Pos) {
  const path = entityPath(ref);
  doc.setIn([...path, "x"], to.x);
  doc.setIn([...path, "y"], to.y);
}

export function deleteEntity(doc: Document, ref: EntityRef) {
  doc.deleteIn(entityPath(ref));
}

/** A free id like `event_3` among the given ones. */
export function freeId(base: string, taken: Iterable<string>): string {
  const t = new Set(taken);
  for (let i = 1; ; i++) if (!t.has(`${base}_${i}`)) return `${base}_${i}`;
}

/** Adds a new entity of `kind` at `at` with sensible defaults; returns its reference. */
export function addEntity(doc: Document, map: MapDef, kind: EntityKind, at: Pos, defaults: { enemy?: string; map?: string; spawn?: string }): EntityRef {
  const { x, y } = at;
  /** Appends to a list of the map (created if missing); the new entry's index is the old length. */
  const push = (list: string, value: object, flow = true): EntityRef => {
    const index = (map as unknown as Record<string, unknown[] | undefined>)[list]?.length ?? 0;
    if (doc.getIn([list]) === undefined) doc.set(list, doc.createNode([], { flow: false }));
    doc.addIn([list], doc.createNode(value, { flow }));
    return { kind, key: index };
  };
  switch (kind) {
    case "event":
      // a new event is an entity: one state (nothing drawn yet) and no handlers (§10.3)
      return push("events", { id: freeId("event", (map.events ?? []).map((e) => e.id)), x, y, states: { idle: {} } }, false);
    case "exit":
      return push("exits", { x, y, dir: "N" as Dir, to: defaults.map ?? "", spawn: defaults.spawn ?? "start" });
    case "enemy":
      return push("enemies", { id: freeId("enemy", (map.enemies ?? []).map((e) => e.id)), enemy: defaults.enemy ?? "sand_scorpion", x, y, dir: "S" as Dir });
    case "trap":
      return push("traps", { id: freeId("trap", (map.traps ?? []).map((t) => t.id)), x, y, damage: 10 });
    case "spawn": {
      const id = freeId("spawn", Object.keys(map.spawns ?? {}));
      doc.setIn(["spawns", id], doc.createNode({ x, y, dir: "S" }, { flow: true }));
      return { kind, key: id };
    }
  }
}

/**
 * Copies an entity onto another cell (ids made unique: `elder` → `elder_1`). Arrivals aren't copied:
 * they come with what leads there (editor-design §6.4).
 */
export function duplicateEntity(doc: Document, map: MapDef, ref: EntityRef, at: Pos): EntityRef | null {
  if (ref.kind === "spawn") return null;
  const list = KIND_INFO[ref.kind].list;
  const items = (map as unknown as Record<string, Record<string, unknown>[] | undefined>)[list] ?? [];
  const src = items[ref.key as number];
  if (!src) return null;
  const copy: Record<string, unknown> = { ...structuredClone(src), x: at.x, y: at.y };
  if (typeof copy.id === "string") {
    const was = copy.id;
    copy.id = freeId(copy.id, items.map((e) => String(e.id)));
    // an entity's handlers that talk about itself now talk about the copy
    if (copy.on) copy.on = JSON.parse(JSON.stringify(copy.on).split(`"event":"${was}"`).join(`"event":"${copy.id}"`));
  }
  doc.addIn([list], doc.createNode(copy, { flow: ref.kind !== "event" }));
  return { kind: ref.kind, key: items.length };
}

/**
 * The Gate and Floor switch presets (game-design §10.3): entities with their states and handlers –
 * a gate opens when its condition turns true (a flag named after it, until it is pointed at a plate),
 * a plate goes down while a hero stands on it.
 */
export function addPreset(doc: Document, map: MapDef, kind: "gate" | "switch", at: Pos): EntityRef {
  const taken = (map.events ?? []).map((e) => e.id);
  const index = map.events?.length ?? 0;
  const id = freeId(kind === "gate" ? "gate" : "plate", taken);
  const entity =
    kind === "gate"
      ? {
          id,
          x: at.x,
          y: at.y,
          states: { closed: { decor: "gate_bars", pass: "solid" }, open: { pass: "walk" } },
          on: [
            { on: "becomes", when: { flag: `${id}_open` }, do: [{ setState: { event: id, state: "open" } }] },
            { on: "becomes", when: { all: [{ not: { flag: `${id}_open` } }, { state: { event: id, is: "open" } }] }, do: [{ setState: { event: id, state: "closed" } }] },
          ],
        }
      : {
          id,
          x: at.x,
          y: at.y,
          states: { up: { decor: "switch_up", pass: "walk" }, down: { decor: "switch_down", pass: "walk" } },
          on: [
            { on: "becomes", when: { heroesOn: { event: id } }, do: [{ setState: { event: id, state: "down" } }] },
            { on: "becomes", when: { not: { heroesOn: { event: id } } }, do: [{ setState: { event: id, state: "up" } }] },
          ],
        };
  if (doc.getIn(["events"]) === undefined) doc.set("events", doc.createNode([], { flow: false }));
  const node = doc.createNode(entity, { flow: false }) as YAMLMap;
  // states and handlers one per line, like the map files
  for (const pair of node.items) if (isScalar(pair.key) && (pair.key.value === "states" || pair.key.value === "on") && (isMap(pair.value) || isSeq(pair.value))) for (const item of pair.value.items) (isPair(item) ? (item.value as YAMLMap) : (item as YAMLMap)).flow = true;
  doc.addIn(["events"], node);
  return { kind: "event", key: index };
}
