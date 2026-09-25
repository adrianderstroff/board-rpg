import type Phaser from "phaser";
import { board, charsAt, exitAt, grid, piecesAt } from "../../core/board/board";
import { computeStats } from "../../core/chars/character";
import type { Ctx } from "../../core/context";
import { currentObjective } from "../../core/script/quests";
import type { Pos } from "../../core/util/grid";
import { measureText } from "../../engine/assets";
import { COLORS, Gauge, Panel, UI_DEPTH, label } from "../../engine/ui/widgets";
import { isRevealed } from "../ui/stats";

/** Board HUD (§16): quest objective, round/actor, cell info, toasts. */
export class Hud {
  private objective?: Panel;
  private turn?: Panel;
  private info?: Panel;
  private toasts: Phaser.GameObjects.GameObject[] = [];
  private toastY = 44;
  /** Hidden while full-screen-ish UI (the interaction close-up) is open. */
  private hidden = false;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly ctx: () => Ctx,
  ) {}

  refresh(actorId?: string | null) {
    const c = this.ctx();
    this.objective?.destroy();
    const obj = currentObjective(c);
    const mapName = c.db.map(board(c).mapId).name;
    const text = obj ? `${obj}` : mapName;
    const w = Math.min(260, Math.max(measureText(this.scene, text), measureText(this.scene, mapName)) + 18);
    this.objective = new Panel(this.scene, 4, 4, w, 30);
    this.objective.text(8, 5, mapName, { color: COLORS.highlight });
    this.objective.text(8, 16, text, { color: COLORS.text });

    this.turn?.destroy();
    const b = board(c);
    const actor = actorId ? (c.state.heroes[actorId] ?? b.chars[actorId]) : undefined;
    const t = `Round ${b.turn.round}${actor ? ` - ${actor.name}` : ""}`;
    const tw = measureText(this.scene, t) + 16;
    this.turn = new Panel(this.scene, this.scene.scale.width - tw - 4, 4, tw, 20);
    this.turn.text(8, 5, t, { color: actor?.kind === "enemy" ? COLORS.bad : COLORS.text });
    this.objective.setVisible(!this.hidden);
    this.turn.setVisible(!this.hidden);
  }

  /** Bottom-left info about the cell under the cursor. */
  cellInfo(p: Pos | null) {
    this.info?.destroy();
    this.info = undefined;
    if (!p) return;
    const c = this.ctx();
    const cell = grid(c).cell(p);
    if (!cell) return;
    const chars = charsAt(c, p, { includeFallen: true });
    const exit = exitAt(c, p);
    const fx = board(c).fieldEffects.filter((f) => f.x === p.x && f.y === p.y).map((f) => c.db.fieldEffect(f.effect).name);
    const terrain = grid(c).chipset.terrains[cell.terrain].name;
    const lines = 1 + chars.length;
    const h = 16 + lines * 12 - 4;
    this.info = new Panel(this.scene, 4, this.scene.scale.height - h - 4, 170, h);
    const extra = exit ? `  -> ${exit.label ?? exit.to}` : fx.length ? `  (${fx.join(", ")})` : "";
    this.info.text(8, 5, `${terrain}  h${cell.height}${extra}`, { color: COLORS.dim });
    chars.forEach((ch, i) => {
      const y = 17 + i * 12;
      const fallen = piecesAt(c, p, { includeFallen: true }).some((pc) => pc.fallen && pc.members.includes(ch.id));
      const color = ch.kind === "enemy" ? COLORS.bad : ch.kind === "npc" ? COLORS.highlight : COLORS.text;
      this.info!.text(8, y, fallen ? `${ch.name} (fallen)` : ch.name, { color });
      if (!fallen && ch.kind !== "npc") {
        const max = computeStats(c.db, ch).maxHp;
        const known = isRevealed(c, ch);
        this.info!.add(new Gauge(this.scene, 90, y + 3, 40, COLORS.good).set(known ? ch.hp : 1, known ? max : 1));
        this.info!.text(164, y, known ? `${ch.hp}` : "??", { align: "right", color: COLORS.dim });
      }
    });
  }

  /** Short notification that fades away. */
  toast(text: string, color: number = COLORS.text) {
    const w = measureText(this.scene, text) + 16;
    const p = new Panel(this.scene, (this.scene.scale.width - w) / 2, this.toastY, w, 20);
    p.text(8, 5, text, { color });
    this.toastY += 22;
    this.toasts.push(p);
    this.scene.tweens.add({
      targets: p,
      alpha: 0,
      delay: 1800,
      duration: 400,
      onComplete: () => {
        p.destroy();
        this.toasts = this.toasts.filter((t) => t !== p);
        if (!this.toasts.length) this.toastY = 44;
      },
    });
  }

  hint(text: string) {
    const t = label(this.scene, this.scene.scale.width - 6, 26, text, { align: "right", color: COLORS.dim });
    t.setScrollFactor(0).setDepth(UI_DEPTH);
    return t;
  }

  setVisible(v: boolean) {
    this.hidden = !v;
    this.objective?.setVisible(v);
    this.turn?.setVisible(v);
    this.info?.setVisible(v);
  }
}
