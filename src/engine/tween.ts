import Phaser from "phaser";

/** Promise wrappers so presentation code can be written as sequential async flows. */
export function tween(scene: Phaser.Scene, config: Phaser.Types.Tweens.TweenBuilderConfig): Promise<void> {
  return new Promise((resolve) => {
    scene.tweens.add({ ...config, onComplete: () => resolve() });
  });
}

export function wait(scene: Phaser.Scene, ms: number): Promise<void> {
  return new Promise((resolve) => scene.time.delayedCall(ms, () => resolve()));
}

export function fadeOut(scene: Phaser.Scene, ms = 250, color = 0x000000): Promise<void> {
  return new Promise((resolve) => {
    const cam = scene.cameras.main;
    const [r, g, b] = [(color >> 16) & 255, (color >> 8) & 255, color & 255];
    cam.once("camerafadeoutcomplete", () => resolve());
    cam.fadeOut(ms, r, g, b);
  });
}

export function fadeIn(scene: Phaser.Scene, ms = 250): Promise<void> {
  return new Promise((resolve) => {
    const cam = scene.cameras.main;
    cam.once("camerafadeincomplete", () => resolve());
    cam.fadeIn(ms);
  });
}

export function flash(scene: Phaser.Scene, ms = 200) {
  scene.cameras.main.flash(ms, 255, 255, 255);
}
