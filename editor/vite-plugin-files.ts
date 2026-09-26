import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import type { Plugin } from "vite";
import { parse } from "yaml";
import type { ProjectFiles } from "./src/projectFiles";

/** The project the editor opens (EDITOR_PROJECT, else the demo). */
export const editorProject = () => process.env.EDITOR_PROJECT || "demo";

const walk = (dir: string): string[] =>
  existsSync(dir)
    ? readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        const p = join(dir, e.name);
        return e.isDirectory() ? walk(p) : e.name.endsWith(".yaml") ? [p] : [];
      })
    : [];

const tracks = (dir: string) => (existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".wav")).map((f) => f.replace(/\.wav$/, "")) : []);

/** Reads a project and its library version from disk. */
export function readProject(root = process.cwd(), project = editorProject()): ProjectFiles {
  const projDir = resolve(root, "projects", project);
  const def = parse(readFileSync(join(projDir, "project.yaml"), "utf8")) as { library: string };
  const libDir = resolve(root, "library", def.library);
  const rel = (base: string, abs: string) => relative(base, abs).split(sep).join("/");
  const files: Record<string, string> = {};
  for (const abs of walk(join(libDir, "data"))) files[`library/${def.library}/data/${rel(join(libDir, "data"), abs)}`] = readFileSync(abs, "utf8");
  for (const abs of walk(join(projDir, "data"))) files[`data/${rel(join(projDir, "data"), abs)}`] = readFileSync(abs, "utf8");
  const music = [...tracks(join(libDir, "assets/audio/music")).map((t) => `lib:${t}`), ...tracks(join(projDir, "assets/audio/music"))];
  return { files, music, roots: { library: `library/${def.library}/assets/`, project: `projects/${project}/assets/` } };
}

/**
 * Dev-server file API for the editor (editor-design §2). Only in `vite serve`, never in a build.
 *   GET /__editor/files  → ProjectFiles
 *   PUT /__editor/file   ← { path: "data/…yaml", text } (only the project's own YAML files; the library is read-only)
 */
export function editorFiles(root = process.cwd()): Plugin {
  const dataDir = resolve(root, "projects", editorProject(), "data");

  /** A safe absolute path for one of the project's data files, or null. */
  const safe = (rel: unknown): string | null => {
    if (typeof rel !== "string" || !rel.startsWith("data/") || !rel.endsWith(".yaml")) return null;
    const abs = resolve(dataDir, rel.slice("data/".length));
    return abs.startsWith(dataDir + sep) ? abs : null;
  };

  return {
    name: "board-rpg-editor-files",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/__editor/files", (req, res) => {
        if (req.method !== "GET") return void res.writeHead(405).end();
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify(readProject(root)));
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
