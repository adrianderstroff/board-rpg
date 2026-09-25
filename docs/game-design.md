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

### 5.2 Board types
- **Peaceful**: no enemies; NPCs wander. Turns still run (the board is always a board game), but NPC turns are animated quickly.
- **Wild**: enemies present; NPCs may be present, flagged as targetable or ignored by enemies.
- Board contents can change via event conditions (e.g. enemies appear once a quest step starts).

### 5.3 Exits
Single cells marked with an **arrow pointing outwards**. Moving a hero onto an enabled exit asks *"Travel to ⟨board⟩?"*; on *Yes* **all heroes** (including fallen) travel to the target board's entry point. Exits can be enabled/disabled by conditions (quest flags); disabled exits show a greyed arrow and are not walkable. Enemies never use exits.

---

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
| **Ability** | once | Includes *Join Party* / *Leave Party*. |
| **Item** | unlimited | Use/give items; targets via item pattern. |
| **Act** | unlimited | Only when sharing a cell with a villager: opens the interaction close-up (§8.8). |
| **Stats** | – | Shows the character's stats window. |
| **End Turn** | – | |
| **End Party** | – | Ends the turn of every party member who hasn't acted yet (convenience). |

Move and Ability can be done in any order. The system **Menu** (§11) is available while it is a hero's turn. The cursor can roam freely to inspect any cell/character (Stats on others).

### 7.3 Move flow
1. Choose *Move* → reachable cells are highlighted.
2. Cursor moves freely; only highlighted cells can be selected.
3. The piece walks along the shortest path (sliding on ice, see §7.4).
4. No confirmation prompt: the move happens immediately and the command box shows **Undo Move** instead of *Move*. Undo restores the exact previous state. It is only offered while nothing else happened since: no ability, item, interaction or turn end, and landing had no effect (trap, field effect damage/status, ice slide, step event). Attacks (engagements) ask *Attack?* before moving and can't be undone.

### 7.4 Field effects
Cells may carry **temporary field effects** (from abilities/items, with a duration in rounds) or permanent ones (from terrain):
| Effect | On landing | While standing there |
|---|---|---|
| **Burning** | 8% max HP fire damage | 8% max HP fire damage at the end of each of the character's turns |
| **Poisonous** | Poison for 2–4 turns (random) | – |
| **Frozen** | Character slides in its moving direction until it reaches a non-frozen cell or the next cell is invalid (blocked/height/edge/occupied) | – |
| **Sticky** | Stuck status (§4.2) | – |

A field effect hits a **piece once as a group** (every member once): when the piece **lands** on the cell (passing through does nothing) and again at the **start of the piece's turn** each round (when its first member starts acting) – damage and status, but no sliding. Flying pieces are unaffected. Board damage cannot KO heroes (they stay at 1 HP) but can KO enemies (EXP/gold are shared by all heroes).

**Traps** (Thief) are hidden cell objects: the first enemy landing on it takes damage and gets *Stuck*; the trap is consumed. Enemies cannot see traps.

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
- **Battle AI**: weighted list of actions with conditions (`hpBelow`, `targetHasStatus`, `chance`, `turnMod`); targets chosen by rule (`random`, `lowestHp`, `highestThreat`).
- **Board AI** behaviors: `aggressive` (engage reachable hero, else approach nearest visible hero), `guard` (hold until a hero is within `aggroRange`, then aggressive), `wander` (random moves within radius), `static`. Hidden heroes are ignored. NPCs use wander/static.
- **Before moving** an enemy may use its ability action: leave/join a party (§8.7) or a **board ability** from `boardAi.abilities` (each with a chance per turn). Targets are scored: offensive abilities prefer cells with the most visible heroes and avoid hitting allies; supportive ones prefer wounded allies. The area is flashed briefly before it lands.

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
| Ice | Magician 2 | 5 | Ice magic power 1.0 | Frozen cross area (3 rounds), range 3 |
| Sleep | Magician 4 | 5 | Sleep 60%, 3 turns | Sleep on characters of a cell, range 3 |
| Thunder | Magician 7 | 8 | Thunder power 0.8 all enemies | – |
| Venom Mist (scroll) | Magician | 5 | Poison 70% all enemies | Poisonous diamond area r1 (3 rounds) |
| Quagmire (scroll) | Magician | 4 | Slow one enemy 3 turns | Sticky cross area (3 rounds) |
| Steal | Thief 1 | 0 | Steal from an enemy | *Steal* option at NPCs / adjacent enemies |
| Hide | Thief 1 | 2 | Hidden 1 turn (untargetable) | Hidden 2 rounds |
| Trap | Thief 3 | 3 | – | Hidden trap on an empty cell, range 2 |
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
| Frost Shard | battle item | 60 | Ice 45 fixed dmg one enemy / board: frozen cell, range 3 |
| Sleep Powder | battle item | 50 | Sleep 70% one enemy / board: sleep on a cell, range 2 |
| Glue Pot | battle item | 40 | Slow one enemy / board: sticky cell, range 3 |
| Scroll: Venom Mist | scroll | 200 | Magician learns Venom Mist |
| Scroll: Quagmire | scroll | 180 | Magician learns Quagmire |
| Scroll: Cross Slash | scroll | 250 | Knight learns Cross Slash |
| Scroll: Aura | scroll | 220 | Monk learns Aura |
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
- **Inn** (innkeeper, bed sign): Rest for `10 × party size` gold → full HP/MP, revive fallen, cure statuses.

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
- **Resolution**: 480×270 virtual pixels, scaled to fit. Menus use roomy 15px rows (the battle command box uses 12px rows to fit its fixed height).
- **Flying pieces** hover ~10px above their cell with a slow bob; a round shadow stays on the ground.
- **Map rotation**: the board can be turned in 90° steps (Q/E, gamepad shoulder buttons, or the two rotate buttons with arrow icons at the bottom right) so tiles hidden behind heights become visible. It rotates around the cursor cell, which keeps its place on screen (the camera may move up to a screen beyond the map edges for this). Blocks are redrawn from the new angle, characters face their new screen direction, decor stays upright. Cursor keys always follow the screen.
- **Phones**: landscape only. The first tap requests fullscreen and a landscape lock (Android); held upright, a "turn your phone" hint is shown. The web app manifest makes "Add to Home Screen" launch fullscreen landscape (also the way to get fullscreen on iPhone). System → Fullscreen toggles it on any device.

