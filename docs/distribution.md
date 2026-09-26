# Distribution: web editor, desktop player, website

The editor runs in the browser – on the website (GitHub Pages) or locally while developing. Games
are played on the desktop with the **player**, a Tauri app around the game, which opens the
`.brpg` files the editor exports (projects.md §5). The website presents the project, hosts the
editor, lets people play the demo and download the player.

Work packages: DS1–DS5 in [packages.md](packages.md).

## 1. Editor storage

The editor works on a **file tree** with the repository's layout – `library/<v>/…` and
`projects/<id>/…` – and one implementation of everything it does with projects (list, create from
the template or as a copy, load, save, assets, export / import `.brpg`, library versions) on top of
it. Where the tree lives is the **storage**:

| Storage | Where | `library/` | `projects/` |
|---|---|---|---|
| **Dev server** | `npm run editor` | the repository | the repository (the Vite plugin reads and writes files) |
| **Folder** | a folder the user picks (File System Access API – Chrome, Edge) | bundled with the editor (read-only) | the folder: one sub-folder per project |
| **Browser** | the browser's storage (IndexedDB) | bundled with the editor (read-only) | stored in the browser |

- The editor starts with the dev server when there is one; otherwise with the folder picked last
  time (its permission is asked for again – a click), else in the browser. The project menu shows
  the storage and switches: *Browser* or *Open a folder…* (only where the browser can).
- A new browser storage starts with a copy of the demo (bundled with the editor), so there is
  something to open right away.
- Export / Import `.brpg` work in every storage – they are how projects move between them (and to
  the player).
- **Assets** of projects in the browser or a folder are files the page reads itself: the editor
  turns them into `blob:` URLs, and a play-test tab gets the same URLs with the content.

## 2. The player (Tauri)

- The game can start from a `.brpg`: its content (the project and the library it bundles) is read
  from the zip, its assets become `blob:` URLs.
- `npm run build:player` builds the game without a game of its own (`VITE_PLAYER`, the `player`
  mode): it starts with a screen to drop a `.brpg` onto or open one. Each game keeps its own save
  slots (by its name).
- `apps/player/` is a Tauri app around that build. It opens a `.brpg` by file association
  (double-click), by dragging it onto the window or from a file dialog; with a `game.brpg` next to
  the executable it starts that one right away (a finished game = the player + its `game.brpg`).
- The editor's ▶ Play keeps running the game in a browser tab – testing never needs the player.

## 3. The website (GitHub Pages)

| Path | What |
|---|---|
| `/` | landing page: what it is, features, screenshots of the demo (tools/screenshots.mjs) and the editor (tools/editor-screenshots.mjs) |
| `/editor/` | the editor (browser / folder storage) |
| `/play/` | the demo, playable in the browser |
| `/download/` | the player: the latest version first, older ones below (from GitHub Releases) |

## 4. Releases (GitHub Actions)

- A version tag (`v0.3.0`) builds the player for Windows, macOS and Linux (`tauri-action`) and
  attaches the builds to a **GitHub Release**.
- Every push to `main` builds the site (landing, editor, game) and deploys it to Pages.
- The download page reads `/repos/<owner>/<repo>/releases` from the GitHub API in the visitor's
  browser: the latest release on top, the others listed below.
- The builds are not signed for now (Windows SmartScreen / macOS Gatekeeper warn); the download page
  says how to open them anyway.

## 5. Decisions

1. The editor is a web app; the desktop app is the **player** (user decision).
2. **Tauri** for the player (user decision): small downloads, mobile later.
3. Storage: a **real folder** where the browser can, otherwise **the browser** (user decision).
4. One repository (npm workspaces when the apps need their own dependencies).
