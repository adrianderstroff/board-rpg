import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { parse, parseDocument } from "yaml";
import { libraryUsage, missingInLibrary, trimLibraryFile, usedAssets } from "../../../src/content/bundle";
import { projectIdFor, type ProjectFiles, type ProjectInfo } from "../projectFiles";
import { readText, safePath, writeText, type FileTree } from "./tree";

/** Project ids are folder names: lower case letters, digits, _ and -. */
export const PROJECT_ID = /^[a-z0-9][a-z0-9_-]*$/;

/** The asset files a project may hold (projects.md §6): graphics sheets and music, by kind folder. */
export const ASSET_PATH = /^(charsets|battlers|faces|battlebacks|chipsets|signs|system)\/[a-z0-9][a-z0-9_-]*\.png$|^audio\/music\/[a-z0-9][a-z0-9_-]*\.wav$/;

export interface LibraryInfo {
  id: string;
  name: string;
  /** Installed from an exported project: only what that project uses. */
  bundled: boolean;
}

/** The immediate sub-folders of `prefix` that hold `file` (projects/<id>/project.yaml …). */
async function folders(tree: FileTree, prefix: string, file: string): Promise<string[]> {
  const ids = new Set<string>();
  for (const p of await tree.list(prefix)) {
    const rest = p.slice(prefix.length).split("/");
    if (rest.length === 2 && rest[1] === file) ids.add(rest[0]);
  }
  return [...ids];
}

/** The last path part without its extension. */
const baseName = (p: string) => p.slice(p.lastIndexOf("/") + 1).replace(/\.[^.]+$/, "");

/**
 * Everything the editor does with projects (distribution.md §1, projects.md) – on any file tree:
 * the repository, a folder, the browser's storage.
 */
export class ProjectStore {
  constructor(readonly tree: FileTree) {}

  // ---------- reading ----------

