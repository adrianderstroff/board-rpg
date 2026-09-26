# Packages

Every actionable piece of [game-design.md](game-design.md) belongs to exactly one package below. Packages are ordered bottom-up: each one only depends on packages above it. `§` refers to the design document.

Status: ☐ open · ◐ partial · ☑ done

Layering (see also [architecture](../CLAUDE.md)):
```
 data/ (YAML)          public/assets/ (PNG)
      │                       │
 src/core   ← pure rules, no Phaser (P1–P9)
 src/engine ← generic Phaser toolkit, no game rules (P10–P11)
 src/game   ← scenes/controllers wiring core + engine (P13–P15)
```

---

## P0 · Project foundation ☑
- ☑ TypeScript + Vite + Phaser 4 + Vitest setup, npm scripts (`dev`, `build`, `test`, `typecheck`)
- ☑ Folder layout `src/core`, `src/engine`, `src/game`, `data/`, `public/assets/`, `tools/`
- ☑ CLAUDE.md with architecture rules
- ☑ Relative build base for desktop/mobile wrappers

## P1 · Core utilities ☑
*Depends on: P0*
- ☑ Grid math: `Pos`, directions (4/8), Chebyshev/Manhattan distance, keys (§5, §6)
- ☑ Seeded RNG stored as state (`next`, `int`, `chance`, `pick`, `shuffle`) (§17)
- ☑ Typed event list for rule results (core returns events, renderer plays them)
- ☑ Small helpers (clamp, deep clone)

## P2 · Data layer ☑
*Depends on: P1*
- ☑ YAML loader (Vite `import.meta.glob` raw imports; works in tests and browser) (§17)
- ☑ Definition types for classes, abilities, items, patterns, statuses, enemies, npcs, shops, dialogs, quests, chipsets, charsets, maps, config
- ☑ `Database` registry with lookups and helpful errors for unknown ids
- ☑ Validation pass: cross-references (ability ids in classes, item ids in shops, pattern ids, map exits → maps, dialog ids…) reported at startup and in a test
- ☑ Data files: `classes`, `patterns`, `statuses`, `abilities`, `items`, `enemies`, `npcs`, `shops`, `config` (§3, §4, §6, §13, §14, §18)

## P3 · Game state & persistence ☑
*Depends on: P1, P2*
- ☑ Single serializable `GameState`: heroes, inventory, gold, flags, vars, quests, board state, map memory, kill records, revealed enemy types, RNG, play time (§17)
- ☑ New-game factory from `config.yaml` (starting heroes, items, gold, map)
- ☑ Save/load with versioning via `SaveStorage` interface (localStorage impl; 3 slots) (§11)
- ☑ Condition evaluator (§10.1) – shared by exits, events, quests (moved here from P9 because P7 needs it)

## P4 · Characters & stats ☑
*Depends on: P2, P3*
- ☑ Character model for heroes, enemies, NPCs (§3)
- ☑ Effective stat calculation: class base + growth, equipment, status modifiers (§3.1)
- ☑ EXP curve, level-ups with stat gains and ability learning by level (§3.1, §12.4)
- ☑ Equipment slots (weapon/armor/accessory), class restrictions, granted abilities (§14.1)
- ☑ Status model: apply/refresh/remove, immunities, turn ticks, scope & persistence rules (§4.2)
- ☑ Element multipliers (§4.1)
- ☑ Known ability list (class + learned + scroll + equipment) (§13)

## P5 · Patterns & board geometry ☑
*Depends on: P1, P2*
- ☑ Board grid model from map layers: terrain, height, holes, blocking decor (§5.1)
- ☑ Height rule for steps and leaps (§5.1)
- ☑ Pattern resolver: `walk`, `ray`, `leap`, `area`, `include`, flags `ignoreHeight`/`ignoreBlocking`/`includeOrigin` (§6)
- ☑ Pattern reach and reach cutoff (§6, §8.2)
- ☑ Shortest path to each reachable cell (BFS through pattern step graph) (§6)
- ☑ Party pattern union with smallest-reach cutoff (§8.2)
- ☑ Occupancy rules: allied passable, hostile = engagement target, NPC = interaction target (§8.3)

## P6 · Effects, abilities & items ☑
*Depends on: P4, P5*
- ☑ Effect pipeline shared by abilities and items with context (`battle` | `board`) (§13.2)
- ☑ Effects: damage (physical/magical/fixed, element, crit, hit), heal, healPercent, restoreMp, applyStatus, cureStatus, revive, fieldEffect, placeTrap, steal, reveal, learnAbility (§12.3, §13.2)
- ☑ Ability usability checks (MP, silence/sleep, scope, target filter) (§13.1)
- ☑ Inventory: add/remove/count, categories, key items unsellable (§14.1)
- ☑ Equip/unequip from inventory (§14.1)
- ☑ Scrolls: learn ability if class eligible and not known (§14.1)
- ☑ Shop logic: buy/sell, sell price 50%, equip comparison data (§15)
- ☑ Inn logic: price, full restore, revive, cure (§15)

