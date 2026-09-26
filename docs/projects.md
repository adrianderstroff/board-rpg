# Projects and the library

A game made with Board RPG is a **project**. Next to the projects there is the **library**: the
default content and resources every project can use. The library is versioned. The demo is just
one project, and it uses the library.

Work packages: PJ1–PJ5 in [packages.md](packages.md).

## 1. Layout

```
library/v1/                  one folder per library version (v1, v2 …), read-only for projects
  library.yaml               { version: 1, name }
  data/                      heroes, classes, patterns, statuses, fieldEffects, abilities, items,
                             enemies, graphics (charsets, battlers, faces, battlebacks, wall signs),
                             chipsets/*
  assets/                    charsets, battlers, faces, battlebacks, chipsets, audio/music
projects/demo/
  project.yaml               { name, library: v1 }
  data/                      config, maps, npcs, dialogs, quests, shops – and anything of its own
                             (its own heroes, items, graphics … in the same files as the library's)
  assets/                    the project's own images and music
public/assets/               the runtime's own: system graphics (cursor, highlights, fonts) and the
                             sound effects the game plays itself – not content
```

## 2. Ids: `lib:`

- The library's content is known as **`lib:<id>`**: `lib:aldric`, `lib:potion`, `lib:desert`,
  `lib:village` (a music track). The project's own content has plain ids. There is no ambiguity
  and no collision: a later library version can add an item that happens to share a name with a
  project's item.
- Library files write their own keys plain (`aldric:` in `library/v1/data/heroes.yaml`). The
  loader adds the prefix. References inside the library are written with it (`classId:
  lib:knight`), the same way a project writes them. A reference reads the same wherever it stands.
- A project can't change library content in place. The editor's **Copy to project** makes an
  editable copy under a plain id and points the project's references at the copy.
- Sound effects are the runtime's (public/assets/audio/sfx), so `sound: chest` keeps a plain name.
- Saves made before projects existed don't load (the game hasn't shipped; the save version is
  bumped).

## 3. Versions

- `project.yaml` names the library version (`library: v1`). Several versions live side by side
  in `library/`, so an old project keeps working when v2 arrives. Moving a project to a newer
  version is an explicit step (later: the editor lists what changed and what no longer resolves).
- A library version doesn't change once it's published. Fixes go into a new version.

## 4. Loading

- The game and the editor build one database: the library version's files (keys prefixed), then
  the project's. `loadRawContent` already takes a set of files. It gets the two layers and merges
  them per collection.
- **Asset paths.** A graphic's `image` is relative to the assets folder of the layer it comes
  from: a library charset `charsets/hero_knight.png` loads from `library/v1/assets/…`, a project
  one from `projects/demo/assets/…`. The database stores the resolved path. Music the same way.
- **Which project.** In development, `?project=<id>` (default `demo`). A build takes
  `--project <id>` (`VITE_PROJECT`).

## 5. Export and shipping – one format, bundled

- **Export** writes `<project>.brpg`, a zip of `project.yaml`, `data/`, `assets/` **and the
  library content the project uses** (only what it references, under `library/v1/`). The file is
  complete on its own: it plays and opens anywhere, even where that library version is missing.
- **Import** unpacks a `.brpg` into `projects/<id>/`. A bundled library version that isn't
  installed yet is installed too.
- **Shipping** (`npm run build -- --project demo`) builds the game runtime with that one project
  and the library content it uses into `dist/`. Tauri and Capacitor wrap `dist/` later. Only the
  used library content is copied, so a small game stays small.

## 6. Editor

- A **project menu** (the toolbar's left end, showing the open project's name): switch to another
  project, **New project** – a name (its folder id follows from it) and what to start from: the
  library's **template** (`library/v1/template/`: default rules, one sand map, a hero and two
  potions – valid and playable right away) or a **copy** of an existing project. Later export and
  import. The open project is remembered (and `?project=<id>` opens one); unsaved work is kept per
  project, so switching loses nothing.
- Library content shows in every list with a *library* badge. Its forms are read-only with
  **Copy to project**.
- **Import resources**: drop a PNG or a music file. It's copied into the project's `assets/` and
  registered (charset, face, battler, battle background, chipset, music track). For sprite sheets
  a small form sets the frame size and layout (see public/assets/ASSETS.md).
- The editor's file access is per project (`/__editor/files?project=`, `PUT /__editor/file` with
  the project, `GET|POST /__editor/projects`). The library is read only.

## 7. Decisions

1. Projects **reference** the library, pinned to a version (not copied into every project).
2. Library ids carry the **`lib:`** prefix.
3. An exported or shipped project **bundles** the library content it uses.
4. Game rules (`config.yaml`: formulas, the start) belong to the project. A new project starts
   from a default config.
5. NPCs are the project's. Their sprites and faces are library graphics.
6. Sound effects stay with the runtime (the game plays them by name for its own events).
7. Old saves are dropped (save version bump), because the game hasn't shipped.
