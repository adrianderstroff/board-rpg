import { defineConfig } from "vitest/config";

export default defineConfig({
  // Relative base so the build works from file:// (Tauri/Electron/Capacitor) and any subpath.
  base: "./",
  server: { port: 5173 },
  build: { target: "es2022", chunkSizeWarningLimit: 2000 }, // Phaser alone is ~1.3 MB
  test: { include: ["src/**/*.test.ts"] },
});
