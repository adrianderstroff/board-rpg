import type { Document } from "yaml";
import type { BattleTarget, BoardTargetFilter, EffectDef, EquipSlot, ItemCategory, ItemDef } from "../../../src/core/data/types";
import type { Project } from "../project";
import { projectIdFor } from "../projectFiles";

/**
 * Items (editor-design §8): one form for everything. The data keeps its shape (items.yaml); the
 * editor derives the category from the sections and offers presets for common items.
 */

export type Item = Omit<ItemDef, "id">;

/** The project's own items. */
export const ITEMS_FILE = "data/items.yaml";
const ITEMS_HEADER = "# The project's own items (docs/game-design.md §14, edited in the editor: docs/editor-design.md §8).\n";

export const CATEGORIES: [ItemCategory, string][] = [
  ["consumable", "Consumable"],
  ["battle", "Battle item"],
  ["weapon", "Weapon"],
  ["armor", "Armor"],
  ["accessory", "Accessory"],
  ["scroll", "Scroll"],
  ["key", "Quest item"],
];
export const categoryLabel = (c: ItemCategory) => CATEGORIES.find(([id]) => id === c)?.[1] ?? c;

/** The category the sections make (a quest item is chosen, not derived). */
export function deriveCategory(item: Item): ItemCategory {
  if (item.equip) return item.equip.slot;
  if (item.learn) return "scroll";
  if (item.battle && (item.battle.target === "enemy" || item.battle.target === "allEnemies")) return "battle";
  return "consumable";
}

/** Whether the category is the derived one (it then follows the sections). */
export const categoryIsAuto = (item: Item) => item.category === deriveCategory(item);

/**
 * An item after a change to its sections: the category follows along while it is the derived
 * one; an overridden category (or a quest item) stays.
 */
export function withChange(before: Item, after: Item): Item {
  if (before.category === "key" || !categoryIsAuto(before)) return after;
  return { ...after, category: deriveCategory(after) };
}

export const BATTLE_TARGETS: [BattleTarget, string][] = [
  ["enemy", "one enemy"],
  ["ally", "one ally"],
  ["self", "the user"],
  ["allEnemies", "all enemies"],
  ["allAllies", "all allies (the party)"],
  ["fallenAlly", "a fallen ally"],
  ["any", "anyone"],
];

export const BOARD_TARGETS: [BoardTargetFilter, string][] = [
  ["hero", "heroes"],
  ["enemy", "enemies"],
  ["npc", "NPCs"],
  ["anyCharacter", "anyone"],
  ["fallen", "fallen heroes"],
  ["self", "the user"],
  ["emptyCell", "an empty cell"],
  ["anyCell", "any cell"],
  ["trap", "traps"],
  ["plant", "plants"],
];

export const SLOTS: [EquipSlot, string][] = [
  ["weapon", "Weapon"],
  ["armor", "Armor"],
  ["accessory", "Accessory"],
];

/** Every effect type with its name in the form and a new row's values. */
export const EFFECT_TYPES: { type: EffectDef["type"]; label: string; make: () => EffectDef }[] = [
  { type: "damage", label: "Damage", make: () => ({ type: "damage", kind: "physical", power: 1 }) },
  { type: "fixedDamage", label: "Fixed damage", make: () => ({ type: "fixedDamage", amount: 30 }) },
  { type: "heal", label: "Heal", make: () => ({ type: "heal", base: 50 }) },
  { type: "healPercent", label: "Heal %", make: () => ({ type: "healPercent", percent: 50 }) },
  { type: "restoreMp", label: "Restore MP", make: () => ({ type: "restoreMp", amount: 25 }) },
  { type: "applyStatus", label: "Apply status", make: () => ({ type: "applyStatus", status: "lib:poison" }) },
  { type: "cureStatus", label: "Cure status", make: () => ({ type: "cureStatus", allNegative: true }) },
  { type: "revive", label: "Revive", make: () => ({ type: "revive", percent: 25 }) },
  { type: "fieldEffect", label: "Field effect", make: () => ({ type: "fieldEffect", effect: "lib:burning", rounds: 3 }) },
  { type: "freezeArea", label: "Freeze", make: () => ({ type: "freezeArea", effect: "lib:frozen", rounds: 3, size: 3 }) },
  { type: "shock", label: "Lightning", make: () => ({ type: "shock", power: 30, reach: 4 }) },
  { type: "cut", label: "Cut a plant", make: () => ({ type: "cut" }) },
  { type: "placePrefab", label: "Place a prefab", make: () => ({ type: "placePrefab", prefab: "lib:snare_trap" }) },
  { type: "steal", label: "Steal", make: () => ({ type: "steal" }) },
  { type: "reveal", label: "Reveal stats", make: () => ({ type: "reveal" }) },
  { type: "discover", label: "Discover", make: () => ({ type: "discover", radius: 3 }) },
  { type: "defuse", label: "Defuse a trap", make: () => ({ type: "defuse", item: "lib:snare" }) },
  { type: "learnAbility", label: "Learn ability", make: () => ({ type: "learnAbility", ability: "" }) },
];

