import { parseDocument, type Document } from "yaml";
import { assembleRaw } from "../../src/content/raw";
import { Database, type RawContent } from "../../src/core/data/database";
import { validateContent } from "../../src/core/data/validate";
import { formatYaml } from "./yamlFormat";

/**
 * The content being edited (editor-design §2): one YAML document per data file – edited in place so
 * comments and formatting survive – plus the game's raw content and Database rebuilt from them.
 */

interface FileEntry {
  doc: Document;
  /** Current text (only re-rendered when the file is edited – untouched files stay byte-identical). */
  text: string;
  /** Text on disk (last load or save). */
  saved: string;
  /** Plain JS of the document (what the game would load). */
  js: unknown;
}

interface Change {
  path: string;
  before: string;
  after: string;
  label: string;
  group?: string;
}

export interface FileApi {
  load(): Promise<{ files: Record<string, string>; music: string[] }>;
  save(path: string, text: string): Promise<void>;
}

export const httpFileApi: FileApi = {
  async load() {
    const r = await fetch("/__editor/files");
    if (!r.ok) throw new Error(`Loading the data files failed (${r.status}). Is the dev server running?`);
    return r.json();
  },
  async save(path, text) {
    const r = await fetch("/__editor/file", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path, text }) });
    if (!r.ok) throw new Error(`Saving ${path} failed: ${await r.text()}`);
  },
};

export class Project {
  private files = new Map<string, FileEntry>();
  private undoStack: Change[] = [];
  private redoStack: Change[] = [];
  private listeners = new Set<() => void>();
  private cache?: { version: number; raw: RawContent; db: Database | null; problems: string[] };
  /** Music track ids available (public/assets/audio/music). */
  music: string[] = [];
  /** Bumped on every change; UI re-renders when it changes. */
  version = 0;

  constructor(private readonly api: FileApi = httpFileApi) {}

  async load() {
    const { files, music } = await this.api.load();
    this.files.clear();
    for (const [path, text] of Object.entries(files)) this.files.set(path, this.entry(text, text));
    this.music = music.sort();
    this.undoStack = [];
    this.redoStack = [];
    this.changed();
  }

  private entry(text: string, saved: string): FileEntry {
    const doc = parseDocument(text);
    return { doc, text, saved, js: doc.toJS() };
  }

  // ---------- reading ----------

  paths(prefix = ""): string[] {
    return [...this.files.keys()].filter((p) => p.startsWith(prefix)).sort();
  }

  doc(path: string): Document {
    const f = this.files.get(path);
    if (!f) throw new Error(`No file ${path}`);
    return f.doc;
  }

  /** Plain data of a file. */
  data<T = unknown>(path: string): T {
    return this.files.get(path)?.js as T;
  }

  /** The game's raw content, Database and validation problems for the current state. */
  get content() {
    if (this.cache?.version !== this.version) {
      const raw = assembleRaw([...this.files].map(([p, f]) => [p, f.js] as [string, unknown]));
      let db: Database | null = null;
      let problems: string[];
      try {
        db = new Database(structuredClone(raw));
        problems = validateContent(db);
      } catch (e) {
        problems = [(e as Error).message];
      }
      this.cache = { version: this.version, raw, db, problems };
    }
    return this.cache;
  }

  dirtyPaths(): string[] {
    return [...this.files].filter(([, f]) => f.text !== f.saved).map(([p]) => p);
  }

  // ---------- editing ----------

  /**
   * Changes a file through its YAML document. Edits with the same `group` in a row are merged
   * into one undo step (a paint stroke, typing in a field).
   */
  edit(path: string, label: string, fn: (doc: Document) => void, group?: string) {
    const f = this.files.get(path);
    if (!f) throw new Error(`No file ${path}`);
    const before = f.text;
    const js = JSON.stringify(f.js);
    fn(f.doc);
    if (JSON.stringify(f.doc.toJS()) === js) return;
    const after = formatYaml(f.doc, before);
    f.text = after;
    f.js = f.doc.toJS();
    const last = this.undoStack[this.undoStack.length - 1];
    if (group && last?.group === group && last.path === path) last.after = after;
    else this.undoStack.push({ path, before, after, label, group });
    this.redoStack = [];
    this.changed();
  }

  /** Creates a new data file (e.g. a new map). */
  create(path: string, text: string) {
    if (this.files.has(path)) throw new Error(`${path} exists`);
    this.files.set(path, this.entry(text, ""));
    this.undoStack.push({ path, before: "", after: text, label: `New ${path}` });
    this.redoStack = [];
    this.changed();
  }

  get canUndo() {
    return this.undoStack.length > 0;
  }
  get canRedo() {
    return this.redoStack.length > 0;
  }
  get undoLabel() {
    return this.undoStack[this.undoStack.length - 1]?.label;
  }

  undo() {
    const c = this.undoStack.pop();
    if (!c) return;
    this.setText(c.path, c.before);
    this.redoStack.push(c);
    this.changed();
  }

  redo() {
    const c = this.redoStack.pop();
    if (!c) return;
    this.setText(c.path, c.after);
    this.undoStack.push({ ...c, group: undefined });
    this.changed();
  }

  private setText(path: string, text: string) {
    const f = this.files.get(path)!;
    const doc = parseDocument(text);
    f.doc = doc;
    f.text = text;
    f.js = doc.toJS();
  }

  /** Writes every changed file. */
  async save() {
    for (const path of this.dirtyPaths()) {
      const f = this.files.get(path)!;
      await this.api.save(path, f.text);
      f.saved = f.text;
    }
    this.changed();
  }

  /** Throws away unsaved changes. */
  revert() {
    for (const path of this.dirtyPaths()) {
      const f = this.files.get(path)!;
      if (!f.saved) this.files.delete(path);
      else this.setText(path, f.saved);
    }
    this.undoStack = [];
    this.redoStack = [];
    this.changed();
  }

  // ---------- change notification ----------

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private changed() {
    this.version++;
    for (const fn of this.listeners) fn();
  }
}
