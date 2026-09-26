import { cpSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { Plugin } from "vite";
import { defineConfig } from "vitest/config";
import { libraryUsage, trimLibraryFile, usedAssets, type LibraryUsage } from "./src/content/bundle.ts";
import { editorFiles, readProject } from "./editor/vite-plugin-files.ts";

/**
 * A build ships one project (VITE_PROJECT, default the demo) with only the library content it uses
 * (docs/projects.md §5): the content glob is narrowed to that project and its library version, the
 * library's data files are trimmed to the used entries, and only the used assets are copied.
 * Dev and the tests see every project and the whole library.
 */
function shipProject(): Plugin {
  const project = process.env.VITE_PROJECT || "demo";
  let outDir = "dist";
  let library = "";
  let usage: LibraryUsage | null = null;
  let libFiles: [string, string][] = [];
  return {
    name: "board-rpg-ship-project",
    apply: "build",
    enforce: "pre", // before Vite expands the content glob
    configResolved(c) {
      outDir = c.build.outDir;
    },
    buildStart() {
      const p = readProject(process.cwd(), project);
      library = p.project.library;
      libFiles = Object.entries(p.files).filter(([f]) => f.startsWith("library/"));
      const own = Object.entries(p.files).filter(([f]) => !f.startsWith("library/"));
      const musicDir = `library/${library}/assets/audio/music`;
      const tracks = existsSync(musicDir) ? readdirSync(musicDir).map((f) => f.replace(/\.wav$/, "")) : [];
      usage = libraryUsage(libFiles, own, tracks);
    },
    transform(code, id) {
      if (!id.replace(/\\/g, "/").endsWith("src/content/loader.ts")) return;
      return code.replaceAll("/library/*/", `/library/${library}/`).replaceAll("/projects/*/", `/projects/${project}/`);
    },
    load(id) {
      // the library's data files, trimmed to what the project uses (an unused chipset: nothing)
      const m = /[\\/](library[\\/][^\\/]+[\\/]data[\\/].+\.yaml)\?raw$/.exec(id);
      if (!m || !usage) return;
      const path = m[1].replace(/\\/g, "/");
      const text = libFiles.find(([f]) => f === path)?.[1];
      if (text === undefined) return;
      return `export default ${JSON.stringify(trimLibraryFile(path, text, usage) ?? "")};`;
    },
    closeBundle() {
      if (!usage) return;
      const own = `projects/${project}/assets`;
      if (existsSync(own)) cpSync(own, resolve(outDir, own), { recursive: true, filter: (f) => !f.endsWith(".gitkeep") });
      for (const a of usedAssets(libFiles, usage)) {
        const from = `library/${library}/assets/${a}`;
        if (!existsSync(from)) continue;
        mkdirSync(dirname(resolve(outDir, from)), { recursive: true });
        cpSync(from, resolve(outDir, from));
      }
    },
  };
}

export default defineConfig({
  // Relative base so the build works from file:// (Tauri/Electron/Capacitor) and any subpath.
  base: "./",
  server: { port: 5173 },
  // The editor (editor/index.html, `npm run editor`) reads and writes the projects through this dev-only API.
  plugins: [editorFiles(), shipProject()],
  build: { target: "es2022", chunkSizeWarningLimit: 2000 }, // Phaser alone is ~1.3 MB
  test: { include: ["src/**/*.test.ts", "editor/**/*.test.ts"] },
});
