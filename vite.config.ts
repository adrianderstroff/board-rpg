import { cpSync, existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Plugin } from "vite";
import { parse } from "yaml";
import { defineConfig } from "vitest/config";
import { editorFiles } from "./editor/vite-plugin-files.ts";

/**
 * A build ships one project (VITE_PROJECT, default the demo) with the assets of the library version
 * it uses (docs/projects.md §5). Dev serves both folders straight from the repository.
 */
function projectAssets(): Plugin {
  let outDir = "dist";
  return {
    name: "board-rpg-project-assets",
    apply: "build",
    configResolved(c) {
      outDir = c.build.outDir;
    },
    closeBundle() {
      const project = process.env.VITE_PROJECT || "demo";
      const { library } = parse(readFileSync(`projects/${project}/project.yaml`, "utf8")) as { library: string };
      for (const dir of [`library/${library}/assets`, `projects/${project}/assets`]) {
        if (existsSync(dir)) cpSync(dir, resolve(outDir, dir), { recursive: true, filter: (f) => !f.endsWith(".gitkeep") });
      }
    },
  };
}

export default defineConfig({
  // Relative base so the build works from file:// (Tauri/Electron/Capacitor) and any subpath.
  base: "./",
  server: { port: 5173 },
  // The editor (editor/index.html, `npm run editor`) reads and writes the project's data through this dev-only API.
  plugins: [editorFiles(), projectAssets()],
  build: { target: "es2022", chunkSizeWarningLimit: 2000 }, // Phaser alone is ~1.3 MB
  test: { include: ["src/**/*.test.ts", "editor/**/*.test.ts"] },
});
