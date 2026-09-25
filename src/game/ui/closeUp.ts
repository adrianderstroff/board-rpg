import Phaser from "phaser";
import { board, grid, pageOfPiece } from "../../core/board/board";
import { graphicsOf } from "../../core/chars/character";
import type { Ctx } from "../../core/context";
import type { Piece } from "../../core/state/types";
import { COLORS, Panel } from "../../engine/ui/widgets";
import { K } from "../keys";

export const CLOSE_UP = { x: 250, y: 8, w: 226, h: 180 };

/** Charset frames: row 0 idle = facing the viewer (down-right), row 2 idle = back view. */
const FRONT = 1;
const BACK = 7;

/**
 * Interaction close-up (§8.8): the map's backdrop with the NPC (or object) standing above and
 * the heroes of the interacting party below, seen from behind. Options and dialogs run while it
 * is shown; the board stays visible on the left.
 */
export class CloseUp {
  readonly panel: Panel;

  constructor(scene: Phaser.Scene, ctx: Ctx, heroes: Piece, npc: Piece) {
    const { x, y, w, h } = CLOSE_UP;
    this.panel = new Panel(scene, x, y, w, h);
    const b = board(ctx);
    const bgKey = K.battleback(ctx.db.map(b.mapId).battleback);
    if (scene.textures.exists(bgKey)) {
      // Centre crop of the battle background as the scene backdrop.
      const src = scene.textures.get(bgKey).getSourceImage() as HTMLImageElement;
      const cw = w - 8;
      const ch = h - 8;
      const cx = Math.max(0, (src.width - cw) / 2);
      const cy = Math.max(0, src.height - ch);
      const img = scene.add.image(4 - cx, 4 - cy, bgKey).setOrigin(0, 0).setCrop(cx, cy, cw, ch);
      this.panel.add(img);
    }
    // NPC / object above
    const page = pageOfPiece(ctx, npc);
    const npcChar = npc.members[0] ? (b.chars[npc.members[0]] ?? undefined) : undefined;
    if (npcChar) {
      const tex = K.charset(graphicsOf(ctx.db, npcChar).charset);
      this.panel.add(scene.add.image(w / 2, 92, tex, FRONT).setOrigin(0.5, 1).setScale(2));
      this.panel.add(scene.add.image(w / 2, 94, K.shadow).setScale(2, 1.5).setAlpha(0.5));
    } else {
      const chip = grid(ctx).chipset;
      if (page?.decor) this.panel.add(scene.add.image(w / 2, 96, K.decor(chip.id), chip.decor[page.decor].frame).setOrigin(0.5, chip.decorAnchorY / chip.decorFrameHeight).setScale(2));
    }
    // Heroes below, seen from behind
    const members = heroes.members.filter((m) => ctx.state.heroes[m]);
    members.forEach((id, i) => {
      const tex = K.charset(graphicsOf(ctx.db, ctx.state.heroes[id]).charset);
      const spread = Math.min(46, (w - 40) / Math.max(1, members.length));
      const hx = w / 2 + (i - (members.length - 1) / 2) * spread;
      this.panel.add(scene.add.image(hx, h - 6, K.shadow).setScale(2, 1.5).setAlpha(0.5));
      this.panel.add(scene.add.image(hx, h - 6, tex, BACK).setOrigin(0.5, 1).setScale(2));
    });
    const name = npcChar?.name ?? (page?.decor ? grid(ctx).chipset.decor[page.decor].name : "");
    if (name) {
      const plate = new Panel(scene, x + 6, y + 6, Math.max(60, name.length * 6 + 16), 20);
      plate.text(8, 5, name, { color: COLORS.highlight });
      this.panel.add(plate);
      plate.setPosition(6, 6);
    }
    this.panel.setAlpha(0);
    scene.tweens.add({ targets: this.panel, alpha: 1, duration: 150 });
  }

  setVisible(v: boolean) {
    this.panel.setVisible(v);
  }

  destroy() {
    this.panel.destroy();
  }
}

