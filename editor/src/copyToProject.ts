import type { Document } from "yaml";
import { rewriteRefs, type RefCollection } from "../../src/content/refs";
import { LIB } from "../../src/core/data/database";
import { assetUrl } from "./map/sprites";
import { putAsset, type Project } from "./project";
import { resourceId, type ResourceKind } from "./resources";

/**
 * Copy to project (projects.md §2, §6): library content can't be changed in place; a copy under a
 * plain id can. The project's references to the library entry are repointed at the copy – only
 * where a field refers to that kind of content (lib:hero_knight as a face stays when the charset is
 * copied). The copy's own references still point into the library.
 */

/** Content collections kept in one file each (data/<collection>.yaml). */
export type EntryCollection = "heroes" | "classes" | "items" | "abilities" | "enemies" | "statuses" | "fieldEffects" | "patterns";

const GRAPHICS_FILE = "data/graphics.yaml";
const GRAPHICS_HEADER = "# The project's own graphics (docs/projects.md): image paths are relative to its assets/ folder.\n";

/** Points every reference in the project's own files from `from` at `to`. */
function repoint(project: Project, collection: RefCollection, from: string, to: string) {
  for (const path of project.paths("data/")) project.edit(path, `Use ${to}`, (doc: Document) => void rewriteRefs(doc, collection, from, to));
}

/** Copies a library entry (heroes, items …) into the project's data/<collection>.yaml; returns its id. */
export function copyEntryToProject(project: Project, collection: EntryCollection, libId: string): string {
  const source = `library/${project.info.library}/data/${collection}.yaml`;
  const node = project.doc(source).get(libId.slice(LIB.length), true);
  if (!node) throw new Error(`No ${libId} in the library's ${collection}`);
  const file = `data/${collection}.yaml`;
  const own = project.paths(file).length ? project.data<Record<string, unknown>>(file) ?? {} : {};
  const id = resourceId(libId.slice(LIB.length), (x) => x in own);
  project.transaction(`Copy ${libId} to the project`, () => {
    if (!project.paths(file).length) project.create(file, `# The project's own ${collection} (docs/projects.md).\n`);
    project.edit(file, `Copy ${libId}`, (doc: Document) => doc.setIn([id], doc.createNode(structuredClone((node as { toJSON(): unknown }).toJSON()))));
    repoint(project, collection, libId, id);
  });
  return id;
}

/** Copies a library graphic or music track (and its file) into the project; returns its id. */
export async function copyResourceToProject(project: Project, kind: ResourceKind, libId: string): Promise<string> {
  const db = project.content.db;
  if (!db) throw new Error("Fix the content's problems first");
  const name = libId.slice(LIB.length);
  if (kind === "music") {
    const id = resourceId(name, (x) => project.music.includes(x));
    const blob = await (await fetch(assetUrl(db.musicPath(libId)))).blob();
    await putAsset(project.info.id, `audio/music/${id}.wav`, blob);
    project.setMusic(id, true);
    project.transaction(`Copy ${libId} to the project`, () => repoint(project, "music", libId, id));
    return id;
  }
  const sheet = db.graphics[kind][libId] as { image: string };
  const id = resourceId(name, (x) => !!db.graphics[kind][x]);
  const blob = await (await fetch(assetUrl(sheet.image))).blob();
  await putAsset(project.info.id, `${kind}/${id}.png`, blob);
  // the library's image path is resolved already; the copy's is relative to the project's assets
  const entry = { ...structuredClone(sheet), image: `${kind}/${id}.png` };
  project.transaction(`Copy ${libId} to the project`, () => {
    if (!project.paths(GRAPHICS_FILE).length) project.create(GRAPHICS_FILE, GRAPHICS_HEADER);
    project.edit(GRAPHICS_FILE, `Copy ${libId}`, (doc: Document) => doc.setIn([kind, id], doc.createNode(entry)));
    repoint(project, kind, libId, id);
  });
  return id;
}
