import type { Document } from "yaml";
import type { MapDef } from "../../../src/core/data/types";
import type { Dir, Pos } from "../../../src/core/util/grid";

/**
 * Entities (editor-design §6): everything placed on a map, shown and edited alike, while each kind
 * stays in its own list in the map file.
 */

export type EntityKind = "event" | "exit" | "spawn" | "enemy" | "gate" | "switch" | "trap" | "sign";

/** What the Add buttons place: entity kinds, a teleport (exit + arrival) and the starts (arrivals with a role). */
export type AddKind = "event" | "teleport" | "enemy" | "gate" | "switch" | "trap" | "sign" | "start" | "quickplay";

export const ADD_INFO: Record<AddKind, { label: string; icon: string; hint: string }> = {
  event: { label: "Event", icon: "event", hint: "An NPC, an object or an invisible trigger – with pages of conditions and actions." },
  teleport: { label: "Teleport", icon: "exit", hint: "An exit to another map; its arrival there is placed right after (and a way back, if wanted)." },
  enemy: { label: "Enemy", icon: "enemy", hint: "An enemy piece (or party) on the map." },
  gate: { label: "Gate", icon: "gate", hint: "Bars across a cell: open while a linked switch is pressed or its condition holds." },
  switch: { label: "Floor switch", icon: "switch", hint: "A plate held down by standing heroes; opens gates." },
  trap: { label: "Hidden trap", icon: "trap", hint: "Stops heroes walking over it until found with Discover." },
  sign: { label: "Wall sign", icon: "sign", hint: "Lettering painted on one side of a block (shop signs)." },
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
  gate: { label: "Gate", list: "gates", hint: "Bars across a cell: open while a linked switch is pressed or its condition holds." },
  switch: { label: "Floor switch", list: "switches", hint: "A plate held down by standing heroes; opens gates." },
  trap: { label: "Hidden trap", list: "traps", editorOnly: true, hint: "Stops heroes walking over it until found with Discover." },
  sign: { label: "Wall sign", list: "wallDecor", hint: "Lettering painted on one side of a block (shop signs)." },
};

/** Every entity on the map, in a stable order. */
export function listEntities(map: MapDef): Entity[] {
  const out: Entity[] = [];
  (map.events ?? []).forEach((e, i) => out.push({ kind: "event", key: i, x: e.x, y: e.y, label: e.id }));
  (map.exits ?? []).forEach((e, i) => out.push({ kind: "exit", key: i, x: e.x, y: e.y, label: `→ ${e.label ?? e.to}` }));
  for (const [id, s] of Object.entries(map.spawns ?? {})) out.push({ kind: "spawn", key: id, x: s.x, y: s.y, label: id });
  (map.enemies ?? []).forEach((e, i) => out.push({ kind: "enemy", key: i, x: e.x, y: e.y, label: `${e.id} (${e.enemy}${e.party?.length ? ` +${e.party.length}` : ""})` }));
  (map.gates ?? []).forEach((g, i) => out.push({ kind: "gate", key: i, x: g.x, y: g.y, label: g.id }));
  (map.switches ?? []).forEach((s, i) => out.push({ kind: "switch", key: i, x: s.x, y: s.y, label: s.id }));
  (map.traps ?? []).forEach((t, i) => out.push({ kind: "trap", key: i, x: t.x, y: t.y, label: t.id }));
  (map.wallDecor ?? []).forEach((w, i) => out.push({ kind: "sign", key: i, x: w.x, y: w.y, label: `${w.sign} (${w.face})` }));
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
export function addEntity(doc: Document, map: MapDef, kind: EntityKind, at: Pos, defaults: { enemy?: string; map?: string; spawn?: string; sign?: string }): EntityRef {
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
      return push("events", { id: freeId("event", (map.events ?? []).map((e) => e.id)), x, y, pages: [{ trigger: "interact" }] }, false);
    case "exit":
      return push("exits", { x, y, dir: "N" as Dir, to: defaults.map ?? "", spawn: defaults.spawn ?? "start" });
    case "enemy":
      return push("enemies", { id: freeId("enemy", (map.enemies ?? []).map((e) => e.id)), enemy: defaults.enemy ?? "sand_scorpion", x, y, dir: "S" as Dir });
    case "gate":
      return push("gates", { id: freeId("gate", (map.gates ?? []).map((g) => g.id)), x, y });
    case "switch":
      return push("switches", { id: freeId("plate", (map.switches ?? []).map((s) => s.id)), x, y, opens: [] });
    case "trap":
      return push("traps", { id: freeId("trap", (map.traps ?? []).map((t) => t.id)), x, y, damage: 10 });
    case "sign":
      return push("wallDecor", { x, y, sign: defaults.sign ?? "inn", face: "S" as Dir });
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
  if (typeof copy.id === "string") copy.id = freeId(copy.id, items.map((e) => String(e.id)));
  doc.addIn([list], doc.createNode(copy, { flow: ref.kind !== "event" }));
  return { kind: ref.kind, key: items.length };
}
