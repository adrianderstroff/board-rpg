import type { RawContent } from "../../../src/core/data/database";
import type { ShopDef } from "../../../src/core/data/types";

/** Shops (editor-design §10): the project's shops and where each is opened. */

export type Shop = Omit<ShopDef, "id">;

export const SHOPS_FILE = "data/shops.yaml";
export const SHOPS_HEADER = "# Shops (docs/game-design.md §15). type decides the keeper's sign: weapon (sword), item (potion), magic (star).\n";

export const SHOP_TYPES: [ShopDef["type"], string, string][] = [
  ["weapon", "Weapons & armor", "sign_weapon"],
  ["item", "Items", "sign_item"],
  ["magic", "Magic", "sign_magic"],
];

export const newShop = (): Shop => ({ name: "New shop", type: "item", items: [] });

/** The map entities that open a shop (a shop step, or a shop option of an interaction). */
export function shopUsers(raw: RawContent, shop: string): { map: string; entity: string; index: number }[] {
  const out: { map: string; entity: string; index: number }[] = [];
  const opens = (v: unknown): boolean => {
    if (Array.isArray(v)) return v.some(opens);
    if (v && typeof v === "object") return Object.entries(v).some(([k, x]) => (k === "shop" && x === shop) || opens(x));
    return false;
  };
  for (const [map, m] of Object.entries(raw.maps)) (m.events ?? []).forEach((e, index) => opens(e) && out.push({ map, entity: e.id, index }));
  return out;
}