---

## 17. Data & content architecture
- **Data files** (YAML, commented, hand-editable) in `data/`: `classes`, `abilities`, `items`, `patterns`, `statuses`, `enemies`, `npcs`, `shops`, `dialogs`, `quests`, `chipsets`, `charsets`, `maps/*.yaml`, `config`.
- **Graphics** in `public/assets/`: `charsets/` (RPG-Maker style walk sheets), `chipsets/` (isometric blocks + decor), `battlers/`, `faces/`, `system/` (window skin, cursor, icons, font, field effect overlays), `battlebacks/`.
- **Maps** combine graphics and logic RPG-Maker-style: layers `terrain` (chipset terrain keys), `height`, `decor`, plus `events`, `exits`, `enemies`, `spawns`.
- **Game state** is one serializable object (heroes, inventory, gold, flags/vars, quests, current board incl. turn state, per-map memory, kill records, RNG state) → save/load is `JSON.stringify`.

---

## 18. Demo content
1. **Sandhollow** (peaceful village): adobe houses, well, palms, market. NPCs: Elder Hamid, weapon smith Brann, item merchant Salma, mage vendor Oriel, innkeeper Dara, child Nia, wandering villagers, guard at the east gate. Exit east → Scorpion Dunes (disabled until the Elder's quest starts).
2. **Scorpion Dunes** (wild): dunes with heights, rocks, cacti, quicksand, a small oasis. Enemies: Sand Scorpions (some in pairs), Giant Condors, **Emperor Scorpion** (boss, guards the road). Chest with Village Charm. Exit west → Sandhollow; exit east → "the road continues…" (disabled – end of demo).
3. **Quests**: *Road to the Oasis* (main, hierarchical: talk to Elder → complete *Clear the Dunes* → report back), *Clear the Dunes* (defeat Emperor Scorpion; hidden ending: defeat all enemies → extra reward), *Nia's Charm* (side quest; switchable).

Enemy stats:
| Enemy | Lvl | HP | STR | DEF | MAG | MDEF | SPD | Move | Skills | Weak/Resist | EXP / Gold | Drops |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Sand Scorpion | 2 | 30 | 10 | 9 | 2 | 4 | 6 | `scuttle` (diag. slide 2 + 1 step) | Poison Sting | weak ice / resist earth | 9 / 6 | Antidote 25% |
| Giant Condor | 3 | 26 | 11 | 5 | 4 | 6 | 14 | `flyer` (any cell ≤3, ignores height) | Dive, Gust | weak thunder | 11 / 8 | Potion 20%, Phoenix Feather 5% |
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
13. **Peaceful boards are also turn-based** for consistency; NPC turns play fast (§5.2).
14. **Ambush/First Strike** probabilities defined, modified by Hide and Perceive (§8.4).
15. **Fallen heroes** stay on their cell and are revived there (user correction) (§3.4).
16. **NPCs are walk-through and interactions happen on their cell** with a close-up view; cancelling an interaction undoes the move (user suggestion) (§8.3, §8.8).
17. **Weapons, armor, accessories, enemies, formulas** were unspecified and are defined in §12–14 based on FF/Shining Force conventions.
