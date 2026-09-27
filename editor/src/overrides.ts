import { isCollection, isPair, type Document } from "yaml";
import { LIB } from "../../src/core/data/database";
import { putAsset, type Project } from "./project";
import { fetchAsset } from "./graphics/sheets";

/**
 * Overrides (projects.md §2): the project's own version of a library entry, under the same id –
 * made implicitly by the first change, removed by Revert to library. References never move.
 */

export type EntryCollection = "items" | "heroes" | "classes" | "enemies" | "abilities" | "statuses";
export type GraphicCollection = "charsets" | "battlers" | "faces" | "battlebacks";

const GRAPHICS_FILE = "data/graphics.yaml";
const header = (what: string) => `# The project's own ${what} – and its versions of the library's (lib: ids, docs/projects.md §2).\n`;

const name = (id: string) => id.slice(LIB.length);
export const isLib = (id: string) => id.startsWith(LIB);
const libraryFile = (project: Project, rel: string) => `library/${project.info.library}/data/${rel}`;

/** The library's own entry, as its file writes it (references in full, paths relative to its assets). */
function libraryEntry(project: Project, file: string, path: string[]): unknown {
  let v: unknown = project.data(libraryFile(project, file));
  for (const k of path) v = (v as Record<string, unknown> | undefined)?.[k];
  return v === undefined ? undefined : structuredClone(v);
}

/** Small nested values on one line, as the files are written by hand. */
function flowChildren(node: unknown) {
  if (!isCollection(node)) return;
  for (const pair of node.items) {
    const v = isPair(pair) ? pair.value : null;
    if (isCollection(v) && JSON.stringify(v.toJSON()).length < 110) v.flow = true;
  }
}

// ---------- entries (items, heroes, classes, enemies, abilities, statuses) ----------

const entryFile = (c: EntryCollection) => `data/${c}.yaml`;

export function isOverridden(project: Project, c: EntryCollection | GraphicCollection | "chipsets", id: string): boolean {
  if (!isLib(id)) return false;
  if (c === "chipsets") return project.paths(`data/chipsets/lib/${name(id)}.yaml`).length > 0;
  if (c === "charsets" || c === "battlers" || c === "faces" || c === "battlebacks") return !!project.data<Record<string, Record<string, unknown>>>(GRAPHICS_FILE)?.[c]?.[id];
  return !!project.data<Record<string, unknown>>(entryFile(c))?.[id];
}

/** Makes the project's version of a library entry (a copy of the library's) if there is none yet. */
function ensureEntry(project: Project, c: EntryCollection, id: string) {
  if (!isLib(id) || isOverridden(project, c, id)) return;
  const entry = libraryEntry(project, `${c}.yaml`, [name(id)]);
  if (entry === undefined) throw new Error(`No ${id} in the library`);
  const file = entryFile(c);
  if (!project.paths(file).length) project.create(file, header(c));
  project.edit(file, `Change ${id}`, (doc: Document) => {
    const node = doc.createNode(entry);
    flowChildren(node);
    doc.setIn([id], node);
  });
}

/**
 * Runs an edit of an entry: for a library entry the first edit makes the project's version first –
 * both one undo step.
 */
export function editEntry(project: Project, c: EntryCollection, id: string, label: string, edit: () => void) {
  if (!isLib(id)) return edit();
  project.transaction(label, () => {
    ensureEntry(project, c, id);
    edit();
  });
}

// ---------- graphics (their image comes along) ----------

/** Overrides being made (their images copying): a second change waits for the same one. */
const making = new Map<string, Promise<unknown>>();
function once<T>(key: string, make: () => Promise<T>): Promise<T> {
  const running = making.get(key) as Promise<T> | undefined;
  if (running) return running;
  const p = make().finally(() => making.delete(key));
  making.set(key, p);
  return p;
}

/** The project's version of a library graphic: its entry, and its image copied to <kind>/lib/. */
export function ensureGraphic(project: Project, kind: GraphicCollection, id: string): Promise<string> {
  return once(`${kind}:${id}`, () => makeGraphic(project, kind, id));
}

