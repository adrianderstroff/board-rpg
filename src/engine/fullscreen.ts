import type Phaser from "phaser";

/**
 * Fullscreen + landscape lock for phones. Browsers only allow this from a user gesture, so it is
 * requested on the first tap. iOS Safari has no fullscreen API for pages – there the web app
 * manifest / "Add to Home Screen" provides fullscreen landscape.
 */
export function requestFullscreenLandscape(scene: Phaser.Scene) {
  const scale = scene.scale;
  if (!scale.isFullscreen && scale.fullscreen.available) scale.startFullscreen();
  const orientation = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
  orientation?.lock?.("landscape").catch(() => {
    /* not supported (desktop, iOS) */
  });
}

/** On touch devices: go fullscreen landscape on the first tap in this scene. */
export function fullscreenOnFirstTap(scene: Phaser.Scene, touch: boolean) {
  if (!touch) return;
  scene.input.once("pointerup", () => requestFullscreenLandscape(scene));
}

export function toggleFullscreen(scene: Phaser.Scene) {
  if (scene.scale.isFullscreen) scene.scale.stopFullscreen();
  else requestFullscreenLandscape(scene);
}
