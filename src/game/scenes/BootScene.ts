import Phaser from "phaser";
import { loadImage, loadSheet, registerFont, type FontSpec } from "../../engine/assets";
import { CURSOR_KEY, ICONS_KEY, WINDOW_KEY } from "../../engine/ui/widgets";
import { getSession } from "../session";
import { K, setIconIndex, setMiniStatusIndex } from "../keys";
import { getAudio, initAudio, preloadAudio } from "../sound";

/** Loads every graphic referenced by the data files plus the system sheets. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super("boot");
  }

  preload() {
    const { db } = getSession();
    const g = db.graphics;
    const bar = this.add.graphics();
    this.load.on("progress", (v: number) => {
      bar.clear().fillStyle(0x3a4466).fillRect(140, 132, 200, 6).fillStyle(0xfeae34).fillRect(140, 132, 200 * v, 6);
    });

    for (const [id, s] of Object.entries(g.charsets)) loadSheet(this, { key: K.charset(id), path: s.image, frameWidth: s.frameWidth, frameHeight: s.frameHeight });
    for (const [id, s] of Object.entries(g.battlers)) loadSheet(this, { key: K.battler(id), path: s.image, frameWidth: s.frameWidth, frameHeight: s.frameHeight });
    for (const [id, f] of Object.entries(g.faces)) loadImage(this, K.face(id), f.image);
    for (const [id, b] of Object.entries(g.battlebacks)) loadImage(this, K.battleback(id), b.image);
    for (const c of db.chipsets.values()) {
      loadSheet(this, { key: K.chipset(c.id), path: c.image, frameWidth: c.frameWidth, frameHeight: c.frameHeight });
      loadSheet(this, { key: K.decor(c.id), path: c.decorImage, frameWidth: c.decorFrameWidth, frameHeight: c.decorFrameHeight });
    }

    loadImage(this, WINDOW_KEY, "system/window.png");
    loadSheet(this, { key: CURSOR_KEY, path: "system/cursor.png", frameWidth: 16, frameHeight: 16 });
    loadSheet(this, { key: K.boardCursor, path: "system/board_cursor.png", frameWidth: 32, frameHeight: 24 });
    loadSheet(this, { key: K.highlight, path: "system/highlight.png", frameWidth: 32, frameHeight: 16 });
    loadSheet(this, { key: K.fieldEffects, path: "system/field_effects.png", frameWidth: 32, frameHeight: 24 });
    const ws = g.wallSigns;
    if (ws) loadSheet(this, { key: K.wallSigns, path: ws.image, frameWidth: ws.frameWidth, frameHeight: ws.frameHeight });
    loadSheet(this, { key: K.exitArrows, path: "system/exit_arrows.png", frameWidth: 32, frameHeight: 16 });
    loadSheet(this, { key: ICONS_KEY, path: "system/icons.png", frameWidth: 16, frameHeight: 16 });
    loadSheet(this, { key: K.statusMini, path: "system/status_icons.png", frameWidth: 10, frameHeight: 10 });
    this.load.json("statusMiniIndex", "assets/system/status_icons.json");
    loadImage(this, K.shadow, "system/shadow.png");
    loadImage(this, K.titleBg, "system/title_bg.png");
    loadImage(this, "fontImage", "system/font.png");
    this.load.json("fontSpec", "assets/system/font.json");
    this.load.json("iconIndex", "assets/system/icons.json");
    preloadAudio(this, db);
    // Missing optional audio files must not break loading.
    this.load.on("loaderror", (file: Phaser.Loader.File) => console.warn(`Asset missing: ${file.key}`));
  }

  create() {
    registerFont(this, "fontImage", this.cache.json.get("fontSpec") as FontSpec);
    const idx = this.cache.json.get("iconIndex") as Record<string, number> | string[];
    setIconIndex(Array.isArray(idx) ? Object.fromEntries(idx.map((n, i) => [n, i])) : idx);
    setMiniStatusIndex((this.cache.json.get("statusMiniIndex") as Record<string, number>) ?? {});
    const s = getSession().settings;
    if (!getAudio()) initAudio(this.game, { music: s.musicVolume, sfx: s.sfxVolume });
    // editor Quick Play: straight onto the map being edited
    const quick = getSession().pendingQuickPlay;
    if (quick) {
      getSession().pendingQuickPlay = undefined;
      this.scene.start("board", { enter: getSession().startQuickPlay(quick) });
      return;
    }
    this.scene.start("title");
  }
}
