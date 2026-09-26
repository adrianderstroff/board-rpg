import { parseDocument, type Document } from "yaml";
import { layeredRaw } from "../../src/content/raw";
import type { AssetRoots } from "../../src/core/data/database";
import type { ProjectFiles, ProjectInfo } from "./projectFiles";

/** The library's files are read-only in a project (projects.md §6). */
export const isLibraryFile = (path: string) => path.startsWith("library/");
import { Database, type RawContent } from "../../src/core/data/database";
import { validateContent } from "../../src/core/data/validate";
import { browserStorage, SESSION_KEY } from "./persist";
import { formatYaml } from "./yamlFormat";
import { refreshAssets, storage } from "./storage";
import { assetChanged } from "./assetVersions";

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

/** One undo step: the files it changed (usually one; a transaction can span several). */
interface Change {
  files: { path: string; before: string; after: string }[];
  label: string;
  group?: string;
}

/** Where unsaved work is kept between reloads (localStorage in the browser). */
export type SessionStore = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/**
 * Unsaved work as stored: the changed files' texts, the undo / redo history, and the disk text of
 * every file they touch – restored only while the disk still has exactly that.
 */
interface Session {
  v: 2;
  files: Record<string, string>;
  bases: Record<string, string>;
  undo: Change[];
  redo: Change[];
}

/** Undo steps kept across reloads (the most recent ones). */
const SESSION_HISTORY = 100;

export interface FileApi {
  load(): Promise<ProjectFiles>;
  save(path: string, text: string): Promise<void>;
  /** Deletes a file (a removed map); without it, removed files are only emptied. */
  remove?(path: string): Promise<void>;
}

/** One project in the editor's storage (distribution.md §1): its files, and saving one of them. */
export function storageFileApi(project: string): FileApi {
  return {
    async load() {
      const files = await storage().store.loadProject(project);
      await refreshAssets(project);
      return files;
    },
    save: (path, text) => storage().store.saveFile(project, path, text),
    remove: (path) => storage().store.deleteFile(project, path),
  };
}

/** The projects in the storage (projects.md §6). */
export const fetchProjects = (): Promise<ProjectInfo[]> => storage().store.listProjects();

/** Stores (a Blob) or deletes (null) one of a project's asset files (charsets/x.png, audio/music/y.wav). */
export async function putAsset(project: string, path: string, file: Blob | null): Promise<void> {
  await storage().store.putAsset(project, path, file ? new Uint8Array(await file.arrayBuffer()) : null);
  await refreshAssets(project);
  assetChanged(`projects/${project}/assets/${path}`);
}

/** Unpacks an exported project (.brpg) as a new project. */
export async function importProjectFile(file: Blob): Promise<ProjectInfo> {
  return storage().store.importProject(new Uint8Array(await file.arrayBuffer()));
}

/** Creates a project: a copy of `from`, or the library's empty template. */
export const createProject = (opts: { id: string; name: string; from?: string }): Promise<ProjectInfo> => storage().store.createProject(opts);

