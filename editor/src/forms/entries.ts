import { isCollection, isMap, isPair, isScalar, isSeq, type Document } from "yaml";
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

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/**
 * Changes the value at `path` from `before` to `after` touching as little of the document as it
 * can: only changed fields, a changed text keeps its node (and quoting), steps added or removed in
 * a list are spliced in – so hand-written files keep their look (editor-design §1.4).
 */
export function patchIn(doc: Document, path: (string | number)[], before: unknown, after: unknown, emptyDeletes = false) {
  if (JSON.stringify(before) === JSON.stringify(after)) return;
  const t = tidy(after);
  if (t === undefined || (emptyDeletes && t === "")) {
    if (doc.hasIn(path)) doc.deleteIn(path);
    return;
  }
  const node = doc.getIn(path, true);
  if (Array.isArray(before) && Array.isArray(t) && isSeq(node)) {
    // the unchanged start and end; what lies between is replaced
    let head = 0;
    while (head < before.length && head < t.length && JSON.stringify(before[head]) === JSON.stringify(t[head])) head++;
    let tail = 0;
    while (tail < before.length - head && tail < t.length - head && JSON.stringify(before[before.length - 1 - tail]) === JSON.stringify(t[t.length - 1 - tail])) tail++;
    const removed = before.length - head - tail;
    const added = t.slice(head, t.length - tail);
    if (removed === added.length) added.forEach((x, i) => patchIn(doc, [...path, head + i], before[head + i], x));
    else node.items.splice(head, removed, ...added.map((x) => (x && typeof x === "object" ? flowNode(doc, x) : doc.createNode(x))));
    return;
  }
  if (isObj(before) && isObj(t) && isMap(node)) {
    for (const k of new Set([...Object.keys(before), ...Object.keys(t)])) patchIn(doc, [...path, k], before[k], t[k]);
    return;
  }
  if (isScalar(node) && (typeof t === "string" || typeof t === "number" || typeof t === "boolean")) {
    node.value = t;
    return;
  }
  doc.setIn(path, t && typeof t === "object" ? flowNode(doc, t) : t);
}

/** Writes the top-level fields of an entry that differ between `before` and `next` (the rest keeps its formatting). */
export function writeEntry<T extends object>(project: Project, file: string, id: string, before: T, next: T, label: string, group?: string) {
  const keys = [...new Set([...Object.keys(before), ...Object.keys(next)])] as (keyof T)[];
  const changed = keys.filter((k) => JSON.stringify(before[k]) !== JSON.stringify(next[k]));
  if (!changed.length) return;
  project.edit(file, label, (doc: Document) => {
    for (const k of changed) patchIn(doc, [id, k as string], before[k], next[k], true);
  }, group ? `${id}.${group}` : undefined);
}

/** A free id from a name ("Hi-Potion" → hi_potion, then hi_potion_2 …). */
export function entryIdFor(name: string, taken: (id: string) => boolean, fallback = "entry"): string {
  const base = projectIdFor(name || fallback);
  let id = base;
  for (let n = 2; taken(id); n++) id = `${base}_${n}`;
  return id;
}

/** Adds an entry to the project's file (made with `header` when missing); returns its id. */
/** `idFrom`: what the id is made from when the entry has no name (a quest's title). */
export function addEntry(project: Project, file: string, header: string, entry: { name?: string } & object, taken: (id: string) => boolean, label: string, fallback = "entry", idFrom?: string): string {
  const id = entryIdFor(idFrom ?? entry.name ?? "", taken, fallback);
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