/** Common items in one click (editor-design §8). */
export const PRESETS: { id: string; label: string; item: Item }[] = [
  {
    id: "potion",
    label: "Healing potion",
    item: {
      name: "Potion", category: "consumable", price: 20, icon: "potion", description: "Restores 50 HP.",
      battle: { target: "ally", effects: [{ type: "heal", base: 50 }] },
      board: { range: "lib:adjacent", targets: ["hero"], effects: [{ type: "heal", base: 50 }] },
    },
  },
  {
    id: "ether",
    label: "MP potion",
    item: {
      name: "Ether", category: "consumable", price: 60, icon: "ether", description: "Restores 25 MP.",
      battle: { target: "ally", effects: [{ type: "restoreMp", amount: 25 }] },
      board: { range: "lib:adjacent", targets: ["hero"], effects: [{ type: "restoreMp", amount: 25 }] },
    },
  },
  {
    id: "cure",
    label: "Cure",
    item: {
      name: "Antidote", category: "consumable", price: 15, icon: "antidote", description: "Cures poison.",
      battle: { target: "ally", effects: [{ type: "cureStatus", statuses: ["lib:poison"] }] },
      board: { range: "lib:adjacent", targets: ["hero"], effects: [{ type: "cureStatus", statuses: ["lib:poison"] }] },
    },
  },
  {
    id: "revive",
    label: "Revive",
    item: {
      name: "Phoenix Feather", category: "consumable", price: 150, icon: "feather", description: "Revives a fallen hero with 25% HP.",
      battle: { target: "fallenAlly", effects: [{ type: "revive", percent: 25 }] },
      board: { range: "lib:adjacent", targets: ["fallen"], effects: [{ type: "revive", percent: 25 }] },
    },
  },
  {
    id: "bomb",
    label: "Attack item",
    item: {
      name: "Fire Bomb", category: "battle", price: 60, icon: "bomb", description: "40 fire damage to all enemies.",
      battle: { target: "allEnemies", effects: [{ type: "fixedDamage", amount: 40, element: "fire" }] },
    },
  },
  {
    id: "powder",
    label: "Status item",
    item: {
      name: "Sleep Powder", category: "battle", price: 40, icon: "powder", description: "Puts an enemy to sleep.",
      battle: { target: "enemy", effects: [{ type: "applyStatus", status: "lib:sleep", chance: 80 }] },
    },
  },
  {
    id: "field",
    label: "Field item",
    item: {
      name: "Glue Pot", category: "consumable", price: 40, icon: "glue", description: "Covers the ground in glue.",
      board: { range: "lib:range3", area: "lib:diamond1", targets: ["anyCell"], effects: [{ type: "fieldEffect", effect: "lib:sticky", rounds: 3 }] },
    },
  },
  {
    id: "sword",
    label: "Weapon",
    item: { name: "Sword", category: "weapon", price: 100, icon: "sword", equip: { slot: "weapon", kind: "sword", stats: { str: 5 } } },
  },
  {
    id: "armor",
    label: "Armor",
    item: { name: "Vest", category: "armor", price: 80, icon: "vest", equip: { slot: "armor", kind: "lightArmor", stats: { def: 4 } } },
  },
  {
    id: "ring",
    label: "Accessory",
    item: { name: "Ring", category: "accessory", price: 200, icon: "ring", equip: { slot: "accessory", kind: "accessory", stats: { mag: 3 } } },
  },
  {
    id: "scroll",
    label: "Scroll",
    item: { name: "Scroll", category: "scroll", price: 150, icon: "scroll", description: "Teaches an ability.", learn: { ability: "", classes: [] } },
  },
  {
    id: "key",
    label: "Quest item",
    item: { name: "Old Key", category: "key", price: 0, icon: "key", description: "It opens something." },
  },
];

export const EMPTY_ITEM: Item = { name: "New item", category: "consumable", price: 10 };

/** An id for a new item from its name ("Hi-Potion" → hi_potion, then hi_potion_2 …). */
export function itemIdFor(name: string, taken: (id: string) => boolean): string {
  const base = projectIdFor(name || "item");
  let id = base;
  for (let n = 2; taken(id); n++) id = `${base}_${n}`;
  return id;
}

/** Adds an item to the project's items.yaml (made when missing); returns its id. */
export function addItem(project: Project, item: Item, label = `New item ${item.name}`): string {
  const raw = project.content.raw.items;
  const id = itemIdFor(item.name || "item", (x) => x in raw);
  project.transaction(label, () => {
    if (!project.paths(ITEMS_FILE).length) project.create(ITEMS_FILE, ITEMS_HEADER);
    project.edit(ITEMS_FILE, label, (doc: Document) => {
      doc.setIn([id], doc.createNode(structuredClone(item)));
      // sections in flow style, as the files are written by hand
      for (const key of ["battle", "board", "equip", "learn"]) {
        const node = doc.getIn([id, key], true) as { flow?: boolean } | undefined;
        if (node && JSON.stringify((item as Record<string, unknown>)[key]).length < 110) node.flow = true;
      }
    });
  });
  return id;
}

