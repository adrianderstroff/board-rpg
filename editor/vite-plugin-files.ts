import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import type { Plugin } from "vite";

/**
 * Dev-server file API for the editor (editor-design §2). Only in `vite serve`, never in a build.
 *   GET /__editor/files  → { files: { "data/…yaml": text }, music: [track ids] }
 *   PUT /__editor/file   ← { path: "data/…yaml", text } (only YAML files below data/)
 */
export function editorFiles(root = process.cwd()): Plugin {
  const dataDir = resolve(root, "data");
  const musicDir = resolve(root, "public/assets/audio/music");

  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const p = join(dir, e.name);
      return e.isDirectory() ? walk(p) : e.name.endsWith(".yaml") ? [p] : [];
    });

  /** A safe absolute path for a data file, or null. */
  const safe = (rel: unknown): string | null => {
    if (typeof rel !== "string" || !rel.startsWith("data/") || !rel.endsWith(".yaml")) return null;
    const abs = resolve(root, rel);
    return abs.startsWith(dataDir + sep) ? abs : null;
  };

  return {
    name: "board-rpg-editor-files",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/__editor/files", (req, res) => {
        if (req.method !== "GET") return void res.writeHead(405).end();
        const files: Record<string, string> = {};
        for (const abs of walk(dataDir)) files[relative(root, abs).split(sep).join("/")] = readFileSync(abs, "utf8");
        const music = existsSync(musicDir) ? readdirSync(musicDir).filter((f) => f.endsWith(".wav")).map((f) => f.replace(/\.wav$/, "")) : [];
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ files, music }));
      });
      server.middlewares.use("/__editor/file", (req, res) => {
        if (req.method !== "PUT") return void res.writeHead(405).end();
        let body = "";
        req.on("data", (c) => (body += c));
        req.on("end", () => {
          try {
            const { path, text } = JSON.parse(body) as { path: unknown; text: unknown };
            const abs = safe(path);
            if (!abs || typeof text !== "string") return void res.writeHead(400).end("bad path or text");
            mkdirSync(dirname(abs), { recursive: true });
            writeFileSync(abs, text, "utf8");
            res.writeHead(204).end();
          } catch (e) {
            res.writeHead(500).end(String(e));
          }
        });
      });
    },
  };
}