## P7 · Board rules ☑
*Depends on: P4, P5, P6*
- ☑ Board state from map: pieces (hero/enemy/NPC), parties, facing, field effects, traps (§5, §7)
- ☑ Turn order by SPD with party slots at slowest member, ties heroes first then seeded random (§7.1)
- ☑ Per-character turn flags: moved / ability used; items unlimited; end turn (§7.2)
- ☑ Move action with path, confirm/cancel via state snapshot (§7.3)
- ☑ Field effects on landing, burning per-turn tick, durations per round (§7.4)
- ☑ Frozen sliding (§7.4)
- ☑ Sticky/Stuck reach reduction (§4.2, §7.4)
- ☑ Traps (§7.4)
- ☑ Board ability use with range/area patterns and target filters (§13.1)
- ☑ Board item use with range pattern (§14.1)
- ☑ Join / Leave party, party movement once per round (§8.1, §8.2)
- ☑ Engagement detection → battle request with type (normal/first strike/ambush) and participants (§8.4)
- ☑ Apply battle result to board: removal, capture move, escape return, fallen heroes, game over (§8.5, §3.4)
- ☑ NPC interaction: approach cell, interaction options (talk/shop/inn/steal) (§8.8)
- ☑ Exits: enabled condition, travel of all heroes to target spawn (§5.3)
- ☑ Status ticking at end of a character's board turn (§4.2)
- ☑ Board AI: aggressive, guard, wander, static; ignore hidden heroes; NPC wandering (§12.5)
- ☑ Board KO rules: heroes stop at 1 HP, enemies KO → shared EXP/gold (§7.4)
- ☑ Targetable NPCs auto-resolved battles (§8.9)
- ☑ Enemy parties joining/leaving via AI (§8.7): pack animals join allies, stuck members leave
- ☑ Enemy board abilities chosen by the AI (§12.5, §13.3)
- ☑ Free exploration without enemies: unlimited walking, per-action time ticks, timed NPC wandering, party steal (§8.10)

## P8 · Battle rules ☑
*Depends on: P4, P6*
- ☑ Battle state: combatants, sides, type, round queue (§12.1)
- ☑ SPD ordering with jitter, ambush/first-strike opening round (§12.1)
- ☑ Commands: Fight, Ability, Item, Run (§12.2)
- ☑ Formulas: physical/magical damage, crit, hit, elements, heal, steal (§12.3)
- ☑ Status effects in battle: skip turns, ticks, sleep break on damage, hidden untargetable (§4.2)
- ☑ Battle AI: weighted conditional actions, target rules (§12.5)
- ☑ Victory rewards: EXP split, gold, drops, level ups; defeat; escape (§12.4)
- ☑ Battle event log for the renderer (§12.1)
- ☑ Guest (NPC) combatants (§8.9)

## P9 · Events, dialog & quests ☑
*Depends on: P3, P6, P7*
- ☑ Action executor (§10.2)
- ☑ Map events with pages, triggers (`interact`, `step`, `auto`) (§10.3)
- ☑ Dialog graph: say/choice/actions/branch/goto; variables (§9)
- ☑ Text markup parser → styled spans (color, size, wave, shake, rainbow, speed, pauses, variables, escapes) (§9)
- ☑ Quest engine: steps, onStart/onComplete, endings incl. hidden, hierarchical, single active quest, switching & locks (§10.4)
- ☑ Kill records / talked-to records for conditions (§10.1)

## P10 · Engine foundation ☑
*Depends on: P0 (no game rules)*
- ☑ Phaser boot, 480×270 virtual resolution, integer scaling, pixel-art rendering (§16)
- ☑ Asset manifest loading (charsets, chipsets, faces, battlers, system) from data definitions (§17)
- ☑ Unified input: keyboard + pointer → actions (`up/down/left/right/confirm/cancel/menu`) (§16)
- ☑ Isometric projection math, depth sorting (§5)
- ☑ Iso map renderer: stacked height blocks from chipset, decor, exit arrows, highlight overlays, field-effect overlays (§5, §13.3)
- ☑ Charset sprite animation (4 directions × 3 frames, RM2000 layout) and walk/jump tweens along paths (§6)
- ☑ Camera follow/pan (§7.2)
- ☑ Bitmap font + rich-text renderer (per-glyph color/size/wave/shake/rainbow), typewriter (§9)
- ☑ UI widgets: window frame, list menu with cursor, gauges (HP/MP/EXP), portrait frame, number popups (§11, §12, §16)
- ☑ Scene transitions (fade/flash) (§2)
- ☑ Gamepad input: standard mapping, D-pad/stick repeat (§16)
- ☑ Audio manager: music crossfade, SFX with throttling, volumes (§16)

