import { render } from "preact";
import { App } from "./App";
import { Project } from "./project";
import { ProjectContext } from "./projectContext";

/** Board RPG editor (docs/editor-design.md). Runs on the Vite dev server: `npm run editor`. */
const root = document.getElementById("app")!;
root.innerHTML = `<div class="loading">Loading the game's data…</div>`;

const project = new Project();
project
  .load()
  .then(() => {
    root.innerHTML = "";
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
  });
