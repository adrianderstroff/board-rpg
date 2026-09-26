import { render } from "preact";
import { App } from "./App";
import { Project } from "./project";

/** Board RPG editor (docs/editor-design.md). Runs on the Vite dev server: `npm run editor`. */
const root = document.getElementById("app")!;
root.innerHTML = `<div class="loading">Loading the game's data…</div>`;

const project = new Project();
project
  .load()
  .then(() => {
    root.innerHTML = "";
    render(<App project={project} />, root);
  })
  .catch((e: Error) => {
    root.innerHTML = "";
    const div = document.createElement("div");
    div.className = "error";
    div.textContent = `The editor couldn't load the data:\n${e.message}`;
    root.append(div);
  });
