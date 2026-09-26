import { isCollection, isPair, type Document } from "yaml";
import { projectIdFor } from "../projectFiles";
import type { Project } from "../project";

/**
 * Content entries kept by id in one file each (items.yaml, heroes.yaml …): making, changing and
 * deleting the project's own. Library entries are read-only (projects.md §2).
 */

/**
 * Drops unset fields and empty objects – but keeps empty lists: a use section always has its
 * effects, an enemy its AI rules, even before the first one is added.
 */
export function tidy(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(tidy);
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) {
      const t = tidy(x);
      if (t === undefined || (t && typeof t === "object" && !Array.isArray(t) && !Object.keys(t).length)) continue;
      out[k] = t;
    }
    return out;
  }
  return v;
}

/** A value as the files write it: on one line when short, else one line per field (each on one line). */
export function flowNode(doc: Document, v: object) {
  const node = doc.createNode(v);
  if (!isCollection(node)) return node;
  if (JSON.stringify(v).length < 90) node.flow = true;
  else
    for (const item of node.items) {
      // a mapping's pairs hold their values; a list holds its items
      const child: unknown = isPair(item) ? item.value : item;
      if (isCollection(child)) child.flow = true;
    }
  return node;
}

/** Writes the top-level fields of an entry that differ between `before` and `next` (the rest keeps its formatting). */
export function writeEntry<T extends object>(project: Project, file: string, id: string, before: T, next: T, label: string, group?: string) {
  const keys = [...new Set([...Object.keys(before), ...Object.keys(next)])] as (keyof T)[];
  const changed = keys.filter((k) => JSON.stringify(before[k]) !== JSON.stringify(next[k]));
  if (!changed.length) return;
  project.edit(
    file,
    label,
    (doc: Document) => {
      for (const k of changed) {
        const v = tidy(next[k]);
        if (v === undefined || v === "") doc.deleteIn([id, k as string]);
        else doc.setIn([id, k as string], v && typeof v === "object" ? flowNode(doc, v) : v);
      }
    },
    group ? `${id}.${group}` : undefined,
  );
}

/** A free id from a name ("Hi-Potion" → hi_potion, then hi_potion_2 …). */
export function entryIdFor(name: string, taken: (id: string) => boolean, fallback = "entry"): string {
  const base = projectIdFor(name || fallback);
  let id = base;
  for (let n = 2; taken(id); n++) id = `${base}_${n}`;
  return id;
}

/** Adds an entry to the project's file (made with `header` when missing); returns its id. */
export function addEntry(project: Project, file: string, header: string, entry: { name?: string } & object, taken: (id: string) => boolean, label: string, fallback = "entry"): string {
  const id = entryIdFor(entry.name ?? "", taken, fallback);
  project.transaction(label, () => {
    if (!project.paths(file).length) project.create(file, header);
    project.edit(file, label, (doc: Document) => {
      const node = doc.createNode(tidy(structuredClone(entry)));
      // fields holding objects on one line each, as the files are written by hand
      if (isCollection(node))
        for (const pair of node.items) {
          const v = isPair(pair) ? pair.value : null;
          if (isCollection(v) && JSON.stringify(v.toJSON()).length < 110) v.flow = true;
        }
      doc.setIn([id], node);
    });
  });
  return id;
}

/** Removes one of the project's entries. */
export function deleteEntry(project: Project, file: string, id: string) {
  project.edit(file, `Delete ${id}`, (doc: Document) => doc.deleteIn([id]));
}
