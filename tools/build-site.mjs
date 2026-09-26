// Builds the website (docs/distribution.md §3) into site-dist/ – what GitHub Pages serves:
//   /          landing page (site/index.html)      /download/  the player's releases (site/download/)
//   /editor/   the editor (static; projects in a folder or the browser)
//   /play/     the demo, playable in the browser
// Usage: node tools/build-site.mjs   (npm run build:site)
import { execSync } from "node:child_process";
import { cpSync, existsSync, rmSync } from "node:fs";

const OUT = "site-dist";
const run = (cmd, env = {}) => execSync(cmd, { stdio: "inherit", env: { ...process.env, ...env } });

rmSync(OUT, { recursive: true, force: true });
// the game with the demo at /play/
run(`npx vite build --outDir ${OUT}/play --emptyOutDir`);
// the editor: its build has the runtime's assets at its root and itself at editor/; ▶ Play opens ../play/
run(`npx vite build --config vite.editor.config.ts --outDir ${OUT}-editor --emptyOutDir`, { VITE_GAME_URL: "../play/" });
cpSync(`${OUT}-editor`, OUT, { recursive: true });
rmSync(`${OUT}-editor`, { recursive: true, force: true });
// the pages and their images
cpSync("site", OUT, { recursive: true });
cpSync("docs/images", `${OUT}/images`, { recursive: true });
if (!existsSync(`${OUT}/icon-192.png`)) cpSync("public/icon-192.png", `${OUT}/icon-192.png`);
// GitHub Pages: serve the files as they are (no Jekyll)
cpSync("site/.nojekyll", `${OUT}/.nojekyll`);
console.log(`site built into ${OUT}/`);
