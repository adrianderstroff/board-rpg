
The game idea is a pixel are mix of an rpg and a board game / games like shining force. following features should be in the game. you probably need to make a whole plan with packages and subtasks. you can rearrange tasks to other packages if that makes more sense to you:

Package: General

- Heros can have different classes and thus different abilities (knight, magician, thief, monk)
- heros and enemies have levels, strength, defence, magical defence, magical attack, hp, mana, speed
- certain abilites can be used in fights but also on the board (they might behave differently)
- some abilities cause status effects that might or might not persist through the board and fights

Package: Final fantasy like fights

- Turn based fights with enemies on the left and heros on the right
- Characters have speed stats that determines the order
- there is the options Fight, Ability, Item, Run
- There is normal fights, ambush (all enemies attack) then the normal order proceeds,  first strike (same as ambush but advantage for heros)
- after a fight the game returns to the board

Package: good game structure

- make sure the way you design the different systems in a composible and easily extendible way without making it too complicated
- it might make sense to define abilities, weapons, classes etc in separate files in a data driven way (maybe using ini or any established formats)
- ideally separate the definition of the graphics, maps, somehow. the map could contain fields with logic so we can later edit it with a game editor.
- try to bundle the game state in a single place, this way its easier to save and load it

Package: items
- there are progress related items (they cannot be sold), weapons, armor, healing items (heal hp, different status effects, revive fallen player, recover mana), scrolls to learn new abilities (for magicians, warriors, thiefs etc) which are one time use, items that work similar to spells that can either attack others or cause status effects
- certain weapons have abilities as long as they are equipped, weapons also have physical strength and maybe also magical strength and affect speed, armor can have physical and magical defense and also affect speed (player classes also have base speed stats) 

Package: general design

- it makes sense that patterns can be designed and then movements of certain player classes or abilities can use these patterns for easier editability and reusability

Package: board general

- the board doesnt need to be square, it can has arbitrary size. it also has different heights so this can affect the movement because if a neighboring field is two block heights difference then its not reachable from the current field, we can only travers neighboring fields that have no or only one block height difference
- for your players when its a players turn the cursor jumps on the players field
- clicking the player shows a box with Move / Ability / Item
- in each round the player can use as many items as they want, but they can only move once and use an ability once, the order of these doesnt matter
- leaving or joining a party counts as ability
- when clicking move the possible fields are shown then the player moves the cursor freely across the board to any of the possible fields and then selects the field, the player moves then to there on the shortest possible paths
- similar does it work for abilities the player selects an ability an ability also has a specific pattern that is used to show the available pattern (but depending on the ability not all of the available fields can be targeted)
- spells have targets they act on (e.g. hero, enemy, players, certain objects in the scene)
- some spells can also target fields to give them temporary status effects (like burning, poisonous, frozen, sticky)
- for burning the player on the field takes damage each turn they are on the field
- for poisonous the player on the field gets the poisoned status for a random amount of turns)
- for frozen does the player slide in the facing direction until he lands on a non icy field or if there is no next valid field in that direction
- for sticky the movement radius will reduced by one or if the movement radius is already one then the player cannot move the next turn
- a status effect is only applied to a player if they land on that field

Package: board movement

- isometric scene where heros and enemies are placed
- characters take turns to move based on their move pattern (same idea like chess but different move patterns)
- the attack pattern might differ from the movement pattern
- characters can group multiple characters together to a party but the movement and attack will be unionized but depend on the distance of weakest party member ie if the knight can only move on field in some directions then his reach is 1 if he can attack 2 fields in a direction and the other party member 3 then the attack reach is only 2. basically all moves of all party members are unioned but then all moves past the reach of the slowest for movement or attack reach for attack are cut off.
- the order of when each charater moves depends on their speed stat (for a group the lowest speed stat count)
- when a player attacks an enemy piece or vice versa then a turn based compat is initiated
- abilites also have different patterns from the attack or move patterns

Package: Board party rules
- the order in which members of a partys turn is determined is the same as before
- a party counts as one unit when moving ie all move together. does the first player of the party move, then when its the other two party members turn then they have no move left
- however they can still use items or use their ability
- if the party moved and one player leaves the party then this player also cannot move in this turn
- if an enemy attacks a party that split up but all players are still on the same field then in battle they still count as party
- in a fight all players in the party fight
- enemies can also form parties or start as a party the same rules apply for them

Package: Boards

- there can be different boards, peaceful boards where no enemies are, but npc can move around there or wild boards where we have enemies (board states might also change by some event triggers), npc can also be on wild boards and depending on some flags can they be targeted by the enemy or they are ignored
- when a hero moves on a piece with an npc a dialog is shown or if multiple actions are possible then a selection of different options is shown that the user can choose from (one such option could be steal)
- if they choose talk then some dialog shows up with textboxes
- some npcs are shop owers, for magic, weapons or items they should be clearly distinguishable and should look always the same
  boards can have exits, these are single tiles with an arrow pointing outwards which leads to another board (exits can be disabled from the quest engine)

Package: Textboxes

- have picture of the person talking (use a generic image for non important npcs)
- the text in the textbox appears like in a typewrited
- text box can have different words or spans of words in the text that might have different color size or mood (like animated in sine or some other stuff)
- the text should easily editable by adding certain special characters in the text that are translated in the color, size, mood etc
- textboxes can also have multi options to choose from that steer the conversation

Package: Quest engine

- represents what currently has to be done
- in a fight it can just be that all enemies need to be killed or a certain enemy needs to be killed
- in peaceful boards it can be that the player has to talk with someone but there can also be more conditions that we can add later
- a quest might have multiple finish conditions but some of them can be hidden (so they don't show up anywhere but can lead to some new quest)
- a win condition can create a new quest that is started
- there can be hierarchical quests (e.g. beat the main antagonist, but it involves finishing all sub tasks)
- there can always only be one quest active, the user might switch quests, but sometimes a quest cannot be switched
- a quest can have multiple sequential steps that have conditions and also can set certain flags (like that all/some exits are disabled)

Package: Abilities

- there are different types of abilities and different player classes have one or more abilities
- the ability types are Magic, sword art, steal, trap, percieve, hide ... (maybe more)
- abilities have to define where they work and how (so on board, or in battle)
- e.g. heal should work on the board and in the battle but they behave differently. in battle you simply select any player you want to heal (either your own heros or even the enemy), on the board choose Magic > Def > Heal then some fields are shown move the cursor to the field you want to cast it to (should only be allowed if some non-npc player is on there)

Package: Menu
- menu is only accessible on the board when its your turn
- the menu has different pages Heros Stats, Items, Save / Progress, System (also have exit game here)

Package: UI / UX
- in battle show the ui once its a players turn otherwise its an empty box or the box mentions what action was done by the enemy and how gained / lost hp
- always show player names, hp, mp, exp and the character portrait
- on the board only show the stats when the cursor clicks on a character and chooses stats, that works on any player but for enemies it might not show the concrete hp, mp etc, nps also usually show there hp, mp etc, that stats also shows a short text about that character
- when showing the abilities there could be already a real preview of the reach of the ability
- when the player moved they have to confirm their move or cancel, then the player jumps back to the previous field

Corrections
- after thinking about it, i think attack patterns shouldnt be different, otherwise it becomes to complicated, so we only have patterns for movement and abilities and also items (that can be used on others)
