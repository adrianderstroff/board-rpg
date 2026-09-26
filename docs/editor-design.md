# Board RPG – Editor Design

A separate editor app for building the game's content – maps, characters, items, events, quests –
and for play-testing it. It uses the same engine and rules as the game and only offers what the game
can represent.

- Game design: [game-design.md](game-design.md) (§N below refers to it)
- Work breakdown: [packages.md](packages.md) (editor packages E1–E9, see §12)

---

## 1. Goals and principles

1. **Everything the editor saves is plain game data.** The editor reads and writes the same
   YAML files the game loads – the open project's `data/` (the library's files are read-only, see
   [projects.md](projects.md)). There is no separate file format; a file edited by
   hand and a file edited in the editor are the same thing.
2. **Only what the game can do.** Every field the editor offers maps onto something the game
   implements. Things the game can't represent yet are listed in §11 instead of being faked.
3. **Usable first, data-shaped second.** The editor may present data differently from how it is
   stored when that is easier to use: a hero page shows the hero *and* its class, an item is one
   form with optional sections, a map's exits, spawns, gates and events all appear as *entities*
   on the map. On save everything is written back into the stored shape.
4. **Hand edits survive.** Saving keeps comments, key order and formatting of untouched parts of a
   YAML file (the `yaml` package's document API edits the document in place).
5. **Always valid, always playable.** The game's own `validateContent` runs live; problems are
   shown next to the field that causes them. Play and Quick Play run the edited content without
   saving first.

---

## 2. Architecture

```
editor/                 the editor app (own Vite entry: editor/index.html)
  src/
    main.tsx            app shell
    project.ts          in-memory project: raw content + YAML documents + dirty state + undo
    fileApi.ts          talks to the dev-server file API
    screens/            Maps, Characters, Items, Abilities, Quests, Dialogs, Shops, Settings
    map/                map canvas (Phaser + engine IsoMapView), tools, layers, entities
    forms/              shared form widgets: stat table, effect list, condition/action builders…
  vite-plugin-files.ts  dev-server endpoints: list/read/write data files
src/…                   the game – the editor imports src/core, src/engine and src/content
```

- **Shared code.** The editor imports the game's rules and engine directly: `core/data` (types,
  `Database`, `validateContent`), `core/board/grid` (to build a map's cells exactly like the game),
  `engine/iso` (the isometric renderer, rotation, shaped blocks) and `content/loader`
  (`loadRawContent`). Nothing is duplicated; a new game feature shows up in the editor preview
  as soon as the editor offers its field.
- **UI.** Forms, lists and trees are DOM (Preact with JSX – small, no heavy framework). The map
  canvas is a Phaser scene inside the page, using the engine's `IsoMapView`.
- **Files.** The editor works on a file tree (distribution.md §1): while developing the repository
  through the Vite dev server, as a static site a folder the user picked or the browser's storage.
  Earlier (before DS1) it ran only on the Vite dev server with a small plugin: `GET /__editor/files` (list), `GET /__editor/file?path=` (read), `PUT /__editor/file`
  (write, only the project's own `data/`; the library is read-only). It is only there in dev (`npm run editor`), never in a build.
- **Project model.** On start the editor loads every data file into (a) a YAML document per file
  (for saving with comments intact) and (b) the same `RawContent` the game builds. Edits change the
  document; the raw content and a `Database` are rebuilt from it (cheap – it's a few hundred KB).
  Each file tracks whether it is dirty. **Save** writes the dirty files; **Revert** reloads them.
- **Reloads keep the work:** unsaved edits and the undo history are kept in the browser
  (localStorage) and come back after a reload – a hot reload while working on the editor, or
  reopening the tab – as long as the files on disk are unchanged; a file changed on disk since wins
  (its unsaved edits are dropped, and the toolbar says so). Where the user was – section, map, mode,
  tool, brush, view, tab, pending resize – is remembered the same way.
- **Undo/redo** works on the whole project (snapshots of the changed documents), so painting a map
  and editing an item share one history.

---

## 3. Layout

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ 🗺 🛡 💀 👥 ⚗ ★ 📜 💬 🏪 ⚙ │ ▶ Play  ▶ Quick Play │ Save  Revert │ ↶ ↷   problems │
├──────────┬───────────────────────────────────────────────┬───────────────────┤
│ map list │ Board | Decor | Entity   tools…    Iso | Top  │  Edit | Info      │
│          │                                               │                   │
│          │   the canvas                                  │  brushes, or the  │
│          │                                               │  selected entity  │
│          │ status: cell info / key hints                 │                   │
└──────────┴───────────────────────────────────────────────┴───────────────────┘
```

- The **top bar** starts with the main sections as icons (their names as tooltips): Maps, Heroes,
  Enemies, NPCs, Items, Abilities, Quests, Dialogs, Shops, Settings. Then ▶ Play and ▶ Quick Play,
  then Save / Revert, Undo / Redo and, at the right end, a red "!" when the content has issues.
- The **inspector** has two tabs: **Edit** (the brushes of the current mode, or the selected entity's
  form) and **Info** (the map's properties).
- Every list has search, **New**, **Duplicate**, **Delete** (blocked while something still
  references the entry – the editor shows where) and **Rename id** (updates every reference in all
  files).
- Every reference field (an item, an ability, a dialog, a map + spawn…) is a searchable picker with a
  preview and a "go to" link; a missing target shows as a validation problem.
- The red "!" (only there when `validateContent` finds problems) opens a window listing every issue: where, then what.

## 4. Play-testing

Two buttons in the toolbar. Both run the **current in-memory content** (saved or not) in a game
window (a new browser tab of the game, or a panel inside the editor – switchable).

- **▶ Play** starts the game as a player would: title screen, New Game with `config.start`
  (§ Settings), the real quest start.
- **▶ Quick Play** starts directly on the map that is open in the editor, using that map's Quick
  Play entity (§6.3) if there is one:
  - position: the entity's cell, otherwise the map's centre (nearest walkable cell);
  - party: the entity's heroes and levels, otherwise the `config.start` party at their start level;
  - optional extra items (added to the inventory) and extra abilities (learned by the chosen
    heroes), optional flags to set (to test a later story state), optional gold.
  No title screen, no intro; the map's `onEnter` and auto events run as usual.

**How the game receives the content.** The game gets a small boot hook: if it is opened with
`?editor=<session>` it asks the editor window (`postMessage`) for the raw content and the play
mode, builds its `Database` from that instead of the bundled files, and either shows the title
(Play) or calls a quick-play entry (Quick Play) that sets up a new game state from the Quick Play
entity and enters the map. The normal game build is unaffected.

---

## 5. Map editor

### 5.1 Canvas
- **Isometric view** (default): the map exactly as the game draws it (same renderer, heights,
  shaped blocks, animated water), with the game's board cursor and zoom (wheel). Q / E turn the view
  smoothly like the game (the blocks spin as one solid, eased, around the map's centre). Middle drag
  or Space + drag pans. The cursor picks the column actually drawn under the mouse (its top and its
  sides, the front-most wins), so pointing at a tall wall's side selects that wall. Empty cells
  (holes) inside the map's size can be painted.
- **Grid:** thin smooth lines (one screen pixel, not pixel art) outline every cell's top – holes at
  ground level – in both views; in the iso view they sit in the drawing order (blocks in front cover
  them) and turn with the map.
- **Axis gizmo:** the lower right of the map view shows where the map's x and y run (two short
  labelled lines); in the iso view it turns with the view.
- **Strip** (above the canvas): the modes, then the tools as icons (their names in tooltips), a
  divider and two on/off icons for the grid and the decor (yellow when on, like the selected tool); the turn buttons and
  the view switch (Iso / Top) are on the right.
- **Top view** (toggle): a flat grid of the same cells for fast painting of large areas; each cell
  shows its terrain's top texture unwarped from the diamond into a square, its height as a number
  and its decor as a thumbnail. Centred on the map at first; wheel zooms around the cursor, middle
  drag or Space + drag pans. Both views edit the same data.
- The first map is open when the editor starts.
- The status bar shows the hovered cell's coordinates, terrain, height, decor and walkability (from
  the game's own grid, so blocked cells are shown as the game sees them), or the current key hints.

### 5.2 Modes
The canvas has three modes (keys 1 / 2 / 3); each shows only its own tools and brushes, and the
layers it doesn't edit – of board, decor and entities – are greyed out.

| Mode | Paints | Left / right mouse | W / S | A / D |
|---|---|---|---|---|
| **Board** | terrain (`layers.terrain`), pieces (`layers.shape`, §5.9), door lintels (`layers.overhead`) | paint / holes (no cell), full block, remove lintel | raise / lower | turn a piece |
| **Decor** | objects (`layers.decor`; facing in `layers.decorDir`) – the object to place follows the cursor see-through; **wall signs** (`wallDecor`: switch the brush to *Wall signs*) on a block's side | place / remove (signs: paint on the side / remove the cell's signs) | raise / lower (signs: which block) | turn a directional object or the brush (signs: which side – one facing away from the view isn't drawn, the status bar says so) |
| **Entity** | events, exits, spawns, enemies, gates, switches, traps, signs, the Quick Play start (§6) | select, drag / delete | – | turn the selected one |

**Preview:** with the pencil, the rectangle or the fill, what the next click places follows the cursor
(the rectangle shows it over the whole dragged area, the fill over the area it would reach)
– in Board mode the terrain block, cut to the brush's piece at the height it will get, temporarily
replacing the cell's own block; in
Decor mode the object facing its way. While the preview shows, W / S set the brush's height and A / D turn
the brush's piece or object; a left click applies them, and they stay for the next cells and other
terrains (once set, the brush shows its height with a button to go back to keeping the cells'). With the select or pick tool
the keys act on the map instead: the hovered cell, or the selected area while the cursor is in it.
Heights have no menu of their own: W / S are the height tool. Pieces (full block, half, point) are
chosen at the top of the Board brush and painted together with the terrain. The per-map **legend** (character → terrain id) is
managed automatically: the user picks terrains, the editor assigns free characters, so layer
strings stay readable in the YAML.

### 5.3 Tools (Board and Decor mode)
Pencil (B), rectangle (R), fill (G, by terrain / decor), pick (I), select area (M) – copy / paste
(also into another map) / move / clear a block of cells across all board layers; moving takes the
entities standing in it along and leaves the terrain brush behind. Right mouse is the eraser of the
current tool. Resize (columns on the right, rows at the bottom) is on the Info tab. With the toolbar's
*Grow the map* toggle on (off by default, after Grid / Decor), painting terrain beyond the edge
(pencil, rectangle) grows the map: while the cursor is out there a grey temporary
grid reaches out to it, and a click adds only the rows / columns the painted cells need – on the
left / top too (everything placed moves along, the view stays put). While the view turns, the
entities' labels stay up and turn with it.

### 5.4 Map properties
The Info tab is a table – labels left, values right: name, size (−x / +x and −y / +y buttons take away or
add a column on the right or a row at the bottom; until Resize applies it (Reset forgets it) the new size previews –
the part that grows in green, the part that shrinks in red – and the canvas marks the cells it adds
green and the ones it drops red; new cells are empty, painted afterwards), kind (Peace / Wild
switch = `peaceful` / `wild`), chipset, **music** (picker with a ▶ button to listen), battle
background (picker, its picture below in a full-width row). Below the table: the **Events** – the
map's own handlers (map loaded, becomes true) with the same tabs as an entity's. With none yet the
tab strip's + reads "+ Add event". A placed enemy's form has Events too (trigger: *defeated*).
The script editor offers every action of game-design §10.2 – the staging ones pick *who* from the
party, the heroes and the map's entities, cells as x / y.

---

## 6. Entities

In the game, a map keeps its interactive things in a few lists (`events`, `exits`, `spawns`,
`enemies`). The editor shows all of them as **entities**: markers on the entity layer that can be
selected, moved and edited in the inspector. Like RPG Maker's events, but every kind maps onto a
list the game already has.

### 6.1 Entity kinds

| Entity | Stored in | Marker in the editor | In the game |
|---|---|---|---|
| **Event** (NPC, object, trigger) | `events[]` | its NPC / decor graphic, or a marker tile (✦) if invisible | as its active page says |
| **Teleport** (exit) | `exits[]` + its arrival on the target map | the game's arrow; a door marker for doors | exit arrow (none for doors) |
| **Arrival** (not added by itself, §6.4) | `spawns{}` | marker tile: arrival icon – start icon for the game start, play icon for the Quick Play start | invisible |
| **Enemy** | `enemies[]` | the enemy's charset (+ party size) | the enemy piece |
| **Game start** / **Quick Play start** | an arrival with that role (§6.3) | start / play icon | the game start; Quick Play is editor only |

Gates, floor switches and traps are events made from **prefabs** (§6.5). Wall signs are painted in
Decor mode (§5.2).

A **marker tile** is a flat tile on the cell with the kind's icon (the same icons in the top view).
**Entity panel** (Edit tab in Entity mode), while no entity is selected: under the heading **Add
entity** one row of buttons – **Event**, **Enemy**, **Teleport ▾** (the teleport, *Game start*,
*Quick Play start*) and the **Prefab** icon button (§6.5) – and under **Entities** the map's
entities as a table in a box (a selected entity's form replaces both) – ID, type, position; a row click selects one
and opens its form. An event made of **states and handlers** (all new events, game-design §10.3) has the same two parts:
- **Appearance** – its states as folder tabs (★ marks the one it starts in; rename, duplicate,
  delete), each with its look (click the preview), facing and movement, and **passability**
  (Solid / Stop / Walk / Avoid); *Hidden* and *Trap mark* side by side.
- **Events** – its handlers as tabs named after their trigger (Interact, Enter, Pass over, Leave, Map
  loaded, Becomes true): a condition, for Interact the close-up options and the script's label, else
  "once", and the script.

A paged event (older content, until R6 converts it) has two parts:
- **Appearance** – a preview of the look (its character facing its way and / or its object; empty
  when it shows nothing) next to id, cell and – for a character – its facing. Clicking the preview opens a picker of
  sprites – nothing, the characters (NPCs), the objects (decor) – and the pick sets the kind of look.
  The picker is a floating window in the middle of the editor: dragged by its title bar, resized at
  its corner (the size is remembered), closed with × / Esc or by picking.
  Below come that kind's settings – a character's movement and shop sign, an object's "behind it"
  character (a shop keeper at a counter) – and "hidden" (found with Discover). The facing
  (N / E / S / W) shows in the preview and on the map. The look
  is stored per page; while every page looks the same the appearance is edited on all of them
  ("every page"), otherwise on the selected page (a chest closed on one page, open on the next).
- **Events** – the pages as folder tabs (scrolling sideways, + at the end) over the page's box (drag a tab onto
  another to move its page there): icon buttons to go to the first / previous / next / last page,
  to duplicate or delete it, then its condition, trigger,
  dialog, options and actions. The whole form scrolls (the bar below it stays); the boxes grow with their content.

Below every entity's form a bar stays at the bottom: back to the list, **duplicate** (the copy
follows the cursor and goes onto the next free cell clicked – ids get a free suffix) and delete.
One entity per cell: placing a new one or a copy only works on a free cell (the preview turns red
on a taken one). Choosing a kind to place shows its marker tile see-through under the cursor
until a cell is clicked.

Editor-only markers (spawns, invisible events, traps, the Quick Play entity, gate–switch links) are
drawn on an overlay of the canvas and never reach the game's rendering.

### 6.2 Events and pages (the "scripting")
The game has **no free scripting**: behaviour is data – *conditions* decide, *actions* do, and both
are shared by quests, dialogs, map events and exits (§10). The editor exposes exactly that:

- An event has **pages**. The last page whose condition holds is the active one (shown in the
  inspector as a list with "active now" for the current test state).
- A page has: **condition** (condition builder), **appearance** (NPC with facing and movement /
  decor / keeper behind an object / nothing), **trigger** (talk/interact, step on it, automatic,
  none), **once** (for step/auto), and what happens:
  - **interactions** offered in the close-up (Talk → dialog, Shop → shop, Inn → price and wake-up
    spot, Examine → text + actions),
  - or, for step/auto triggers, a **dialog** and/or **actions**.
- **Condition builder**: a tree of the game's conditions (flag, item, gold, variable compare,
  talked to, defeated, all defeated on a map, on map, quest active / done / step, level,
  party has, all / any / not). Each leaf is a small form with pickers.
- **Script editor** (the action builder): an ordered list of steps – the game's actions (set/clear
  flag, set/add variable, give/take item, give/take gold, start/complete quest, set quest step,
  dialog, shop, inn, heal party, remove event, spawn enemy, teleport, message, reveal) each with
  pickers, and blocks (game-design §10.2): *Say a line* (speaker + text), *Ask a question* (options
  with text, icon, "shown when" and their own steps), *If … then … else* (condition, nested steps;
  an if inside else is an else-if), *Wait*.
- **Teleport shortcut**: an Exit entity is the simple case (walk onto it → another map). For a
  scripted teleport (after a dialog, a choice) the action builder's *Teleport* picks map + spawn
  on a mini map.
- A "where is this used" panel shows the dialogs, quests and flags an event touches, and which other
  events and quests read the same flags.

### 6.3 Starts: the game start and the Quick Play start
Both are **arrivals with a role**. The Add buttons *Game start* and *Quick Play start* place one
(placing again moves it; the old arrival goes if nothing else uses it). The game start is one for
the whole game (`config.start.map` / `spawn`); the Quick Play start is one per map, and its form holds
all Quick Play settings (party and levels, extra items and abilities, flags, gold) – there is no
separate Quick Play panel. Stored in the map file under `editor:` so the game ignores it:

```yaml
editor:
  quickPlay:
    spawn: quick_play            # the arrival it starts on
    party: [{ hero: aldric, level: 8 }, { hero: mira, level: 8 }]   # optional
    items: { potion: 5, token_serenity: 1 }                          # optional
    abilities: { mira: [thunder] }                                   # optional
    flags: [monks_trial]                                             # optional
    gold: 500                                                        # optional
```

### 6.4 Teleports
An exit and its arrival are one **Teleport** in the editor. Arrivals are never placed by themselves:
- **Placing a Teleport** (Add → Teleport, click a free cell) puts the exit there and opens the
  **destination** in a floating window: first the list of maps (with search), then the chosen map
  (top view) – click the arrival cell (A / D: facing). Clicking an existing arrival uses that one.
  **Way back** (off by default) instead places the *return exit* on the other map; each arrival then
  lies one cell in front of its exit, never on it (the party would bounce back and forth). Cancelling
  removes the new exit again.
- The exit's form: *leads to* (map, arrival, cell) with **Change…** (the same windows), the arrow's
  direction, door, together, label, enabled when. A **teleport action** in a script picks its target
  the same way.
- Arrival names are generated (`from_<map>`) and can be renamed; renaming updates everything that
  points at it (exits, teleport actions, the inn's wake-up, the starts).
- **Deleting** an arrival deletes the exits leading there, on any map, after a confirmation that lists
  them; teleport actions, inn wake-ups or the game start pointing at it become problems (red, in the
  issues "!") until pointed elsewhere. Deleting an exit or a start deletes its arrival when
  nothing else uses it. Such a cascade is **one undo step** over every file it touches.
- **Icons** tell the kinds apart on the canvas: exit (the arrow), door, arrival, game start, Quick
  Play start.

---

### 6.5 Prefabs
Ready-made groups of entities (game-design §10.5), the library's and the project's own.
- The **Prefab** icon button opens a picker (a floating window): search, the prefabs by category
  with icon, name and description; the library's marked. Picking one starts placing: its whole
  **footprint** follows the cursor (red where a cell is taken or off the map); a click places it –
  fresh ids for its `$` placeholders, references rewired, one undo step. Esc cancels.
- **Save as prefab**: the selected entity or group (their bottom bar), or every entity in the area
  the Select tool marked (Board / Decor mode). The window asks for a name and a category; below a
  divider it holds everything else a prefab has: a **description** (for the picker), an **icon**,
  the **anchor** (the cell a click places: their top-left corner, or one of the entities' cells) and
  **what each value becomes when placed** – one row per value the entities use, each with a mode:

  | Value | Modes |
  |---|---|
  | the prefab's own entities (their ids) | per copy · fixed (only one copy per map then) |
  | entities outside the selection (a gate the lever opens) | fixed · set on placement |
  | flags, variables | per copy · fixed · set on placement |
  | content: items, dialogs, shops, enemies, music | fixed · set on placement |

  *Per copy*: each placement gets its own; *fixed*: kept as it is; *set on placement*: asked for
  when placing (a label; the current value is the default). The prefab's own entities start as per
  copy, everything else as fixed; *fixed* is always the second choice of a row. It goes into the project's `data/prefabs.yaml`.
- **Placing a prefab with inputs**: after the click a small window asks for them, the defaults
  filled in (Enter places it); an entity input is chosen from the map's entities.

### 6.6 Groups
Several entities can be selected at once in Entity mode: **Shift+click** adds an entity to the
selection or takes it out, **dragging on an empty cell** draws a rectangle that selects what is
inside (with Shift: adds it). Dragging one of them moves them all – only where every one fits (on
the map, on cells that are free or their own). The inspector then shows the group under **Selection**, in one box: its
**anchor** (the top-left corner of their cells – marked orange on the map; changing x or y moves them
all) and its entities as a list (a row selects that one alone); then the bottom bar: **Save as prefab**, **Duplicate group** (the copy follows the
cursor like a prefab – fresh ids, their references to each other follow – and becomes the new group)
and **Delete group** (Del; one undo step). Esc clears the selection. A single entity's bar says
**Duplicate entity** and **Delete entity**.

## 7. Characters

Heroes, Enemies and NPCs are three screens with the Items layout (§8): the list on the left
(search, **New**, the library's marked), the form in the middle as boxes, and the inspector showing
the character as the game does – the board sprite walking in all four facings, the battle sprite's
poses, the face at its sizes, the stats – with **Duplicate**, **Delete** and, for the library's,
**Copy to project**. Graphics are picked from a window of thumbnails (the Resources, §6 of
projects.md). Ids are made from the name when the entry is made.

### 7.1 Heroes
The game splits a hero into the **hero** (`heroes.yaml`: name, class, start level, graphics, start
equipment) and its **class** (`classes.yaml`: base stats, growth per level, abilities by level,
move pattern, equipment kinds). The hero page shows both on one page:

- **Identity**: name, description, class (picker), start level.
- **Graphics**: board sprite (charset – animated preview of all four facings), battle sprite
  (battler – all poses), face (portrait at 48 / 24 / 14 px).
- **Stats**: a table of the seven stats (max HP, max MP, STR, DEF, MAG, MDEF, SPD) with *base* and
  *growth per level*, and a chart/table of the resulting values at levels 1–50 (computed with the
  game's own formula, including equipment). A banner says when the class is shared by other heroes
  ("editing the Knight class changes Aldric and …").
- **Abilities**: a timeline of which ability is learned at which level (drag to reorder, pick
  abilities), plus the class's ability type name (Magic, Sword Art…).
- **Movement**: the move pattern (with a small board preview of the reachable cells).
- **Equipment**: the equipment kinds the class may use, and the hero's start equipment per slot
  (only items of an allowed kind are offered); the stat table shows the effect.
- **Start**: whether the hero is in the starting party (`config.start.party`).

Heroes carry no items of their own – the party shares one inventory (edited under Settings as the
start inventory); only enemies have their own items (§7.2). Abilities always come from the class.

### 7.2 Enemies
- **Identity**: name, description, level, boss (with battle music).
- **Graphics**: board sprite, battle sprite, face; dormant look (a decor, §7.5).
- **Stats**: the seven stats at its own level and optional growth per level (a map's enemy
  entity can place it at another level – the inspector shows the resulting stats and rewards),
  element multipliers (a row of
  weak / normal / resist / immune per element), status immunities, permanent statuses, its own
  element and on-hit status.
- **Equipment** (optional – creatures wear none): weapon, armor, accessory slots with the same item
  pickers and stat preview as heroes (§12.6).
- **Movement**: move pattern, swimming (none / water only / amphibious).
- **Battle AI**: the list of rules – action (attack or an ability), weight, conditions (HP below,
  chance, round, cooldown, alone, target lacks status), target choice, priority. The editor shows
  the rules in plain words ("When HP < 50 %, 30 %: Heal on the lowest-HP ally").
- **Board AI**: behaviour (aggressive / guard / wander / static), aggro range, wander radius,
  pack, board abilities with chances, dormant.
- **Its own items** – only enemies carry items of their own (heroes share the party inventory).
  Three lists (user decision):
  - **uses**: items the enemy has and uses in battle (item + count; its AI decides when – an AI rule
    with "use item", game-design §12.5).
  - **can be stolen**: item + probability (Steal / Mug) – `steal` today.
  - **drops**: item + probability after defeat – `drops` today.
- **Rewards**: EXP, gold.

### 7.3 NPCs
Name, description, graphics, optional stats (for fights and steals), steal list. Where the NPC is
placed (events on maps) is listed with links.

---

## 8. Items – one form for everything

All items today share one shape (`items.yaml`): basic fields plus optional **equip**, **battle
use**, **board use** and **learn** parts. The editor shows exactly that as one form with
switchable sections:

1. **Basics** (always): name, icon (picker from the icon sheet), flavour text, price, and
   **Quest item** (a toggle: quest items can't be sold and are listed last in the inventory –
   stored as category `key`).
2. **Equipment** (optional): slot (weapon / armor / accessory), kind (sword, staff, dagger, claw,
   heavy armor, light armor, robe, shell, accessory – the kinds classes list), stat bonuses (the
   seven stats, negative allowed), element (weapons), abilities granted while equipped (e.g. Cut,
   Fire), on-hit status + chance, status immunities.
3. **Use in battle** (optional): **target** in words – *one enemy, one ally, the user, all
   enemies, all allies (the party), a fallen ally, anyone* – and a list of **effects**.
4. **Use on the board** (optional): range pattern (with preview), area pattern, what it can target
   (heroes, enemies, NPCs, fallen heroes, any cell, traps, plants), wild boards only, and effects.
5. **Teaches an ability** (optional): ability + the classes that can learn it (a scroll).

**Effects** are one list editor used everywhere (items, abilities, enemy skills), each row one of
the game's effect types with its fields: *damage* (physical/magical, power, base, element, ignore
DEF), *fixed damage* (amount, element), *heal* (base, scale), *heal %*, *restore MP*, *apply status*
(status, chance, turns), *cure status* (list or all negative), *revive* (% HP), *field effect*
(effect, rounds), *freeze* (effect, rounds, size), *lightning* (power, reach), *cut*, *place trap*,
*steal*, *reveal stats*, *discover* (radius), *defuse*, *learn ability*. "No effect" = an empty list
(a quest item or a flavour item has no use sections at all).

**Presets** make common items one click: Healing potion, MP potion, Cure, Revive (Phoenix Feather =
battle: a fallen ally, revive 25 %; board: fallen heroes next to you, revive 25 %), Attack item
(elemental damage to one / all enemies), Status item, Field item (fire / ice / glue on the board),
Weapon, Armor, Accessory, Scroll, Quest item.

**Category** (which inventory tab and shop sign it gets) is derived from the sections – equipment →
weapon/armor/accessory by slot, teaches → scroll, quest item → key, a battle use aimed at enemies →
battle, otherwise consumable – and can be overridden. The category follows the sections as long as
it is the derived one; once overridden it stays (the field says "automatic" or offers to go back).

**The screen.** The list on the left (search, grouped by category, the library's items marked)
with **New ▾** (Empty or a preset) at the top; the selected item's form fills the middle – the
basics, then one box per section with a switch to add or remove it; the inspector shows the item
as the game does (icon, name, category, price, text) and what it does in words ("Battle: one ally –
heal 50 HP"), with **Duplicate** and **Delete**. Library items are read-only: the form is shown
greyed out with **Copy to project** (projects.md §2). The id is set when the item is made (from its
name); renaming comes with E9. Board ranges and areas are picked from the patterns, with a small
grid preview of the cells they reach from the user (an inline pattern shows as "custom", edited in
YAML).

---

## 9. Quests

Quests are separate from events (`quests.yaml`); events and dialogs start and advance them with
actions and read them with conditions.

- Quest: title, description, parent quest (sub-quests), locked (the player can't switch to
  another quest while it is active), on-start actions.
- **Steps** in order: objective text, *done when* (condition builder), lock (no switching during
  this step), on-start / on-complete actions.
- **Endings** (optional, first match wins): id, condition, hidden, on-complete actions.
- A **flow view** shows the step chain and which events/dialogs start, advance or check the quest
  (found by scanning all actions and conditions).

**The screens** (E7) have the layout of the other content screens (§7): the list, the form in the
middle, the inspector. Quests are listed as main quests with their sub-quests below them; the form
has the quest's fields, then one box per step (objective, *done when*, lock, on start / on
complete) and the endings; the inspector is the flow view – the steps as a chain, each with its
condition in words, and every place that starts, advances or checks the quest, with links.

---

## 10. Dialogs, shops, abilities, settings

- **Dialogs**: a dialog is a script (game-design §10.2) edited with the same step editor as the
  entities' events – *say* (speaker, text with the game's markup), *question* (options with
  conditions and steps), *if / else*, actions, *wait*, *continue in* another dialog, *end*. Every
  line said shows a **live preview of the game's text box** (the pixel font, colours, the face and
  name; placeholders filled with sample values) and warns when it doesn't fit the box. The list
  groups dialogs by file (New puts one into the file of the selected one); the inspector shows the
  links around the dialog – where it is opened (entities, quests, other dialogs) and where it
  continues – each with a link.
- **Shops**: name, sign type, item list (picker, reorder); the inspector shows the goods as the
  shop window lists them (icon, name, price) and the entities that open the shop, with links.
- **Abilities**: name, type (the menu it is listed under: Magic, Sword Art …) and group, MP, icon,
  description, offensive (automatic from the effects, or set), battle use and board use – the
  same boxes as items (target, effects; swallow and summon for enemy skills). The inspector says
  what it does and who has it: the classes that learn it (at which level), the items that grant or
  teach it, the enemies that use it. A `special` ability (join / leave party) is shown, not edited.
- **Settings**: `config.yaml` as one form of boxes – the game (title, music), the start (where it
  is: the Game start entity, with a link to it – it is moved on the map, not typed in; party,
  gold, items, first quest), levels (max level, party size, the EXP curve with a chart), battle
  (the damage formula's constants with a worked example, hit / critical / first strike / ambush
  chances), shops and inn (inn price, sell ratio) and the board (burn floor, exploration round).

Statuses, field effects, patterns, chipsets and graphics sheets are read-only lists at first (see
§11).

---

## 11. Gaps – asked for, but the game can't represent it yet

These are skipped in the first editor version; each needs a game change first, to be discussed.

| Wish | Game today | Possible unification |
|---|---|---|
| ~~Enemies **using their items** in battle~~ – done with E6 | – | enemy `items: [{ item, count }]` + AI rules `{ action: item, item: <id> }`; each use consumes one for that battle (game-design §12.5) |
| Items with an **elemental "normal" type** vs typed | damage has an optional element; no element = normal | already representable (element "none") – no gap |

Content the editor won't edit at first (read-only, edited in YAML/tools as today):

- **Statuses, field effects, patterns** – few, rarely changed; a pattern painter can come later.
- **Chipsets and graphics sheets** – the art is generated by `tools/art`; the editor can pick from
  what exists but not draw new frames.
- **Map generators** – some maps were generated by scripts; once edited in the editor the YAML is
  the source of truth.

---

## 12. Work packages

| # | Package | Content |
|---|---|---|
| E1 | Foundation | `editor/` app, dev-server file API, project model (YAML documents, dirty files, save/revert, undo), shell layout, live validation |
| E2 | Play-testing | game boot hook (`?editor=`), content over `postMessage`, Play, Quick Play + Quick Play entity |
| E3 | Map editor | canvas (iso + grid), layers, terrain/height/decor/shape/facing/overhead tools, map properties incl. music |
| E4 | Entities | all entity kinds, event pages with condition/action builders, exits/teleports |
| E5 | Items | unified item form, effect editor, presets |
| E6 | Characters | heroes (+ class), enemies (AI, board AI, drops/steal), NPCs, graphics previews |
| E7 | Quests & dialogs | quest steps/endings/flow, dialog node editor with preview |
| E8 | Abilities, shops, settings | remaining content screens |
| E9 | References | rename id everywhere, "where used", delete protection |
| R1–R7 | Entities & teleports rework | teleports, wall signs as decor, script runner, entity states, handlers, presets & migration, state / handler editor (packages.md) |

Order: E1 → E2 → E3 → E4, then E5–E8 in any order, E9 alongside.

## 13. Decisions

1. **Same files, no separate format** – the editor edits the project's `data/**/*.yaml` in place, keeping comments.
2. **Entities are a view**: exits, spawns, enemies, gates, switches, traps, signs and events are all
   entities in the editor but stay in their own lists in the data (no data migration needed).
3. **No new scripting language**: events use the existing condition/action system; the editor gives
   it builders. A real scripting layer is only worth it once builders can't express something.
4. **Play-tests use unsaved content**, sent to the game over `postMessage`; the game only gets a
   small opt-in boot hook.
5. **Quick Play lives in the map file** under `editor:` (one per map), ignored by the game.
6. **Hero page = hero + class**, with a warning when a class is shared. Abilities are defined by the
   class only; heroes hold no items of their own – only enemies do (user decision).
7. **One item form** with optional sections; the category is derived, quest item = `key`.
8. **Preact for forms, Phaser for the map canvas**, both in one Vite app next to the game (user decision).
9. **Three map modes** – Board, Decor, Entity – each with its own tools; W / S raise and lower, A / D
   turn, right mouse erases (holes, no decor, delete); sections as icons in the top bar; inspector
   tabs Edit and Info; Quick Play edited only through its entity (user decisions).
10. **Content screens share one layout** (E5, E6): list · form of boxes · the entry as the game shows
    it; library entries read-only with Copy to project; a hero whose class is shared gets **New
    class** (a copy for this hero) rather than editing the class under the others' feet.
11. **Chances are percentages in the editor** and fractions in the files (0.25 = 25 %).
12. **Edits patch the YAML** (E7): a form writes only the values that changed – a changed text keeps
    its node and quoting, steps added or removed are spliced into the list – so hand-written files
    keep their look line for line.
10. **Teleports** (user decisions): exit + arrival are one editor kind; arrivals come and go with what
    leads there; one-way by default, "way back" optional, arrivals one cell in front of exits; the
    starts are arrivals with a role (§6.3, §6.4).
11. **One entity per cell**: placing and duplicating only on free cells; the preview turns red.