async function makeGraphic(project: Project, kind: GraphicCollection, id: string): Promise<string> {
  const image = `${kind}/lib/${name(id)}.png`;
  if (isOverridden(project, kind, id)) return (project.data<Record<string, Record<string, { image: string }>>>(GRAPHICS_FILE)[kind][id]).image;
  const entry = libraryEntry(project, "graphics.yaml", [kind, name(id)]) as Record<string, unknown> | undefined;
  if (!entry) throw new Error(`No ${id} in the library`);
  await putAsset(project.info.id, image, await fetchAsset(project.content.raw.graphics[kind][id].image));
  project.transaction(`Change ${id}`, () => {
    if (!project.paths(GRAPHICS_FILE).length) project.create(GRAPHICS_FILE, header("graphics"));
    project.edit(GRAPHICS_FILE, `Change ${id}`, (doc: Document) => doc.setIn([kind, id], doc.createNode({ ...entry, image }, { flow: true })));
  });
  return image;
}

// ---------- chipsets (both sheets come along) ----------

export const chipsetOverrideFile = (id: string) => `data/chipsets/lib/${name(id)}.yaml`;

/** The project's version of a library chipset: its definition and both sheets, in chipsets/lib/. */
export function ensureChipset(project: Project, id: string): Promise<void> {
  return once(`chipsets:${id}`, () => makeChipset(project, id));
}

async function makeChipset(project: Project, id: string): Promise<void> {
  if (isOverridden(project, "chipsets", id)) return;
  const def = project.data<Record<string, unknown>>(libraryFile(project, `chipsets/${name(id)}.yaml`));
  if (!def) throw new Error(`No ${id} in the library`);
  const resolved = project.content.raw.chipsets[id];
  const image = `chipsets/lib/${name(id)}.png`;
  const decorImage = `chipsets/lib/${name(id)}_decor.png`;
  const [blocks, decor] = await Promise.all([fetchAsset(resolved.image), fetchAsset(resolved.decorImage)]);
  await putAsset(project.info.id, image, blocks);
  await putAsset(project.info.id, decorImage, decor);
  const file = chipsetOverrideFile(id);
  project.transaction(`Change ${id}`, () => {
    project.create(file, `# The project's version of the library chipset ${id} (docs/projects.md §2).\n`);
    project.edit(file, `Change ${id}`, (doc: Document) => {
      doc.contents = doc.createNode({ ...structuredClone(def), image, decorImage }) as never;
      for (const key of ["terrains", "decor"]) {
        const map = doc.getIn([key], true);
        if (isCollection(map)) for (const pair of map.items) if (isPair(pair) && isCollection(pair.value)) pair.value.flow = true;
      }
    });
  });
}

// ---------- revert ----------

/** Removes the project's version: the library's is back (the override's images are deleted too). */
export async function revertToLibrary(project: Project, c: EntryCollection | GraphicCollection | "chipsets", id: string) {
  if (!isOverridden(project, c, id)) return;
  if (c === "chipsets") {
    project.remove(chipsetOverrideFile(id), `Revert ${id} to the library`);
    await putAsset(project.info.id, `chipsets/lib/${name(id)}.png`, null).catch(() => undefined);
    await putAsset(project.info.id, `chipsets/lib/${name(id)}_decor.png`, null).catch(() => undefined);
    return;
  }
  if (c === "charsets" || c === "battlers" || c === "faces" || c === "battlebacks") {
    const image = project.data<Record<string, Record<string, { image: string }>>>(GRAPHICS_FILE)[c][id].image;
    project.edit(GRAPHICS_FILE, `Revert ${id} to the library`, (doc: Document) => doc.deleteIn([c, id]));
    await putAsset(project.info.id, image, null).catch(() => undefined);
    return;
  }
  project.edit(entryFile(c), `Revert ${id} to the library`, (doc: Document) => doc.deleteIn([id]));
}
