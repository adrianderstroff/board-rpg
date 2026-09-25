import Phaser from "phaser";
import { listSaves } from "../../core/state/save";
import { InputRouter } from "../../engine/input";
import { fadeOut } from "../../engine/tween";
import { COLORS, label, pick, UI_DEPTH } from "../../engine/ui/widgets";
import { K } from "../keys";
import { getSession } from "../session";
import { loadPage } from "../ui/mainMenu";
import { music, sfx } from "../sound";
import { fullscreenOnFirstTap } from "../../engine/fullscreen";
import { isTouchMode } from "../../engine/ui/TouchButtons";

export class TitleScene extends Phaser.Scene {
  constructor() {
    super("title");
  }

  create() {
    const router = new InputRouter(this);
    if (this.textures.exists(K.titleBg)) this.add.image(0, 0, K.titleBg).setOrigin(0, 0);
    const title = getSession().db.config.title;
    const t = label(this, 240, 60, title, { align: "center", color: COLORS.highlight }).setScale(3).setDepth(UI_DEPTH);
    t.setOrigin(0.5, 0);
    label(this, 240, 100, "A desert tale", { align: "center", color: COLORS.dim }).setDepth(UI_DEPTH);
    this.cameras.main.fadeIn(400);
    music(getSession().db.config.music?.title, this);
    fullscreenOnFirstTap(this, isTouchMode(this));
    void this.menu(router);
  }

  private async menu(router: InputRouter) {
    const session = getSession();
    const hasSave = listSaves(session.storage).some(Boolean);
    for (;;) {
      const r = await pick(this, router, [{ label: "New Game" }, { label: "Continue", disabled: !hasSave }], {
        x: 200,
        y: 150,
        width: 80,
        cancellable: false,
      });
      if (r === 0) {
        const result = session.newGame();
        await fadeOut(this, 400);
        this.scene.start("board", { enter: result });
        return;
      }
      if (r === 1 && (await loadPage(this, router))) {
        await fadeOut(this, 400);
        this.scene.start("board", {});
        return;
      }
    }
  }
}

export class GameOverScene extends Phaser.Scene {
  constructor() {
    super("gameover");
  }

  create() {
    const router = new InputRouter(this);
    label(this, 240, 90, "The heroes have fallen...", { align: "center", color: COLORS.bad }).setScale(2);
    music(undefined, this);
    sfx("defeat");
    this.cameras.main.fadeIn(600);
    void (async () => {
      for (;;) {
        const r = await pick(this, router, [{ label: "Load" }, { label: "Title" }], { x: 205, y: 140, width: 70, cancellable: false });
        if (r === 0 && (await loadPage(this, router))) {
          this.scene.start("board", {});
          return;
        }
        if (r === 1) {
          this.scene.start("title");
          return;
        }
      }
    })();
  }
}
