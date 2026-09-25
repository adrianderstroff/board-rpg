import Phaser from "phaser";
import type { InputAction, InputRouter } from "../input";
import { COLORS, Panel } from "./widgets";

/** True on touch devices; `?touch=1` in the URL forces touch controls (desktop testing). */
export function isTouchMode(scene: Phaser.Scene): boolean {
  if (typeof location !== "undefined" && new URLSearchParams(location.search).has("touch")) return true;
  return !!scene.sys.game.device.input.touch;
}

export interface TouchButtonSpec {
  /** Text label, or a drawn icon. */
  label?: string;
  icon?: "rotateLeft" | "rotateRight";
  action: InputAction;
  width?: number;
}

/** Circular arrow (rotate) icon drawn with vector graphics, centred at (cx, cy). */
function drawRotateIcon(g: Phaser.GameObjects.Graphics, cx: number, cy: number, clockwise: boolean) {
  const r = 5;
  g.lineStyle(2, 0xfeae34, 1);
  // 3/4 circle, open at the top
  const start = clockwise ? Phaser.Math.DegToRad(-60) : Phaser.Math.DegToRad(-120);
  g.beginPath();
  g.arc(cx, cy, r, start, start + (clockwise ? -1 : 1) * Phaser.Math.DegToRad(270) * -1, !clockwise);
  g.strokePath();
  // arrow head at the arc start
  const hx = cx + Math.cos(start) * r;
  const hy = cy + Math.sin(start) * r;
  const dir = clockwise ? 1 : -1;
  g.fillStyle(0xfeae34, 1).fillTriangle(hx - 3 * dir, hy - 3, hx + 3 * dir, hy, hx - 3 * dir, hy + 3);
}

const W = 46;
const ICON_W = 26;
const H = 22;
const GAP = 4;

/**
 * Small on-screen buttons for actions that have no tap equivalent (Back, Menu).
 * Laid out right-to-left from (right, top). They feed actions straight into the InputRouter,
 * so every screen that understands the keyboard understands them too.
 */
export interface TouchButtons {
  remove(): void;
  /** Hidden buttons don't react (e.g. while a text box covers them). */
  setVisible(v: boolean): void;
}

export function addTouchButtons(scene: Phaser.Scene, input: InputRouter, specs: TouchButtonSpec[], right: number, top: number): TouchButtons {
  const removers: (() => void)[] = [];
  const panels: Panel[] = [];
  let visible = true;
  let x = right;
  for (const s of specs) {
    const w = s.width ?? (s.icon ? ICON_W : W);
    x -= w;
    const p = new Panel(scene, x, top, w, H);
    if (s.label) p.text(w / 2, 6, s.label, { align: "center", color: COLORS.text });
    if (s.icon) {
      const g = scene.add.graphics();
      drawRotateIcon(g, w / 2, H / 2, s.icon === "rotateRight");
      p.add(g);
    }
    p.setAlpha(0.9).setDepth(p.depth + 50);
    removers.push(input.addButton({ x, y: top, w, h: H }, s.action, () => visible));
    removers.push(() => p.destroy());
    panels.push(p);
    x -= GAP;
  }
  const remove = () => removers.forEach((r) => r());
  scene.events.once("shutdown", remove);
  return {
    remove,
    setVisible(v: boolean) {
      visible = v;
      for (const p of panels) p.setVisible(v);
    },
  };
}
