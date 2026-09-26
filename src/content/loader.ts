import { parse } from "yaml";
import { Database, type RawContent } from "../core/data/database";
import { layeredRaw } from "./raw";

/**
 * Loads a project's content (projects.md): the library version it names plus its own files – all
 * YAML below library/ and projects/ is bundled at build time (works in tests too).
 */
const files = import.meta.glob(["/library/*/library.yaml", "/library/*/data/**/*.yaml", "/projects/*/project.yaml", "/projects/*/data/**/*.yaml"], {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

/** The project the game plays: `?project=<id>`, else the build's VITE_PROJECT, else the demo. */
export const PROJECT: string =
  (typeof location !== "undefined" && new URLSearchParams(location.search).get("project")) || (import.meta.env?.VITE_PROJECT as string | undefined) || "demo";

const read = (path: string, text: string): unknown => {
  try {
    return parse(text);
  } catch (e) {
    throw new Error(`YAML error in ${path}: ${(e as Error).message}`);
  }
};

/** A project's settings (project.yaml). */
export interface ProjectDef {
  name: string;
  /** The library version it uses ("v1" = library/v1). */
  library: string;
}

export function loadRawContent(sources: Record<string, string> = files, project = PROJECT): RawContent {
  const key = (p: string) => p.replace(/^\//, "");
  const all = Object.entries(sources).map(([p, t]) => [key(p), t] as const);
  const def = all.find(([p]) => p === `projects/${project}/project.yaml`);
  if (!def) throw new Error(`No project "${project}" (projects/${project}/project.yaml)`);
  const { library } = read(def[0], def[1]) as ProjectDef;
  // (an empty file – a library file a build left out, see vite.config.ts – adds nothing)
  const layer = (prefix: string) =>
    all
      .filter(([p]) => p.startsWith(`${prefix}/data/`))
      .map(([p, t]) => [p, read(p, t)] as [string, unknown])
      .filter(([, data]) => data != null);
  return layeredRaw(layer(`library/${library}`), layer(`projects/${project}`), { library: `library/${library}/assets/`, project: `projects/${project}/assets/` });
}

export function loadDatabase(): Database {
  return new Database(loadRawContent());
}
