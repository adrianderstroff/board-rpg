import Phaser from "phaser";
import type { InputRouter, PointerInfo } from "../input";
import { COLORS, Panel, playUiSound } from "./widgets";

export interface QuantityOptions {
  x: number;
  y: number;
  title: string;
  /** Largest selectable amount (≥ 1). */
  max: number;
  /** Price per unit, shown as a running total. */
  unitPrice?: number;
  confirmLabel?: string;
}

const W = 150;
const H = 86;

/**
 * "How many?" dialog. Up/Right = +1, Down/Left = −1 (hold for repeat via key repeat),
 * confirm = accept, cancel = abort. Touch/mouse: tap the arrows, the confirm or the cancel button.
 * Resolves with the amount or null.
 */
export function pickQuantity(scene: Phaser.Scene, input: InputRouter, o: QuantityOptions): Promise<number | null> {
  const max = Math.max(1, Math.floor(o.max));
  let n = 1;
  const panel = new Panel(scene, Math.min(o.x, scene.scale.width - W - 2), Math.min(o.y, scene.scale.height - H - 2), W, H);
  panel.text(W / 2, 6, o.title, { align: "center", color: COLORS.highlight });
  const arrows = scene.add.graphics();
  panel.add(arrows);
  const qty = panel.text(W / 2, 27, "", { align: "center" });
  const total = panel.text(W / 2, 43, "", { align: "center", color: COLORS.dim });
  const ok = new Panel(scene, 0, 0, 62, 18);
  const no = new Panel(scene, 0, 0, 62, 18);
  ok.text(31, 4, o.confirmLabel ?? "OK", { align: "center" });
  no.text(31, 4, "Cancel", { align: "center" });
  panel.add([ok, no]);
  ok.setPosition(8, H - 24);
  no.setPosition(W - 70, H - 24);

  // hit boxes in panel-local coordinates
  const UP = { x: W / 2 + 22, y: 22, w: 20, h: 18 };
  const DOWN = { x: W / 2 - 42, y: 22, w: 20, h: 18 };
  const inside = (p: PointerInfo, r: { x: number; y: number; w: number; h: number }) => {
    const lx = p.x - panel.x;
    const ly = p.y - panel.y;
    return lx >= r.x && ly >= r.y && lx < r.x + r.w && ly < r.y + r.h;
  };

  const render = () => {
    qty.setText(`${n}${max > 1 ? ` / ${max}` : ""}`);
    if (o.unitPrice !== undefined) total.setText(`${n * o.unitPrice} G`);
    arrows.clear();
    const up = n < max ? 0xfeae34 : 0x5a6988;
    const dn = n > 1 ? 0xfeae34 : 0x5a6988;
    // ▲ right of the number, ▼ left of it
    arrows.fillStyle(up, 1).fillTriangle(UP.x + 4, UP.y + 13, UP.x + 16, UP.y + 13, UP.x + 10, UP.y + 4);
    arrows.fillStyle(dn, 1).fillTriangle(DOWN.x + 4, DOWN.y + 5, DOWN.x + 16, DOWN.y + 5, DOWN.x + 10, DOWN.y + 14);
  };
  const change = (d: number) => {
    const next = Phaser.Math.Clamp(n + d, 1, max);
    if (next !== n) {
      n = next;
      playUiSound("cursor");
      render();
    } else playUiSound("buzzer");
  };
  render();

  return new Promise((resolve) => {
    const done = (v: number | null) => {
      release();
      panel.destroy();
      playUiSound(v === null ? "cancel" : "confirm");
      resolve(v);
    };
    const release = input.push({
      onAction: (a) => {
        if (a === "up" || a === "right") change(1);
        else if (a === "down" || a === "left") change(-1);
        else if (a === "confirm") done(n);
        else if (a === "cancel") done(null);
        return true;
      },
      onWheel: (dy) => change(dy < 0 ? 1 : -1),
      onPointerDown: (p) => {
        if (inside(p, UP)) change(1);
        else if (inside(p, DOWN)) change(-1);
        else if (inside(p, { x: ok.x, y: ok.y, w: 62, h: 18 })) done(n);
        else if (inside(p, { x: no.x, y: no.y, w: 62, h: 18 })) done(null);
        return true;
      },
    });
  });
}
