import { defineConfig } from "vite";

/**
 * The editor as a static site (docs/distribution.md §1, DS2): `npm run build:editor` → dist-editor/
 * with the editor at editor/, the runtime's own assets beside it and the library bundled in.
 * Without a dev server it keeps projects in a folder or in the browser. ▶ Play opens the game at
 * VITE_GAME_URL (relative to the editor; the website puts the game at ../play/).
 */
export default defineConfig({
  base: "./",
  build: {
    outDir: "dist-editor",
    target: "es2022",
    chunkSizeWarningLimit: 4000,
    rollupOptions: { input: { editor: "editor/index.html" } },
  },
});