## P11 · Art pipeline ☑
*Depends on: P0*
- ☑ Procedural pixel-art generator (`tools/art`) writing PNGs – placeholder art that follows final sheet layouts
- ☑ Charsets: 4 heroes, villagers, elder, child, guard, shopkeepers (smith/merchant/mage/innkeeper), scorpion, condor, emperor scorpion (§15, §18)
- ☑ Chipset: desert iso blocks (sand, dunes, stone, adobe, roof, grass, water, quicksand, path, rock) + decor (palm, cactus, rocks, well, stalls, crates, barrels, signs, chest) (§18)
- ☑ Battlers (side view) for heroes and enemies (§12.1)
- ☑ Faces 48×48 for heroes and named NPCs + generic (§9)
- ☑ System: window skin, cursor, cell highlight, exit arrows, field effect overlays, icons, bitmap font, battle backgrounds (§16)
- ☑ Procedural chiptune audio generator (`tools/audio`, `npm run audio`): 28 SFX, 5 music loops (§16)

## P12 · Content data (demo) ☑
*Depends on: P2 formats*
- ☑ Chipset & charset definitions (graphics ↔ logic mapping) (§17)
- ☑ Map `sandhollow` (peaceful village) (§18)
- ☑ Map `scorpion_dunes` (wild) (§18)
- ☑ Dialogs for all NPCs, shop greetings, quest dialogs (§18)
- ☑ Quests: Road to the Oasis, Clear the Dunes (hidden ending), Nia's Charm (§18)
- ☑ Shops: weapons/armor, items, magic; inn (§15)

## P13 · Board scene ☑
*Depends on: P7, P9, P10, P11, P12*
- ☑ Render board state; animate core events (move, slide, jump, status, damage popups, KO)
- ☑ Cursor: jump to active hero, free roam, cell info (§7.2, §16)
- ☑ Command box Move/Ability/Item/Stats/End Turn with once-per-turn rules (§7.2)
- ☑ Move selection with highlights, path walking, confirm/cancel (§7.3)
- ☑ Ability menu by type → group → ability with live range preview, target selection (§13.1, §16) – shared with battle
- ☑ Join Party walk animation, enemy ability area flash
- ☑ Item menu with range targeting (§14.1)
- ☑ Stats window for any character (hidden values for unrevealed enemies) (§16)
- ☑ Enemy/NPC turns via board AI with camera follow (§12.5)
- ☑ Engagement (no confirm, moving onto an enemy attacks) → battle transition → apply result (§8.4, §8.5)
- ☑ NPC interaction menu, exits with travel prompt (§8.8, §5.3)
- ☑ HUD: quest objective, round/actor, cell info (§16)
- ☑ Free exploration loop: tap to walk, select heroes, command box without turn entries, switch to/from tactics (§8.10)

## P14 · Battle scene ☑
*Depends on: P8, P10, P11*
- ☑ Side-view layout (enemies left, heroes right), battle background (§12.1)
- ☑ Hero status panel (portrait, name, HP, MP, EXP) always visible (§16)
- ☑ Command window Fight/Ability/Item/Run with target selection (§12.2)
- ☑ Message box for enemy actions and HP changes (§16)
- ☑ Action animations (step forward, flash, damage numbers, KO fade)
- ☑ Opening banner Ambush / First Strike (§12.1)
- ☑ Victory screen (EXP, gold, drops, level ups), defeat, escape (§12.4)

## P15 · Dialog, menus, shops & meta scenes ☑
*Depends on: P9, P10, P13*
- ☑ Text box with portrait, name, typewriter, markup effects, choices (§9)
- ☑ Main menu (board, hero turn only): Heroes (stats/equip/abilities), Items (use/scroll), Quests & Save, System (§11)
- ☑ Shop screen: buy/sell with equip comparison (§15)
- ☑ Inn prompt (§15)
- ☑ Title screen (new game / continue / load), Game Over screen (§3.4)
- ☑ Quest switching UI with lock handling (§10.4)

## P16 · Quality & verification ☑
*Depends on: all above*
- ☑ Unit tests for core packages (patterns, parties, turn order, field effects, battle formulas, quests, dialog markup, data validation)
- ☑ Scripted playthrough test: new game → talk to elder → travel → fight → win (core only, headless)
- ☑ Browser smoke test with screenshots (Playwright, `tools/smoke.mjs`, manual run against the dev server)
- ☑ End-to-end scenarios (`npm run e2e`): inn & revive, exits, save/continue, game over, shop/scroll/equip, steal, trap/freeze/slide, hidden quest ending, enemy AI, free exploration, harbor search, river ice & stair fire, ruins traps/Discover/skeletons

## P17 · Future (not started) ☑
- ☐ Map/data editor (visual) (§1)
- ☑ Touch controls: Back/Menu buttons, drag to pan, tap-to-preview targeting (§16)
- ☑ Map rotation in 90° steps (§16)
- ☑ Walk-through NPCs, interaction close-up, cancelable interactions (§8.3, §8.8)
- ☑ Mobile: fullscreen + landscape lock on first tap, portrait hint, web app manifest (§16)
- ☐ Desktop (Tauri/Electron) and mobile (Capacitor) packaging
- ☐ Localization of data texts
- ☐ More classes, boards, enemies

