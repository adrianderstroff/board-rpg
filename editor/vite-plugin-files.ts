import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import type { Plugin } from "vite";
import { parse, parseDocument } from "yaml";
import type { ProjectFiles, ProjectInfo } from "./src/projectFiles.ts";

/** The project the editor opens when it names none (EDITOR_PROJECT, else the demo). */
export const editorProject = () => process.env.EDITOR_PROJECT || "demo";

/** Project ids are folder names: lower case letters, digits, _ and -. */
export const PROJECT_ID = /^[a-z0-9][a-z0-9_-]*$/;

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
  if (!PROJECT_ID.test(project)) throw new Error(`Bad project id "${project}"`);
  const projDir = resolve(root, "projects", project);
  if (!existsSync(join(projDir, "project.yaml"))) throw new Error(`No project "${project}" (projects/${project}/project.yaml)`);
  const def = parse(readFileSync(join(projDir, "project.yaml"), "utf8")) as { name?: string; library: string };
  const libDir = resolve(root, "library", def.library);
  const rel = (base: string, abs: string) => relative(base, abs).split(sep).join("/");
  const files: Record<string, string> = {};
  for (const abs of walk(join(libDir, "data"))) files[`library/${def.library}/data/${rel(join(libDir, "data"), abs)}`] = readFileSync(abs, "utf8");
  for (const abs of walk(join(projDir, "data"))) files[`data/${rel(join(projDir, "data"), abs)}`] = readFileSync(abs, "utf8");
  const music = [...tracks(join(libDir, "assets/audio/music")).map((t) => `lib:${t}`), ...tracks(join(projDir, "assets/audio/music"))];
  return {
    project: { id: project, name: def.name ?? project, library: def.library },
    files,
    music,
    roots: { library: `library/${def.library}/assets/`, project: `projects/${project}/assets/` },
  };
}

/** Every project in projects/ (by name). */
export function listProjects(root = process.cwd()): ProjectInfo[] {
  const dir = resolve(root, "projects");
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && PROJECT_ID.test(e.name) && existsSync(join(dir, e.name, "project.yaml")))
    .map((e) => {
      const def = parse(readFileSync(join(dir, e.name, "project.yaml"), "utf8")) as { name?: string; library: string };
      return { id: e.name, name: def.name ?? e.name, library: def.library };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Creates projects/<id> (projects.md §6): a copy of another project (`from`), or the library's
 * empty template (`library/<v>/template`: default rules, one map). Only its name changes.
 */
export function createProject(root: string, opts: { id: string; name: string; from?: string; library?: string }): ProjectInfo {
  const { id, name } = opts;
  if (!PROJECT_ID.test(id)) throw new Error(`"${id}" can't be a project id (lower case letters, digits, _ and -)`);
  const target = resolve(root, "projects", id);
  if (existsSync(target)) throw new Error(`A project "${id}" exists already`);
  let source: string;
  if (opts.from) {
    if (!PROJECT_ID.test(opts.from)) throw new Error(`Bad project id "${opts.from}"`);
    source = resolve(root, "projects", opts.from);
  } else source = resolve(root, "library", opts.library ?? "v1", "template");
  if (!existsSync(join(source, "project.yaml"))) throw new Error(`Nothing to start from at ${relative(root, source)}`);
  cpSync(source, target, { recursive: true });
  // the new name, keeping the file's comments
  const file = join(target, "project.yaml");
  const doc = parseDocument(readFileSync(file, "utf8"));
  doc.set("name", name);
  writeFileSync(file, doc.toString());
  return { id, name, library: String(doc.get("library")) };
}

/**
 * Dev-server file API for the editor (editor-design §2). Only in `vite serve`, never in a build.
 *   GET  /__editor/projects         → ProjectInfo[]
 *   POST /__editor/projects         ← { id, name, from? } → ProjectInfo (a new project, see createProject)
 *   GET  /__editor/files?project=id → ProjectFiles
 *   PUT  /__editor/file             ← { project, path: "data/…yaml", text } (only a project's own YAML files; the library is read-only)
 */
export function editorFiles(root = process.cwd()): Plugin {
  /** A safe absolute path for one of a project's data files, or null. */
  const safe = (project: unknown, rel: unknown): string | null => {
    if (typeof project !== "string" || !PROJECT_ID.test(project)) return null;
    if (typeof rel !== "string" || !rel.startsWith("data/") || !rel.endsWith(".yaml")) return null;
    const dataDir = resolve(root, "projects", project, "data");
    const abs = resolve(dataDir, rel.slice("data/".length));
    return abs.startsWith(dataDir + sep) ? abs : null;
  };
  const json = (res: { setHeader(k: string, v: string): void; end(s: string): void }, v: unknown) => {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(v));
  };
  const body = (req: NodeJS.ReadableStream) =>
    new Promise<unknown>((ok, fail) => {
      let text = "";
      req.on("data", (c) => (text += c));
      req.on("end", () => {
        try {
          ok(JSON.parse(text));
        } catch (e) {
          fail(e);
        }
      });
    });

  return {
    name: "board-rpg-editor-files",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/__editor/projects", (req, res) => {
        if (req.method === "GET") return json(res, listProjects(root));
        if (req.method !== "POST") return void res.writeHead(405).end();
        body(req)
          .then((b) => json(res, createProject(root, b as { id: string; name: string; from?: string })))
          .catch((e) => res.writeHead(400).end((e as Error).message));
      });
      server.middlewares.use("/__editor/files", (req, res) => {
        if (req.method !== "GET") return void res.writeHead(405).end();
        const project = new URL(req.url ?? "", "http://x").searchParams.get("project") || editorProject();
        try {
          json(res, readProject(root, project));
        } catch (e) {
          res.writeHead(404).end((e as Error).message);
        }
      });
      server.middlewares.use("/__editor/file", (req, res) => {
        if (req.method !== "PUT") return void res.writeHead(405).end();
        body(req)
          .then((b) => {
            const { project, path, text } = b as { project: unknown; path: unknown; text: unknown };
            const abs = safe(project, path);
            if (!abs || typeof text !== "string") return void res.writeHead(400).end("bad project, path or text");
            mkdirSync(dirname(abs), { recursive: true });
            writeFileSync(abs, text, "utf8");
            res.writeHead(204).end();
          })
          .catch((e) => res.writeHead(500).end(String(e)));
      });
    },
  };
}
