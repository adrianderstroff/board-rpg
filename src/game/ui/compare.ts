import type { Ctx } from "../../core/context";
import { COLORS } from "../../engine/ui/widgets";

const NAMES: Record<string, string> = { str: "ATK", def: "DEF", mag: "MAG", mdef: "MDF", spd: "SPD", maxHp: "HP", maxMp: "MP" };

/**
 * How an equipment item compares to what is worn in its slot (§15): the changed stats (at most
 * `max`, e.g. "ATK+6 MAG-2"), and an overall verdict – the sum of all stat changes.
 */
export function equipCompare(ctx: Ctx, itemId: string, currentId?: string, max = 2): { text: string; score: number; color: number } {
  const a = ctx.db.item(itemId).equip?.stats ?? {};
  const b = currentId ? (ctx.db.item(currentId).equip?.stats ?? {}) : {};
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])] as (keyof typeof a)[];
  const diffs = keys.map((k) => ({ k, d: (a[k] ?? 0) - (b[k] ?? 0) })).filter((x) => x.d !== 0);
  const score = diffs.reduce((s, x) => s + x.d, 0);
  const text = diffs
    .slice(0, max)
    .map((x) => `${NAMES[x.k] ?? x.k}${x.d > 0 ? "+" : ""}${x.d}`)
    .join(" ");
  return { text: itemId === currentId ? "equipped" : text || "same", score, color: itemId === currentId || score === 0 ? COLORS.dim : score > 0 ? COLORS.good : COLORS.bad };
}
