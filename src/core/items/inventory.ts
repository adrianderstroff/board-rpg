import { canEquip, clampVitals, knownAbilities } from "../chars/character";
import type { Ctx } from "../context";
import type { EquipSlot, ItemDef } from "../data/types";
import type { GameEvent } from "../events";
import type { Character } from "../state/types";

export function itemCount(ctx: Ctx, id: string): number {
  return ctx.state.inventory[id] ?? 0;
}

export function addItem(ctx: Ctx, id: string, count = 1): GameEvent[] {
  ctx.db.item(id); // validates
  ctx.state.inventory[id] = itemCount(ctx, id) + count;
  return [{ type: "itemGained", item: id, count }];
}

export function removeItem(ctx: Ctx, id: string, count = 1): boolean {
  const have = itemCount(ctx, id);
  if (have < count) return false;
  if (have === count) delete ctx.state.inventory[id];
  else ctx.state.inventory[id] = have - count;
  return true;
}

export function inventoryList(ctx: Ctx, filter?: (d: ItemDef) => boolean): { item: ItemDef; count: number }[] {
  return Object.entries(ctx.state.inventory)
    .map(([id, count]) => ({ item: ctx.db.item(id), count }))
    .filter((e) => e.count > 0 && (!filter || filter(e.item)))
    .sort((a, b) => a.item.category.localeCompare(b.item.category) || a.item.name.localeCompare(b.item.name));
}

// ---------- equipment ----------

export function equip(ctx: Ctx, hero: Character, itemId: string): boolean {
  const def = ctx.db.item(itemId);
  if (!def.equip || !canEquip(ctx.db, hero, itemId) || itemCount(ctx, itemId) < 1) return false;
  const slot = def.equip.slot;
  unequip(ctx, hero, slot);
  removeItem(ctx, itemId);
  hero.equipment[slot] = itemId;
  clampVitals(ctx.db, hero);
  return true;
}

export function unequip(ctx: Ctx, hero: Character, slot: EquipSlot): boolean {
  const cur = hero.equipment[slot];
  if (!cur) return false;
  delete hero.equipment[slot];
  ctx.state.inventory[cur] = itemCount(ctx, cur) + 1;
  clampVitals(ctx.db, hero);
  return true;
}

// ---------- scrolls ----------

export function canLearnScroll(ctx: Ctx, hero: Character, itemId: string): boolean {
  const learn = ctx.db.item(itemId).learn;
  if (!learn || hero.kind !== "hero") return false;
  return learn.classes.includes(hero.classId!) && !knownAbilities(ctx.db, hero).includes(learn.ability);
}

export function readScroll(ctx: Ctx, hero: Character, itemId: string): GameEvent[] {
  if (!canLearnScroll(ctx, hero, itemId) || !removeItem(ctx, itemId)) return [];
  const ability = ctx.db.item(itemId).learn!.ability;
  hero.learned.push(ability);
  return [{ type: "learn", target: hero.id, ability }];
}

// ---------- shops & inn (§15) ----------

export function sellPrice(ctx: Ctx, itemId: string): number {
  const def = ctx.db.item(itemId);
  return def.category === "key" ? 0 : Math.floor(def.price * ctx.db.config.sellRatio);
}

export function canSell(ctx: Ctx, itemId: string): boolean {
  return ctx.db.item(itemId).category !== "key" && itemCount(ctx, itemId) > 0;
}

export function buy(ctx: Ctx, itemId: string, count = 1): boolean {
  const cost = ctx.db.item(itemId).price * count;
  if (ctx.state.gold < cost) return false;
  ctx.state.gold -= cost;
  addItem(ctx, itemId, count);
  return true;
}

export function sell(ctx: Ctx, itemId: string, count = 1): boolean {
  if (!canSell(ctx, itemId) || itemCount(ctx, itemId) < count) return false;
  removeItem(ctx, itemId, count);
  ctx.state.gold += sellPrice(ctx, itemId) * count;
  return true;
}

export function innPrice(ctx: Ctx, perHero?: number): number {
  return (perHero ?? ctx.db.config.innPricePerHero) * ctx.state.roster.length;
}