## P18 · Board presentation II ☑
*Depends on: P10, P13*
- ☑ Unit rotation: per-cell textured meshes spin as one solid; decor/characters stay upright and ride along; facing switches half-way; overlays/cursor hidden during the turn (§16)
- ☑ Close-up floor per backdrop (`battlebacks.<id>.floor` in graphics.yaml) (§16)

## P19 · Changing terrain ☑
*Depends on: P7*
- ☑ Live grid: per-map terrain overrides (saved), walkability from field effects (§5.4)
- ☑ Freezable water: Frozen bridges water, ice under pieces persists, only freezing works on open water (§5.4)
- ☑ Fire: burns flammable terrain (`burnsTo`), spreads each round to 4-neighbours, melts ice (§5.4)
- ☑ Ice spell 3×3 / 4 rounds; Ice via scroll only (§13.3)
- ☑ View: terrain changes redraw cells (§5.4)

## P20 · Hidden things ☑
*Depends on: P7, P19*
- ☑ Ancient map traps: stop hero movement on the way, spent once (§7.5)
- ☑ Hidden events (invisible chest), revealed by Discover (§7.5)
- ☑ Dormant enemies: look like remains, block, no turns, rise when heroes come close (stop the move), don't count for exploration (§7.5)
- ☑ Discover ability: sense within 3 (? markers), uncover target (§7.5)
- ☑ View/scene: ? markers, dormant rendering, rise/trap playback, interrupted moves skip close-ups/travel

## P22 · Cell rules II ☑
*Depends on: P19, P20*
- ☑ Field effects on crossing; start-of-turn effects anchored on the member who moved the piece (§7.4)
- ☑ Ice: walks end on the first ice cell and slip; melting under a piece puts it back ashore (§5.4)
- ☑ Ice shapes by size (water square / land line), Frost Shard like Ice, Ice 2/3 scrolls (§5.4, §13.3)
- ☑ Exploration clock for field effects; ice lasts longer there (§8.10)
- ☑ Skeletons rise when they can reach the party and ambush (§7.5)
- ☑ Discover reveals everything within 3 at once; Defuse → Snare item for wild boards (§7.5)
- ☑ Rotation: per-cell meshes without seams (§16)

## P21 · Demo expansion ☑
*Depends on: P11, P12, P19, P20*
- ☑ Art: harbor/forest/ruins/elf terrains & decor, sailors, captain, elves, elf mage, skeleton (charset, battler, face), backdrops harbor/forest/ruins/elvenglade (§18)
- ☑ Maps: Saltmere Harbor (start), Greenwood River, Elvenglade, Sunken Ruins; Sandhollow west gate (§18)
- ☑ Content: NPCs, dialogs, searchable barrels/jars, magic shop with Scroll: Ice, skeleton enemy, prologue quest *Into the Desert* (§18)
- ☑ Tests: unit tests for the mechanics, e2e scenarios for the new maps, playthrough start (§18)

## P23 · Water, lightning, plants ☑
*Depends on: P19*
- ☑ Shallow/deep water terrains; swimmer movement (`water` / `amphibious`) (§5.5)
- ☑ Lightning (Thunder board use, Zap): conduction through connected water/soaked cells ≤4 steps, damage falloff (§5.6)
- ☑ Soaked field effect; Seeds → brambles next round; Cut (sword-granted); decor overrides per map (§5.7)
- ☑ Enemy board AI: combos (spit then zap), seed rings

## P24 · Switches, gates, split floors ☑
*Depends on: P7*
- ☑ Gates & switches (weight, latch, openWhen, closeFlag) (§5.8)
- ☑ Together-exits and group travel (§5.3)

## P25 · Temple Mountain & the three tokens ☑
*Depends on: P21, P23, P24*
- ☑ Art: mountain/temple/pond/tower/jungle/dark tiles & decor, monks, islander, fishfolk, toad, produce enemies, bosses, shadows, backdrops; music (§18)
- ☑ Maps: Temple Mountain, Temple, Hall of Fears, Reed Pond, Endless Dunes, Mirage Sands, Mirage Tower F1–F5, Verdant Isle, Grove Garden, Mora's House (§18)
- ☑ Content: monks' alternating dialogs, quest *The Mountain Temple*, tokens, Holy Orb/Holy, ship to the island, enemies (§18)
- ☑ Tests: unit tests for the mechanics, e2e scenarios (§18)

## P26 · The Grave Toad (final boss) ☑
*Depends on: P25*
- ☑ Battle: swallow / digest / spit, untargetable victim, release when the swallower falls (§12.7)
- ☑ AI: priority rules, `cooldown`, `alone`, `boss` target; Empowered/Bolstered; summon with gold cost (§12.5, §12.7)
- ☑ Data & art: Grave Toad, Bone Acolytes, Bad Breath, Swallow, Raise Dead, buffs; `final` music, gulp/spit SFX
- ☑ Cave maps and the fight's place in the quest (§18)

