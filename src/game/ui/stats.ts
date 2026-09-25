import type Phaser from "phaser";
import { computeStats, descriptionOf, effectiveStats, expForLevel } from "../../core/chars/character";
import type { Ctx } from "../../core/context";
import type { Character } from "../../core/state/types";
import type { InputRouter } from "../../engine/input";
import { COLORS, Gauge, Panel } from "../../engine/ui/widgets";
import { faceKey, icon } from "../keys";

export function isRevealed(ctx: Ctx, c: Character) {
  return c.kind !== "enemy" || ctx.state.records.revealed.includes(c.def);
}

export function classLabel(ctx: Ctx, c: Character) {
  if (c.kind === "hero") return ctx.db.cls(c.classId!).name;
  if (c.kind === "enemy") return ctx.db.enemy(c.def).boss ? "Boss" : "Monster";
  return "Villager";
}

/** Draws a stats panel for any character (§16). Enemies show ??? until revealed by Perceive. */
export function statsPanel(scene: Phaser.Scene, ctx: Ctx, c: Character, x = 90, y = 30): Panel {
  const p = new Panel(scene, x, y, 300, 190);
  const known = isRevealed(ctx, c);
  const face = faceKey(ctx.db, c);
  if (face && scene.textures.exists(face)) p.add(scene.add.image(10, 10, face).setOrigin(0, 0).setDisplaySize(48, 48));
  p.text(66, 9, c.name, { color: COLORS.highlight });
  p.text(66, 21, `${classLabel(ctx, c)}  Lv ${c.level}`);
  const max = computeStats(ctx.db, c);
  const eff = effectiveStats(ctx.db, c);
  const num = (v: number) => (known ? String(v) : "???");
  p.text(66, 34, `HP ${known ? `${c.hp}/${max.maxHp}` : "???"}`);
  p.add(new Gauge(scene, 150, 38, 60, COLORS.good).set(known ? c.hp : 1, known ? max.maxHp : 1));
  p.text(66, 45, `MP ${known ? `${c.mp}/${max.maxMp}` : "???"}`);
  p.add(new Gauge(scene, 150, 49, 60, COLORS.mp).set(known ? c.mp : 1, known ? max.maxMp : 1));
  if (c.kind === "hero") {
    const next = expForLevel(ctx.db, c.level + 1);
    p.text(220, 34, `EXP ${c.exp}`, { color: COLORS.dim });
    p.text(220, 45, `Next ${Math.max(0, next - c.exp)}`, { color: COLORS.dim });
  }
  const rows: [string, number][] = [
    ["ATK", eff.str],
    ["DEF", eff.def],
    ["MAG", eff.mag],
    ["MDEF", eff.mdef],
    ["SPD", eff.spd],
  ];
  rows.forEach(([k, v], i) => {
    p.text(12, 68 + i * 12, k, { color: COLORS.dim });
    p.text(70, 68 + i * 12, num(v), { align: "right" });
  });
  if (c.kind === "hero") {
    (["weapon", "armor", "accessory"] as const).forEach((slot, i) => {
      const id = c.equipment[slot];
      const item = id ? ctx.db.item(id) : undefined;
      const ic = icon(item?.icon);
      if (ic !== undefined) p.icon(90, 65 + i * 14, ic);
      p.text(108, 68 + i * 14, item?.name ?? `- no ${slot} -`, { color: item ? COLORS.text : COLORS.disabled });
    });
  } else if (c.kind === "enemy" && known) {
    const def = ctx.db.enemy(c.def);
    const weak = Object.entries(def.elements ?? {}).filter(([, m]) => (m ?? 1) > 1).map(([e]) => e);
    const res = Object.entries(def.elements ?? {}).filter(([, m]) => (m ?? 1) < 1).map(([e]) => e);
    p.text(90, 68, `Weak: ${weak.join(", ") || "-"}`);
    p.text(90, 80, `Resist: ${res.join(", ") || "-"}`);
  }
  // statuses
  c.statuses.forEach((s, i) => {
    const def = ctx.db.status(s.id);
    const ic = icon(def.icon);
    if (ic !== undefined) p.icon(90 + i * 18, 110, ic);
  });
  if (c.statuses.length) p.text(90 + c.statuses.length * 18 + 2, 114, c.statuses.map((s) => ctx.db.status(s.id).name).join(", "), { color: COLORS.dim });
  p.text(12, 134, descriptionOf(ctx.db, c), { maxWidth: 276, color: COLORS.dim });
  return p;
}

export async function showStats(scene: Phaser.Scene, input: InputRouter, ctx: Ctx, c: Character) {
  const p = statsPanel(scene, ctx, c);
  await input.waitConfirm();
  p.destroy();
}
