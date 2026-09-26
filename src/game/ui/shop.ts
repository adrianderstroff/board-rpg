import type Phaser from "phaser";
import { canEquip } from "../../core/chars/character";
import { equipCompare } from "./compare";
import type { Ctx } from "../../core/context";
import { buy, canSell, inventoryList, itemCount, sell, sellPrice } from "../../core/items/inventory";
import type { InputRouter } from "../../engine/input";
import { COLORS, Menu, Panel, pick } from "../../engine/ui/widgets";
import { icon } from "../keys";
import { pickQuantity } from "../../engine/ui/QuantityPicker";
import { CLOSE_UP } from "./closeUp";
import { sfx } from "../sound";

/**
 * Shop screen (§15): Buy / Sell / Leave with equip compatibility per hero.
 * Uses the left half of the screen so the interaction close-up stays visible on the right.
 */
const LIST = { x: 8, y: CLOSE_UP.y, w: 236, h: CLOSE_UP.h };
/** Quantity dialog centred over the list. */
const QTY = { x: LIST.x + (LIST.w - 150) / 2, y: LIST.y + 50 };

export async function openShop(scene: Phaser.Scene, input: InputRouter, ctx: Ctx, shopId: string) {
  const shop = ctx.db.shop(shopId);
  for (;;) {
    const r = await pick(scene, input, [{ label: "Buy" }, { label: "Sell" }, { label: "Leave" }], {
      x: LIST.x,
      y: LIST.y,
      width: LIST.w,
      height: LIST.h,
      title: `${shop.name}`,
    });
    if (r === null || r === 2) return;
    if (r === 0) await buyPage(scene, input, ctx, shop.items);
    else await sellPage(scene, input, ctx);
  }
}

function infoPanel(scene: Phaser.Scene, ctx: Ctx, itemId: string): Panel {
  const it = ctx.db.item(itemId);
  const p = new Panel(scene, 8, 196, 464, 50);
  p.text(8, 6, it.description ?? it.category, { maxWidth: 400 });
  if (it.equip) {
    const heroes = ctx.state.roster.map((id) => ctx.state.heroes[id]);
    // per hero: can they use it, and is it stronger (green) or weaker (red) than what they wear?
    heroes.forEach((h, i) => {
      const ok = canEquip(ctx.db, h, itemId);
      const slot = it.equip!.slot;
      const cmp = equipCompare(ctx, itemId, h.equipment[slot], 1);
      p.text(8 + i * 114, 30, h.name, { color: ok ? COLORS.text : COLORS.disabled });
      if (ok) p.text(8 + i * 114 + 44, 30, cmp.text, { color: cmp.color });
    });
  }
  p.text(456, 6, `Own ${itemCount(ctx, itemId)}`, { align: "right", color: COLORS.dim });
  return p;
}

async function buyPage(scene: Phaser.Scene, input: InputRouter, ctx: Ctx, items: string[]) {
  let last = 0;
  for (;;) {
    let info: Panel | null = null;
    const menu = new Menu(
      scene,
      input,
      items.map((id) => {
        const it = ctx.db.item(id);
        return { label: it.name, right: `${it.price} G`, icon: icon(it.icon), disabled: it.price > ctx.state.gold };
      }),
      {
        x: LIST.x,
        y: LIST.y,
        width: LIST.w,
        height: LIST.h,
        title: `Buy          Gold ${ctx.state.gold}`,
        initial: last,
        onHighlight: (i) => {
          info?.destroy();
          info = infoPanel(scene, ctx, items[i]);
        },
      },
    );
    const r = await menu.choose();
    if (r !== null) {
      last = r;
      // Ask how many – a single tap/click never buys by accident. The list stays visible behind.
      const it = ctx.db.item(items[r]);
      const qty = await pickQuantity(scene, input, { ...QTY, title: it.name, max: Math.min(99, Math.floor(ctx.state.gold / Math.max(1, it.price))), unitPrice: it.price, confirmLabel: "Buy" });
      if (qty && buy(ctx, it.id, qty)) sfx("coin");
    }
    menu.destroy();
    (info as Panel | null)?.destroy();
    if (r === null) return;
  }
}

async function sellPage(scene: Phaser.Scene, input: InputRouter, ctx: Ctx) {
  for (;;) {
    const list = inventoryList(ctx);
    if (!list.length) return;
    let info: Panel | null = null;
    const menu = new Menu(
      scene,
      input,
      list.map((e) => ({ label: `${e.item.name} x${e.count}`, right: canSell(ctx, e.item.id) ? `${sellPrice(ctx, e.item.id)} G` : "-", icon: icon(e.item.icon), disabled: !canSell(ctx, e.item.id) })),
      {
        x: LIST.x,
        y: LIST.y,
        width: LIST.w,
        height: LIST.h,
        title: `Sell         Gold ${ctx.state.gold}`,
        onHighlight: (i) => {
          info?.destroy();
          info = infoPanel(scene, ctx, list[i].item.id);
        },
      },
    );
    const r = await menu.choose();
    if (r !== null) {
      const e = list[r];
      const qty = await pickQuantity(scene, input, { ...QTY, title: e.item.name, max: e.count, unitPrice: sellPrice(ctx, e.item.id), confirmLabel: "Sell" });
      if (qty && sell(ctx, e.item.id, qty)) sfx("coin");
    }
    menu.destroy();
    (info as Panel | null)?.destroy();
    if (r === null) return;
  }
}
