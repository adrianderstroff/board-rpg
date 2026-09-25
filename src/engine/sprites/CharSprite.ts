import Phaser from "phaser";

/**
 * Charset rows (RPG Maker 2000 style, adapted to iso): 0 = facing screen down-right,
 * 1 = down-left, 2 = up-right, 3 = up-left. Columns: step A, idle, step B.
 */
export type FacingRow = 0 | 1 | 2 | 3;

export function ensureCharsetAnims(scene: Phaser.Scene, texture: string) {
  for (let row = 0; row < 4; row++) {
    const key = `${texture}:walk:${row}`;
    if (scene.anims.exists(key)) continue;
    const b = row * 3;
    scene.anims.create({
      key,
      frames: [b, b + 1, b + 2, b + 1].map((frame) => ({ key: texture, frame })),
      frameRate: 7,
      repeat: -1,
    });
  }
}

/** A walking character sprite anchored at its feet. */
export class CharSprite extends Phaser.GameObjects.Sprite {
  private row: FacingRow = 1;
  private stepping = false;

  constructor(scene: Phaser.Scene, x: number, y: number, texture: string) {
    super(scene, x, y, texture, 4);
    ensureCharsetAnims(scene, texture);
    this.setOrigin(0.5, 1);
    scene.add.existing(this);
  }

  face(row: FacingRow) {
    this.row = row;
    if (this.stepping) this.play(`${this.texture.key}:walk:${row}`, true);
    else this.setFrame(row * 3 + 1);
    return this;
  }

  /** Idle "breathing" step animation (RPG Maker NPCs step in place). */
  setStepping(on: boolean) {
    this.stepping = on;
    if (on) this.play(`${this.texture.key}:walk:${this.row}`, true);
    else {
      this.stop();
      this.setFrame(this.row * 3 + 1);
    }
    return this;
  }

  /** Walks through world points; `rowFor` picks the facing for each segment; `onStep` updates depth. */
  async walk(points: { x: number; y: number }[], rowFor: (i: number) => FacingRow, msPerStep = 170, onStep?: (i: number) => void) {
    const wasStepping = this.stepping;
    this.stepping = true;
    for (let i = 0; i < points.length; i++) {
      this.face(rowFor(i));
      onStep?.(i);
      await new Promise<void>((resolve) =>
        this.scene.tweens.add({ targets: this, x: points[i].x, y: points[i].y, duration: msPerStep, onComplete: () => resolve() }),
      );
    }
    this.setStepping(wasStepping);
  }

  /** Hop to a point with an arc (leaps). */
  async jump(to: { x: number; y: number }, row: FacingRow, ms = 320) {
    this.face(row);
    const fromY = this.y;
    const fromX = this.x;
    await new Promise<void>((resolve) => {
      this.scene.tweens.addCounter({
        from: 0,
        to: 1,
        duration: ms,
        onUpdate: (tw) => {
          const t = tw.getValue() ?? 0;
          this.x = fromX + (to.x - fromX) * t;
          this.y = fromY + (to.y - fromY) * t - Math.sin(t * Math.PI) * 18;
        },
        onComplete: () => resolve(),
      });
    });
  }
}
