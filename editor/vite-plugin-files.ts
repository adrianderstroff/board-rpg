import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { strToU8, strFromU8, unzipSync, zipSync } from "fflate";
import { dirname, join, relative, resolve, sep } from "node:path";
import type { Plugin } from "vite";
import { parse, parseDocument } from "yaml";
import { projectIdFor, type ProjectFiles, type ProjectInfo } from "./src/projectFiles.ts";
import { libraryUsage, trimLibraryFile, usedAssets } from "../src/content/bundle.ts";

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

/** Every file below `dir` (paths relative to it, with /). */
const allFiles = (dir: string, base = dir): string[] =>
  existsSync(dir)
    ? readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        const p = join(dir, e.name);
        return e.isDirectory() ? allFiles(p, base) : e.name === ".gitkeep" ? [] : [relative(base, p).split(sep).join("/")];
      })
    : [];

/**
 * A project as one `.brpg` file (projects.md §5): a zip of project.yaml, data/, assets/ and the
 * library content it uses (trimmed data files and the used assets, under library/<v>/) – complete
 * on its own.
 */
export function exportProject(root: string, id: string): Uint8Array {
  const { project, files } = readProject(root, id);
  const projDir = resolve(root, "projects", id);
  const libDir = resolve(root, "library", project.library);
  const lib = Object.entries(files).filter(([p]) => p.startsWith("library/")) as [string, string][];
  const own = Object.entries(files).filter(([p]) => !p.startsWith("library/")) as [string, string][];
  const tracks = existsSync(join(libDir, "assets/audio/music")) ? readdirSync(join(libDir, "assets/audio/music")).map((f) => f.replace(/\.wav$/, "")) : [];
  const usage = libraryUsage(lib, own, tracks);
  const zip: Record<string, Uint8Array> = {};
  for (const rel of ["project.yaml", ...allFiles(join(projDir, "data")).map((f) => `data/${f}`), ...allFiles(join(projDir, "assets")).map((f) => `assets/${f}`)]) zip[rel] = readFileSync(join(projDir, rel));
  const L = `library/${project.library}`;
  zip[`${L}/library.yaml`] = readFileSync(join(libDir, "library.yaml"));
  for (const [path, text] of lib) {
    const trimmed = trimLibraryFile(path, text, usage);
    if (trimmed !== null) zip[path] = strToU8(trimmed);
  }
  for (const a of usedAssets(lib, usage)) if (existsSync(join(libDir, "assets", a))) zip[`${L}/assets/${a}`] = readFileSync(join(libDir, "assets", a));
  // images and sounds are stored as they are (they hardly compress); the YAML is deflated
  const entries = Object.fromEntries(Object.entries(zip).map(([p, d]) => [p, [d, { level: /\.(png|wav)$/.test(p) ? 0 : 6 }] as const]));
  return zipSync(entries as never);
}

/**
 * Unpacks a `.brpg` into projects/<id> (the id from its name, made unique). Its library version is
 * installed from the file when this machine doesn't have it yet (marked `bundled`: only what that
 * project uses).
 */
export function importProject(root: string, bytes: Uint8Array): ProjectInfo {
  const zip = unzipSync(bytes);
  if (!zip["project.yaml"]) throw new Error("Not a Board RPG project (no project.yaml)");
  const def = parse(strFromU8(zip["project.yaml"])) as { name?: string; library?: string };
  if (!def.library || !PROJECT_ID.test(def.library)) throw new Error("project.yaml names no library version");
  const base = projectIdFor(def.name ?? "project");
  let id = base;
  for (let n = 2; existsSync(resolve(root, "projects", id)); n++) id = `${base}_${n}`;
  const L = `library/${def.library}/`;
  const installLibrary = !existsSync(resolve(root, L, "library.yaml"));
  const put = (abs: string, data: Uint8Array) => {
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, data);
  };
  for (const [path, data] of Object.entries(zip)) {
    if (path.endsWith("/") || path.split("/").includes("..")) continue; // folders; nothing outside
    if (path === "project.yaml" || path.startsWith("data/") || path.startsWith("assets/")) put(resolve(root, "projects", id, path), data);
    else if (path.startsWith(L) && installLibrary) {
      const text = path === `${L}library.yaml` ? strToU8(strFromU8(data).trimEnd() + "\n# Installed from an exported project: only the content that project uses.\nbundled: true\n") : data;
      put(resolve(root, path), text);
    }
  }
  return { id, name: def.name ?? id, library: def.library };
}

/**
 * Dev-server file API for the editor (editor-design §2). Only in `vite serve`, never in a build.
 *   GET  /__editor/projects         → ProjectInfo[]
 *   POST /__editor/projects         ← { id, name, from? } → ProjectInfo (a new project, see createProject)
 *   GET  /__editor/files?project=id → ProjectFiles
 *   PUT  /__editor/file             ← { project, path: "data/…yaml", text } (only a project's own YAML files; the library is read-only)
 *   GET  /__editor/export?project=id → <id>.brpg (exportProject)
 *   POST /__editor/import           ← the bytes of a .brpg → ProjectInfo (importProject)
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
      server.middlewares.use("/__editor/export", (req, res) => {
        const project = new URL(req.url ?? "", "http://x").searchParams.get("project") ?? "";
        try {
          const zip = exportProject(root, project);
          res.setHeader("Content-Type", "application/zip");
          res.setHeader("Content-Disposition", `attachment; filename="${project}.brpg"`);
          res.end(Buffer.from(zip));
        } catch (e) {
          res.writeHead(400).end((e as Error).message);
        }
      });
      server.middlewares.use("/__editor/import", (req, res) => {
        if (req.method !== "POST") return void res.writeHead(405).end();
        const chunks: Buffer[] = [];
        req.on("data", (c: Buffer) => chunks.push(c));
        req.on("end", () => {
          try {
            json(res, importProject(root, new Uint8Array(Buffer.concat(chunks))));
          } catch (e) {
            res.writeHead(400).end((e as Error).message);
          }
        });
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
