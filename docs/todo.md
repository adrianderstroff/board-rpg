# Todo – design notes for later

Ideas that are designed but not built yet. When one is picked up, move its design into
[game-design.md](game-design.md), add a work package to [packages.md](packages.md) and remove it here.

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
