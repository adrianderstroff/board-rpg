import { render } from "preact";
import { App } from "./App";
import { Project, storageFileApi } from "./project";
import { readStored, writeStored } from "./persist";
import { ProjectContext } from "./projectContext";
import { startStorage } from "./storage";

/**
 * Board RPG editor (docs/editor-design.md). Runs on the Vite dev server (`npm run editor`) or as a
 * static site, where projects live in a folder or in the browser (docs/distribution.md §1).
 */
const root = document.getElementById("app")!;
root.innerHTML = `<div class="loading">Loading the game's data…</div>`;

const fail = (e: Error) => {
  root.innerHTML = "";
  const div = document.createElement("div");
  div.className = "error";
  div.textContent = `The editor couldn't load the data:\n${e.message}`;
  root.append(div);
};

async function start() {
  const s = await startStorage();
  // the project: ?project=<id>, else the one open last time in this storage – the first time a new,
  // empty "Untitled" (the site; the demo is in the project menu), on the dev server the demo
  const key = `project.${s.kind}`;
  let projects = await s.store.listProjects();
  const asked = new URLSearchParams(location.search).get("project");
  const last = readStored<string | null>(key, null);
  const firstTime = !asked && !last && s.kind !== "dev";
  if (firstTime || !projects.length) {
    let id = "untitled";
    for (let n = 2; projects.some((p) => p.id === id); n++) id = `untitled-${n}`;
    await s.store.createProject({ id, name: "Untitled" });
    projects = await s.store.listProjects();
    writeStored(key, id);
  }
  const wanted = asked || readStored(key, "demo");
  const id = projects.some((p) => p.id === wanted) ? wanted : projects.some((p) => p.id === "demo") ? "demo" : projects[0].id;
  const project = new Project(storageFileApi(id));
  await project.load();
  root.innerHTML = "";
  writeStored(key, project.info.id);
  document.title = `${project.info.name} – Board RPG editor`;
  render(
    <ProjectContext.Provider value={project}>
      <App project={project} />
    </ProjectContext.Provider>,
    root,
  );
  // handle for automated browser tests (tools/e2e.mjs), like the game's window.__game
  (window as unknown as { __editor: object }).__editor = { project, storage: s };
}

start().catch(fail);
