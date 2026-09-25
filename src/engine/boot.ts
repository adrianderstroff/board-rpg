import Phaser from "phaser";

export const VIRTUAL_WIDTH = 480;
export const VIRTUAL_HEIGHT = 270;

/** Creates the Phaser game: 480x270 virtual pixels, pixel-art filtering, scaled to fit. */
export function createGame(parent: string, scenes: Phaser.Types.Scenes.SceneType[]): Phaser.Game {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    backgroundColor: "#181425",
    pixelArt: true,
    roundPixels: true,
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: VIRTUAL_WIDTH,
      height: VIRTUAL_HEIGHT,
      fullscreenTarget: parent,
    },
    input: { mouse: { preventDefaultWheel: true }, gamepad: true },
    scene: scenes,
  });
}