## P27 · Shaped blocks: a ship that looks like one ☑
*Depends on: P3*
- ☑ Diagonal pieces (`shape` layer, cut corners), hull flare with water underlay, bulwarks open at gangways – static and while rotating (§5.9)
- ☑ The Gull: pointed bow, raised stern, bulwarks, steering wheel (decor `ship_wheel`)
- ☑ Directional decor: one frame per view, turning with the board (the wheel)

## P28 · Enemy levels and equipment ☑
- ☑ Optional `growth` and per-placement `level` (party shifts alike), rewards scale with level (§12.6)
- ☑ Optional enemy equipment with hero rules (stats, element, on-hit, immunities, grants); Fishfolk: Coral Spear + Scale Vest

---

# Rework: entities & teleports (game-design §10.3, editor-design §6)

## R1 · Teleports ☑
- ☑ Teleport kind: exit + arrival; Add → Teleport, destination in floating windows (map list, then placing the arrival on the map); way back with arrivals in front of the exits
- ☑ Exit form "leads to … Change…"; teleport actions pick their target the same way; icons per kind (exit, door, arrival, game start, Quick Play start)
- ☑ Starts as arrival roles (game start, Quick Play start – `editor.quickPlay.spawn`); no Spawn / Quick Play kinds
- ☑ Rename updates references; deleting cascades (exits to a deleted arrival, unused arrivals) as one undo step over several files; unknown teleport targets are problems
- ☑ Project transactions: edits on several files as one undo step (also kept across reloads)

## R2 · Wall signs in Decor mode ☑
- ☑ Signs placed on a block face in Decor mode (face with A / D, block with W / S); no Wall sign entity
- ☑ See-through preview on the chosen side (replacing a sign there); pick takes a sign; "faces away" note

## R3 · Script runner ☑
- ☑ Sequential scripts with if / elif / else, choice (icons), say, wait, dialog call, stop; a question pauses the script and the answer resumes it; dialogs run as scripts (existing content unchanged); not saved half-way (decision 41)
- ☑ Script editor: blocks (say, question with options, if / else, wait) with nested steps
- ☑ Game: text, pauses and questions (icons) from scripts; effects inside dialogs are played

## R4 · Entity states ☑
- ☑ States (look, passability) saved per map; `setState` action, `state` condition; the current state is the event's page for the board (pieces, close-ups, occupancy)
- ☑ Walk-through entities are stood on (no close-up); a solid state waits until its cell is free
- ☑ Validation: looks, handler scripts, state names and entities named in conditions / actions

## R5 · Handlers & triggers ☑
- ☑ Interact (options or a script), enter, leave, pass over (stops hero moves, not flying ones), map loaded, condition becomes true; `once`; `heroesOn` condition; chained handlers settle in one go
- ☑ State-level hidden (Discover)
- ☑ Damage / heal (with status, the heroes here or the party, a trap cue)
- ☑ New actions: move an entity / hero piece, face, show / hide, camera, sound / music, fade / flash / shake, emote, add / remove party member, enable / disable exit
- ☑ Enemies' *defeated* handlers (enemy form: Events)

## R6 · Presets & migration (◐)
- ☑ Gate and floor switch: entity presets on the Add buttons; content migrated (13 gates, 6 plates); the gate / switch rules and lists removed; tests and e2e read entity states
- ☑ Editor: conditions "entity is in state" / "heroes stand on", action "set an entity's state"
- ☑ Paged events converted to states and handlers (81 events; saves keep what has run)
- ☑ Hidden traps as entities: preset, content migrated (3), hidden states, trap mark, *avoid*; Discover / Defuse through "ability used" handlers; damage / heal actions
- ☑ Map-level handlers: `onEnter` and 23 controller entities moved into the map's `on` (Info tab: Events)

## R7 · State and handler editor ☑
- ☑ Appearance: states as folder tabs (★ starting state, rename – handlers follow, duplicate, delete), each with its look (sprite picker), facing, movement, passability; hidden
- ☑ Events: handlers as tabs – trigger, condition, close-up options and label (interact) or once, and the script (block editor from R3)
- ☑ New events are entities; duplicating one points its handlers at the copy; renaming updates the handlers that name it

# Projects (see [projects.md](projects.md))

## PJ1 · Library and the demo project ☑
- ☑ `library/v1/` (library.yaml, data, assets) and `projects/demo/` (project.yaml, data, assets); the runtime's own assets stay in public/
- ☑ Loader: library layer (keys get `lib:`) + project layer; asset paths per layer; `?project=` / `VITE_PROJECT`; the build copies the project's and its library's assets
- ☑ Content migrated to `lib:` references (validation proves it, now also terrain surfaces and melting); the rules' library needs in `builtins.ts` (validated); tests; save version 2
- ☑ Tools follow: art / audio generators, e2e, screenshots; editor reads the library read-only

## PJ2 · Projects in the editor ☑
- ☑ Editor file access per project (library read-only); project menu in the toolbar; New project from the library's template (`library/v1/template`) or as a copy; unsaved work kept per project; every project and the template are validated in the tests

