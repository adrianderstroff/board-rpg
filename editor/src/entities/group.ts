import type { Document } from "yaml";
import type { MapDef, PrefabDef } from "../../../src/core/data/types";
import type { Pos } from "../../../src/core/util/grid";
import { mapSize } from "../map/layers";
import type { Project } from "../project";
import { listEntities, moveEntity, sameRef, type EntityRef } from "./model";
import { prefabFrom } from "./prefabs";
import { removeEntity } from "./remove";

/**
 * Several entities selected at once (editor-design §6.6): moved, duplicated, deleted or saved as a
 * prefab together. Their anchor is the top-left corner of the cells they cover.
 */

/** The selected entities that still exist, with their cells. */
export function groupMembers(map: MapDef, refs: EntityRef[]) {
  return listEntities(map).filter((e) => refs.some((r) => sameRef(r, e)));
}

export function groupAnchor(map: MapDef, refs: EntityRef[]): Pos {
  const members = groupMembers(map, refs);
  return { x: Math.min(...members.map((e) => e.x)), y: Math.min(...members.map((e) => e.y)) };
}

/** Whether the group can move by (dx, dy): every cell on the map and free (or one of its own). */
export function canMoveGroup(map: MapDef, refs: EntityRef[], dx: number, dy: number): boolean {
  const { w, h } = mapSize(map);
  const members = groupMembers(map, refs);
  const others = listEntities(map).filter((e) => !members.some((m) => sameRef(m, e)));
  return members.every((m) => {
    const x = m.x + dx;
    const y = m.y + dy;
    return x >= 0 && y >= 0 && x < w && y < h && !others.some((o) => o.x === x && o.y === y);
  });
}

export function moveGroup(doc: Document, map: MapDef, refs: EntityRef[], dx: number, dy: number) {
  for (const m of groupMembers(map, refs)) moveEntity(doc, m, { x: m.x + dx, y: m.y + dy });
}

/** Deletes the group as one undo step (from the end of each list, so the other indices stay right). */
export function deleteGroup(project: Project, mapId: string, map: MapDef, refs: EntityRef[]): boolean {
  const members = groupMembers(map, refs).sort((a, b) => (a.kind === b.kind ? Number(b.key) - Number(a.key) : a.kind === "spawn" ? 1 : b.kind === "spawn" ? -1 : 0));
  let all = true;
  project.transaction(`Delete ${members.length} entities`, () => {
    for (const m of members) {
      // an exit deleted before may have taken its arrival along
      if (m.kind === "spawn" && !project.data<MapDef>(`data/maps/${mapId}.yaml`).spawns?.[m.key as string]) continue;
      if (!removeEntity(project, mapId, m)) all = false;
    }
  });
  return all;
}

/** The group as a prefab to place again (Duplicate group): ids per copy, arrivals left out. */
export function groupPrefab(map: MapDef, refs: EntityRef[]): PrefabDef {
  const members = groupMembers(map, refs).filter((e) => e.kind !== "spawn");
  return { id: "@group", name: `${members.length} entities`, ...prefabFrom(map, members, groupAnchor(map, members)) };
}
