# Board RPG

Isometric pixel-art board game × JRPG (Shining Force meets Final Fantasy). TypeScript + Phaser 4 + Vite, tests with Vitest.
Web first; desktop (Tauri/Electron) and mobile (Capacitor) later.

- Design: [docs/game-design.md](docs/game-design.md) (sections referenced as §N in code)
- Work breakdown & status: [docs/packages.md](docs/packages.md) – update statuses when finishing work
- Ideas designed but not built yet: [docs/todo.md](docs/todo.md) – move an item into the design doc when picking it up
- Editor (content editor + play-testing): [docs/editor-design.md](docs/editor-design.md), packages E1–E9
- Projects & the library (layout, `lib:` ids, versions, export): [docs/projects.md](docs/projects.md)
- Distribution (web editor storages, Tauri player, website, releases): [docs/distribution.md](docs/distribution.md)
- Graphics in the editor (import, tiles, pixel editor, game images per project): [docs/graphics.md](docs/graphics.md)
- Asset sheet layouts: [public/assets/ASSETS.md](public/assets/ASSETS.md)

## Commands
- `npm run editor` – the content editor (docs/editor-design.md) at http://localhost:5173/editor/ – edits the project's data in place (the library is read-only); ▶ Play / ▶ Quick Play run the unsaved content in a game tab
- `npm run dev` – dev server at http://localhost:5173 (`npm run dev:phone` also serves on the LAN for testing on a phone; `?touch=1` forces touch controls on desktop)
- `npm test` – unit tests (`src/**/*.test.ts`), incl. content validation and a scripted playthrough
- `npm run build` – typecheck + production build to `dist/`
- `npm run build:editor` – the editor as a static site to `dist-editor/` (projects in a folder or in the browser, docs/distribution.md)
- `npm run build:player` – the player (the game without a game of its own: it opens `.brpg` files) to `dist-player/`; the Tauri app around it: `apps/player/`
- `npm run build:site` – the website (landing page, `/editor/`, `/play/`, `/download/`) to `site-dist/`
- `npm run art` – regenerate procedural placeholder art (content sheets into `library/v1/assets/`, system graphics into `public/assets/`)
- `npm run audio` – regenerate procedural chiptune SFX (`public/assets/audio/sfx`) and music (`library/v1/assets/audio/music`) (see AUDIO.md)
- `npm run e2e [-- scenario ...]` – Playwright end-to-end scenarios against the running dev server (keyboard-driven; `window.__game.debug` only for setup, `debug.menu()` exposes the open menu so tests pick entries by label). Screenshots in `tools/out/e2e/`
- `node tools/smoke.mjs <url> <outDir> "key:Enter;;wait:500;;shot:name;;eval:js"` – Playwright smoke run with screenshots (dev server must be running); `window.__game` exposes `phaser`, `session()` and some core functions

## Architecture (strict layering)
```
library/v1/{data,assets}     ← the default library (heroes, classes, items, enemies, graphics, chipsets, music); ids lib:<id>
projects/demo/{data,assets}  ← the demo project (config, maps, npcs, dialogs, quests, shops); references lib: content
public/assets/**             ← the runtime's own: system graphics, sound effects
src/core    pure rules, no Phaser/DOM. Functions take `ctx` (db + state + rng), MUTATE state and
            return GameEvent[] describing what happened. Never import engine/game.
src/engine  generic Phaser toolkit (iso renderer, sprites, input focus stack, UI widgets, rich text).
            No game rules, never imports core.
src/game    scenes & UI flows wiring core + engine (BoardScene, BattleScene, menus, shop, dialogs).
src/content YAML loading (Vite glob) → Database.
```
- **State**: everything saveable lives in one `GameState` (`src/core/state/types.ts`); save = JSON. Undo (move cancel) = `game.snapshot()` / `game.restore()`; always read `game.ctx` fresh after a restore.
- **Events**: core returns `GameEvent[]`; scenes replay them (`BoardScene.play`, `BattleScene.playEvents`). Keep rules out of scenes.
- **Scripts**: conditions/actions (`core/script`) are shared by quests, dialogs, map events and exits. UI-only actions come back as `UiRequest`s.
- **Library ids**: library content is `lib:<id>` everywhere (its files write their own keys plain). The few library entries the rules rely on are named in `src/core/data/builtins.ts` only.
- **Content**: new classes/abilities/items/enemies/maps are data only. Add references → `validateContent` catches typos (runs in tests and at startup).
- Every rule change gets a test in `src/test/`.