## PJ3 · Export, import, shipping ☑
- ☑ What a project uses of its library (`content/bundle.ts`): transitive `lib:` references, trimmed library files, used assets
- ☑ `.brpg` export (project + used library content) and import (installs a missing library version) – project menu; `VITE_PROJECT=<id> npm run build` ships one project with only the used library content

## PJ4 · Importing resources ☑
- ☑ Resources screen: charsets, battlers, faces, battle backgrounds, music – the library's (read-only) and the project's own
- ☑ Import (button or drop): PNG / WAV copied into the project's assets, registered in its graphics.yaml with the layout worked out from the size (ASSETS.md); frame size / floor adjustable; delete
- ☐ Chipsets (terrain definitions with the sheet) – later

## PJ5 · Library content in the editor ☑
- ☑ Library badge and read-only forms (Resources); Copy to project for graphics and music (the file too) – references follow by field (`content/refs.ts`), one undo step
- ☑ `copyEntryToProject` for content entries (heroes, items …) – its buttons come with the E5–E8 screens
- ☑ Library versions in the project menu: moving to another version is checked first (what it lacks is listed; nothing moves then)

# Prefabs (game-design §10.5, editor-design §6.5)

## PF1 · Prefabs as content ☑
- ☑ `prefabs` collection (library + project; `lib:` ids): events / enemies / exits, relative cells, `$` placeholders (also inside longer strings); validation; placing = fresh ids + rewired references (core/data/prefab.ts, shared by editor and game)
- ☑ Library prefabs: gate, floor switch, plate and gate, hidden trap, snare trap

## PF2 · Prefabs in the game ☑
- ☑ Entities made during play (map memory `spawned`, saves); `placePrefab` effect; enter / leave / pass `by: heroes | enemies | anyone`; damage "here" = whoever stands there (enemies can die of it)
- ☑ Snare and the Trap skill place `lib:snare_trap`; the runtime trap list and its rules removed