/** Downloads a project as a .brpg file (its saved files – projects.md §5). */
export async function downloadProject(id: string) {
  const bytes = await storage().store.exportProject(id);
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/zip" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${id}.brpg`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export class Project {
  private files = new Map<string, FileEntry>();
  private undoStack: Change[] = [];
  private redoStack: Change[] = [];
  private listeners = new Set<() => void>();
  private cache?: { version: number; raw: RawContent; db: Database | null; problems: string[] };
  /** The open project (projects.md). */
  info: ProjectInfo = { id: "", name: "", library: "" };
  /** Music track ids available (the library's as lib:<name>). */
  music: string[] = [];
  /** Where the library's and the project's assets are (projects.md §4). */
  roots: AssetRoots = { library: "", project: "" };
  /** Bumped on every change; UI re-renders when it changes. */
  version = 0;
  /** Unsaved edits dropped at load because their file changed on disk meanwhile. */
  dropped: string[] = [];
  private persistTimer?: ReturnType<typeof setTimeout>;
  /** The transaction being recorded (edits inside it become one undo step). */
  private tx?: Change;

  constructor(
    private readonly api: FileApi = storageFileApi("demo"),
    private readonly store: SessionStore | null = browserStorage(),
  ) {}

  /** Loads the files from disk, then brings back unsaved work from before a reload. */
  async load() {
    const { project, files, music, roots } = await this.api.load();
    this.info = project;
    this.roots = roots;
    this.files.clear();
    for (const [path, text] of Object.entries(files)) this.files.set(path, this.entry(text, text));
    this.music = music.sort();
    this.undoStack = [];
    this.redoStack = [];
    this.restoreSession();
    this.changed();
  }

  // ---------- unsaved work across reloads ----------

  private restoreSession() {
    this.dropped = [];
    let s: Session | null = null;
    try {
      // (before projects there was one session for the demo)
      s = JSON.parse(this.store?.getItem(this.sessionKey) ?? (this.info.id === "demo" ? this.store?.getItem(SESSION_KEY) : null) ?? "null") as Session | null;
    } catch {
      s = null;
    }
    if (!s || s.v !== 2) return;
    // a file that changed on disk since wins: its unsaved edits (and the history) are dropped
    const disk = (path: string) => this.files.get(path)?.saved ?? "";
    const changed = new Set(Object.keys(s.bases).filter((path) => disk(path) !== s.bases[path]));
    for (const [path, text] of Object.entries(s.files)) {
      if (changed.has(path)) {
        this.dropped.push(path);
        continue;
      }
      if (this.files.has(path)) this.setText(path, text);
      else this.files.set(path, this.entry(text, "")); // created, never saved
    }
    if (!changed.size) {
      this.undoStack = s.undo;
      this.redoStack = s.redo;
    }
  }

  /** Stores the unsaved work right away (normally done shortly after each change). */
  persistNow() {
    clearTimeout(this.persistTimer);
    this.persistTimer = undefined;
    if (!this.store) return;
    const files: Record<string, string> = {};
    for (const path of this.dirtyPaths()) files[path] = this.files.get(path)!.text;
    const undo = this.undoStack.slice(-SESSION_HISTORY);
    const redo = this.redoStack.slice(-SESSION_HISTORY);
    const bases: Record<string, string> = {};
    const touched = [...undo, ...redo].flatMap((c) => c.files.map((f) => f.path));
    for (const path of new Set([...Object.keys(files), ...touched])) bases[path] = this.files.get(path)?.saved ?? "";
    const write = (session: Session) => this.store!.setItem(this.sessionKey, JSON.stringify(session));
    try {
      if (this.info.id === "demo") this.store.removeItem(SESSION_KEY); // the old, shared one
      if (!Object.keys(bases).length) this.store.removeItem(this.sessionKey);
      else write({ v: 2, files, bases, undo, redo });
    } catch {
      // too big for the storage: keep the files at least, without the history
      try {
        const fileBases = Object.fromEntries(Object.keys(files).map((p) => [p, bases[p]]));
        write({ v: 2, files, bases: fileBases, undo: [], redo: [] });
      } catch {
        // nothing more to do – the work is still in this tab
      }
    }
  }

  /** Unsaved work is kept per project. */
  private get sessionKey() {
    return `${SESSION_KEY}:${this.info.id}`;
  }

  private schedulePersist() {
    if (!this.store || this.persistTimer) return;
    this.persistTimer = setTimeout(() => this.persistNow(), 250);
  }

  private entry(text: string, saved: string): FileEntry {
    const doc = parseDocument(text);
    return { doc, text, saved, js: doc.toJS() };
  }

  // ---------- reading ----------

  /** A music track was added to (or removed from) the project's assets. */
  setMusic(id: string, present: boolean) {
    this.music = present ? [...new Set([...this.music, id])].sort() : this.music.filter((m) => m !== id);
    this.changed();
  }

  /** Paths of the files (removed ones – emptied, until saved – are gone). */
  paths(prefix = ""): string[] {
    return [...this.files].filter(([p, f]) => p.startsWith(prefix) && f.text !== "").map(([p]) => p).sort();
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
      // the library version's files, then the project's (projects.md §4)
      const all = [...this.files].filter(([, f]) => f.text !== "").map(([p, f]) => [p, f.js] as [string, unknown]);
      const raw = layeredRaw(
        all.filter(([p]) => isLibraryFile(p)),
        all.filter(([p]) => !isLibraryFile(p)),
        this.roots,
      );
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
    if (isLibraryFile(path)) throw new Error(`${path}: the library is read-only (projects.md §6)`);
    const f = this.files.get(path);
    if (!f) throw new Error(`No file ${path}`);
    const before = f.text;
    const js = JSON.stringify(f.js);
    fn(f.doc);
    if (JSON.stringify(f.doc.toJS()) === js) return;
    const after = formatYaml(f.doc, before);
    f.text = after;
    f.js = f.doc.toJS();
    this.record(path, before, after, label, group);
  }

  /**
   * Removes a file (a renamed map): it is emptied now – undo brings it back – and deleted from the
   * storage on Save.
   */
  remove(path: string, label: string) {
    if (isLibraryFile(path)) throw new Error(`${path}: the library is read-only (projects.md §6)`);
    const f = this.files.get(path);
    if (!f || f.text === "") return;
    const before = f.text;
    this.setText(path, "");
    this.record(path, before, "", label);
  }

  /** Creates a new data file (e.g. a new map). */
  create(path: string, text: string) {
    const old = this.files.get(path);
    if (old && old.text !== "") throw new Error(`${path} exists`);
    // a removed file (not saved yet) comes back with the new text
    if (old) this.setText(path, text);
    else this.files.set(path, this.entry(text, ""));
    this.record(path, "", text, `New ${path}`);
  }

  /**
   * Runs `fn`, whose edits – on any number of files – become one undo step (a delete that also
   * removes things on other maps, a teleport with its arrival). Nested calls join the outer one.
   */
  transaction<T>(label: string, fn: () => T): T {
    if (this.tx) return fn();
    const tx: Change = { files: [], label };
    this.tx = tx;
    try {
      return fn();
    } finally {
      this.tx = undefined;
      if (tx.files.some((f) => f.before !== f.after)) {
        this.undoStack.push(tx);
        this.redoStack = [];
        this.changed();
      }
    }
  }

  private record(path: string, before: string, after: string, label: string, group?: string) {
    if (this.tx) {
      const f = this.tx.files.find((x) => x.path === path);
      if (f) f.after = after;
      else this.tx.files.push({ path, before, after });
      this.changed();
      return;
    }
    const last = this.undoStack[this.undoStack.length - 1];
    if (group && last?.group === group && last.files.length === 1 && last.files[0].path === path) last.files[0].after = after;
    else this.undoStack.push({ files: [{ path, before, after }], label, group });
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
    for (const f of [...c.files].reverse()) this.setText(f.path, f.before);
    this.redoStack.push(c);
    this.changed();
  }

  redo() {
    const c = this.redoStack.pop();
    if (!c) return;
    for (const f of c.files) this.setText(f.path, f.after);
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
      if (f.text === "" && this.api.remove) {
        await this.api.remove(path);
        this.files.delete(path);
        continue;
      }
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
    this.schedulePersist();
    for (const fn of this.listeners) fn();
  }
}
