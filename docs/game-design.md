# Board RPG – Game Design Document

> Working title. Pixel-art hybrid of a tactical board game and a classic JRPG (Shining Force meets Final Fantasy).
> This document is the single reference for *what* the game is. Implementation work is tracked in [packages.md](packages.md).
> Section numbers (§) are referenced from packages and code.

---

## 1. Vision

Heroes travel across **isometric boards** (villages, deserts, dungeons). On a board everything happens in **turns ordered by speed**, like a board game where every piece moves with its own **chess-like pattern**. When two hostile pieces collide, the game switches to a **Final-Fantasy-style side-view battle**. After the battle the game returns to the board.

Pillars:
1. **Positioning matters** – move patterns, heights, parties and field effects make the board a tactical puzzle.
2. **Classic JRPG depth** – classes, levels, equipment, spells, status effects, shops, quests.
3. **Data-driven & moddable** – everything (classes, abilities, items, patterns, maps, dialogs, quests) lives in editable text files; a visual editor can be added later.

Platforms: web first; desktop (Tauri/Electron) and mobile (Capacitor) later; consoles possible through a renderer port because rules are engine-independent.

---

## 2. Core loop

```
 Board (explore, talk, shop, position) ──contact with enemy──▶ Battle (FF-style)
      ▲                                                            │
      └──────────── victory / escape (rewards, level ups) ◀────────┘
 Quests steer where to go; exits lead to other boards.
```

---

## 3. Characters & stats

### 3.1 Stats
| Stat | Meaning |
|---|---|
| **Level** | 1–50. Raises base stats via class growth. |
| **HP / Max HP** | 0 HP = knocked out (KO). |
| **MP / Max MP** | Spent by abilities. |
| **STR** | Physical attack (+ weapon ATK). |
| **DEF** | Physical defense (+ armor). |
| **MAG** | Magical attack (+ weapon MAG). |
| **MDEF** | Magical defense. |
| **SPD** | Turn order on board and in battle; run chance. Modified by equipment. |
| **EXP** | Experience; next level at `expForLevel(L) = floor(12 · (L-1)^2.1)`. |

Effective stat = `class base + growth·(level-1)` (heroes) or fixed values (enemies), then `+ equipment`, then `× status modifiers`. Minimum 1 (SPD minimum 1).

### 3.2 Hero classes
Each class defines base stats, growth, a **move pattern** (§6), equipment types and abilities learned by level.

| Class | Role | Move pattern | Ability type | Equips |
|---|---|---|---|---|
| **Knight** | Tank, physical damage | `knight`: chess knight leaps (L-shape) + 1 orthogonal step (reach 2) | Sword Art | Swords, heavy armor |
| **Magician** | Magic damage/support | `diagonal2`: diagonal slide up to 2 + 1 orthogonal step (reach 2) | Magic | Staves/rods, robes |
| **Thief** | Speed, utility | `queen3`: slide up to 3 in all 8 directions (reach 3) | Skill | Daggers, light armor |
| **Monk** | Balanced, self-sustain | `rook3`: slide up to 3 orthogonally (reach 3) | Ki | Claws/knuckles, light armor, robes |

Base values (level 1 / growth per level):

| | HP | MP | STR | DEF | MAG | MDEF | SPD |
|---|---|---|---|---|---|---|---|
| Knight | 42 / 7 | 6 / 1 | 12 / 2.2 | 11 / 2 | 3 / 0.6 | 5 / 1 | 6 / 0.6 |
| Magician | 26 / 4 | 22 / 3.5 | 4 / 0.8 | 5 / 0.9 | 13 / 2.3 | 11 / 2 | 7 / 0.8 |
| Thief | 32 / 5 | 10 / 1.5 | 9 / 1.6 | 7 / 1.2 | 5 / 0.8 | 7 / 1.2 | 12 / 1.2 |
| Monk | 38 / 6.5 | 12 / 1.8 | 11 / 2 | 8 / 1.5 | 8 / 1.4 | 9 / 1.5 | 9 / 0.9 |

Demo heroes: **Aldric** (Knight), **Mira** (Magician), **Kit** (Thief), **Tarek** (Monk).

### 3.3 Enemies & NPCs
- Enemies have fixed stats per level entry, a move pattern, battle skills, element affinities, EXP/gold rewards, drop & steal tables, board AI and battle AI (§12).
- NPCs have stats too (shown in the stats window), an optional `targetable` flag (enemies may attack them, §8.9) and interactions (§9).

### 3.4 Knock-out, death & game over
- A character at 0 HP is **KO**. A KO hero becomes **fallen**: it leaves its party and **stays on its cell** (lying sprite) – the cell it stood on when the battle began (attackers: their origin cell, defenders: the defended cell). Fallen heroes don't take turns, don't block movement and are ignored by enemies.
- Fallen heroes are **revived on that cell** by an item/ability targeting the cell (revive range pattern) or at an **inn**. A revived hero joins an allied piece on the same cell if there is room, otherwise becomes its own piece there.
- When the heroes travel through an exit, fallen heroes are carried along and lie fallen on the arrival cell.
- If every hero is KO → **Game Over** → load last save or return to title.
- KO enemies are removed permanently from that board (remembered per map).

---

## 4. Elements & status effects

### 4.1 Elements
`fire`, `ice`, `thunder`, `earth`, `holy` (+ `none`). Characters may be **weak** (×1.5 damage), **resistant** (×0.5) or **immune** (×0) to an element.

### 4.2 Status effects
Each status defines: stat modifiers, per-turn tick (damage/heal as % max HP), duration in the owner's turns, where it is active (`board`, `battle`) and whether it **persists** across the board↔battle switch.

