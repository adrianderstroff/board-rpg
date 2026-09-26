import { defineConfig } from "vitest/config";
import { editorFiles } from "./editor/vite-plugin-files.ts";

export default defineConfig({
  // Relative base so the build works from file:// (Tauri/Electron/Capacitor) and any subpath.
  base: "./",
  server: { port: 5173 },
  // The editor (editor/index.html, `npm run editor`) reads and writes data/ through this dev-only API.
  plugins: [editorFiles()],
  build: { target: "es2022", chunkSizeWarningLimit: 2000 }, // Phaser alone is ~1.3 MB
  test: { include: ["src/**/*.test.ts", "editor/**/*.test.ts"] },
});
