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
- ☑ Engagement confirm → battle transition → apply result (§8.4, §8.5)
- ☑ NPC interaction menu, exits with travel prompt (§8.8, §5.3)
- ☑ HUD: quest objective, round/actor, cell info (§16)

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
- ☑ End-to-end scenarios (`npm run e2e`): inn & revive, exits, save/continue, game over, shop/scroll/equip, steal, trap/freeze/slide, hidden quest ending, enemy AI

## P17 · Future (not started) ☑
- ☐ Map/data editor (visual) (§1)
- ☑ Touch controls: Back/Menu buttons, drag to pan, tap-to-preview targeting (§16)
- ☑ Map rotation in 90° steps (§16)
- ☑ Walk-through NPCs, interaction close-up, cancelable interactions (§8.3, §8.8)
- ☑ Mobile: fullscreen + landscape lock on first tap, portrait hint, web app manifest (§16)
- ☐ Desktop (Tauri/Electron) and mobile (Capacitor) packaging
- ☐ Localization of data texts
- ☐ More classes, boards, enemies
