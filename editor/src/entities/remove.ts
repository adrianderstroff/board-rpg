import type { Project } from "../project";
import { deleteEntity, type EntityRef } from "./model";
import { arrivalDeletion, deleteArrival, deleteExit, mapFile } from "./teleports";

/**
 * Deletes an entity with what belongs to it (editor-design §6.4): an exit takes its arrival along
 * when nothing else leads there; an arrival takes the exits leading there – after asking, when that
 * reaches beyond itself. Returns false when the user said no.
 */
export function removeEntity(project: Project, mapId: string, ref: EntityRef): boolean {
  if (ref.kind === "spawn") {
    const spawn = ref.key as string;
    const { exits, broken } = arrivalDeletion(project, mapId, spawn);
    if (exits.length || broken.length) {
      const lines = [...exits.map((e) => `– ${e.label}: deleted too`), ...broken.map((b) => `– ${b.label}: needs a new target`)];
      if (!confirm(`Delete the arrival "${spawn}"?\n\n${lines.join("\n")}`)) return false;
    }
    deleteArrival(project, mapId, spawn);
    return true;
  }
  if (ref.kind === "exit") {
    deleteExit(project, mapId, ref.key as number);
    return true;
  }
  project.edit(mapFile(mapId), `Delete ${ref.kind}`, (doc) => deleteEntity(doc, ref));
  return true;
}
