import { useEffect, useState } from "preact/hooks";
import { FloatingWindow } from "./forms/FloatingWindow";
import { Field } from "./forms/fields";
import { createProject, fetchProjects, importProjectFile, type Project } from "./project";
import { projectIdFor, type ProjectInfo } from "./projectFiles";

export { projectIdFor };
import { writeStored } from "./persist";

/** Opens another project: its unsaved work stays stored with it (projects.md §6). */
export function openProject(project: Project, id: string) {
  project.persistNow();
  writeStored("project", id);
  const url = new URL(location.href);
  url.searchParams.set("project", id);
  location.href = url.href;
}

/**
 * The toolbar's project menu (projects.md §6): the open project's name; the list of projects to
 * switch to and New project.
 */
export function ProjectMenu({ project }: { project: Project }) {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [projects, setProjects] = useState<ProjectInfo[] | null>(null);
  const [libraries, setLibraries] = useState<{ id: string; name: string; bundled: boolean }[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open && !creating) return;
    fetchProjects()
      .then(setProjects)
      .catch((e: Error) => setError(e.message));
    fetch("/__editor/libraries")
      .then((r) => r.json())
      .then(setLibraries)
      .catch(() => setLibraries([]));
  }, [open, creating]);

  // a click elsewhere closes the menu
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !(e.target as HTMLElement).closest(".project-menu") && setOpen(false);
    addEventListener("mousedown", close);
    return () => removeEventListener("mousedown", close);
  }, [open]);

  /** Checks the other version first: it only moves when that version has everything the project uses. */
  const moveLibrary = async (library: string) => {
    setOpen(false);
    const q = `project=${encodeURIComponent(project.info.id)}&library=${encodeURIComponent(library)}`;
    const check = (await (await fetch(`/__editor/library?${q}`)).json()) as { missing: string[] };
    if (check.missing.length) return alert(`Library ${library} lacks what this project uses:\n${check.missing.join(", ")}`);
    if (project.dirtyPaths().length && !confirm("Unsaved changes stay unsaved – move anyway?")) return;
    if (!confirm(`Move ${project.info.name} to library ${library}?`)) return;
    const r = await fetch("/__editor/library", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ project: project.info.id, library }) });
    if (!r.ok) return alert(await r.text());
    openProject(project, project.info.id);
  };

  return (
    <div class="project-menu">
      <button class="project-button" title={`Project ${project.info.id} · library ${project.info.library}`} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
        {project.info.name} <span class="caret">▾</span>
      </button>
      {open && (
        <div class="menu" role="menu">
          {(projects ?? []).map((p) => (
            <button key={p.id} role="menuitem" class={p.id === project.info.id ? "on" : ""} onClick={() => (p.id === project.info.id ? setOpen(false) : openProject(project, p.id))}>
              <span>{p.name}</span>
              <span class="dim">{p.id}</span>
            </button>
          ))}
          {!projects && !error && <div class="dim pad">Loading…</div>}
          {error && <div class="bad pad">{error}</div>}
          <hr />
          <button
            role="menuitem"
            onClick={() => {
              setOpen(false);
              setCreating(true);
            }}
          >
            New project…
          </button>
          <button
            role="menuitem"
            title="A .brpg file with this project and the library content it uses – it opens anywhere (saved files only)"
            onClick={() => {
              setOpen(false);
              if (project.dirtyPaths().length && !confirm("The export has the saved files only – export anyway?")) return;
              const a = document.createElement("a");
              a.href = `/__editor/export?project=${encodeURIComponent(project.info.id)}`;
              a.download = `${project.info.id}.brpg`;
              a.click();
            }}
          >
            Export {project.info.name}…
          </button>
          <hr />
          <div class="dim pad" title="The library version this project uses (projects.md §3)">
            Library {project.info.library}
          </div>
          {libraries
            .filter((l) => l.id !== project.info.library)
            .map((l) => (
              <button key={l.id} role="menuitem" title={l.bundled ? "Installed from an exported project: only what that project uses" : l.name} onClick={() => void moveLibrary(l.id)}>
                Move to library {l.id}…
              </button>
            ))}
          <label role="menuitem" class="menu-file" title="Open a .brpg file as a new project">
            Import…
            <input
              type="file"
              accept=".brpg,.zip"
              onChange={async (e) => {
                const file = e.currentTarget.files?.[0];
                if (!file) return;
                try {
                  const info = await importProjectFile(file);
                  openProject(project, info.id);
                } catch (err) {
                  setError((err as Error).message);
                }
              }}
            />
          </label>
        </div>
      )}
      {creating && <NewProjectWindow project={project} projects={projects ?? []} onClose={() => setCreating(false)} />}
    </div>
  );
}

/** Name, id (from the name) and what to start from: the library's empty template or a copy of a project. */
function NewProjectWindow({ project, projects, onClose }: { project: Project; projects: ProjectInfo[]; onClose: () => void }) {
  const [name, setName] = useState("");
  const [from, setFrom] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const id = projectIdFor(name);
  const taken = projects.some((p) => p.id === id);
  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const made = await createProject({ id, name: name.trim(), from: from || undefined });
      openProject(project, made.id);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };
  return (
    <FloatingWindow id="new-project" title="New project" onClose={onClose} size={{ w: 420, h: 280 }}>
      <form
        class="new-project"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim() && !taken && !busy) void create();
        }}
      >
        <Field label="Name">
          <input autoFocus value={name} placeholder="My Game" onInput={(e) => setName(e.currentTarget.value)} />
        </Field>
        <Field label="Folder" hint={taken ? "A project with this folder exists already" : undefined}>
          <span class={taken ? "bad" : "dim"}>projects/{id}</span>
        </Field>
        <Field label="Start from">
          <select value={from} onChange={(e) => setFrom(e.currentTarget.value)}>
            <option value="">Empty (one map)</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                A copy of {p.name}
              </option>
            ))}
          </select>
        </Field>
        {error && <p class="bad">{error}</p>}
        <div class="row end">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" class="primary" disabled={!name.trim() || taken || busy}>
            Create
          </button>
        </div>
      </form>
    </FloatingWindow>
  );
}
