# Board RPG

Isometric pixel-art board game × JRPG (Shining Force meets Final Fantasy). TypeScript + Phaser 4 + Vite, tests with Vitest.
Web first; desktop (Tauri/Electron) and mobile (Capacitor) later.

- Design: [docs/game-design.md](docs/game-design.md) (sections referenced as §N in code)
- Work breakdown & status: [docs/packages.md](docs/packages.md) – update statuses when finishing work
- Ideas designed but not built yet: [docs/todo.md](docs/todo.md) – move an item into the design doc when picking it up
- Asset sheet layouts: [public/assets/ASSETS.md](public/assets/ASSETS.md)

## Commands
- `npm run dev` – dev server at http://localhost:5173 (`npm run dev:phone` also serves on the LAN for testing on a phone; `?touch=1` forces touch controls on desktop)
- `npm test` – unit tests (`src/**/*.test.ts`), incl. content validation and a scripted playthrough
- `npm run build` – typecheck + production build to `dist/`
- `npm run art` – regenerate procedural placeholder art into `public/assets/`
- `npm run audio` – regenerate procedural chiptune SFX/music into `public/assets/audio/` (see AUDIO.md)
- `npm run e2e [-- scenario ...]` – Playwright end-to-end scenarios against the running dev server (keyboard-driven; `window.__game.debug` only for setup, `debug.menu()` exposes the open menu so tests pick entries by label). Screenshots in `tools/out/e2e/`
- `node tools/smoke.mjs <url> <outDir> "key:Enter;;wait:500;;shot:name;;eval:js"` – Playwright smoke run with screenshots (dev server must be running); `window.__game` exposes `phaser`, `session()` and some core functions

## Architecture (strict layering)
```
data/*.yaml, data/maps|chipsets|dialogs/*.yaml   ← all content (hand-editable, validated)
public/assets/**                                  ← graphics (charsets, chipsets, battlers, faces, system)
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
- **Content**: new classes/abilities/items/enemies/maps are data only. Add references → `validateContent` catches typos (runs in tests and at startup).
- Every rule change gets a test in `src/test/`.
