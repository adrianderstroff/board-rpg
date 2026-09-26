import { isMap, isScalar, type Document } from "yaml";
import type { Dir, Pos } from "../../../src/core/util/grid";
import { DIR_VEC } from "../../../src/core/util/grid";
import type { ExitDef, MapDef } from "../../../src/core/data/types";
import type { Project } from "../project";
import { freeId } from "./model";

/**
 * Teleports (editor-design §6.4): an exit and the arrival it leads to are one thing. Arrivals
 * (`spawns`) are never placed by themselves – they come with what leads there (exits, teleport
 * actions, the inn's wake-up, the game start, the Quick Play start) and go with the last of them.
 */

export const mapFile = (id: string) => `data/maps/${id}.yaml`;
export const CONFIG_FILE = "data/config.yaml";
const mapIdOf = (path: string) => path.replace(/^data\/maps\//, "").replace(/\.yaml$/, "");

const OPPOSITE: Record<Dir, Dir> = { N: "S", S: "N", E: "W", W: "E" };

/** Where the party stands after coming through an exit: one cell in front of it, facing away. */
export function frontOf(exit: Pos & { dir: Dir }): Pos & { dir: Dir } {
  const v = DIR_VEC[exit.dir];
  return { x: exit.x - v.x, y: exit.y - v.y, dir: OPPOSITE[exit.dir] };
}

/** The side of the map a cell is closest to – a new exit's arrow points off the map there. */
export function nearestEdge(map: MapDef, p: Pos): Dir {
  const rows = String(map.layers?.terrain ?? "").split("\n").filter((r) => r.length);
  const w = Math.max(1, ...rows.map((r) => r.length));
  const h = rows.length;
  const d: [Dir, number][] = [["N", p.y], ["S", h - 1 - p.y], ["W", p.x], ["E", w - 1 - p.x]];
  return d.sort((a, b) => a[1] - b[1])[0][0];
}

export interface ArrivalUse {
  kind: "exit" | "teleport" | "inn" | "start" | "quickplay";
  /** The file that holds the reference. */
  file: string;
  /** YAML path of the object holding `spawn` (exits: the exit). */
  path: (string | number)[];
  label: string;
}

/** Paths (from the root) of every object `pred` accepts, in plain data. */
function findObjects(data: unknown, pred: (o: Record<string, unknown>) => boolean, at: (string | number)[] = [], out: (string | number)[][] = []) {
  if (Array.isArray(data)) data.forEach((v, i) => findObjects(v, pred, [...at, i], out));
  else if (data && typeof data === "object") {
    const o = data as Record<string, unknown>;
    if (pred(o)) out.push(at);
    for (const [k, v] of Object.entries(o)) findObjects(v, pred, [...at, k], out);
  }
  return out;
}

const pointsAt = (map: string, spawn: string) => (o: Record<string, unknown>) => o.map === map && o.spawn === spawn;

/** Everything that leads to arrival `spawn` on `map`. */
export function arrivalUses(project: Project, map: string, spawn: string): ArrivalUse[] {
  const out: ArrivalUse[] = [];
  for (const file of project.paths("data/maps/")) {
    const m = project.data<MapDef>(file);
    (m?.exits ?? []).forEach((e, i) => {
      if (e.to === map && e.spawn === spawn) out.push({ kind: "exit", file, path: ["exits", i], label: `Exit on ${m.name} (${e.x}, ${e.y})` });
    });
    if (mapIdOf(file) === map && m?.editor?.quickPlay?.spawn === spawn) out.push({ kind: "quickplay", file, path: ["editor", "quickPlay"], label: "Quick Play start" });
  }
  const cfg = project.data<{ start?: { map: string; spawn: string } }>(CONFIG_FILE);
  if (cfg?.start?.map === map && cfg.start.spawn === spawn) out.push({ kind: "start", file: CONFIG_FILE, path: ["start"], label: "Game start" });
  // teleport actions and inn wake-ups, wherever scripts live (maps, dialogs, quests)
  for (const file of project.paths("data/")) {
    const data = project.data(file);
    for (const p of findObjects(data, (o) => !!o.teleport && typeof o.teleport === "object" && pointsAt(map, spawn)(o.teleport as Record<string, unknown>)))
      out.push({ kind: "teleport", file, path: [...p, "teleport"], label: `Teleport action in ${file.replace(/^data\//, "")}` });
    for (const p of findObjects(data, (o) => !!o.wakeAt && typeof o.wakeAt === "object" && pointsAt(map, spawn)(o.wakeAt as Record<string, unknown>)))
      out.push({ kind: "inn", file, path: [...p, "wakeAt"], label: `Inn wake-up in ${file.replace(/^data\//, "")}` });
  }
  return out;
}

/** The role an arrival has besides being arrived at. */
export function arrivalRole(project: Project, map: string, spawn: string): "start" | "quickplay" | null {
  const cfg = project.data<{ start?: { map: string; spawn: string } }>(CONFIG_FILE);
  if (cfg?.start?.map === map && cfg.start.spawn === spawn) return "start";
  if (project.data<MapDef>(mapFile(map))?.editor?.quickPlay?.spawn === spawn) return "quickplay";
  return null;
}

function addSpawn(project: Project, map: string, name: string, at: Pos & { dir: Dir }): string {
  const m = project.data<MapDef>(mapFile(map));
  const taken = Object.keys(m.spawns ?? {});
  const id = taken.includes(name) ? freeId(name, taken) : name;
  project.edit(mapFile(map), "Add arrival", (doc) => doc.setIn(["spawns", id], doc.createNode({ x: at.x, y: at.y, dir: at.dir }, { flow: true })));
  return id;
}

function deleteSpawn(doc: Document, id: string) {
  doc.deleteIn(["spawns", id]);
}

/** Removes an arrival nobody leads to any more (after its exit or teleport went elsewhere). */
export function cleanupArrival(project: Project, map: string, spawn: string) {
  const m = project.data<MapDef>(mapFile(map));
  if (!m?.spawns?.[spawn] || arrivalUses(project, map, spawn).length) return;
  project.edit(mapFile(map), "Remove unused arrival", (doc) => deleteSpawn(doc, spawn));
}

/** Where a teleport goes: a cell on a map (a new arrival), an existing arrival, or – way back – the return exit. */
export interface Destination {
  map: string;
  x: number;
  y: number;
  dir: Dir;
  /** Use this existing arrival instead of making one. */
  reuse?: string;
  /** Place the return exit here instead; both arrivals go in front of their exits. */
  wayBack?: boolean;
}

/** The arrival for a destination (made unless reused); named after where it comes from. */
export function ensureArrival(project: Project, dest: Destination, fromMap: string): string {
  return dest.reuse ?? addSpawn(project, dest.map, `from_${fromMap}`, dest);
}

function addExit(project: Project, map: string, exit: ExitDef): number {
  const m = project.data<MapDef>(mapFile(map));
  const index = m.exits?.length ?? 0;
  project.edit(mapFile(map), "Add exit", (doc) => {
    if (doc.getIn(["exits"]) === undefined) doc.set("exits", doc.createNode([], { flow: false }));
    doc.addIn(["exits"], doc.createNode(exit, { flow: true }));
  });
  return index;
}

/** A new teleport: an exit at `at` on `map` leading to `dest` (one undo step). Returns the exit's index. */
export function createTeleport(project: Project, map: string, at: Pos & { dir: Dir }, dest: Destination): number {
  return project.transaction("Add teleport", () => {
    if (!dest.wayBack) {
      const spawn = ensureArrival(project, dest, map);
      return addExit(project, map, { x: at.x, y: at.y, dir: at.dir, to: dest.map, spawn });
    }
    // both ways: each exit's arrival lies in front of the other one
    const there = addSpawn(project, dest.map, `from_${map}`, frontOf(dest));
    const here = addSpawn(project, map, `from_${dest.map}`, frontOf(at));
    addExit(project, dest.map, { x: dest.x, y: dest.y, dir: dest.dir, to: map, spawn: here });
    return addExit(project, map, { x: at.x, y: at.y, dir: at.dir, to: dest.map, spawn: there });
  });
}

/** Points an existing exit somewhere else; its old arrival goes if nothing else uses it. */
export function retargetExit(project: Project, map: string, index: number, dest: Destination) {
  project.transaction("Change teleport destination", () => {
    const old = project.data<MapDef>(mapFile(map)).exits?.[index];
    if (!old) return;
    const spawn = ensureArrival(project, dest, map);
    project.edit(mapFile(map), "Change teleport destination", (doc) => {
      doc.setIn(["exits", index, "to"], dest.map);
      doc.setIn(["exits", index, "spawn"], spawn);
    });
    cleanupArrival(project, old.to, old.spawn);
  });
}

/** Deletes an exit and – if nothing else leads there – its arrival. */
export function deleteExit(project: Project, map: string, index: number) {
  project.transaction("Delete teleport", () => {
    const exit = project.data<MapDef>(mapFile(map)).exits?.[index];
    if (!exit) return;
    project.edit(mapFile(map), "Delete teleport", (doc) => doc.deleteIn(["exits", index]));
    cleanupArrival(project, exit.to, exit.spawn);
  });
}

/** What deleting an arrival takes along: the exits leading there, and what becomes invalid. */
export function arrivalDeletion(project: Project, map: string, spawn: string) {
  const uses = arrivalUses(project, map, spawn);
  return { exits: uses.filter((u) => u.kind === "exit"), broken: uses.filter((u) => u.kind === "teleport" || u.kind === "inn" || u.kind === "start") };
}

/** Deletes an arrival, the exits leading there (on any map) and a Quick Play start on it – one undo step. */
export function deleteArrival(project: Project, map: string, spawn: string) {
  project.transaction("Delete arrival", () => {
    const { exits } = arrivalDeletion(project, map, spawn);
    // highest index first, so the others keep theirs
    const byFile = new Map<string, number[]>();
    for (const e of exits) byFile.set(e.file, [...(byFile.get(e.file) ?? []), e.path[1] as number]);
    for (const [file, indices] of byFile)
      project.edit(file, "Delete teleport", (doc) => {
        for (const i of indices.sort((a, b) => b - a)) doc.deleteIn(["exits", i]);
      });
    project.edit(mapFile(map), "Delete arrival", (doc) => {
      deleteSpawn(doc, spawn);
      if (project.data<MapDef>(mapFile(map))?.editor?.quickPlay?.spawn === spawn) doc.deleteIn(["editor", "quickPlay", "spawn"]);
    });
  });
}

/** Renames an arrival and everything that points at it. */
export function renameArrival(project: Project, map: string, from: string, to: string) {
  if (from === to) return;
  project.transaction("Rename arrival", () => {
    const uses = arrivalUses(project, map, from);
    project.edit(mapFile(map), "Rename arrival", (doc) => {
      const spawns = doc.get("spawns", true);
      if (!isMap(spawns)) return;
      const pair = spawns.items.find((p) => (isScalar(p.key) ? p.key.value : p.key) === from);
      if (pair && isScalar(pair.key)) pair.key.value = to;
    });
    for (const u of uses) project.edit(u.file, "Rename arrival", (doc) => doc.setIn([...u.path, "spawn"], to));
  });
}

/** Places the game start or this map's Quick Play start at `at` (moving it there if it existed). */
export function placeStart(project: Project, map: string, at: Pos, role: "start" | "quickplay"): string {
  return project.transaction(role === "start" ? "Place game start" : "Place Quick Play start", () => {
    const cfg = project.data<{ start: { map: string; spawn: string } }>(CONFIG_FILE);
    const old = role === "start" ? cfg?.start : { map, spawn: project.data<MapDef>(mapFile(map))?.editor?.quickPlay?.spawn ?? "" };
    const spawn = addSpawn(project, map, role === "start" ? "start" : "quick_play", { ...at, dir: "S" });
    if (role === "start")
      project.edit(CONFIG_FILE, "Place game start", (doc) => {
        doc.setIn(["start", "map"], map);
        doc.setIn(["start", "spawn"], spawn);
      });
    else project.edit(mapFile(map), "Place Quick Play start", (doc) => doc.setIn(["editor", "quickPlay", "spawn"], spawn));
    if (old?.spawn) cleanupArrival(project, old.map, old.spawn);
    return spawn;
  });
}