  /** Every project (by name). */
  async listProjects(): Promise<ProjectInfo[]> {
    const out: ProjectInfo[] = [];
    for (const id of await folders(this.tree, "projects/", "project.yaml")) {
      if (!PROJECT_ID.test(id)) continue;
      const def = parse((await readText(this.tree, `projects/${id}/project.yaml`)) ?? "") as { name?: string; library: string };
      out.push({ id, name: def?.name ?? id, library: def?.library });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }

  /** The library versions there are (library/<v>/library.yaml). */
  async listLibraries(): Promise<LibraryInfo[]> {
    const out: LibraryInfo[] = [];
    for (const id of await folders(this.tree, "library/", "library.yaml")) {
      if (!PROJECT_ID.test(id)) continue;
      const def = (parse((await readText(this.tree, `library/${id}/library.yaml`)) ?? "") ?? {}) as { name?: string; bundled?: boolean };
      out.push({ id, name: def.name ?? id, bundled: !!def.bundled });
    }
    return out.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
  }

  /** The YAML files below a folder, as [path, text]. */
  private async yamlFiles(prefix: string): Promise<[string, string][]> {
    const out: [string, string][] = [];
    for (const p of await this.tree.list(prefix)) if (p.endsWith(".yaml")) out.push([p, (await readText(this.tree, p)) ?? ""]);
    return out;
  }

  private async tracks(prefix: string): Promise<string[]> {
    return (await this.tree.list(prefix)).filter((p) => p.endsWith(".wav")).map(baseName);
  }

  private async projectDef(id: string): Promise<{ name?: string; library: string }> {
    if (!PROJECT_ID.test(id)) throw new Error(`Bad project id "${id}"`);
    const text = await readText(this.tree, `projects/${id}/project.yaml`);
    if (text === undefined) throw new Error(`No project "${id}" (projects/${id}/project.yaml)`);
    return parse(text) as { name?: string; library: string };
  }

  /** A project and its library version, as the editor works on them (projects.md §6). */
  async loadProject(id: string): Promise<ProjectFiles> {
    const def = await this.projectDef(id);
    const files: Record<string, string> = {};
    for (const [p, t] of await this.yamlFiles(`library/${def.library}/data/`)) files[p] = t;
    for (const [p, t] of await this.yamlFiles(`projects/${id}/data/`)) files[p.slice(`projects/${id}/`.length)] = t;
    const music = [...(await this.tracks(`library/${def.library}/assets/audio/music/`)).map((t) => `lib:${t}`), ...(await this.tracks(`projects/${id}/assets/audio/music/`))];
    return {
      project: { id, name: def.name ?? id, library: def.library },
      files,
      music,
      roots: { library: `library/${def.library}/assets/`, project: `projects/${id}/assets/` },
    };
  }

  // ---------- writing ----------

  /** Saves one of a project's own data files ("data/…yaml"; the library is read-only). */
  async saveFile(id: string, path: string, text: string) {
    if (!PROJECT_ID.test(id) || !path.startsWith("data/") || !path.endsWith(".yaml") || !safePath(path)) throw new Error(`Can't save "${path}"`);
    await writeText(this.tree, `projects/${id}/${path}`, text);
  }

  /** Deletes one of a project's data files (a renamed or deleted map). */
  async deleteFile(id: string, path: string) {
    if (!PROJECT_ID.test(id) || !path.startsWith("data/") || !path.endsWith(".yaml") || !safePath(path)) throw new Error(`Can't delete "${path}"`);
    await this.tree.write(`projects/${id}/${path}`, null);
  }

  /** Writes (bytes) or deletes (null) one of a project's asset files. */
  async putAsset(id: string, path: string, bytes: Uint8Array | null) {
    await this.projectDef(id);
    if (!ASSET_PATH.test(path)) throw new Error(`"${path}" can't be a project asset (charsets|battlers|faces|battlebacks|chipsets|signs|system/<id>.png, audio/music/<id>.wav)`);
    await this.tree.write(`projects/${id}/assets/${path}`, bytes);
  }

  /** A folder of the tree, copied to another place. */
  private async copyFolder(from: string, to: string) {
    for (const p of await this.tree.list(from)) {
      if (p.endsWith("/.gitkeep")) continue;
      const data = await this.tree.read(p);
      if (data) await this.tree.write(to + p.slice(from.length), data);
    }
  }

  /**
   * A new project (projects.md §6): a copy of another project (`from`), or the library's empty
   * template (`library/<v>/template`: default rules, one map). Only its name changes.
   */
  async createProject(opts: { id: string; name: string; from?: string; library?: string }): Promise<ProjectInfo> {
    const { id, name } = opts;
    if (!PROJECT_ID.test(id)) throw new Error(`"${id}" can't be a project id (lower case letters, digits, _ and -)`);
    if (await this.tree.read(`projects/${id}/project.yaml`)) throw new Error(`A project "${id}" exists already`);
    if (opts.from && !PROJECT_ID.test(opts.from)) throw new Error(`Bad project id "${opts.from}"`);
    const source = opts.from ? `projects/${opts.from}/` : `library/${opts.library ?? "v1"}/template/`;
    if (!(await this.tree.read(`${source}project.yaml`))) throw new Error(`Nothing to start from at ${source}`);
    await this.copyFolder(source, `projects/${id}/`);
    // the new name, keeping the file's comments
    const doc = parseDocument((await readText(this.tree, `projects/${id}/project.yaml`)) ?? "");
    doc.set("name", name);
    await writeText(this.tree, `projects/${id}/project.yaml`, doc.toString());
    return { id, name, library: String(doc.get("library")) };
  }

  /**
   * Checks (and with `apply`, makes) a project's move to another library version (projects.md §3):
   * the references that version lacks. It only moves when nothing is missing.
   */
  async moveToLibrary(id: string, library: string, apply = false): Promise<{ missing: string[]; moved: boolean }> {
    if (!PROJECT_ID.test(library) || !(await this.tree.read(`library/${library}/library.yaml`))) throw new Error(`No library "${library}"`);
    const { files } = await this.loadProject(id);
    const own = Object.entries(files).filter(([p]) => !p.startsWith("library/"));
    const lib = await this.yamlFiles(`library/${library}/data/`);
    const missing = missingInLibrary(lib, own, await this.tracks(`library/${library}/assets/audio/music/`));
    if (!apply || missing.length) return { missing, moved: false };
    const doc = parseDocument((await readText(this.tree, `projects/${id}/project.yaml`)) ?? "");
    doc.set("library", library);
    await writeText(this.tree, `projects/${id}/project.yaml`, doc.toString());
    return { missing, moved: true };
  }

  // ---------- .brpg ----------

  /**
   * A project as one `.brpg` file (projects.md §5): a zip of project.yaml, data/, assets/ and the
   * library content it uses (trimmed data files and the used assets, under library/<v>/) –
   * complete on its own.
   */
  async exportProject(id: string): Promise<Uint8Array> {
    const { project, files } = await this.loadProject(id);
    const lib = Object.entries(files).filter(([p]) => p.startsWith("library/")) as [string, string][];
    const own = Object.entries(files).filter(([p]) => !p.startsWith("library/")) as [string, string][];
    const L = `library/${project.library}`;
    const usage = libraryUsage(lib, own, await this.tracks(`${L}/assets/audio/music/`));
    const zip: Record<string, Uint8Array> = {};
    const dir = `projects/${id}/`;
    for (const p of await this.tree.list(dir)) {
      const rel = p.slice(dir.length);
      if (rel.endsWith(".gitkeep") || !(rel === "project.yaml" || rel.startsWith("data/") || rel.startsWith("assets/"))) continue;
      const data = await this.tree.read(p);
      if (data) zip[rel] = data;
    }
    const libDef = await this.tree.read(`${L}/library.yaml`);
    if (libDef) zip[`${L}/library.yaml`] = libDef;
    for (const [path, text] of lib) {
      const trimmed = trimLibraryFile(path, text, usage);
      if (trimmed !== null) zip[path] = strToU8(trimmed);
    }
    for (const a of usedAssets(lib, usage)) {
      const data = await this.tree.read(`${L}/assets/${a}`);
      if (data) zip[`${L}/assets/${a}`] = data;
    }
    // images and sounds are stored as they are (they hardly compress); the YAML is deflated
    const entries = Object.fromEntries(Object.entries(zip).map(([p, d]) => [p, [d, { level: /\.(png|wav)$/.test(p) ? 0 : 6 }] as const]));
    return zipSync(entries as never);
  }

  /**
   * Unpacks a `.brpg` as a new project (a folder from its name, made unique). Its library version is
   * installed from the file when this storage doesn't have it yet (marked `bundled`: only what that
   * project uses).
   */
  async importProject(bytes: Uint8Array): Promise<ProjectInfo> {
    let zip: Record<string, Uint8Array>;
    try {
      zip = unzipSync(bytes);
    } catch {
      throw new Error("Not a Board RPG project (not a .brpg file)");
    }
    if (!zip["project.yaml"]) throw new Error("Not a Board RPG project (no project.yaml)");
    const def = parse(strFromU8(zip["project.yaml"])) as { name?: string; library?: string };
    if (!def?.library || !PROJECT_ID.test(def.library)) throw new Error("project.yaml names no library version");
    const base = projectIdFor(def.name ?? "project", "-");
    let id = base;
    for (let n = 2; await this.tree.read(`projects/${id}/project.yaml`); n++) id = `${base}-${n}`;
    const L = `library/${def.library}/`;
    const installLibrary = !(await this.tree.read(`${L}library.yaml`));
    for (const [path, data] of Object.entries(zip)) {
      if (path.endsWith("/") || !safePath(path)) continue; // folders; nothing outside
      if (path === "project.yaml" || path.startsWith("data/") || path.startsWith("assets/")) await this.tree.write(`projects/${id}/${path}`, data);
      else if (path.startsWith(L) && installLibrary) {
        const out = path === `${L}library.yaml` ? strToU8(strFromU8(data).trimEnd() + "\n# Installed from an exported project: only the content that project uses.\nbundled: true\n") : data;
        await this.tree.write(path, out);
      }
    }
    return { id, name: def.name ?? id, library: def.library };
  }
}
