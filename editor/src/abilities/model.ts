import type { RawContent } from "../../../src/core/data/database";
import type { AbilityDef } from "../../../src/core/data/types";
import { addEntry } from "../forms/entries";
import type { Project } from "../project";

/** Abilities (editor-design §10): the project's own, new ones, and who has each. */

export type Ability = Omit<AbilityDef, "id">;

export const ABILITIES_FILE = "data/abilities.yaml";
const HEADER = "# The project's own abilities (docs/game-design.md §13, edited in the editor: docs/editor-design.md §10).\n";

/** Starting points for a new ability. */
export const ABILITY_PRESETS: { id: string; label: string; ability: Ability }[] = [
  { id: "strike", label: "Attack skill", ability: { name: "Strike", type: "Skill", mp: 3, icon: "type_skill", description: "A strong blow.", battle: { target: "enemy", effects: [{ type: "damage", kind: "physical", power: 1.5 }] } } },
  { id: "spell", label: "Attack spell", ability: { name: "Spark", type: "Magic", group: "Attack", mp: 4, icon: "fire", description: "Fire damage to one enemy.", battle: { target: "enemy", effects: [{ type: "damage", kind: "magical", power: 1.2, element: "fire" }] }, board: { range: "lib:range3", targets: ["enemy"], effects: [{ type: "damage", kind: "magical", power: 1.2, element: "fire" }] } } },
  { id: "heal", label: "Healing", ability: { name: "Mend", type: "Magic", group: "Support", mp: 4, icon: "heart", description: "Restores HP.", battle: { target: "ally", effects: [{ type: "heal", base: 20, scale: 1.5 }] }, board: { range: "lib:range2", targets: ["hero"], effects: [{ type: "heal", base: 20, scale: 1.5 }] } } },
  { id: "status", label: "Status spell", ability: { name: "Hex", type: "Magic", group: "Support", mp: 5, icon: "status_slow", description: "Slows an enemy.", battle: { target: "enemy", effects: [{ type: "applyStatus", status: "lib:slow", chance: 0.7, turns: 3 }] } } },
  { id: "buff", label: "Buff", ability: { name: "Ward", type: "Skill", mp: 3, icon: "status_protect", description: "Protects an ally.", battle: { target: "ally", effects: [{ type: "applyStatus", status: "lib:protect", turns: 3 }] } } },
  { id: "field", label: "Field spell", ability: { name: "Blaze", type: "Magic", group: "Attack", mp: 6, icon: "fire", description: "Sets the ground on fire.", board: { range: "lib:range3", area: "lib:diamond1", targets: ["anyCell"], effects: [{ type: "fieldEffect", effect: "lib:burning", rounds: 3 }] } } },
];

export const EMPTY_ABILITY: Ability = { name: "New ability", type: "Skill", mp: 0, battle: { target: "enemy", effects: [] } };

export function addAbility(project: Project, ability: Ability, label = `New ability ${ability.name}`): string {
  return addEntry(project, ABILITIES_FILE, HEADER, ability, (x) => x in project.content.raw.abilities, label, "ability");
}

/** The menus abilities are listed under (Magic, Sword Art …), from the content. */
export const abilityTypes = (raw: RawContent) => [...new Set(Object.values(raw.abilities).map((a) => a.type))].sort();
export const abilityGroups = (raw: RawContent) => [...new Set(Object.values(raw.abilities).map((a) => a.group).filter((g): g is string => !!g))].sort();

export interface AbilityUse {
  kind: "class" | "item" | "enemy";
  id: string;
  /** "at level 3", "grants", "teaches", "battle AI" … */
  how: string;
}

/** Who has an ability: classes (by level), items (granting, teaching), enemies (battle / board AI). */
export function abilityUsers(raw: RawContent, ability: string): AbilityUse[] {
  const out: AbilityUse[] = [];
  for (const [id, c] of Object.entries(raw.classes)) for (const a of c.abilities ?? []) if (a.ability === ability) out.push({ kind: "class", id, how: `at level ${a.level}` });
  for (const [id, i] of Object.entries(raw.items)) {
    if (i.equip?.grants?.includes(ability)) out.push({ kind: "item", id, how: "while equipped" });
    if (i.learn?.ability === ability) out.push({ kind: "item", id, how: "teaches it" });
    const effects = [...(i.battle?.effects ?? []), ...(i.board?.effects ?? [])];
    if (effects.some((e) => e.type === "learnAbility" && e.ability === ability)) out.push({ kind: "item", id, how: "teaches it" });
  }
  for (const [id, e] of Object.entries(raw.enemies)) {
    if ((e.ai ?? []).some((r) => r.action === ability)) out.push({ kind: "enemy", id, how: "in battle" });
    if ((e.boardAi?.abilities ?? []).some((a) => a.ability === ability)) out.push({ kind: "enemy", id, how: "on the board" });
  }
  return out;
}