| Status | Effect | Scope | Persists | Cured by |
|---|---|---|---|---|
| Poison | −6% max HP per turn (can't KO on board: stops at 1 HP) | both | yes | Antidote, Remedy, Chakra |
| Sleep | Skips turns; broken when taking damage | both | no (ends after battle) | Damage, Remedy |
| Stun | Skips next turn | battle | no | – (1 turn) |
| Blind | Physical hit chance −50% | battle | no | Eye Drops, Remedy |
| Slow | SPD ×0.5 | both | no | Remedy |
| Haste | SPD ×1.5 | both | no | – |
| Protect | DEF & MDEF ×1.5 | both | yes | – |
| Regen | +8% max HP per turn | both | yes | – |
| Hidden | Cannot be targeted/engaged by enemies; engaging from hidden = guaranteed First Strike. Ends when the character attacks or uses an offensive ability | both | yes | – |
| Stuck | Board move reach −1 (reach 1 → cannot move) for the next turn | board | yes | – |
| Flying | Hovers above the field: unaffected by field effects, traps and ice. A party flies only if all members fly. Condors fly permanently (innate enemy status); heroes via Levitation Draught (5 turns) | both | yes | – |
| Defending | DEF ×2, MDEF ×1.5 until the character's next battle turn (Defend command) | battle | no | – |

Durations are counted at the **end of the owner's turn** (board turn or battle turn). Board-only statuses are frozen during battle and vice versa.

---

## 5. Board

### 5.1 Structure
- A board is an **isometric grid of arbitrary shape** (cells can be empty/holes) and arbitrary size.
- Each cell has a **terrain** (from the chipset, §13.3) and a **height** (0…35 blocks).
- Terrain defines walkability and optional permanent **surface effect** (e.g. `quicksand` = sticky, `ice` = frozen, `lava` = burning).
- **Height rule:** a step between neighboring cells is only possible if the height difference is ≤ 1. Leaps (§6) check the height difference between start and landing cell (≤ 1 unless the pattern says otherwise).
- Cells may contain **decor** (palms, cacti, crates; can block), **events** (NPCs, chests, signs, triggers), **exits** and **pieces**.

### 5.4 Terrain that changes (elemental puzzles)
Terrain can react to field effects. The rules are chipset data (`freezable`, `flammable`, `burnsTo`) plus field-effect data (`bridges`, `ignites`, `melts`), not map-specific code:
- **Ice shapes**: Ice-type spells and items freeze by *size* (Ice / Frost Shard 3, Ice 2 5, Ice 3 7). Aimed at water they freeze the size×size square around the target, but **only its water cells** (land neighbours are ignored). Aimed at anything else they freeze a **straight line** of `size` cells centred on the target, along the caster → target direction. Like fire, the cold only passes between neighbouring cells at most **one level** apart: the line stops at a higher step, water beyond a step stays open.
- **Freezable** terrain (water, rivers) can't be walked on, but **Frozen** turns it into an ice bridge: walkable (with ice sliding, §7.4) while the effect lasts. Only freezing works on open water: fire, poison clouds or mud cast on water have no effect.
- **Burning** on a frozen cell **melts the ice** (removes Frozen) instead of setting the cell ablaze.
- **Melting under someone**: sliding is instant, so ice never vanishes mid-slide. If a piece *stands* on ice over water when it melts (worn off, or fire), it is put back on the cell it stepped onto the ice from (fallback: the nearest free walkable cell).
- **Flammable** terrain (flowers, grass) catches fire: it turns into its `burnsTo` terrain at once (flowers → scorched earth, an overgrown stair step → a plain step, grass → scorched earth). At the start of each round, fire on burnt terrain spreads to 4-neighbour cells with flammable terrain **at most one level higher or lower** (new fires last 2 rounds and spread again), so a flower bed burns away ring by ring. A fire cast directly lasts its normal 3 rounds.
- **Burnable decor**: cacti and bushes (`flammable` in the chipset decor) burn away for good when fire reaches them and pass the fire on to neighbours. Blocking cacti can therefore close a path that only fire opens.
- **Flower beds** block movement, so fire opens paths. Burnt cells stay burnt: terrain changes are remembered per map (saved with the game).

### 5.2 Board types
- **Peaceful**: no enemies; NPCs wander. The board is in **free exploration** (§8.10) – no rounds, heroes walk wherever they can reach.
- **Wild**: enemies present; NPCs may be present, flagged as targetable or ignored by enemies.
- Board contents can change via event conditions (e.g. enemies appear once a quest step starts).

### 5.3 Exits
Single cells marked with an **arrow pointing outwards**. Moving a hero onto an enabled exit asks *"Travel to ⟨board⟩?"*; on *Yes* **all heroes** (including fallen) travel to the target board's entry point. Exits can be enabled/disabled by conditions (quest flags); disabled exits show a greyed arrow and are not walkable. Enemies never use exits.

**Doors** (`door: true`, also stairs inside buildings) are exits without arrow and without question: stepping into the open doorway enters. Inside, the party appears one cell in from the door; coming out it stands one cell in front of the door – never on an exit cell, so it can't bounce back and forth. Interiors are small maps cut away at the front (back walls only). The building continues **over** the doorway: the map's `overhead` layer (+ `overheadHeight`) adds purely visual blocks above a walkable cell, starting above a 4-level clearance (32 px, about a character's height), so a door is an opening with a lintel instead of a gap. Houses are 5 blocks tall, the two-storey inn 7.

**Arrivals** (`spawns` in the map) are where a party lands: the end of an exit, of a teleport action,
of the inn's wake-up, the game start. An arrival exists because something leads there – the editor
creates it together with the exit or teleport and removes it with the last thing that uses it
(editor-design §6.4). An exit's arrival never lies on an exit cell – one cell in front of it – or the
party would bounce back and forth.

**Split floors** (`together: true` exits, e.g. the Mirage Tower's stairs): a hero piece stepping onto one waits there ("waiting for the others"); only when **every standing hero piece** waits on a together-exit to the same map does the board change – each piece arrives at the spawn of the exit it stood on. So teams that were separated stay separated on the next floor.

**Wall signs** (`wallDecor` in the map: cell, `sign`, `face` N/E/S/W, block `level`): flat lettering (a normal square image from `graphics.wallSigns`, e.g. "INN" or a potion bottle) painted onto one side face of a block. It is mapped onto that face at native pixel size, so it is isometrically distorted like the wall, turns with it and is only drawn while that side faces the camera – after rotating it never shows on the wrong side of a building. Shop names go above the door.

---

### 5.5 Water depth and swimmers
- **Shallow water** (`water: shallow`): walkable for everyone, freezable, conducts lightning. **Deep water** (`water: deep`): heroes can't enter it (nobody in the party can swim) unless it is frozen; it conducts lightning.
- **Swimmers** (`swims` on an enemy): `water` = moves only through water cells (shallow and deep), `amphibious` = land and water. Heroes can't engage a swimmer in deep water – only abilities (lightning!) reach it.

### 5.6 Lightning and conduction
- **Thunder** on the board (and the enemy **Zap**) strikes one cell: everyone there takes magical thunder damage.
- Struck on a **conductive** cell (shallow/deep water or a **Soaked** cell – not ice), the bolt runs through all conductive cells connected to it (4-neighbourhood) up to **4 steps** away and hits everyone on them – friend or foe. Damage is **×1.5 on the struck cell** and falls off with distance: ×1.25, ×1.0, ×0.75, ×0.5 at 1–4 steps.
- **Soaked** is a field effect that does nothing by itself (3 rounds) – but it conducts. (Tomato spit + Lemon zap.)
- As always on the board, heroes are left at 1 HP at worst; enemies can be KO'd. This is the one exception to "board abilities don't deal direct damage" (§19.6).

### 5.7 Plants that grow and are cut
- **Seeds** (field effect, e.g. the Watermelon's *Seed Ring* around a hero – only on free, plantable cells) grow at the next round start into a **bramble**: blocking, flammable decor. Nothing grows under a piece.
- **Cut** (granted by swords): removes a bramble or bush on an adjacent cell. **Fire** burns brambles too (§5.4).
- Decor that appears/disappears is remembered per map (`decor` overrides in the map memory).

### 5.8 Switches and gates
- **Gates** (`gates` in the map) are bars across a cell: closed = blocked. A gate is open while one of its **switches** (`switches`: floor plates, `opens` gate ids, `weight` = heroes needed, `latch` = stays open once pressed) is pressed by standing heroes, or while its `openWhen` condition holds (e.g. all enemies defeated). A gate never closes on someone standing in it.
- A gate closing for the first time can set a flag (`closeFlag`) – e.g. to start the "we have to split up" scene.

### 5.9 Shaped blocks (ships)
Blocks are cubes by default. For things that shouldn't look blocky – a ship – two shape tools exist; both are purely visual and turn with the board like every block:
- **Diagonal pieces**: a map's `shape` layer marks cells whose corners are cut off along the diagonals (`legend.shapes`, e.g. `{ cut: [NW] }` = a half cell, `{ cut: [NW, NE] }` = a point). A ship's bow is a point in front of two half cells. Shaped cells are not walkable.
- **Hull flare**: a terrain with `flare` leans its outer sides inward toward the bottom, so the deck overhangs the hull; `underlay` draws the water under it, and `bulwark` adds a low wall along the outer edges – open where a walkable non-hull cell joins (the gangplank). Sides between two hull cells stay hidden, so a hull of many cells reads as one.
- **Directional decor** (`views: 4`): objects that look different from each side (the ship's wheel) have one frame per quarter turn; the board shows the one for its rotation and switches half-way through a spin, like the characters. The first frame faces S (grid +y); a map turns single placements with its `decorDir` layer (N/E/S/W per cell), so one object can be placed facing any way.

## 6. Patterns (movement, abilities, items)

A **pattern** is a reusable, named description of a set of target cells relative to an origin. The same system is used for **movement**, **ability range**, **item range** and **area of effect**. (Per the design correction there are no separate attack patterns – attacking uses the movement pattern, see §8.6.)

Pattern parts (combinable, a pattern is the union of its parts):
| Part | Parameters | Behavior |
|---|---|---|
| `walk` | `range`, `dirs` (`orthogonal`/`diagonal`/`all`) | Flood fill step by step (Shining-Force style). Obeys height & blocking. |
| `ray` | `range`, `dirs` | Slides straight in each direction until range or blocked (rook/bishop/queen). Each step obeys height rule. |
| `leap` | `offsets`, `symmetric` | Jumps to fixed offsets ignoring intermediate cells (chess knight). Landing obeys height (`maxHeightDiff`, default 1). |
| `area` | `radius`, `shape` (`diamond`/`square`/`cross`/`self`) | Static shape, used for spell ranges and area of effect. |
| `include` | pattern id | Reuse another pattern. |

Pattern flags: `ignoreHeight`, `ignoreBlocking` (flyers, magic), `includeOrigin`.

**Reach** of a pattern = its largest distance (steps for walk/ray, Chebyshev distance for leap/area). It can be set explicitly.

**Movement path:** the piece moves along the shortest valid path (BFS over the pattern's step graph); leaps animate as jumps.

---

## 7. Turns on the board

### 7.1 Turn order
- A **round** consists of one turn per character on the board (heroes, enemies, NPCs).
- Order is by **SPD** (highest first). A **party** takes a single slot at the **lowest SPD of its members**; inside that slot members act consecutively in their own SPD order. Ties: heroes first, then random (seeded).
- The order is re-evaluated whenever the next actor is picked (so joining/leaving parties mid-round is handled naturally). Characters that already acted this round are skipped.

### 7.2 A character's turn
When a hero's turn starts the **cursor jumps to the hero's cell**. Selecting the hero opens the command box:

| Command | Limit per turn | Notes |
|---|---|---|
| **Move** | once | Party moves as a unit (§8). |
| **Ability** | once | The hero's abilities as one plain list (no type/group levels on the board; scrolls beyond 5). Abilities cast on oneself (Discover, Hide, Chakra) go off right away. |
| **Item** | unlimited | Use/give items; targets via item pattern. After an ability, item or party action the menus close and the map is back; select the hero again for more commands. |
| **Act** | unlimited | Only when sharing a cell with a villager: opens the interaction close-up (§8.8). |
| **Stats** | – | Shows the character's stats window. |
| **Party** | once | *Join Party* / *Leave Party* (§8.1). Uses the same once-per-turn action as Ability: after joining/leaving no ability this turn, and after an ability no joining/leaving. |
| **End Turn** | – | |
| **End Party** | – | Ends the turn of every party member who hasn't acted yet (convenience). |

Move and Ability can be done in any order. The system **Menu** (§11) is available while it is a hero's turn. The cursor can roam freely to inspect any cell/character (Stats on others).

### 7.3 Move flow
1. Choose *Move* → reachable cells are highlighted.
2. Cursor moves freely; only highlighted cells can be selected.
3. The piece walks along the shortest path (sliding on ice, see §7.4).
4. No confirmation prompt: the move happens immediately and the command box shows **Undo Move** instead of *Move*. Undo restores the exact previous state. It is only offered while nothing else happened since: no ability, item, interaction or turn end, and landing had no effect (trap, field effect damage/status, ice slide, step event). Moving onto an enemy starts the battle at once (no question) and can't be undone.

### 7.4 Field effects
Cells may carry **temporary field effects** (from abilities/items, with a duration in rounds) or permanent ones (from terrain):
| Effect | On landing | While standing there |
|---|---|---|
| **Burning** | 8% max HP fire damage | 8% max HP fire damage at the end of each of the character's turns |
| **Poisonous** | Poison for 2–4 turns (random) | – |
| **Frozen** | Stepping onto ice **ends the walk there**: the piece slips on (~0.28 s per cell) in its moving direction until it reaches a non-frozen cell or the next cell is invalid (blocked/height/edge/occupied) | – |
| **Sticky** | Stuck status (§4.2) | – |

A field effect hits a **piece once as a group** (every member once):
- when the piece **crosses** the cell on its way (walking through fire burns, through poison poisons) and when it **lands** on it;
- again **once per round at the start of the turn of the piece's anchor**: the member who moved the piece onto the cell. So a party whose last member moved it onto fire isn't burnt again right at the start of the next round – it burns when that member's turn comes round again. If the anchor leaves the party (or falls), the next member in the party becomes the anchor; a character who leaves is the anchor of its own new piece.

Damage and status only, no sliding. Flying pieces are unaffected. Board damage cannot KO heroes (they stay at 1 HP) but can KO enemies (EXP/gold are shared by all heroes); an enemy KO'd on its way stops there.

**Traps** (Thief) are hidden cell objects: the first enemy landing on it takes damage and gets *Stuck*; the trap is consumed. Enemies cannot see traps.

### 7.5 Hidden things
Some maps hide things from the heroes. **Discover** (Thief) finds them.
- **Ancient traps** (map data) are invisible. A hero piece walking **through or onto** one stops on that cell: it takes damage, gets *Stuck*, and the trap is spent (remembered per map). Flying pieces float over them; enemies ignore them. Once revealed by Discover a trap is shown on the board and the heroes' paths go around it.
- **Hidden objects** (map events with `hidden: true`, e.g. an invisible chest) are not on the board until uncovered.
- **Dormant enemies** (e.g. skeletons, `boardAi.dormant`) lie on their cell looking exactly like the `skeleton` decor used for harmless remains. They block movement, take no turns and don't count as enemies (the board stays in free exploration). As soon as a hero piece's path reaches a cell the skeleton could attack with its own move pattern, the move stops there, the skeleton **rises** ("!") and attacks at once as an **ambush**; the board switches to turn-based tactics.
- **Discover** (Thief, board only, MP 1, cast on the thief's own cell): the 3-cell reach around the thief lights up briefly, then everything hidden in it shows itself – traps become visible, hidden objects appear (and can be used), dormant enemies rise. Nothing found → "Nothing hidden nearby." An enemy uncovered this way is caught unprepared: it takes no turn in the current round (when this starts the tactics, round 1) and acts from the next round on – only enemies *provoked* by a party walking into their reach ambush at once.
- **Defuse** (Thief, board only, MP 0, adjacent cell with a visible trap – revealed ancient trap or one the heroes set): takes the trap apart; it goes into the inventory as a **Snare**.
- **Snare** (item): on **wild boards only**, hide it on an empty cell within 2 – like the Trap skill, the first enemy landing on or walking through it is hurt and stuck; enemies can't see it.

---

## 8. Parties & engagement

### 8.1 Forming parties
- **Join Party** (ability, costs the turn's ability action): target an allied piece on the same or an adjacent cell (8 directions, height rule applies). The joiner moves onto that cell and merges. Max **4** members.
- **Leave Party** (ability): the character becomes its own piece on the **same cell**. It may still move this turn if it has not moved yet.
- Multiple allied pieces may share a cell only through these rules.

### 8.2 Party movement
- A party moves as one unit. Its move set = **union of all members' move patterns, cut off at the smallest reach among the members** (e.g. Knight reach 2 + Thief reach 3 → all knight leaps + queen slides up to 2).
- The first member who uses *Move* moves the whole party; all members are marked as *moved*. Other members can still use abilities and items.
- A party can only move if **no member has moved this round** (joining a character that already moved blocks party movement for this round).
- Stuck/slow members reduce the party's reach (reach is computed from effective member reach).

### 8.3 Allied pieces
Allied pieces are passable (walk/ray can pass through) but not valid destinations, except through *Join Party*. Hostile pieces block movement and are valid destinations only as **engagement targets**. **Villagers (NPCs) never block heroes**: heroes walk through them, and choosing an NPC's cell as destination starts an interaction. Objects (chests, signs) stay solid. Enemies also pass NPCs unless the NPC is targetable (§8.9). Sharing a cell with an NPC never protects heroes from enemies.

### 8.4 Engagement → battle
Moving onto a cell occupied by a hostile piece **engages** it (chess-like capture). Visually the attacker walks up to the target and lunges at it before the battle starts; a winner then steps onto the cell, otherwise it walks back. Combatants: all characters of the moving piece vs **all characters of the defending faction on that cell** (a split party standing on the same cell still fights together).

Battle type:
| Situation | Type |
|---|---|
| Heroes engage | 25% **First Strike** (100% if the engaging piece is Hidden) otherwise Normal |
| Enemies engage | 25% **Ambush** (halved if a hero in the defending cell has Perceive active this round) otherwise Normal |
| Boss battles | Always Normal unless scripted |

### 8.5 After the battle
| Result | Board consequence |
|---|---|
| Attacker wins | Defender characters removed (enemies) / fallen on the cell (heroes); surviving attackers occupy the cell (their fallen stay on the origin cell). |
| Defender wins | Attacker characters removed (enemies) / fallen on their origin cell (heroes); defender stays. |
| Escape | Attacker returns to its origin cell; nobody moves otherwise. |
| All heroes KO | Game Over. |

Surviving characters keep HP/MP/persistent statuses. The engaging character's *Move* is used; Ability/Items remain available.

### 8.6 Why no attack patterns
Attack reach = movement reach. A piece "attacks" by moving onto its target. This keeps one pattern per character (design correction) while the party-reach rule still applies to attacks.

### 8.7 Enemy parties
Enemies use identical rules: they can start as a party (map data) or join/leave via AI:
- **Pack animals** (`boardAi.pack`, e.g. scorpions, condors) join an adjacent allied piece when heroes come within their awareness range (aggro range + 2) and they can't engage right away.
- A member that can't move (reach 0, e.g. Stuck) **leaves its party** so the others can still move.
- Joining/leaving uses the enemy's ability action for that turn, exactly like for heroes.

### 8.8 NPC interaction
Moving a hero onto a villager's cell puts the party **on that cell** (consistent with engaging enemies; the villager steps back visually). A **close-up** opens on the right: the map's backdrop, the NPC standing above and the party seen from behind below, with the options `Talk`, `Shop`, `Rest` (inn), `Steal` (only if the actor has the Steal ability; uses the ability action), … Dialogs, shops (drawn on the left half) and the inn run while the close-up is shown; afterwards the options come back, so a visit can combine talking, shopping etc. The last option is always **Leave** (stay on the cell). **Backing out before using any option undoes the move**. While sharing a cell with a villager, the command box offers **Act**, which reopens the close-up any number of times without using the move or ability. Objects (chests) are approached from the front instead.

### 8.9 Targetable NPCs
If an enemy engages a targetable NPC without heroes, the fight is auto-resolved (both sides AI) and summarized in a message. If heroes stand on the same cell, the NPC fights as an AI-controlled guest.

### 8.10 Free exploration
While **no living enemy is on the board** (peaceful maps, or a wild map once every enemy is defeated) there are no rounds and no turns:
- One hero piece is **selected** (HUD: `Exploring - Name`). Tapping/clicking a cell the piece can walk to moves it there along the shortest path – **no move pattern or reach limit**, orthogonal steps, the height rule (±1, or the members' pattern limit) still applies, allies and villagers are passable. It can move again right away; walks are animated quickly.
- Tapping another hero piece selects it; tapping the selected piece opens its commands (a party first asks **Who?**): `Act` / `Ability` / `Item` / `Stats` – no Move, Undo, End Turn or End Party. Exits, villager close-ups (§8.8) and objects work as usual; backing out of a close-up still undoes the approach.
- **Time**: after every hero action (move, ability, item, interaction) hero statuses tick and ability actions are available again. **Field effects run on a clock** instead: every `exploreRoundMs` (1.5 s) while the player is on the map (not in menus or animations) they wear off one round and fires spread. Ice lasts ×3 there (`exploreFactor`), ~18 s for Ice – enough to walk across. In a close-up any party member with *Steal* can steal (`Steal (Kit)`).
- Wandering villagers take a step on a timer (~2 s) while the player is idle on the map.
- Parties can still be formed and split (Join/Leave Party abilities).
- As soon as an enemy appears (quest, script, spawn) the game shows **Enemies!** and returns to turn-based tactics with a fresh round; defeating the last enemy shows **Area clear** and switches to exploration.

---

## 9. Dialog & text boxes

- Text box at the bottom with **portrait** (generic portrait for unimportant NPCs), speaker name and **typewriter** text (configurable speed; confirm key skips to end of page, then advances).
- **Inline markup** (easy to type in data files):
  | Markup | Effect |
  |---|---|
  | `*word*` | Highlight color (gold) |
  | `[c=red]…[/c]` | Color (named or `#rrggbb`) |
  | `[s=2]…[/s]` | Size (glyph scale) |
  | `~…~` or `[wave]…[/wave]` | Wavy (sine) text |
  | `^…^` or `[shake]…[/shake]` | Shaking/angry text |
  | `[rainbow]…[/rainbow]` | Cycling colors |
  | `[spd=0.5]…[/spd]` | Typing speed factor |
  | `|` | Short pause, `[p=800]` pause in ms |
  | `{hero}`, `{gold}`, `{name:id}` | Variables |
  | `\*` | Literal special char |
- **Choices**: a dialog node can offer options (optionally conditional) that jump to other nodes.
- Dialog nodes can run **actions** (§10.2) and branch on **conditions** (§10.1).

---

## 10. Events, conditions & quests

### 10.1 Conditions (shared mini-language)
YAML objects: `flag`, `not`, `all`, `any`, `item {id,count}`, `gold`, `var {name, op, value}`, `talkedTo`, `defeated {enemy|piece, count}`, `defeatedAllOn {map}`, `onMap`, `questActive`, `questDone`, `questStep`, `partyHas`, `level`.

### 10.2 Actions
`setFlag`, `clearFlag`, `setVar`, `addVar`, `giveItem`, `takeItem`, `giveGold`, `takeGold`, `startQuest`, `completeQuest`, `setQuestStep`, `dialog`, `shop`, `inn`, `healParty`, `spawnEnemy`, `removeEvent`, `teleport`, `message`.

### 10.3 Map events (RPG-Maker style)
An event is an object on a cell with **pages**. The last page whose condition holds is active and defines graphic, facing, movement behavior, trigger (`interact`, `step`, `auto` on map enter) and the interaction list. Used for NPCs, shopkeepers, chests, signs, hidden items and triggers.

**Planned rework – entities with states and handlers** (packages R3–R7; decided with the user). Gates,
floor switches and hidden traps are special kinds today only because events can't express what they
do. Events get the missing pieces and replace them:
- An **entity** has a cell, **states** and **handlers**.
- A **state** bundles a look (character with facing and movement / object / keeper behind an object /
  nothing), a **passability** (solid / stop here to interact / walk through) and hidden (found with
  Discover). The current state is saved per map; actions change it. It replaces pages: what depends
  on flags is set up by a *map loaded* handler.
- A **handler** is a trigger, an optional condition and a script. Triggers: **interact**, **enter**
  (a piece stops on it; heroes or anyone), **leave**, **pass over** (a hero moving across it – the
  move stops there; flying pieces are not caught), **map loaded**, **condition becomes true**, and for
  enemies **defeated**.
- A **script** is a sequence of actions with blocks: **if / elif / else**, **choice** (options with
  optional icons, each with its own actions), **wait** (a time, or until moves end), **call** a shared
  script, **stop**. Actions: today's (§10.2) plus **set state** (of this or another entity), **move** an
  entity or hero piece to a cell, **face**, **show / hide**, **damage / heal / status** (the triggering
  piece, the party), **camera** focus, **sound / music**, screen **fade / flash / shake**, **emote**
  balloon, **add / remove party member**, **enable / disable exit**. Targets can be "the piece that
  triggered it" and "this entity".
- New conditions: an entity **is in state**, **heroes stand on** a cell (with a weight).
- **Dialogs become scripts** (a line of text is an action), so events, dialogs, quests and map entry
  share one script language and one editor.
- **Presets** replace the special kinds: a **gate** (closed: bars, solid / open: nothing, walk through;
  a change to solid waits until nobody stands there), a **floor switch** (up / down: *enter* with
  enough heroes → down and open its gates, *leave* with no hero left → up; latching = no leave
  handler), a **trap** (armed and hidden / sprung: *pass over* → damage, *Stuck*, sprung).
- Traps set during play (Snare, the Thief's Trap) stay a runtime list; **wall signs** become decor on
  a block face (Decor mode). **Exits**, **arrivals** and **enemies** stay their own kinds.

### 10.4 Quest engine
- A **quest** has a title, description, optional parent (**hierarchical**: a quest step can require sub-quests to be done), a `lockSwitch` flag and ordered **steps**.
- A **step** has objective text, **completion conditions**, `onStart` and `onComplete` actions (e.g. disable exits via flags).
- A quest has one or more **endings** (finish conditions), which may be **hidden** (never shown in UI). Each ending runs actions – e.g. start a follow-up quest.
- **Exactly one quest is active.** The player can switch the active quest in the menu unless the active quest/step is locked. Conditions are **state-based** (flags, kill records, items), so only the active quest is evaluated – switching back later completes steps whose conditions are already met.
- Board goals like "defeat all enemies" or "defeat the boss" are ordinary step conditions.
- The active step's objective is shown in the board HUD.

---

## 11. Menu (board only, on a hero's turn)
| Page | Contents |
|---|---|
| **Heroes** | List (portrait, HP/MP/EXP); detail: stats, equipment (equip/unequip), abilities |
| **Items** | Inventory by category; read scrolls; key items read-only. Consumables can be used from the menu only on peaceful boards – on wild boards items must be used via a hero's *Item* command so range matters |
| **Quests** | Active quest + steps, other quests (switch active) |
| **Save** | Save / Load (3 slots) |
| **System** | Text speed, window color, back to title, exit game |

---

## 12. Battle (Final Fantasy style)

### 12.1 Layout & flow
- Side view: **enemies on the left, heroes on the right**. Background depends on the board's terrain.
- Bottom UI: hero rows (portrait, name, HP, MP, EXP bar) always visible; a command/message box shows the current hero's commands, or – during enemy turns – what the enemy did and the HP gained/lost.
- Rounds: all living combatants act once per round, ordered by SPD (±10% random jitter per round).
- **Ambush**: an opening round in which only enemies act, then normal rounds. **First Strike**: opening round only for heroes.

- **Revealed enemies** (Perceive, remembered per enemy type): while choosing a target, the message box shows the enemy's name on the left and cycles its facts on the right every ~1.8 s – HP/MP (current/max), then the stats, then weaknesses / resistances / immunities; a group that doesn't fit is split over several pages. Unrevealed enemies show only their name.

### 12.2 Commands
| Command | Effect |
|---|---|
| **Fight** | Physical attack on one target (weapon element applies). |
| **Defend** | Defending status until the character's next turn (DEF ×2, MDEF ×1.5). |
| **Ability** | Choose type → ability → target(s). |
| **Item** | Use a consumable (costs the turn in battle). |
| **Run** | Party escape chance `50% + 4%·(avg hero SPD − avg enemy SPD)`, clamped 10–95%. Impossible vs bosses. |

Targets: any living combatant (heroes can target enemies and allies, e.g. heal an enemy by choice).

### 12.3 Formulas
- **Physical damage** = `ATK·power · k · S/(S+DEF) × rand(0.9–1.1)`, min 1. ATK = STR + weapon ATK; `S = 24` (defense scale) and `k = 1.4` are in `config.yaml`. Ratio-based so armor never reduces damage to zero. `ignoreDef` removes a fraction of DEF. Crit 5% (+ class bonus) ×1.5. Hit 95% (Blind −50%).
- **Magical damage** = `(MAG·power + base) · k · S/(S+MDEF) × rand(0.9–1.1)`, min 1, never misses. Element multiplier applies. **Fixed damage** (items) ignores stats but applies elements.
- **Heal** = `base + MAG·scale`.
- **Steal** success = `40% + 3%·(SPD_thief − SPD_target)`, clamped 10–90%.

### 12.4 End of battle
- **Victory**: EXP (sum of enemies' EXP split evenly among living participating heroes, rounded up), gold, drops (per-item chance). Level-up messages list stat gains and new abilities.
- **Defeat** of the heroes' side → fallen (Game Over if no hero remains anywhere).
- Battle-only statuses are removed.

### 12.5 AI
- **Battle AI**: weighted list of actions with conditions (`hpBelow`, `targetLacksStatus`, `chance`, `round`, `cooldown` = rounds since this actor last used it, `alone` = all its allies are down); targets chosen by rule (`random`, `lowestHp`, `highestHp`, `boss` = an allied boss). **Priority** rules are taken before the weighted pick whenever they apply (henchmen buff their master first, then fight).
- **Board AI** behaviors: `aggressive` (engage reachable hero, else approach nearest visible hero), `guard` (hold until a hero is within `aggroRange`, then aggressive), `wander` (random moves within radius), `static`. Hidden heroes are ignored. NPCs use wander/static.
- **Before moving** an enemy may use its ability action: leave/join a party (§8.7) or a **board ability** from `boardAi.abilities` (each with a chance per turn). Targets are scored: offensive abilities prefer cells with the most visible heroes and avoid hitting allies; supportive ones prefer wounded allies. The area is flashed briefly before it lands.

### 12.6 Enemy levels and equipment
- An enemy has stats at its own `level`. With an optional `growth` (per level, like a class) a map can place it at another level (`level` on the map entry; party members shift by the same amount). Without `growth` only the rewards change.
- EXP and gold scale with the placed level against its own (`exp × level / own level`).
- Enemies may **wear equipment** (`equipment: { weapon, armor, accessory }`), which works exactly like a hero's: stat bonuses, the weapon's element and on-hit status (unless the enemy has its own), status immunities, granted abilities. Creatures (scorpions, condors…) wear nothing; the Fishfolk carry a Coral Spear and a Scale Vest (and sometimes drop the spear).

### 12.7 Swallow, blessings and summons (the Grave Toad)
- **Swallow** (enemy skill): the target disappears into the user. While inside it **can't act and can't be targeted by anyone** (friend or foe; group effects skip it). The swallower's next two turns are forced and are its whole action:
  1. **Digest** – it gains half of what it will take (shown as +HP / +MP on it),
  2. **Spit Out** – it gains the other half, then spits the victim back to its place, who now loses the full amount: **half of its HP when swallowed** (never to 0) and **30 % of its MP**.
  A swallower holds only one victim and never swallows the last hero standing. If it **falls while holding someone**, the victim comes out without any loss (as does a victim whose HP ran out inside).
- **Buffs**: *Empowered* (STR ×1.5) and *Bolstered* (DEF ×1.5, MDEF ×1.3), battle-only, 4 turns.
- **Summon** (enemy skill `summon: {enemies, cost}`): raises new combatants on the user's side, in the places of the fallen. It is paid out of the battle's gold reward (the summoner's own gold is its purse – no summon it can't pay for); summoned enemies give EXP but no gold.
- The **Grave Toad** (final boss of the demo, undead) attacks, breathes *Bad Breath* (poison on all heroes, cooldown 3), and sometimes swallows (cooldown 5, 50 %). Its two **Bone Acolytes** (undead) bless it with Dark Blessing (Empowered) and Bone Ward (Bolstered) whenever it lacks either, and otherwise attack or cast Bone Bolt. Once both acolytes are down the toad may raise two new ones (40 % per turn, 120 G each time). The fight has its own music (`final`).

---

## 13. Abilities

### 13.1 Structure
An ability has: `type` (Magic, Sword Art, Skill, Ki, Party), optional `group` (menu sub-level, e.g. Magic > Support > Heal), `mp`, description, icon, and **separate `battle` and `board` definitions** – if a definition is missing the ability can't be used there.
- `battle`: `target` (`enemy`, `ally`, `self`, `any`, `allEnemies`, `allAllies`), `effects`.
- `board`: `range` pattern, `area` pattern (optional), `targets` filter (`hero`, `enemy`, `npc`, `anyCharacter`, `emptyCell`, `anyCell`, `object`), `effects`.
- The board preview shows the real range (and area) while browsing the ability list.
- Ability menus (board **and** battle) are hierarchical: type → group → ability (e.g. Magic > Support > Heal). Levels with a single entry are skipped; cancel goes back one level.

### 13.2 Effects (shared by abilities & items)
`damage {kind: physical|magical, power, base, element}`, `fixedDamage`, `heal {base, scale}`, `healPercent`, `restoreMp`, `applyStatus {status, chance, turns}`, `cureStatus {statuses|all}`, `revive {percent}`, `fieldEffect {effect, rounds}`, `placeTrap`, `steal`, `reveal`, `learnAbility`, `joinParty`, `leaveParty`.

### 13.3 Ability list (demo scope)
| Ability | Class (lvl) | MP | Battle | Board |
|---|---|---|---|---|
| Cleave | Knight 1 | 3 | Physical 1.5× one enemy | – |
| Guard | Knight 1 | 2 | Protect self/ally 3 turns | Protect on characters of an adjacent/own cell |
| Shield Bash | Knight 3 | 4 | Physical 0.8× + Stun 35% | – |
| Cross Slash | Knight 6 | 8 | Physical 1.1× all enemies | – |
| Fire | Magician 1 | 4 | Fire magic power 1.0 | Burning on target cell (3 rounds), range 3 |
| Heal | Magician 1 | 4 | Heal 20 + MAG×1.2 one target | Heal all characters on a cell (hero/enemy/NPC), range 2 |
| Ice (scroll) | Magician | 5 | Ice magic power 1.0 | Freeze size 3 (4 rounds), range 3: water 3×3 / land line of 3; bridges water (§5.4) |
| Ice 2 (scroll, not in the demo) | Magician | 9 | Ice magic power 1.6 | Freeze size 5 (5 rounds) |
| Ice 3 (scroll, not in the demo) | Magician | 15 | Ice magic power 1.3, all enemies | Freeze size 7 (6 rounds) |
| Sleep | Magician 4 | 5 | Sleep 60%, 3 turns | Sleep on characters of a cell, range 3 |
| Thunder | Magician 7 | 8 | Thunder power 0.8 all enemies | – |
| Venom Mist (scroll) | Magician | 5 | Poison 70% all enemies | Poisonous diamond area r1 (3 rounds) |
| Quagmire (scroll) | Magician | 4 | Slow one enemy 3 turns | Sticky cross area (3 rounds) |
| Steal | Thief 1 | 0 | Steal from an enemy | *Steal* option at NPCs / adjacent enemies |
| Hide | Thief 1 | 2 | Hidden 1 turn (untargetable) | Hidden 2 rounds |
| Trap | Thief 3 | 3 | – | Hidden trap on an empty cell, range 2 |
| Discover | Thief 1 | 1 | – | Reveals everything hidden within 3 cells of the thief (§7.5) |
| Thunder | Magician 7 | 8 | Thunder power 0.8 all enemies | Lightning on a cell, range 3; runs through connected water (§5.6) |
| Cut | swords (granted) | 0 | – | Cuts down a bramble/bush on an adjacent cell (§5.7) |
| Holy (Holy Orb) | Monk | 12 | Holy power 2.4 one enemy (undead ×2) | – |
| Water Spit | Tomato (enemy) | 0 | – | Soaks a 3×3 area around a hero, range 3 (§5.6) |
| Zap | Lemon (enemy) | 0 | – | Lightning on a hero's cell, range 3 – prefers wet targets (§5.6) |
| Seed Ring | Watermelon (enemy) | 0 | – | Seeds the 8 cells around a hero; brambles next round (§5.7) |
| Flame Spit | Chili (enemy) | 0 | – | Burning cell around a hero, range 3 |
| Defuse | Thief 1 | 0 | – | Takes apart a visible trap on an adjacent cell → Snare item (§7.5) |
| Mug | Thief 6 | 5 | Physical 1.0 + steal | – |
| Chakra | Monk 1 | 3 | Heal self 15 + MAG×1.0, cure Poison | same (self) |
| Perceive | Monk 1 | 2 | Reveal enemy stats & weaknesses | Reveal enemies in diamond r4 + traps; halves ambush chance this round |
| Palm Strike | Monk 3 | 4 | Physical 1.3× ignoring half DEF | – |
| Aura | Monk 5 | 6 | Regen all allies 3 turns | Regen characters of own/adjacent cell |
| Join Party / Leave Party | all | 0 | – | §8.1 |
| Venom Spit | Sand Scorpion (enemy) | 0 | – | Poison 50% on a hero cell, range 2 |
| Wind Shear | Giant Condor (enemy) | 0 | – | Slow 60% on a hero cell, range 3 |
| Quake | Emperor Scorpion (enemy) | 0 | – | Sticky cross area around a hero cell, range 3 |

Weapons can **grant abilities while equipped** (e.g. Flame Blade grants Fire).

---

## 14. Items

### 14.1 Categories
| Category | Rules |
|---|---|
| **Key items** | Quest progress; cannot be sold, used or dropped. |
| **Weapons** | ATK, MAG, SPD modifier, element, class restriction, granted abilities. |
| **Armor** | DEF, MDEF, SPD modifier, class restriction. |
| **Accessories** | Misc bonuses (stats, status immunity). |
| **Consumables** | Heal HP/MP, cure, revive; board `range` pattern (default: own/adjacent cell). |
| **Battle items** | Attack/status effects like spells (e.g. bombs); board behavior = field effect. |
| **Scrolls** | Teach an ability to eligible classes; consumed. |

Equipment slots: **Weapon, Armor, Accessory**. Sell price = 50% of buy price.

### 14.2 Demo item list
| Item | Type | Price | Details |
|---|---|---|---|
| Potion | consumable | 20 | Heal 50 HP |
| Hi-Potion | consumable | 80 | Heal 150 HP |
| Ether | consumable | 60 | Restore 25 MP |
| Antidote | consumable | 15 | Cure Poison |
| Eye Drops | consumable | 15 | Cure Blind |
| Remedy | consumable | 100 | Cure all negative statuses |
| Phoenix Feather | consumable | 150 | Revive with 25% HP |
| Fire Bomb | battle item | 60 | Fire 40 fixed dmg all enemies / board: burning diamond r1, range 3 |
| Frost Shard | battle item | 60 | Ice 45 fixed dmg one enemy / board: freezes like Ice (size 3), range 3 |
| Sleep Powder | battle item | 50 | Sleep 70% one enemy / board: sleep on a cell, range 2 |
| Glue Pot | battle item | 40 | Slow one enemy / board: sticky cell, range 3 |
| Scroll: Venom Mist | scroll | 200 | Magician learns Venom Mist |
| Scroll: Quagmire | scroll | 180 | Magician learns Quagmire |
| Scroll: Cross Slash | scroll | 250 | Knight learns Cross Slash |
| Scroll: Aura | scroll | 220 | Monk learns Aura |
| Scroll: Ice | scroll | 150 | Magician learns Ice (Elvenglade) |
| Token of Serenity / Foresight / Life | key | – | The temple's stolen tokens (§18) |
| Holy Orb | key (scroll-like) | – | A Monk who studies it learns Holy |
| Snare | consumable | 40 | From Defuse; board, wild boards only: hidden trap on an empty cell, range 2 (15 dmg + Stuck) |
| Village Charm | key | – | Side quest item |

Weapons (ATK / MAG / SPD):
| Weapon | Class | Price | Stats | Special |
|---|---|---|---|---|
| Bronze Sword | Knight | 100 | 8 / 0 / 0 | – |
| Iron Sword | Knight | 350 | 14 / 0 / 0 | – |
| Flame Blade | Knight | 900 | 18 / 5 / 0 | fire element, grants Fire |
| Great Sword | Knight | 700 | 24 / 0 / −3 | – |
| Oak Staff | Magician, Monk | 80 | 3 / 6 / 0 | – |
| Ruby Rod | Magician | 500 | 4 / 12 / 0 | grants Fire |
| Frost Rod | Magician | 500 | 4 / 12 / 0 | grants Ice |
| Dagger | Thief | 90 | 6 / 0 / +1 | – |
| Kris | Thief | 400 | 10 / 0 / +2 | 25% poison on hit |
| Leather Knuckles | Monk | 90 | 7 / 0 / 0 | – |
| Iron Claws | Monk | 380 | 13 / 0 / 0 | – |
| Tiger Fangs | Monk | 850 | 18 / 2 / +1 | – |

Armor (DEF / MDEF / SPD): Leather Vest (Thief, Monk; 4/1/0, 60), Chain Mail (Knight; 10/2/−1, 300), Plate Armor (Knight; 16/4/−2, 800), Cloth Robe (Magician, Monk; 2/6/0, 60), Silk Robe (Magician, Monk; 4/12/0, 450), Scorpion Shell (Knight, Monk, Thief; 12/6/0, drop only).
Accessories: Speed Anklet (SPD +3, 400), Amulet (Poison immunity, 300), Mana Ring (Max MP +10, 350), Power Band (STR +4, 350).

---

## 15. Shops & inn
- Shopkeepers always look the same per shop type and have a sign icon: **Weapons** (smith, red apron, sword sign), **Armor** (shared with weapon smith in demo), **Items** (merchant, green, potion sign), **Magic** (mage, purple robe, star sign; sells scrolls & battle items).
- Shop screen: Buy / Sell / Leave, drawn on the left at the same height as the interaction close-up. Choosing an item opens a **quantity dialog** (arrows / up-down, max = what the gold allows (buy, ≤ 99) or what is owned (sell), running total, Buy|Sell / Cancel) so a single click never buys or sells by accident. The info bar shows the description, owned count and which heroes can equip it.
- **Inn** (innkeeper, bed sign): Rest for `10 × party size` gold → full HP/MP, revive fallen, cure statuses. The screen fades to black, a lullaby jingle plays, and the party wakes up next to the beds on the upper floor (`wakeAt`) with "The party has recovered!".
- **Counters**: shopkeepers inside buildings stand behind a counter; the counter is the interactive object (`keeper` = the npc behind it – shown in the close-up, speaks the dialogs), reached from the front.
- **Comparing equipment**: in the Equip list and the shop info bar, each weapon/armor/accessory shows how it differs from what is worn in that slot ("ATK+6 MAG-2"), in green when it is stronger overall (sum of the changes), red when weaker, grey when equal/equipped.

---

## 16. UI/UX summary
- **Board HUD**: active quest objective (top-left), round + current actor portrait (top-right), cursor cell info (bottom: terrain, height, character name + HP bar).
- **Inspecting a piece**: selecting a cell with an enemy (or another hero piece) highlights everywhere it can move/attack this turn (red for enemies, blue for heroes) with *Stats* / *Close*.
- **Command box header**: portrait of the acting hero, then the name, then their status icons right-aligned.
- **Status icons**: every status is shown as a small 10px icon with a gentle bob – side by side above battle sprites, above characters/parties on the board (all members' statuses of a party), in the command box header and in the battle portrait panel of the acting hero.
- **Stats window** (any character): portrait, name, class/level, HP/MP/EXP, stats, equipment, statuses, short bio text. Enemies show `???` for numbers unless revealed by Perceive (reveal is remembered per enemy type).
- **Ability/Item preview**: highlighting an entry previews its range on the board.
- **Confirm/Cancel** after moving.
- **Controls**: mouse/touch (click cell, click menu entries), keyboard (arrows/WASD = cursor/menu, Z/Enter/Space = confirm, X/Esc/Backspace = cancel, M/Tab = menu), **gamepad** (standard mapping: D-pad/left stick with key repeat, A confirm, B/Select cancel, X/Y/Start menu). The menu key also works while the command box is open.
- **Touch** (phones/tablets, or `?touch=1`): tap = click; on-screen **Back** and **Menu** buttons (bottom-right on the board, Back top-right in battle); **drag** pans the board; when choosing a move/ability/item target the **first tap previews** (cursor, path, area) and the **second tap on the same cell confirms**. Taps fire on release so drags never select anything.
- **Audio**: chiptune music per board (`music:` in the map file), battle and boss themes and a title theme (`config.music`); sound effects for UI (cursor, confirm, cancel, invalid), movement, hits/crits/misses, spells by element, heals, statuses, KOs, field effects, traps, chests, gold, travel, battle start/escape, victory/defeat/level-up jingles and a subtle typewriter blip. Music crossfades between scenes. Music and sound volume are set in System (saved in the browser).
- **Menu cursor**: the hand sits on the menu box's left border (FF6 style); entries are not indented to make room for it.
- **Resolution**: 480×270 virtual pixels, scaled to fit. Menus use roomy 15px rows (the battle command box uses 12px rows to fit its fixed height).
- **Flying pieces** hover ~10px above their cell with a slow bob; a round shadow stays on the ground. In battle, flying battlers (e.g. condors) hover and bob as well.
- **Map rotation**: the board can be turned in 90° steps (Q/E, gamepad shoulder buttons, or the two rotate buttons with arrow icons at the bottom right) so tiles hidden behind heights become visible. It rotates around the cursor cell, which keeps its place on screen (positions are sub-pixel during the turn so it runs smoothly, and snap back to whole pixels afterwards) (the camera may move up to a screen beyond the map edges for this). The turn starts moving at once and eases out; its length is the **Turn speed** setting in System (1 slow … 5 fast: 1.5 / 1.15 / 0.9 / 0.6 / 0.35 s, default 3). The **terrain turns as one solid unit**: during the animation every cell column is drawn as a textured mesh (its top face and the side faces toward the camera, cut from the same chipset frames) whose corners follow the rotation, so the ground stays continuous, walls stay vertical and the first and last frames look exactly like the normal blocks. The top textures switch to the new orientation half-way. Upright things – characters, decor (palms, pillars, chests) and status icons – ride along on their cells but stay upright; characters switch to their new facing half-way through the turn. Overlays and the cursor are hidden while turning, and the pointer is ignored (cells slide under a resting mouse). Afterwards the blocks are drawn normally from the new angle. Cursor keys always follow the screen.
- **Interaction close-up floor**: each backdrop defines where its floor starts (`floor` of the battleback in `graphics.yaml`, an image row), so the villager stands on the ground of that backdrop instead of floating in front of walls or the horizon.
- **Phones**: landscape only. The first tap requests fullscreen and a landscape lock (Android); held upright, a "turn your phone" hint is shown. The web app manifest makes "Add to Home Screen" launch fullscreen landscape (also the way to get fullscreen on iPhone). System → Fullscreen toggles it on any device.

---

## 17. Data & content architecture
- **Data files** (YAML, commented, hand-editable) in `data/`: `classes`, `abilities`, `items`, `patterns`, `statuses`, `enemies`, `npcs`, `shops`, `dialogs`, `quests`, `chipsets`, `charsets`, `maps/*.yaml`, `config`.
- **Graphics** in `public/assets/`: `charsets/` (RPG-Maker style walk sheets), `chipsets/` (isometric blocks + decor), `battlers/`, `faces/`, `system/` (window skin, cursor, icons, font, field effect overlays), `battlebacks/`.
- **Maps** combine graphics and logic RPG-Maker-style: layers `terrain` (chipset terrain keys), `height`, `decor`, plus `events`, `exits`, `enemies`, `spawns`.
- **Game state** is one serializable object (heroes, inventory, gold, flags/vars, quests, current board incl. turn state, per-map memory, kill records, RNG state) → save/load is `JSON.stringify`.

---

## 18. Demo content
The journey runs west → east: **Saltmere Harbor → Greenwood River (→ Elvenglade) → Sunken Ruins → Sandhollow → Scorpion Dunes**.

1. **Saltmere Harbor** (peaceful, start): the heroes arrive by ship. Cobbled quay, wooden docks on the sea, the moored ship *Gull* (a deck of planks with masts and a gangplank). Captain Rhea on deck, two sailors (one wanders the dock), a dock worker. Barrels, jars and crates can be **searched**: the first search of some finds a Potion, an Ether, an Antidote or 40 gold; searching again (or searching an empty one) tells what's still inside – strong wine dregs, cheap rum smell, salted fish, rope. They never refuse the party. Exit east → Greenwood River.
2. **Greenwood River** (peaceful, a long forest map): forest paths between trees and mushrooms. Half-way, a path leads north to **Elvenglade**. Then a **river** (3 cells wide, from map edge to map edge) blocks the way: it can only be crossed on ice (Ice spell, §5.4). Beyond it a meadow with flower beds and **stairs** up to the desert's edge – **two cacti side by side** block one step until burnt with Fire (the fire jumps from one cactus to the other; the ledges beside the stairs carry more cacti and bushes). A signpost by the river and the elves hint at both. Exit east at the top of the stairs → Sunken Ruins.
3. **Elvenglade** (peaceful): a small village of elves (small folk with pointed ears) among great trees, with leaf-roofed houses. Elder Sylwen, a few elves, and **Faelar's magic shop** – a building with a potion bottle painted above its door; inside, Faelar sells *Scroll: Ice* plus ethers and a Frost Shard across the counter. Exit south → Greenwood River.
4. **Sunken Ruins** (wild): sand-swallowed ruins of an old temple – cracked flagstones, broken pillars and walls. **Skeletons** lie everywhere: three are dormant enemies that rise when heroes come within 2 cells, the others are harmless remains (same look). **Ancient traps** on the paths stop the party. An **invisible chest** (Speed Anklet) can only be found with Discover. Exit west → Greenwood River, exit east → Sandhollow (west gate).
5. **Sandhollow** (peaceful village): adobe houses, well, palms, market. Two houses can be entered: **Elder Hamid's house** and the inn **The Sleeping Camel** ("INN" painted above its door; ground floor with Dara behind the counter and the stairs, upper floor with two beds). NPCs: weapon smith Brann, item merchant Salma, mage vendor Oriel, innkeeper Dara, child Nia, wandering villagers, guard at the east gate. West gate → Sunken Ruins. Exit east → Scorpion Dunes (disabled until the Elder's quest starts).
6. **Scorpion Dunes** (wild): dunes with heights, rocks, cacti, quicksand, a small oasis. Enemies: Sand Scorpions (some in pairs), Giant Condors, **Emperor Scorpion** (boss, guards the road). Chest with Village Charm. Exit west → Sandhollow; exit east → "the road continues…" (disabled – end of demo).
7. **Temple Mountain** (peaceful): east of the Scorpion Dunes (the road opens after reporting to the Elder). A tall, vertical map climbed in zig-zags: stairs up, along a ledge to the left, stairs up, along a ledge to the right … to a plateau with the **Temple of the Still Sky** (tiered roofs, stone lanterns, prayer flags). Pilgrims on the ledges. From the foot of the mountain a path leads east to the **Reed Pond**.
8. **Temple** (interior): monks meditating on cushions around a Buddha statue, incense. A **free cushion** faces them: sitting there starts the conversation, the three monks speaking in turns. They offer to teach an old technique against evil – **Holy** – if the heroes prove worthy by returning the three tokens stolen from the temple. Behind them a hidden door opens once the tokens are back: the **Hall of Fears** (a dark room where the heroes' fears take shape: Shadow Knight, Shadow Mage, Shadow Thief, Shadow Monk); when all are beaten, the gate to the **orb chamber** opens – the **Holy Orb** teaches the Monk *Holy*.
9. **Reed Pond** (wild): shallow water (walkable, freezable) and deep water (only frozen). **Fishfolk** (humanoid fish, amphibious) and **Bog Toads** (amphibious) – in deep water only lightning reaches them. The **Token of Serenity** lies on an islet in the middle.
10. **Endless Dunes → Mirage Tower**: a south exit of the Scorpion Dunes leads into the Endless Dunes, whose edges lead back into themselves. Only who gets **lost** (crossing them three times) sees the **Mirage Tower** appear. Five floors:
   - F1: the hall – a floor switch opens a gate only while someone stands on it; stepping off, the gate closes again → "we have to split up". One team holds the switch, the other passes; inside, a switch opens the gate for the first team. Each team reaches its own stairs.
   - F2 (puzzle): two halves divided by a wall – each team's switch opens the *other* team's gate, so they take turns.
   - F3 (puzzle): an ice lane slides each team straight onto a latching plate that opens the other team's stairs gate (one hero is enough, so an uneven split never gets stuck).
   - F4 (fight): Mirage Phantoms on both sides of the wall.
   - F5 (boss): the teams enter the boss room from two entrances – the **Mirage Djinn** and its phantoms guard the **Token of Foresight**.
   The stairs are together-exits (§5.3): the teams stay apart from F1 to F5.
11. **Verdant Isle** (wild) – by ship: Captain Rhea sails there from Saltmere Harbor once the monks have given the task. A rainforest of **sentient fruit and vegetables** that fight together: **Tomato** soaks the heroes (Water Spit), **Lemon** zaps the wet ground (Zap), **Watermelon** walls them in with brambles (Seed Ring), **Chili** burns (Flame Spit). A few groups on the way; in the **garden** of a house the **Pumpkin King** and all of them hold the island's elder, **Old Mora**, hostage. After the fight Mora (in her house) gives the **Token of Life**. Rhea's boat takes the party back.
12. **The Grave Toad's cave**: once the Holy Orb is claimed, a cave opens half-way up Temple Mountain. It leads down to the **Grave Toad** (§12.7) and its two Bone Acolytes – the end of the demo.
13. **Quests**: *Into the Desert* (prologue, starts at the harbor: reach the Greenwood → cross the river → cross the ruins to Sandhollow; completing it starts the main quest), *Road to the Oasis* (main, hierarchical: talk to Elder → complete *Clear the Dunes* → report back), *Clear the Dunes* (defeat Emperor Scorpion; hidden ending: defeat all enemies → extra reward), *Nia's Charm* (side quest; switchable), *The Mountain Temple* (main, after *Road to the Oasis*: climb the mountain → speak with the monks → find the three tokens → return them → face your fears → claim the Holy Orb).

Enemy stats:
| Enemy | Lvl | HP | STR | DEF | MAG | MDEF | SPD | Move | Skills | Weak/Resist | EXP / Gold | Drops |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Sand Scorpion | 2 | 30 | 10 | 9 | 2 | 4 | 6 | `scuttle` (diag. slide 2 + 1 step) | Poison Sting | weak ice / resist earth | 9 / 6 | Antidote 25% |
| Giant Condor | 3 | 26 | 11 | 5 | 4 | 6 | 14 | `flyer` (any cell ≤3, ignores height) | Dive, Gust | weak thunder | 11 / 8 | Potion 20%, Phoenix Feather 5% |
| Skeleton | 3 | 34 | 11 | 7 | 2 | 4 | 7 | `rook2` | Bone Rattle (may Slow) | weak fire, holy ×2 / resist ice, poison immune | 14 / 9 | Potion 20% |
| Fishfolk | 5 | 48 | 14 | 9 | 5 | 8 | 9 | `walk1` + swims (amphibious) | Spear Jab, Bubble (may Slow) | weak thunder / resist ice, fire | 20 / 14 | Potion 20% |
| Bog Toad | 4 | 40 | 12 | 8 | 3 | 5 | 6 | `king1` + swims (amphibious) | Tongue Lash, Croak (Sleep) | weak thunder / resist earth | 16 / 10 | Antidote 25% |
| Mirage Phantom | 6 | 50 | 13 | 7 | 12 | 12 | 11 | `flyer` | Mirage Touch (Blind) | weak holy ×2 / resist fire, ice | 24 / 16 | Ether 15% |
| Mirage Djinn (boss) | 9 | 320 | 18 | 12 | 20 | 16 | 12 | `king1` | Sand Blade, Mirage Storm (all, Blind) | weak holy, ice / resist fire, earth | 150 / 120 | Token of Foresight (story) |
| Tomato | 6 | 44 | 12 | 8 | 8 | 8 | 10 | `walk1` | Water Spit (board), Splat | weak fire | 18 / 12 | Potion 20% |
| Lemon | 6 | 38 | 9 | 7 | 14 | 10 | 12 | `diagonal2` | Zap (board), Sour Spray (Blind) | weak earth / resist thunder | 18 / 12 | Eye Drops 25% |
| Watermelon | 7 | 70 | 15 | 12 | 6 | 8 | 5 | `walk1` | Seed Ring (board), Body Slam | weak fire | 22 / 14 | Hi-Potion 10% |
| Chili | 7 | 42 | 13 | 7 | 13 | 9 | 13 | `rook2` | Flame Spit (board), Hot Pepper (fire) | weak ice / resist fire | 22 / 14 | Fire Bomb 20% |
| Pumpkin King (boss) | 10 | 380 | 20 | 15 | 14 | 12 | 8 | `king1` | Vine Lash, Harvest Moon (all) | weak fire / resist earth | 180 / 150 | – |
| Shadow Knight / Mage / Thief / Monk | 10 | 160 | the heroes' fears: each fights like its hero's class | | | | | – | class attacks, dark | weak holy ×2 | 60 / 0 | – |
| Emperor Scorpion | 6 | 180 | 17 | 14 | 8 | 8 | 7 | `king1` | Crushing Claw, Venom Tail, Sandstorm | weak ice / resist earth, fire | 80 / 60 | Scorpion Shell 100% |

---

## 19. Resolved design decisions
Where the rough ideas were incomplete or conflicting, these rules were chosen:
1. **No attack patterns** (correction) → attacking = moving onto a hostile piece with the move pattern; party attack reach = party move reach (§8.6).
2. **Party speed**: "lowest speed counts" + "same order as before" → the party occupies one slot at its slowest member's SPD, members act consecutively (§7.1).
3. **Party move once**: party moves only if no member moved this round (§8.2).
4. **Split party on same cell** fights together → engagement pulls in all same-faction characters on the cell (§8.4).
5. **"Status only on landing" vs burning each turn** → landing applies effects; burning additionally damages each turn spent on it (§7.4).
6. **Board damage**: board abilities don't deal direct damage; offensive magic creates field effects/statuses. Battles remain the place for damage (§13.3).
7. **Items unlimited per board turn**, but one action per turn in battle (FF convention).
8. **Heal on board** targets a cell and heals all characters on it (any faction, not NPC-only cells unless NPC is targetable) (§13.3).
9. **NPC interaction** stops the hero in front of the NPC (§8.8). Steal on board = NPC option.
10. **Exits** move all heroes; enemies can't use exits (§5.3).
11. **Escape** returns the attacker to its origin (§8.5).
12. **Quest progress** evaluated only for the active quest, but conditions are state-based so nothing is lost when switching (§10.4).
13. **Boards without enemies are explored freely** – no rounds, walk anywhere reachable (user decision, replaces the earlier "peaceful boards are turn-based") (§8.10).
14. **Ambush/First Strike** probabilities defined, modified by Hide and Perceive (§8.4).
15. **Fallen heroes** stay on their cell and are revived there (user correction) (§3.4).
16. **NPCs are walk-through and interactions happen on their cell** with a close-up view; cancelling an interaction undoes the move (user suggestion) (§8.3, §8.8).
17. **Weapons, armor, accessories, enemies, formulas** were unspecified and are defined in §12–14 based on FF/Shining Force conventions.
18. **Board rotation as a unit** (user request): the terrain spins as one solid made of per-cell meshes, upright sprites (characters, decor) keep their own logic and turn their facing at the half-way point (§16).
19. **Water & ice**: Ice freezes the 9-neighbourhood of water cells (non-water neighbours ignored) or, aimed at land, a line of 3 along the caster → target direction (user spec); Ice 2/3 use 5/7. It lasts 4 rounds (×3 by time while exploring); frozen water is a walkable ice bridge; stepping on ice slips you to its end; if it melts under you, you're put back where you stepped onto it (user spec, §5.4, §7.4).
20. **Fire**: burns flammable terrain at once and spreads one ring per round to 4-neighbour flowers/grass; no effect on water; melts ice (§5.4). Only grass and flowers burn – forest floor, trees and buildings don't, so a spell can't burn down a whole map.
21. **Ice is bought, not levelled**: Mira no longer learns Ice at level 2; the Elvenglade magic shop sells the scroll, which makes the river crossing the gate to the rest of the demo.
22. **Discover & Defuse** (user spec): Discover reveals everything hidden within 3 cells at once (no markers) – traps show, hidden objects appear, skeletons rise; Defuse turns a visible trap into a Snare item that can be set on wild boards (§7.5).
23. **Hidden traps stop movement**: a hero piece passing through an ancient trap stops on it (and an enemy passing through a thief trap); flying pieces are not caught. Dormant skeletons interrupt movement as soon as they could reach the party, then ambush it (§7.5).
24. **Cell effects on crossing, anchored per party** (user spec): effects also hit while walking through; the start-of-turn repeat is tied to the member who moved the party there (§7.4).
25. **Peaceful boards run field effects by time** (user spec): 1.5 s per round, ice ×3 (§8.10).
26. **Swimming**: heroes never swim; shallow water is walkable, deep water only when frozen. Swimmers are an enemy property (`water` only / `amphibious`) (§5.5).
27. **Lightning in water** (user spec: "travels 4 tiles … connected in a 4-neighbourhood", more damage in water, less with distance) → ×1.5 at the struck cell, −0.25 per step, hits allies too (§5.6).
28. **Seeds grow one round later** and never under a piece; brambles are cut with a sword (Cut, granted by all swords) or burnt (§5.7).
29. **Split floors**: together-exits keep separated teams apart across floors; the tower is only left through the boss room (§5.3, §18).
30. **Getting lost**: the Endless Dunes loop into themselves; the third crossing reveals the Mirage Tower (a map switch, not a hidden cell) (§18).
31. **Token names**: Serenity (pond), Foresight (tower), Life (island) (user asked for a name for the pond's token).
32. **Holy** is learned from the Holy Orb by the Monk (like a scroll); undead and shadows (skeletons, phantoms, fears) take double (§13.3).
33. **Swallow** (user spec: spat out two rounds later with half its HP and some MP stolen, untargetable meanwhile, released unharmed if the boss dies, gains shown half at a time) → the loss is based on HP when swallowed and never kills; MP = 30 %; one victim at a time, never the last hero (§12.7).
34. **Henchmen** buff first, then attack (priority AI rules); **re-summoning** costs the boss 120 G of its reward and happens with 40 % per turn once both are down, so not right away (§12.7).
35. **Final boss placement**: the cave opens half-way up the mountain after the Holy Orb – Holy is the answer to an undead boss (§18).
36. **Ships** (user request: "diagonal pieces instead of straight blocks and overhangs", "small walls on deck and a steering wheel") → shaped blocks: diagonal cuts, hull flare with water beneath, bulwarks open at the gangway; the wheel is decor (§5.9).
37. **Enemy levels and equipment** (user request) → optional `growth` + a level per map entry; optional equipment slots using the hero equipment rules; rewards scale with level (§12.6).
38. **Teleports** (user decision): arrivals (`spawns`) are never placed by themselves – they come with the exit or teleport action that leads there and go with the last one; exits are one-way by default, "way back" creates the return exit, and every arrival lies one cell in front of an exit so the party can't bounce back and forth (RPG Maker style). The game start and the Quick Play start are arrivals with a role (§5.3).
39. **Entities with states and handlers** instead of pages and special kinds (user direction): gates, floor switches and hidden traps become entity presets; wall signs become decor; exits, arrivals and enemies stay kinds of their own (§10.3).
40. **One entity per cell** in the editor: placing a new one or a copy only works on a free cell.