/** Removes one of the project's items. */
export function deleteItem(project: Project, id: string) {
  project.edit(ITEMS_FILE, `Delete ${id}`, (doc: Document) => doc.deleteIn([id]));
}

// ---------- in words ----------

const turnsText = (t: number | [number, number] | undefined) => (t === undefined ? "" : Array.isArray(t) ? ` for ${t[0]}–${t[1]} turns` : ` for ${t} turns`);
const plain = (id: string) => id.replace(/^lib:/, "");

/** One effect in words ("heal 50 HP", "poison (80 %)"). */
export function effectText(e: EffectDef): string {
  switch (e.type) {
    case "damage":
      return `${e.kind} damage ×${e.power ?? 1}${e.base ? ` +${e.base}` : ""}${e.element ? ` (${e.element})` : ""}`;
    case "fixedDamage":
      return `${e.amount} ${e.element ? `${e.element} ` : ""}damage`;
    case "heal":
      return `heal ${e.base ?? 0} HP${e.scale ? ` + ${e.scale}×MAG` : ""}`;
    case "healPercent":
      return `heal ${e.percent} % HP`;
    case "restoreMp":
      return `restore ${e.amount} MP`;
    case "applyStatus":
      return `${plain(e.status)}${e.chance !== undefined ? ` (${e.chance} %)` : ""}${turnsText(e.turns)}`;
    case "cureStatus":
      return e.allNegative ? "cure all negative statuses" : `cure ${(e.statuses ?? []).map(plain).join(", ")}`;
    case "revive":
      return `revive with ${e.percent} % HP`;
    case "fieldEffect":
      return `${plain(e.effect)} for ${e.rounds} rounds`;
    case "freezeArea":
      return `freeze (${plain(e.effect)}, size ${e.size}) for ${e.rounds} rounds`;
    case "shock":
      return `lightning ${e.power}${e.reach ? `, reach ${e.reach}` : ""}`;
    case "cut":
      return "cut a plant";
    case "placePrefab":
      return `place ${plain(e.prefab)}`;
    case "steal":
      return "steal";
    case "reveal":
      return "reveal stats";
    case "discover":
      return `discover (radius ${e.radius})`;
    case "defuse":
      return `defuse a trap (→ ${plain(e.item)})`;
    case "learnAbility":
      return `learn ${plain(e.ability)}`;
  }
}

/** What the item does, one line per section ("Battle: one ally – heal 50 HP"). */
export function itemSummary(item: Item, name: (collection: "abilities" | "classes" | "statuses", id: string) => string = (_, id) => plain(id)): string[] {
  const out: string[] = [];
  const effects = (list: EffectDef[] = []) => (list.length ? list.map(effectText).join(", ") : "no effect");
  if (item.equip) {
    const e = item.equip;
    const stats = Object.entries(e.stats ?? {}).map(([k, v]) => `${k.toUpperCase()} ${v! >= 0 ? "+" : ""}${v}`);
    const extra = [
      ...stats,
      e.element ? `${e.element} element` : "",
      e.grants?.length ? `grants ${e.grants.map((a) => name("abilities", a)).join(", ")}` : "",
      e.onHit ? `on hit: ${name("statuses", e.onHit.status)} (${e.onHit.chance} %)` : "",
      e.immune?.length ? `immune to ${e.immune.map((s) => name("statuses", s)).join(", ")}` : "",
    ].filter(Boolean);
    out.push(`Equip (${e.slot}, ${e.kind})${extra.length ? `: ${extra.join(", ")}` : ""}`);
  }
  if (item.battle) out.push(`Battle: ${BATTLE_TARGETS.find(([t]) => t === item.battle!.target)?.[1] ?? item.battle.target} – ${effects(item.battle.effects)}`);
  if (item.board) {
    const who = (item.board.targets ?? []).map((t) => BOARD_TARGETS.find(([id]) => id === t)?.[1] ?? t).join(" / ");
    out.push(`Board: ${who}${item.board.wildOnly ? " (wild boards)" : ""} – ${effects(item.board.effects)}`);
  }
  if (item.learn) out.push(`Teaches ${item.learn.ability ? name("abilities", item.learn.ability) : "(no ability yet)"}${item.learn.classes?.length ? ` to ${item.learn.classes.map((c) => name("classes", c)).join(", ")}` : ""}`);
  if (!out.length) out.push(item.category === "key" ? "A quest item – no use of its own." : "No use yet.");
  return out;
}
