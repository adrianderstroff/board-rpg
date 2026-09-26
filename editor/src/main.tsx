import { render } from "preact";
import { App } from "./App";
import { httpFileApi, Project } from "./project";
import { readStored, writeStored } from "./persist";
import { ProjectContext } from "./projectContext";

/** Board RPG editor (docs/editor-design.md). Runs on the Vite dev server: `npm run editor`. */
const root = document.getElementById("app")!;
root.innerHTML = `<div class="loading">Loading the game's data…</div>`;

// the project: ?project=<id>, else the one open last time, else the demo (projects.md §6)
const projectId = new URLSearchParams(location.search).get("project") || readStored("project", "demo");
const project = new Project(httpFileApi(projectId));
project
  .load()
  .then(() => {
    root.innerHTML = "";
    writeStored("project", project.info.id);
    document.title = `${project.info.name} – Board RPG editor`;
    render(
      <ProjectContext.Provider value={project}>
        <App project={project} />
      </ProjectContext.Provider>,
      root,
    );
    // handle for automated browser tests (tools/e2e.mjs), like the game's window.__game
    (window as unknown as { __editor: object }).__editor = { project };
  })
  .catch((e: Error) => {
    root.innerHTML = "";
    const div = document.createElement("div");
    div.className = "error";
    div.textContent = `The editor couldn't load the data:\n${e.message}`;
    root.append(div);
    // a project that is gone: the next start opens the demo again
    if (projectId !== "demo") {
      writeStored("project", "demo");
      const a = document.createElement("a");
      a.href = "?project=demo";
      a.textContent = "Open the demo";
      div.append(document.createElement("br"), a);
    }
  });
