import { MemoryTree, type FileTree } from "./tree";

/** The repository through the dev server (vite-plugin-files.ts). */
export class HttpTree implements FileTree {
  async read(path: string) {
    const r = await fetch(`/__editor/fs/file?path=${encodeURIComponent(path)}`);
    if (r.status === 404) return undefined;
    if (!r.ok) throw new Error(`Reading ${path} failed (${r.status})`);
    return new Uint8Array(await r.arrayBuffer());
  }
  async write(path: string, data: Uint8Array | null) {
    const url = `/__editor/fs/file?path=${encodeURIComponent(path)}`;
    const r = await fetch(url, data ? { method: "PUT", body: data as BodyInit } : { method: "DELETE" });
    if (!r.ok) throw new Error(`Writing ${path} failed: ${await r.text()}`);
  }
  async list(prefix: string) {
    const r = await fetch(`/__editor/fs/list?prefix=${encodeURIComponent(prefix)}`);
    if (!r.ok) throw new Error(`Listing ${prefix} failed (${r.status})`);
    return (await r.json()) as string[];
  }
  /** Whether the dev server's file access is there (else the editor runs as a static site). */
  static async available(): Promise<boolean> {
    try {
      const r = await fetch("/__editor/fs/list?prefix=library/");
      return r.ok && (r.headers.get("content-type") ?? "").includes("json");
    } catch {
      return false;
    }
  }
}

// ---------- the library (and the demo) bundled with the editor ----------

const bundledText = import.meta.glob(["/library/*/library.yaml", "/library/*/data/**/*.yaml", "/library/*/template/**/*.yaml", "/projects/demo/**/*.yaml"], {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;
/** The library's images and music: their URLs in this build. */
const bundledAssets = import.meta.glob(["/library/*/assets/**/*.png", "/library/*/assets/**/*.wav"], { query: "?url", import: "default", eager: true }) as Record<string, string>;

/** Where a bundled library asset is served ("library/v1/assets/…" → its URL), or undefined. */
export const bundledAssetUrl = (path: string): string | undefined => bundledAssets[`/${path}`];

/**
 * The library versions bundled with the editor, read-only: their YAML in memory, their assets
 * fetched from this build when read (an export takes the ones the project uses).
 */
export class BundledLibraryTree implements FileTree {
  private readonly text = new MemoryTree(Object.fromEntries(Object.entries(bundledText).filter(([p]) => p.startsWith("/library/")).map(([p, t]) => [p.slice(1), t])));
  async read(path: string) {
    const t = await this.text.read(path);
    if (t) return t;
    const url = bundledAssetUrl(path);
    if (!url) return undefined;
    const r = await fetch(url);
    return r.ok ? new Uint8Array(await r.arrayBuffer()) : undefined;
  }
  async write(path: string): Promise<void> {
    throw new Error(`The bundled library is read-only (${path})`);
  }
  async list(prefix: string) {
    const assets = Object.keys(bundledAssets).map((p) => p.slice(1)).filter((p) => p.startsWith(prefix));
    return [...(await this.text.list(prefix)), ...assets].sort();
  }
}

/** The demo project bundled with the editor (a new browser storage starts with a copy). */
export const bundledDemo = (): Record<string, string> =>
  Object.fromEntries(Object.entries(bundledText).filter(([p]) => p.startsWith("/projects/demo/")).map(([p, t]) => [p.slice(1), t]));

// ---------- the browser's storage ----------

const DB = "board-rpg-editor";
const FILES = "files";
const HANDLES = "handles";

function openDb(): Promise<IDBDatabase> {
  return new Promise((ok, fail) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(FILES);
      req.result.createObjectStore(HANDLES);
    };
    req.onsuccess = () => ok(req.result);
    req.onerror = () => fail(req.error);
  });
}

function request<T>(store: string, mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((ok, fail) => {
        const tx = db.transaction(store, mode);
        const req = run(tx.objectStore(store));
        tx.oncomplete = () => ok(req.result);
        tx.onerror = () => fail(tx.error);
      }),
  );
}

/** Projects (and library versions imported with a project) in the browser's IndexedDB. */
export class IdbTree implements FileTree {
  async read(path: string) {
    const v = await request<unknown>(FILES, "readonly", (s) => s.get(path));
    return v instanceof Uint8Array ? v : v instanceof ArrayBuffer ? new Uint8Array(v) : undefined;
  }
  async write(path: string, data: Uint8Array | null) {
    await request<unknown>(FILES, "readwrite", (s) => (data === null ? s.delete(path) : s.put(data, path)) as IDBRequest<unknown>);
  }
  async list(prefix: string) {
    const keys = await request<IDBValidKey[]>(FILES, "readonly", (s) => s.getAllKeys(IDBKeyRange.bound(prefix, prefix + "\uffff")));
    return (keys as string[]).sort();
  }
}

/** Remembered values (the picked folder's handle) in the same database. */
export const remember = (key: string, value: unknown) => request(HANDLES, "readwrite", (s) => s.put(value, key));
export const recall = <T,>(key: string) => request<T | undefined>(HANDLES, "readonly", (s) => s.get(key) as IDBRequest<T | undefined>);

// ---------- a folder the user picked (File System Access API) ----------

type Dir = FileSystemDirectoryHandle;

/** Whether this browser can open a real folder (Chrome, Edge …). */
export const canOpenFolders = () => typeof (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker === "function";

/** A folder with the repository's layout (projects/, and library/ for versions imported with a project). */
export class FolderTree implements FileTree {
  constructor(readonly root: Dir) {}
  private async dir(parts: string[], create: boolean): Promise<Dir | undefined> {
    let d: Dir = this.root;
    for (const p of parts) {
      try {
        d = await d.getDirectoryHandle(p, { create });
      } catch {
        return undefined;
      }
    }
    return d;
  }
  async read(path: string) {
    const parts = path.split("/");
    const d = await this.dir(parts.slice(0, -1), false);
    if (!d) return undefined;
    try {
      const f = await (await d.getFileHandle(parts[parts.length - 1])).getFile();
      return new Uint8Array(await f.arrayBuffer());
    } catch {
      return undefined;
    }
  }
  async write(path: string, data: Uint8Array | null) {
    const parts = path.split("/");
    const d = await this.dir(parts.slice(0, -1), data !== null);
    if (!d) return;
    const name = parts[parts.length - 1];
    if (data === null) return void (await d.removeEntry(name).catch(() => undefined));
    const w = await (await d.getFileHandle(name, { create: true })).createWritable();
    await w.write(data as BlobPart);
    await w.close();
  }
  async list(prefix: string) {
    const parts = prefix.replace(/\/$/, "").split("/").filter(Boolean);
    const start = await this.dir(parts, false);
    if (!start) return [];
    const out: string[] = [];
    const walk = async (d: Dir, at: string) => {
      for await (const [name, h] of (d as unknown as { entries(): AsyncIterable<[string, FileSystemHandle]> }).entries()) {
        if (h.kind === "directory") await walk(h as Dir, `${at}${name}/`);
        else out.push(`${at}${name}`);
      }
    };
    await walk(start, parts.length ? `${parts.join("/")}/` : "");
    return out.sort();
  }
}
