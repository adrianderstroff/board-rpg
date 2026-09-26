# Todo – design notes for later

Ideas that are designed but not built yet. When one is picked up, move its design into
[game-design.md](game-design.md), add a work package to [packages.md](packages.md) and remove it here.

## Prefabs: numbers as inputs
- **What:** a prefab's numbers (a trap's damage, the gold in a chest, a wait) chosen when it is
  placed, like its other inputs (game-design §10.5, editor-design §6.5).
- **Design:** in Save as prefab, a number of a script or condition can be *promoted to an input*
  (label, default = the number) – the Names list would get far too long if every number showed up
  by itself, so it stays opt-in: a small "input" toggle next to number fields, or picking them in a
  second list.
- **Open question:** where the toggle lives (the Save window, or the entity form itself).

## Prefabs: picking entity inputs on the map
- **What:** when a placed prefab asks for an entity (the gate a lever opens), choose it by clicking
  it on the map. Today the placing window offers a list of the map's entities (editor-design §6.5).
- **Design:** the input's field gets a "pick on the map" button: the window steps aside, the map
  highlights the entities that fit (events with states for a state reference, enemies for an
  enemy …), a click fills the field and brings the window back; Esc returns without a choice. The
  list stays as the fallback.
- **Open question:** whether entities placed by the same prefab in this placement can be picked
  too (they don't exist yet while the window is open).

## Prefabs: linked copies
- **What:** placed copies that follow their prefab – change the prefab (a better trap), every
  placed copy changes too. Today placing makes an independent copy.
- **Design:** a placed copy remembers its prefab (`prefab: lib:gate` plus its inputs' values and
  the ids it got); the editor re-places it when the prefab changes, keeping the copy's cell, ids and
  inputs. Edits to a linked copy either unlink it or are refused ("edit the prefab").
- **Open questions:** what happens to copies' own edits; saves that remember a copy's states when
  the prefab's states change.

## Map events (§10)
Today a map event is one cell with pages (`when`, last match wins) and a `trigger`:
`interact` (a hero moves onto the cell), `step` (a hero ends a move there), `auto` (map entry
and after every state change) or `none`. See game-design.md §10 and `core/script/interact.ts`.

### Pass-through triggers
- **What:** fire when a hero walks *through* the cell, not only when it stops there (a tripwire, a
  voice in the corridor, a cutscene when crossing a bridge).
- **Design:** `trigger: pass`. Checked for every cell of a move path, like crossing field effects
  (§7.4). If the page has a dialog or `stop: true`, the move ends on that cell first (the same way
  hidden traps interrupt a move, §7.5), so the rest of the path isn't walked behind a dialog.
- **Open question:** whether `pass` also fires on the move's final cell (then `step` would be the
  special case "stop here only").

### Area triggers
- **What:** one event covering a region: "entering the throne room", "anywhere on the beach".
- **Design:** events get an optional `area` instead of a single cell: a rectangle
  `{ x, y, w, h }` or a list of cells. `step` / `pass` fire for any cell of the area; `interact`
  stays single-cell. Pages and `once` work as today; `once` is per event, not per cell. An area can
  be marked with a map layer later if rectangles aren't enough.

### Who triggers
- **What:** events for enemies and NPCs, not just heroes (an escort reaching the gate, a monster
  stepping onto a pressure plate, an enemy crossing into a village).
- **Design:** `by: hero | enemy | npc | any` on a page (default `hero`). The trigger also passes the
  piece to the actions, so a script can react to *which* character caused it, e.g.
  `removeEvent` on the escort, or a `when: { piece: … }` condition.

### After a battle
- **What:** run a page directly after a fight, not indirectly through an `auto` page with a
  `defeated` condition.
- **Design:** `trigger: battleEnd` with optional `result: victory | defeat | escaped` and
  `enemy` / `piece` filters. It runs after the board has resolved the battle (fallen heroes lie
  down, the victor captures the cell), before the next turn.

### Timers and turn counts
- **What:** things that happen after a while: a bridge collapsing in round 5, reinforcements every
  3 rounds, a guard changing shifts while exploring.
- **Design:** `trigger: round` with `every: n` and/or `at: n` (board rounds, §7.1). While exploring
  freely there are no rounds, so it uses the exploration clock (`exploreRoundMs`, §8.10): one tick
  counts as one round. A per-map round counter is kept in the map's memory, so leaving and coming
  back doesn't restart it (or `reset: onEnter` if it should).

## Visuals
- **Characters behind low walls:** a hero standing right at a ship's near bulwark is drawn in front
  of it instead of half hidden behind it. Needs walls and characters sorted together (a split of the
  bulwark mesh per edge, depth-sorted with the pieces).
- **Ship sails:** the Gull's masts still have furled sails; real square sails (directional decor,
  §5.9) would make the ship read at a glance.