## PF3 · Prefabs in the editor ☑
- ☑ Entity panel: Add entity (Event, Enemy, Teleport ▾ with the starts, Prefab icon button + picker) and Entities headings; footprint preview (the prefab's looks) while placing
- ☑ Save as prefab (entity form's bar; the Select tool's area) into the project's prefabs.yaml; handlers' *By* field
- ☑ Save as prefab window: description, icon, anchor, and per copy / shared for every id, flag and variable the entities use (no more implicit "starts with an id" rule)
- ☑ Groups: Shift+click, a rectangle on empty cells; drag to move them all; group panel with anchor, Save as prefab, Duplicate group, Delete group (editor-design §6.6)

## PF4 · Prefab inputs ☑
- ☑ Per copy flags / variables really renamed on placement (named after an entity: follow it; else a free name)
- ☑ `inputs` (label, type, default) – entity, flag, variable, item, dialog, shop, enemy, music; defaults during play; validation (scripts checked with the defaults)
- ☑ Save as prefab: every value the entities use with its mode (per copy · fixed · on placement) – outside entities and content found too; tooltips per mode
- ☑ Placing: a window asks for the inputs (defaults filled in); entity inputs from the map's entities

# Distribution (see [distribution.md](distribution.md))

## DS1 · Editor storage ☑
- ☑ One implementation of the project operations on a file tree (`editor/src/storage/ops.ts`: list, create, load, save, assets, export / import, library versions); the dev server only reads, writes and lists files
- ☑ Storages: dev server, a folder (File System Access API), the browser (IndexedDB) – the library bundled with the editor; the demo copied into a new browser storage; an empty folder starts with a project from the template
- ☑ Project assets as blob: URLs (the editor's canvases, the play-test tab); the storage shown and switched in the project menu

## DS2 · The editor as a static site ☑
- ☑ `npm run build:editor` → `dist-editor/` (the editor at editor/, the runtime's assets beside it, the library bundled); ▶ Play opens the game at `VITE_GAME_URL` (the website: ../play/)

## DS3 · The player ☑
- ☑ The game starts from a `.brpg` (`content/brpg.ts`: content from the zip, assets as blob: URLs); `npm run build:player` → `dist-player/` (no game of its own: a start screen – drop a game or open one); each game keeps its own save slots
- ☑ `apps/player/`: Tauri app – file association, a `game.brpg` beside the executable, the start screen otherwise; built and tried on Windows (9 MB app, 3 MB installer)
- ☐ macOS: games opened with the app while it runs ("open with" events) – with the release builds

## DS4 · The website ☑
- ☑ `npm run build:site` → `site-dist/`: landing page (features, screenshots from tools/screenshots.mjs and tools/editor-screenshots.mjs), `/editor/`, `/play/` (a play-test from the editor gets every library asset from the editor build), `/download/` (GitHub Releases API)

## DS5 · Releases ☑
- ☑ `.github/workflows/release.yml`: a version tag (`v0.1.0`, matching tauri.conf.json) builds the player for Windows, macOS (universal) and Linux (tauri-action) into a GitHub Release
- ☑ `.github/workflows/site.yml`: every push to main runs the tests, builds the site and deploys it to Pages (https://adrianderstroff.github.io/board-rpg/)

# Editor (see [editor-design.md](editor-design.md))

## E1 · Editor foundation ☑
- ☑ `editor/` app (own Vite entry, Preact), dev-server file API (`data/` only), project model: YAML documents, dirty files, save/revert, undo/redo (typing and strokes merge)
- ☑ Saving changes only the edited lines (alignment, comments, line endings kept)
- ☑ Shell layout (navigation, toolbar, inspector), live `validateContent` problems; Maps list + properties (music with preview)

## E2 · Play-testing ☑
- ☑ Game boot hook `?editor=`: content over `postMessage`; play-tests use their own save slots
- ☑ Play (title → New Game) and Quick Play (current map, Quick Play settings: position, party/levels, items, abilities, flags, gold) – set in the map inspector for now, placed on the canvas with E4

## E3 · Map editor ☑
- ☑ Canvas: isometric (the game's own map source + engine renderer, rotation, zoom, pan, game board cursor) and a flat grid view
- ☑ Layers: terrain (incl. holes), height, decor, decor facing, shape, door lintels; tools: pencil, rectangle, fill, pick; height raise/lower/set; resize (placed things move along)
- ☑ Area select → copy / paste (also between maps) / move (entities along) / clear, across all board layers
- ☑ Map properties: name, kind, chipset, battleback, music (with preview); onEnter comes with the action builder (E4)
- ☑ Smooth view turns like the game; top view zoom/pan and centring; brush preview (terrain block cut to its piece at the brush height, decor facing) – W/S/A/D change the brush while it shows; the other layer greyed out; holes pickable with a white grid; first map opened on start
- ☑ Picking by drawn column (tall walls' sides); thin smooth grid lines in both views, also while turning; tool icons and grid / decor toggle icons in the strip
- ☑ Map info as a table (Peace / Wild, ▶ music, battle background row); size stepper previewed in the size text and on the canvas, new cells empty; x / y axis gizmo; rectangle and fill preview the whole area
- ☑ Reworked layout (user request): sections as icons in the top bar; Board / Decor / Entity modes with their own tools; W/S height, A/D turn, right mouse erases; Edit / Info tabs; top view with unwarped terrain textures; decor ghost preview and greyed-out board

## E4 · Entities ☑
- ☑ Entities layer: every kind drawn with the game's sprites (editor-only markers as labels), select / cycle / drag / place / delete
- ☑ Forms: events (pages with condition, look, trigger, dialog, close-up options, actions), exits/teleports, spawns (rename), enemies (party, level, condition), gates & switches (links), traps, wall signs, Quick Play start
- ☑ Condition and action builders (all condition and action kinds, nested all/any/not, flag suggestions); map `onEnter`
- ☑ Inn wake-up spot: map, spawn point and facing (`wakeAt.dir`, new in the game)

## E5 · Items ☑
- ☑ Items screen: list by category (search, library marked), New ▾ (Empty or a preset), one form – basics (icon picker, quest item), equipment, battle use, board use (pattern pickers with a cell preview), teaches; the category follows the sections until overridden; the inspector shows the item as the game does and what it does in words; Duplicate / Delete; library items read-only with Copy to project
- ☑ Effect list editor (forms/EffectList, shared with abilities later) and presets (healing / MP potion, cure, revive, attack, status, field item, weapon, armor, accessory, scroll, quest item)
- ☑ Checkboxes across the editor in its own style (the box-check look)
## E6 · Characters ☑
- ☑ Heroes: hero + class on one page (shared-class banner, library class read-only with Copy class to project, New class from the current one), stats per level with the game's formula and start equipment, abilities by level, movement preview, equipment kinds, start equipment (only what the class wears), starting party
- ☑ Enemies: stats with growth and a preview at another level, resistances, immunities, permanent statuses, equipment, movement / swimming, battle AI rules in plain words, board AI, its items (uses / stolen / drops), rewards, boss music
- ☑ NPCs: graphics, optional stats, movement, attacked by enemies, steal list, where it stands (links open the map with the entity selected)
- ☑ Graphics picked from thumbnails; previews: walking in four facings, battle poses, face sizes
- ☑ Game: enemies carry items into battle and use them (`items`, AI rules `action: item`, game-design §12.5); library immunities got their `lib:` prefix back and are validated
## E7 · Quests & dialogs ☑
- ☑ Quests: main quests and sub-quests, the quest's fields and on-start script, one box per step (objective, id, done when, lock, on start / on complete folded to words until opened), endings; the flow view: steps in words, endings, sub-quests, and every place that starts, sets, completes or checks the quest – with links
- ☑ Dialogs: listed by file, New (in the file of the selected one or a new file), the step editor with a live preview of every line in the game's text box (window, face, name, pixel font, colours, sample placeholders; warns when it doesn't fit); who opens it and where it continues, with links; speakers: the event's own, the narrator, a character or any name
- ☑ Where-used lookup for every kind of content (editor/src/references.ts, quests and dialogs added to content/refs.ts) – the base for E9
- ☑ Edits patch the YAML: only changed values are written, texts keep their quoting, added / removed steps are spliced in
## E8 · Abilities, shops, settings ☑
- ☑ Abilities: list by menu, New ▾ (empty or a preset), one form (icon, menu and group, MP, offensive automatic or set, the special rule shown), the battle and board boxes shared with items (swallow / summon for enemy skills); the inspector says what it does and who has it (classes by level, items granting / teaching, enemies)
- ☑ Shops: name, sign, goods (with price and category); the inspector shows the shop window and the entities that open it, with links
- ☑ Settings (config.yaml): title and music; the start (shown with a link to the Game start entity), party, gold, items, first quest; max level, party size, the EXP curve with a chart; the damage formula with a worked example, chances; inn price, sell ratio; burn floor, exploration round
## E9 · References ☑
- ☑ Rename id on every content screen (items, heroes, enemies, NPCs, abilities, shops, quests, dialogs) and for maps (Info tab – the file moves, deleted on Save): the key keeps its place, every reference in the project's files is repointed, one undo step
- ☑ "Used in": every place an entry is used – the project's and the library's – with links to the map entity or the entry (editor/src/references.ts; NPCs, shops and maps added to content/refs.ts)
- ☑ Delete protection: Delete waits while anything outside the entry still refers to it (the tooltip says how many; the list shows where)
- ☐ Later: renaming classes, resources (graphics, music – their files would move too), statuses and patterns

# Graphics (see [graphics.md](graphics.md))

## G1 · Tiles ☑
- ☑ Graphics & music screen (Resources renamed): Tiles – a chipset's terrains and decor as thumbnails with tags (blocks, water, surface); terrain rules (walkable, water, surface, freezable, flammable → burns to, frames, fill, animation, sink, ship hull), decor rules (blocks, flammable, cuttable, rotations); what uses a piece, Delete when unused
- ☑ Preview on a small board with the game's renderer (a flat patch and a raised step; decor standing), turned through the four view rotations; New terrain / decor (a copy of the selected, its picture in a new frame of the sheet); Copy chipset to project (both sheets, the maps follow); import a tile sheet as a new chipset; maps pick their chipset (Info tab)
- ☑ Changed images reach every view: asset versions bust the caches (editor URLs, the dev server, the map canvases)

## G2 · Pixel editor ☑
- ☑ One workspace over the editor (pixel/PixelEditor): frame strip with names, the frame zoomed (fits the window, +/−, Ctrl+wheel), checkerboard, grid; pencil (right button erases), eraser, fill, line, rectangle and filled rectangle, picker (Alt+click), selection (drag to move, Ctrl+C / Ctrl+V, Del), mirror drawing, flip, nudge (arrows), copy / paste frame, onion skin; colours in the image, the game's palette, any colour, transparent; its own undo / redo; Save image (Ctrl+S) writes the PNG – a library or game image becomes the project's copy on its first save, its uses follow; add frames (tiles, icons); pan big images (middle button / Space)
- ☑ Edit from Graphics (✎ Edit image) and ✎ where images are used: hero / enemy / NPC graphics, the icon picker (items, abilities), the Tiles inspector, the map editor's Board and Decor palettes

## G3 · Characters ☑
- ☑ Previews: board sprites walking in four directions, battle sprites on a battle background (idle breathing, each pose played on a click), faces at 48 / 24 / 14 px and in the text box; guides: the feet line and the middle

## G4 · Tiles and decor drawing ☑
- ☑ Guides: the block's diamond and side faces, decor's footprint and anchor, field effects' diamond; previews: a little board of the block (flat and stacked, its fill below, animation frames cycling) in four rotations, decor standing on ground (its rotation frames as the view turns), wall signs on a wall face, field effects animated on a cell, highlights / board cursor / exit arrows on the board

## G5 · Game images per project ☑
- ☑ Game: `graphics.yaml` system.images – the project's copies in assets/system/ replace the runtime's (engine setSystemOverrides; the game, play-tests, the player and builds); system.icons – the project's own icon names (BootScene uses them instead of icons.json); validated
- ☑ Editor: Graphics › Game images – icons (the sheet grows, new icons get names; names in use stay), status markers, title background (title screen preview), window skin (text box and menu), menu cursor, board cursor, highlights, exit arrows, field effects, shadow, font (sample text); Use the game's own again; the editor shows the project's copies everywhere (icons, text boxes, previews)

## G6 · Backgrounds ☑
- ☑ Battle backgrounds (the battle scene with the floor line and a hero and an enemy on it) and the title image (the title screen with its menu): one big frame, zoom and pan

## G7 · New sheets ☑
- ☑ New ▾ on Graphics: a blank board sprite (24 × 32 or 32 × 32 frames), battle sprite (6 hero poses or 4 creature poses), face, battle background – registered and opened in the pixel editor; New chipset (a plain ground block, empty decor sheet); starting from a library sheet = Copy to project; sheets grow by frames (tiles, decor, icons)
- ☐ Later: removing image files nothing uses any more (Revert undoes the data, not images already written)
