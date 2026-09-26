/** A project in projects/ (projects.md §1). */
export interface ProjectInfo {
  id: string;
  name: string;
  /** The library version it uses ("v1"). */
  library: string;
}

/** What the editor works on (projects.md §6): the open project's files and the library version it uses. */
export interface ProjectFiles {
  project: ProjectInfo;
  /** The project's own files as "data/…yaml" (editable), the library's as "library/<v>/data/…yaml" (read-only). */
  files: Record<string, string>;
  /** Music tracks: the library's as "lib:<name>", the project's by name. */
  music: string[];
  /** Where each layer's assets are, from the site root. */
  roots: { library: string; project: string };
}
