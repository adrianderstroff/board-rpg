import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import type { FileTree } from "./src/storage/tree.ts";

/** The repository (or any folder with its layout) as a file tree – the dev server and the tests. */
export class NodeTree implements FileTree {
  constructor(private readonly root: string) {}
  private abs(path: string) {
    const abs = resolve(this.root, path);
    if (abs !== resolve(this.root) && !abs.startsWith(resolve(this.root) + sep)) throw new Error(`"${path}" is outside the tree`);
    return abs;
  }
  async read(path: string) {
    const abs = this.abs(path);
    return existsSync(abs) ? new Uint8Array(readFileSync(abs)) : undefined;
  }
  async write(path: string, data: Uint8Array | null) {
    const abs = this.abs(path);
    if (data === null) return void (existsSync(abs) && rmSync(abs));
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, data);
  }
  async list(prefix: string) {
    const dir = this.abs(prefix);
    const out: string[] = [];
    const walk = (d: string) => {
      if (!existsSync(d)) return;
      for (const e of readdirSync(d, { withFileTypes: true })) {
        const p = join(d, e.name);
        if (e.isDirectory()) walk(p);
        else out.push(relative(this.root, p).split(sep).join("/"));
      }
    };
    walk(dir);
    return out.sort();
  }
}
