/**
 * A file tree with the repository's layout – `library/<v>/…`, `projects/<id>/…` (distribution.md
 * §1). Every storage of the editor is one: the repository (dev server), a folder the user picked,
 * the browser's storage. Paths use `/` and never start with one.
 */
export interface FileTree {
  /** A file's bytes, or undefined when there is none. */
  read(path: string): Promise<Uint8Array | undefined>;
  /** Writes a file (making its folders) – or deletes it (null). */
  write(path: string, data: Uint8Array | null): Promise<void>;
  /** Every file below `prefix` (a folder path ending in `/`), as full paths. */
  list(prefix: string): Promise<string[]>;
}

const enc = new TextEncoder();
const dec = new TextDecoder();

export const readText = async (tree: FileTree, path: string) => {
  const b = await tree.read(path);
  return b === undefined ? undefined : dec.decode(b);
};
export const writeText = (tree: FileTree, path: string, text: string) => tree.write(path, enc.encode(text));

/** A path that stays inside the tree (no `..`, no leading `/`). */
export const safePath = (path: string) => !!path && !path.startsWith("/") && !path.split("/").some((p) => p === ".." || p === "");

/** A tree in memory (tests, and the bundled library's data). */
export class MemoryTree implements FileTree {
  readonly files = new Map<string, Uint8Array>();
  constructor(files: Record<string, string | Uint8Array> = {}) {
    for (const [p, v] of Object.entries(files)) this.files.set(p, typeof v === "string" ? enc.encode(v) : v);
  }
  async read(path: string) {
    return this.files.get(path);
  }
  async write(path: string, data: Uint8Array | null) {
    if (data === null) this.files.delete(path);
    else this.files.set(path, data);
  }
  async list(prefix: string) {
    return [...this.files.keys()].filter((p) => p.startsWith(prefix)).sort();
  }
}

/**
 * Two trees as one: `base` (read-only – the library bundled with the editor) under `top` (where
 * the storage writes). Reads prefer `base`; lists are merged; writes go to `top`.
 */
export class LayeredTree implements FileTree {
  constructor(
    private readonly base: FileTree,
    private readonly top: FileTree,
  ) {}
  async read(path: string) {
    return (await this.base.read(path)) ?? (await this.top.read(path));
  }
  async write(path: string, data: Uint8Array | null) {
    return this.top.write(path, data);
  }
  async list(prefix: string) {
    return [...new Set([...(await this.base.list(prefix)), ...(await this.top.list(prefix))])].sort();
  }
}
