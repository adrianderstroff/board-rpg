import Phaser from "phaser";
import type { InputRouter } from "../input";
import { RichText, type RichTextToken } from "./RichText";
import { COLORS, CURSOR_KEY, Panel, pick, type MenuItem } from "./widgets";

export interface Speaker {
  name?: string;
  /** Texture key of a 48x48 portrait. */
  face?: string;
}

const H = 70;

/** Dialog window with portrait, name plate, typewriter rich text and choices (§9). */
export class TextBox {
  private readonly panel: Panel;
  private readonly text: RichText;
  private readonly faceImg: Phaser.GameObjects.Image;
  private readonly nameText: Phaser.GameObjects.BitmapText;
  private readonly next: Phaser.GameObjects.Sprite;
  private readonly frame: Phaser.GameObjects.Graphics;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly input: InputRouter,
    private readonly cps = 45,
    private readonly onBlip?: () => void,
  ) {
    const w = scene.scale.width - 16;
    this.panel = new Panel(scene, 8, scene.scale.height - H - 6, w, H);
    this.frame = scene.add.graphics();
    this.panel.add(this.frame);
    this.faceImg = scene.add.image(10, 11, "__DEFAULT").setOrigin(0, 0).setVisible(false);
    this.panel.add(this.faceImg);
    this.nameText = this.panel.text(10, 5, "", { color: COLORS.highlight });
    this.text = new RichText(scene, 10, 18, w - 20);
    this.text.onGlyph = (i) => {
      if (i % 3 === 0) this.onBlip?.();
    };
    this.panel.add(this.text);
    this.next = scene.add.sprite(w - 14, H - 12, CURSOR_KEY, 0).setAngle(90).setVisible(false);
    this.panel.add(this.next);
    scene.tweens.add({ targets: this.next, y: H - 10, yoyo: true, repeat: -1, duration: 300 });
  }

  private layout(speaker: Speaker) {
    const hasFace = !!speaker.face && this.scene.textures.exists(speaker.face);
    const textX = hasFace ? 66 : 10;
    this.faceImg.setVisible(hasFace);
    this.frame.clear();
    if (hasFace) {
      this.faceImg.setTexture(speaker.face!).setDisplaySize(48, 48).setPosition(10, 12);
      this.frame.lineStyle(1, 0xc0cbdc, 1).strokeRect(9.5, 11.5, 49, 49);
    }
    this.nameText.setText(speaker.name ?? "").setPosition(textX, 5);
    this.text.setPosition(textX, speaker.name ? 18 : 11);
    return textX;
  }

  /** Shows one page; resolves after the player confirms. */
  async say(speaker: Speaker, tokens: RichTextToken[]): Promise<void> {
    const textX = this.layout(speaker);
    // re-create text with correct width
    this.text.maxWidth = this.panel.w - textX - 12;
    this.text.setTokens(tokens);
    this.next.setVisible(false);
    const typing = this.text.typeOut(this.cps);
    let skipped = false;
    const release = this.input.push({
      onAction: (a) => {
        if (a === "confirm" || a === "cancel") {
          if (!this.text.done) this.text.revealAll();
          else skipped = true;
        }
        return true;
      },
      onPointerDown: () => {
        if (!this.text.done) this.text.revealAll();
        else skipped = true;
        return true;
      },
    });
    await typing;
    this.next.setVisible(true);
    await new Promise<void>((resolve) => {
      const check = () => {
        if (skipped) {
          this.scene.events.off("update", check);
          resolve();
        }
      };
      this.scene.events.on("update", check);
    });
    release();
    this.next.setVisible(false);
  }

  /** Options shown above the box. */
  async choose(options: string[]): Promise<number> {
    const items: MenuItem[] = options.map((label) => ({ label }));
    const r = await pick(this.scene, this.input, items, {
      x: this.panel.x + this.panel.w - 170,
      y: this.panel.y - 2,
      anchorBottom: true,
      width: 170,
      cancellable: false,
    });
    return r ?? 0;
  }

  destroy() {
    this.panel.destroy();
  }
}
