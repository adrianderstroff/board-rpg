# Board RPG Player (Tauri)

The desktop app that plays `.brpg` games (docs/distribution.md §2): the game build (`npm run
build:player` → `dist-player/`) in a Tauri window.

- Opened with a `.brpg` (double-click – the installer registers the file type – or the command
  line) it plays that; with a `game.brpg` beside the executable it plays that one; otherwise the
  page asks for a game (drop one onto the window, or *Open a game…*).
- Build (needs Rust and the Tauri prerequisites): from the repository root `npm run build:player`,
  then `npx tauri build --config apps/player/src-tauri/tauri.conf.json` – or let GitHub Actions do
  it (the release workflow, DS5).
