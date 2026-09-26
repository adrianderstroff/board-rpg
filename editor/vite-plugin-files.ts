import type { Plugin } from "vite";
import { NodeTree } from "./node-tree.ts";
import { safePath } from "./src/storage/tree.ts";

/**
 * Dev-server file access for the editor (editor-design §2, distribution.md §1): the repository as
 * the editor's file tree – everything else (projects, export, import …) the editor does itself
 * (src/storage/ops.ts). Only in `vite serve`, never in a build; only below library/ and projects/.
 *   GET    /__editor/fs/list?prefix=projects/   → every file below it (JSON)
 *   GET    /__editor/fs/file?path=…             → its bytes (404: none)
 *   PUT    /__editor/fs/file?path=…             ← its bytes
 *   DELETE /__editor/fs/file?path=…
 */
export function editorFiles(root = process.cwd()): Plugin {
  const tree = new NodeTree(root);
  const allowed = (p: string | null): p is string => !!p && safePath(p) && (p === "library" || p === "projects" || p.startsWith("library/") || p.startsWith("projects/"));
  return {
    name: "board-rpg-editor-files",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/__editor/fs/list", (req, res) => {
        const prefix = new URL(req.url ?? "", "http://x").searchParams.get("prefix");
        if (!allowed(prefix?.replace(/\/$/, "") ?? null)) return void res.writeHead(400).end("bad prefix");
        tree
          .list(prefix!)
          .then((paths) => {
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify(paths));
          })
          .catch((e) => res.writeHead(500).end(String(e)));
      });
      server.middlewares.use("/__editor/fs/file", (req, res) => {
        const path = new URL(req.url ?? "", "http://x").searchParams.get("path");
        if (!allowed(path)) return void res.writeHead(400).end("bad path");
        if (req.method === "GET") {
          tree
            .read(path)
            .then((data) => (data ? res.end(Buffer.from(data)) : res.writeHead(404).end()))
            .catch((e) => res.writeHead(500).end(String(e)));
          return;
        }
        if (req.method === "DELETE") {
          tree
            .write(path, null)
            .then(() => res.writeHead(204).end())
            .catch((e) => res.writeHead(500).end(String(e)));
          return;
        }
        if (req.method !== "PUT") return void res.writeHead(405).end();
        const chunks: Buffer[] = [];
        req.on("data", (c: Buffer) => chunks.push(c));
        req.on("end", () => {
          tree
            .write(path, new Uint8Array(Buffer.concat(chunks)))
            .then(() => res.writeHead(204).end())
            .catch((e) => res.writeHead(500).end(String(e)));
        });
      });
    },
  };
}
