import Phaser from "phaser";
import { chooseAiAction } from "../../core/battle/ai";
import {
  battle,
  battleAbilities,
  battleItems,
  canUseBattleAbility,
  nextBattleTurn,
  performAction,
  swallowedEntry,
  targetCandidates,
} from "../../core/battle/battle";
import type { BattleAction, BattleState } from "../../core/battle/types";
import { computeStats, expForLevel, graphicsOf, isAlive } from "../../core/chars/character";
import { getChar, type Ctx } from "../../core/context";
import type { BattleTarget } from "../../core/data/types";
import type { GameEvent } from "../../core/events";
import { itemCount } from "../../core/items/inventory";
import { InputRouter } from "../../engine/input";
import { addTouchButtons, isTouchMode } from "../../engine/ui/TouchButtons";
import { wait } from "../../engine/tween";
import { banner, COLORS, CURSOR_KEY, Gauge, Panel, pick, popup } from "../../engine/ui/widgets";
import { measureText } from "../../engine/assets";
import { enemyInfoGroups } from "../ui/stats";

/** How long each page of a revealed enemy's info shows next to its name (ms). */
const INFO_PAGE_MS = 1800;

/** Packs info groups into lines that fit `width` px; every group starts a new line. */
function pageInfo(scene: Phaser.Scene, groups: string[][], width: number): string[] {
  const pages: string[] = [];
  for (const g of groups) {
    let line = "";
    for (const part of g) {
      const next = line ? `${line}  ${part}` : part;
      if (line && measureText(scene, next) > width) {
        pages.push(line);
        line = part;
      } else line = next;
    }
    if (line) pages.push(line);
  }
  return pages;
}
import { faceKey, icon, K, miniStatusIconsOf } from "../keys";
import { pickAbility } from "../ui/abilityMenu";
import { castSound, getAudio, music, sfx, sfxForEvent, sfxKey } from "../sound";
import { getSession } from "../session";

interface Actor {
  id: string;
  side: "hero" | "enemy";
  sprite: Phaser.GameObjects.Sprite;
  home: { x: number; y: number };
  frames: Record<string, number>;
  shadow: Phaser.GameObjects.Image;
  /** Status icons above the sprite. */
  icons: Phaser.GameObjects.Image[];
  iconKey: string;
}

const ENEMY_SLOTS = [
  { x: 120, y: 150 },
  { x: 60, y: 168 },
  { x: 175, y: 172 },
  { x: 70, y: 128 },
  { x: 170, y: 126 },
  { x: 115, y: 182 },
];
/** A big boss in the middle with its henchmen to the sides (§12.7). */
const BIG_BOSS_POS = { x: 118, y: 160 };
const HENCH_SLOTS = [
  { x: 40, y: 178 },
  { x: 198, y: 180 },
  { x: 36, y: 132 },
  { x: 202, y: 130 },
];

const HERO_SLOTS = [
  { x: 368, y: 122 },
  { x: 386, y: 140 },
  { x: 404, y: 158 },
  { x: 422, y: 176 },
];

/** Final-Fantasy style side-view battle (§12). */
export class BattleScene extends Phaser.Scene {
  private router!: InputRouter;
  private actors = new Map<string, Actor>();
  private bigSlot?: number;
  private statusPanel?: Panel;
  private messagePanel?: Panel;
  private infoTimer?: Phaser.Time.TimerEvent;
  private onDone?: () => void;
  private summary = { exp: 0, gold: 0, items: [] as string[], levels: [] as string[] };

  constructor() {
    super("battle");
  }

  get ctx(): Ctx {
    return getSession().current.ctx;
  }

  init(data: { onDone: () => void }) {
    this.onDone = data.onDone;
    this.actors = new Map();
    this.summary = { exp: 0, gold: 0, items: [], levels: [] };
  }

  create() {
    this.router = new InputRouter(this);
    const b = battle(this.ctx);
    const bg = this.textures.exists(K.battleback(b.battleback)) ? K.battleback(b.battleback) : K.battleback("desert");
    this.add.image(0, 0, bg).setOrigin(0, 0);
    this.add.rectangle(0, 190, 480, 80, 0x181425).setOrigin(0, 0);
    const heroes = b.combatants.filter((c) => c.side === "hero");
    const enemies = b.combatants.filter((c) => c.side === "enemy");
    heroes.forEach((c, i) => this.addActor(c.id, "hero", HERO_SLOTS[i % HERO_SLOTS.length]));
    const bigOne = enemies.find((c) => this.frameHeight(c.id) > 60);
    this.bigSlot = enemies.length > 1 && bigOne ? bigOne.slot : undefined;
    enemies.forEach((c) => {
      const big = enemies.length === 1 && this.frameHeight(c.id) > 60;
      this.addActor(c.id, "enemy", big ? { x: 120, y: 172 } : this.enemyPos(c.slot));
    });
    this.refreshStatus();
    this.events.on("update", this.bobIcons, this);
    this.events.once("shutdown", () => this.events.off("update", this.bobIcons, this));
    this.cameras.main.fadeIn(300);
    const tracks = getSession().db.config.music;
    const own = enemies.map((c) => getChar(this.ctx, c.id)).find((c) => c.kind === "enemy" && this.ctx.db.enemy(c.def).music);
    music(own ? this.ctx.db.enemy(own.def).music : b.boss ? (tracks?.boss ?? tracks?.battle) : tracks?.battle, this);
    if (isTouchMode(this)) void addTouchButtons(this, this.router, [{ label: "Back", action: "cancel" }], this.scale.width - 4, 6);
    void this.run(b);
  }

  /** Where an enemy stands by its slot (summoned ones reuse the slots of the fallen). */
  private enemyPos(slot: number) {
    if (this.bigSlot === undefined) return ENEMY_SLOTS[slot % ENEMY_SLOTS.length];
    if (slot === this.bigSlot) return BIG_BOSS_POS;
    return HENCH_SLOTS[(slot > this.bigSlot ? slot - 1 : slot) % HENCH_SLOTS.length];
  }

  private frameHeight(id: string) {
    const g = graphicsOf(this.ctx.db, getChar(this.ctx, id));
    return g.battler ? this.ctx.db.graphics.battlers[g.battler].frameHeight : 32;
  }

  private addActor(id: string, side: "hero" | "enemy", pos: { x: number; y: number }) {
    const c = getChar(this.ctx, id);
    const g = graphicsOf(this.ctx.db, c);
    const def = g.battler ? this.ctx.db.graphics.battlers[g.battler] : undefined;
    let sprite: Phaser.GameObjects.Sprite;
    let frames: Record<string, number> = {};
    if (def && this.textures.exists(K.battler(g.battler!))) {
      sprite = this.add.sprite(pos.x, pos.y, K.battler(g.battler!), def.frames.idle ?? 0).setOrigin(0.5, 1);
      frames = def.frames;
    } else {
      // Fallback: charset facing the other side.
      sprite = this.add.sprite(pos.x, pos.y, K.charset(g.charset), side === "hero" ? 10 : 1).setOrigin(0.5, 1);
    }
    sprite.setDepth(pos.y);
    const shadow = this.add.image(pos.x, pos.y - 1, K.shadow).setDepth(pos.y - 1).setScale(sprite.width / 16, 1).setAlpha(0.5);
    const actor: Actor = { id, side, sprite, shadow, home: { ...pos }, frames, icons: [], iconKey: "" };
    this.actors.set(id, actor);
    if (!isAlive(c)) this.pose(actor, "ko");
    else if (frames.idle2 !== undefined) {
      this.time.addEvent({
        delay: 450 + Math.random() * 100,
        loop: true,
        callback: () => {
          if (!isAlive(getChar(this.ctx, id)) || sprite.getData("busy")) return;
          sprite.setFrame(sprite.frame.name === String(frames.idle) ? frames.idle2 : frames.idle);
        },
      });
    }
  }

  private pose(a: Actor, pose: string) {
    const f = a.frames[pose] ?? a.frames.idle;
    if (f !== undefined) a.sprite.setFrame(f);
  }

  // ---------- panels ----------

  /** Status icons side by side above each living battler (§4.2). */
  private refreshStatusIcons() {
    for (const a of this.actors.values()) {
      const c = getChar(this.ctx, a.id);
      const icons = isAlive(c) && !swallowedEntry(this.ctx, a.id) ? miniStatusIconsOf(this.ctx.db, [c]) : [];
      const key = icons.join(",");
      if (key !== a.iconKey) {
        for (const img of a.icons) img.destroy();
        a.icons = icons.map((ic) => this.add.image(0, 0, K.statusMini, ic).setOrigin(0.5, 1).setDepth(900));
        a.iconKey = key;
      }
      const top = a.home.y - a.sprite.displayHeight - 2;
      a.icons.forEach((img, i) => img.setPosition(a.home.x + (i - (a.icons.length - 1) / 2) * 11, top).setData("baseY", top).setData("phase", i * 1.3));
    }
  }

  /** Gentle up/down motion of the status icons, and of flying battlers (they hover and bob). */
  private bobIcons(time: number) {
    for (const a of this.actors.values()) {
      const c = getChar(this.ctx, a.id);
      const flying = isAlive(c) && c.statuses.some((s) => this.ctx.db.status(s.id).fieldImmune);
      const bob = flying ? Math.round(Math.sin(time * 0.003 + a.home.x * 0.05) * 3) - 4 : 0;
      if (!a.sprite.getData("held")) a.sprite.y = a.home.y + bob; // not while swallowed / spat out
      for (const img of a.icons) img.y = (img.getData("baseY") as number) + bob + Math.round(Math.sin(time * 0.004 + (img.getData("phase") as number)));
    }
  }

  private refreshStatus() {
    this.refreshStatusIcons();
    this.statusPanel?.destroy();
    const ctx = this.ctx;
    const heroes = battle(ctx).combatants.filter((c) => c.side === "hero");
    const p = new Panel(this, 150, 192, 326, 74);
    heroes.forEach((c, i) => {
      const h = getChar(ctx, c.id);
      const s = computeStats(ctx.db, h);
      const y = 6 + i * 16;
      const face = faceKey(ctx.db, h);
      if (face && this.textures.exists(face)) p.add(this.add.image(6, y - 2, face).setOrigin(0, 0).setDisplaySize(14, 14));
      p.text(24, y, h.name, { color: isAlive(h) ? (battle(ctx).current === h.id ? COLORS.highlight : COLORS.text) : COLORS.bad });
      p.text(128, y, `${h.hp}`, { align: "right" });
      p.add(new Gauge(this, 132, y + 3, 50, COLORS.good).set(h.hp, s.maxHp));
      p.text(212, y, `${h.mp}`, { align: "right", color: COLORS.mp });
      p.add(new Gauge(this, 216, y + 3, 36, COLORS.mp).set(h.mp, s.maxMp));
      if (h.kind === "hero") {
        const lo = expForLevel(ctx.db, h.level);
        const hi = expForLevel(ctx.db, h.level + 1);
        p.text(262, y, `L${h.level}`, { color: COLORS.dim });
        p.add(new Gauge(this, 280, y + 4, 38, COLORS.exp, 2).set(h.exp - lo, hi - lo));
      }
    });
    this.statusPanel = p;
  }

  private message(text: string | null, info: string[][] = []) {
    this.messagePanel?.destroy();
    this.messagePanel = undefined;
    this.infoTimer?.remove();
    this.infoTimer = undefined;
    if (!text) return;
    const p = new Panel(this, 90, 6, 300, 22);
    this.messagePanel = p;
    if (!info.length) {
      p.text(150, 6, text, { align: "center" });
      return;
    }
    // Name on the left, the revealed facts cycling on the right (Perceive, §12.1).
    p.text(8, 6, text, { color: COLORS.highlight });
    const room = 300 - 8 - measureText(this, text) - 18;
    const pages = pageInfo(this, info, room);
    let i = 0;
    let line = p.text(292, 6, pages[0], { align: "right" });
    if (pages.length < 2) return;
    this.infoTimer = this.time.addEvent({
      delay: INFO_PAGE_MS,
      loop: true,
      callback: () => {
        i = (i + 1) % pages.length;
        line.destroy();
        line = p.text(292, 6, pages[i], { align: "right" });
      },
    });
  }

  // ---------- loop ----------

  private async run(b: BattleState) {
    if (b.kind === "ambush") await banner(this, "Ambush!", 800, COLORS.bad);
    if (b.kind === "firstStrike") await banner(this, "First Strike!", 800, COLORS.good);
    for (let guard = 0; guard < 500 && !b.result; guard++) {
      const t = nextBattleTurn(this.ctx);
      await this.playEvents(t.events);
      if (!t.actor) break;
      this.refreshStatus();
      const action = t.needsInput ? await this.heroCommand(t.actor) : chooseAiAction(this.ctx, t.actor);
      if (!t.needsInput) await wait(this, 250);
      await this.animateAction(t.actor, performAction(this.ctx, t.actor, action));
      this.refreshStatus();
    }
    await this.finish(b);
  }

  private async finish(b: BattleState) {
    this.message(null);
    if (b.result === "victory") {
      music(undefined, this);
      getAudio()?.jingle(sfxKey("victory"));
      await banner(this, "Victory!", 700, COLORS.highlight);
      const lines = [`EXP +${this.summary.exp}`, `Gold +${this.summary.gold}`];
      for (const i of this.summary.items) lines.push(`Found ${this.ctx.db.item(i).name}`);
      lines.push(...this.summary.levels);
      const p = new Panel(this, 120, 40, 240, 20 + lines.length * 12);
      lines.forEach((l, i) => p.text(12, 10 + i * 12, l, { color: l.includes("level") || l.includes("learned") ? COLORS.exp : COLORS.text }));
      await this.router.waitConfirm();
      p.destroy();
    } else if (b.result === "defeat") {
      music(undefined, this);
      sfx("defeat");
      await banner(this, "Defeated...", 1200, COLORS.bad);
    } else if (b.result === "escaped") {
      sfx("escape");
      for (const a of this.actors.values()) if (a.side === "hero") this.tweens.add({ targets: a.sprite, x: a.sprite.x + 120, duration: 400 });
      await wait(this, 450);
    }
    this.cameras.main.fadeOut(250);
    await wait(this, 260);
    const done = this.onDone;
    this.scene.stop();
    this.scene.wake("board");
    done?.();
  }

  // ---------- player commands (§12.2) ----------

  private async heroCommand(id: string): Promise<BattleAction> {
    const ctx = this.ctx;
    const hero = getChar(ctx, id);
    const actor = this.actors.get(id)!;
    this.tweens.add({ targets: actor.sprite, x: actor.home.x - 8, duration: 120 });
    const face = faceKey(ctx.db, hero);
    const facePanel = new Panel(this, 4, 192, 58, 74);
    if (face && this.textures.exists(face)) facePanel.add(this.add.image(5, 6, face).setOrigin(0, 0).setDisplaySize(48, 48));
    facePanel.text(29, 58, hero.name, { color: COLORS.highlight, align: "center" });
    // status icons right-aligned along the bottom edge of the portrait
    miniStatusIconsOf(ctx.db, [hero])
      .slice(-4)
      .forEach((ic, i, all) => facePanel.add(this.add.image(53 - (all.length - i) * 11, 43, K.statusMini, ic).setOrigin(0, 0)));
    try {
      for (;;) {
        const abilities = battleAbilities(ctx, id);
        const items = battleItems(ctx);
        const b = battle(ctx);
        const cmd = await pick(
          this,
          this.router,
          [
            { label: "Fight" },
            { label: "Defend" },
            { label: "Ability", disabled: !abilities.length },
            { label: "Item", disabled: !items.length },
            { label: "Run", disabled: b.boss },
          ],
          { x: 64, y: 192, width: 84, height: 74, rowHeight: 12, cancellable: false },
        );
        if (cmd === 0) {
          const t = await this.chooseTarget(id, "enemy");
          if (t) return { type: "attack", target: t };
        } else if (cmd === 1) return { type: "defend" };
        else if (cmd === 2) {
          const a = await this.chooseAbility(id, abilities);
          if (a) return a;
        } else if (cmd === 3) {
          const it = await this.chooseItem(id, items);
          if (it) return it;
        } else if (cmd === 4) return { type: "run" };
      }
    } finally {
      facePanel.destroy();
      this.tweens.add({ targets: actor.sprite, x: actor.home.x, duration: 120 });
    }
  }

  private async chooseAbility(id: string, abilities: string[]): Promise<BattleAction | null> {
    const ctx = this.ctx;
    const hero = getChar(ctx, id);
    let info: Panel | null = null;
    const a = await pickAbility(this, this.router, abilities.map((x) => ctx.db.ability(x)), {
      x: 150,
      y: 190,
      anchorBottom: true,
      title: `MP ${hero.mp}`,
      usable: (ab) => canUseBattleAbility(ctx, id, ab.id),
      onHighlight: (ab) => {
        info?.destroy();
        info = null;
        if (!ab) return;
        info = new Panel(this, 90, 6, 300, 22);
        info.text(150, 6, ab.description ?? "", { align: "center", color: COLORS.dim });
      },
    });
    if (!a) return null;
    const target = await this.targetFor(id, a.battle!.target);
    if (target === null) return null;
    return { type: "ability", ability: a.id, target: target || undefined };
  }

  private async chooseItem(id: string, items: string[]): Promise<BattleAction | null> {
    const ctx = this.ctx;
    const r = await pick(
      this,
      this.router,
      items.map((i) => ({ label: ctx.db.item(i).name, right: `x${itemCount(ctx, i)}`, icon: icon(ctx.db.item(i).icon) })),
      { x: 150, y: 190, anchorBottom: true, width: 170, maxRows: 8, title: "Items" },
    );
    if (r === null) return null;
    const it = ctx.db.item(items[r]);
    const target = await this.targetFor(id, it.battle!.target);
    if (target === null) return null;
    return { type: "item", item: it.id, target: target || undefined };
  }

  /** "" = no target needed (group/self); null = cancelled. */
  private async targetFor(id: string, target: BattleTarget): Promise<string | null> {
    if (target === "allEnemies" || target === "allAllies" || target === "self") return "";
    return this.chooseTarget(id, target);
  }

  /** Hand cursor over combatants. Any living combatant can be chosen; the list starts with the natural side. */
  private chooseTarget(id: string, target: BattleTarget): Promise<string | null> {
    const ctx = this.ctx;
    const natural = targetCandidates(ctx, id, target);
    const others = target === "fallenAlly" ? [] : targetCandidates(ctx, id, "any").filter((t) => !natural.includes(t));
    const list = [...natural, ...others];
    if (!list.length) return Promise.resolve(null);
    let i = 0;
    const hand = this.add.sprite(0, 0, CURSOR_KEY, 0).setDepth(1000);
    const place = () => {
      const a = this.actors.get(list[i])!;
      // The hand graphic points right: enemies (left side) get it on their right, pointing left;
      // heroes (right side) get it on their left, pointing right. Battler frames have transparent
      // margins, so aim at ~35% of the frame width from the centre.
      const enemy = a.side === "enemy";
      const reach = a.sprite.displayWidth * 0.35 + 9;
      hand.setFlipX(enemy);
      hand.setPosition(enemy ? a.sprite.x + reach : a.sprite.x - reach, a.sprite.y - a.sprite.displayHeight * 0.45);
      const c = getChar(ctx, list[i]);
      this.message(c.name, enemyInfoGroups(ctx, c));
    };
    place();
    return new Promise((resolve) => {
      const done = (v: string | null) => {
        release();
        hand.destroy();
        this.message(null);
        resolve(v);
      };
      const release = this.router.push({
        onAction: (a) => {
          if (a === "up" || a === "left") i = (i - 1 + list.length) % list.length;
          else if (a === "down" || a === "right") i = (i + 1) % list.length;
          else if (a === "confirm") return void done(list[i]);
          else if (a === "cancel") return void done(null);
          place();
          return true;
        },
        onPointerMove: (p) => {
          const hit = list.findIndex((t) => this.actors.get(t)!.sprite.getBounds().contains(p.x, p.y));
          if (hit >= 0 && hit !== i) {
            i = hit;
            place();
          }
        },
        onPointerDown: (p) => {
          const hit = list.findIndex((t) => this.actors.get(t)!.sprite.getBounds().contains(p.x, p.y));
          if (hit >= 0) done(list[hit]);
        },
      });
    });
  }

  // ---------- animation ----------

  private async animateAction(actorId: string, events: GameEvent[]) {
    const actor = this.actors.get(actorId);
    const act = events.find((e) => e.type === "action");
    if (actor && act && act.type === "action") {
      this.message(`${getChar(this.ctx, actorId).name}: ${act.name}`);
      actor.sprite.setData("busy", true);
      const dx = actor.side === "hero" ? -18 : 18;
      const magic = !!act.ability && this.ctx.db.ability(act.ability).type === "Magic";
      castSound(this.ctx, act.ability);
      this.pose(actor, act.name === "Attack" ? "attack" : act.item || magic ? "cast" : "attack");
      await new Promise<void>((r) => this.tweens.add({ targets: actor.sprite, x: actor.home.x + dx, duration: 140, onComplete: () => r() }));
      await wait(this, 120);
    }
    await this.playEvents(events.filter((e) => e.type !== "action"));
    if (actor) {
      this.tweens.add({ targets: actor.sprite, x: actor.home.x, duration: 140 });
      if (isAlive(getChar(this.ctx, actorId))) this.pose(actor, "idle");
      actor.sprite.setData("busy", false);
    }
    await wait(this, 350);
    this.message(null);
  }

  private async playEvents(events: GameEvent[]) {
    for (const e of events) {
      if (e.type !== "levelUp" && e.type !== "gold" && e.type !== "itemGained") sfxForEvent(this.ctx, e);
      const a = "target" in e ? this.actors.get(e.target as string) : undefined;
      const top = a ? { x: a.sprite.x, y: a.sprite.y - a.sprite.displayHeight - 2 } : { x: 240, y: 90 };
      switch (e.type) {
        case "damage":
          if (a) {
            a.sprite.setData("busy", true);
            this.pose(a, "hurt");
            this.tweens.add({ targets: a.sprite, x: a.home.x + (a.side === "hero" ? 4 : -4), yoyo: true, duration: 60, repeat: 1 });
            a.sprite.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
            this.time.delayedCall(80, () => a.sprite.clearTint().setTintMode(Phaser.TintModes.MULTIPLY));
          }
          popup(this, top.x, top.y, `${e.amount}${e.crit ? "!" : ""}`, e.weak ? COLORS.highlight : COLORS.text);
          await wait(this, 320);
          if (a && isAlive(getChar(this.ctx, a.id))) {
            this.pose(a, "idle");
            a.sprite.setData("busy", false);
          }
          this.refreshStatus();
          break;
        case "heal":
          popup(this, top.x, top.y, `+${e.amount}`, COLORS.good);
          await wait(this, 250);
          this.refreshStatus();
          break;
        case "mp":
          if (e.amount > 0) popup(this, top.x, top.y - 12, `+${e.amount} MP`, COLORS.mp); // above an HP popup
          this.refreshStatus();
          break;
        case "miss":
          popup(this, top.x, top.y, "Miss", COLORS.dim);
          await wait(this, 200);
          break;
        case "status":
          popup(this, top.x, top.y - 10, `${e.added ? "" : "-"}${this.ctx.db.status(e.status).name}`, e.added ? COLORS.highlight : COLORS.dim);
          this.refreshStatusIcons();
          await wait(this, 250);
          break;
        case "ko":
          if (a) {
            a.sprite.setData("busy", true);
            if (a.side === "enemy") {
              a.sprite.setTint(0xe43b44);
              this.tweens.add({ targets: a.sprite, alpha: 0, duration: 400 });
            } else this.pose(a, "ko");
          }
          await wait(this, 300);
          break;
        case "revive":
          if (a) {
            a.sprite.setAlpha(1).clearTint().setData("busy", false);
            this.pose(a, "idle");
          }
          popup(this, top.x, top.y, "Revived", COLORS.good);
          break;
        case "steal":
          this.message(e.item ? `Stole ${this.ctx.db.item(e.item).name}!` : "Nothing stolen.");
          await wait(this, 600);
          break;
        case "reveal":
          this.message("Stats revealed!");
          await wait(this, 400);
          break;
        case "swallow": {
          // the victim shrinks into the maw
          const by = this.actors.get(e.actor);
          const v = this.actors.get(e.target);
          if (by && v) {
            v.sprite.setData("busy", true).setData("held", true);
            this.refreshStatusIcons();
            const mouth = { x: by.sprite.x + by.sprite.displayWidth * 0.3, y: by.sprite.y - by.sprite.displayHeight * 0.45 };
            await new Promise<void>((r) =>
              this.tweens.add({ targets: v.sprite, x: mouth.x, y: mouth.y, scale: 0.2, alpha: 0, duration: 380, ease: "Quad.easeIn", onComplete: () => r() }),
            );
            this.tweens.add({ targets: by.sprite, scaleY: 1.08, yoyo: true, duration: 140, repeat: 1 });
          }
          this.message(`${getChar(this.ctx, e.target).name} was swallowed!`);
          await wait(this, 700);
          break;
        }
        case "spit":
        case "release": {
          const by = this.actors.get(e.actor);
          const v = this.actors.get(e.target);
          if (v) {
            const from = by ? { x: by.sprite.x + by.sprite.displayWidth * 0.3, y: by.sprite.y - by.sprite.displayHeight * 0.45 } : v.home;
            v.sprite.setPosition(from.x, from.y).setScale(0.3).setAlpha(1);
            if (by && e.type === "spit") this.tweens.add({ targets: by.sprite, scaleX: 1.1, yoyo: true, duration: 120 });
            await new Promise<void>((r) =>
              this.tweens.add({ targets: v.sprite, x: v.home.x, y: v.home.y, scale: 1, duration: 420, ease: "Back.easeOut", onComplete: () => r() }),
            );
            v.sprite.setData("held", false);
            const alive = isAlive(getChar(this.ctx, e.target));
            this.pose(v, alive ? "hurt" : "ko");
            if (e.type === "spit") {
              const vt = { x: v.home.x, y: v.home.y - v.sprite.displayHeight - 2 };
              if (e.hp) popup(this, vt.x, vt.y, `${e.hp}`, COLORS.text);
              if (e.mp) popup(this, vt.x, vt.y - 10, `-${e.mp} MP`, COLORS.mp);
            } else this.message(`${getChar(this.ctx, e.target).name} escaped the stomach!`);
            await wait(this, 500);
            if (alive) this.pose(v, "idle");
            v.sprite.setData("busy", false);
          }
          this.refreshStatus();
          break;
        }
        case "summoned": {
          this.message(`${getChar(this.ctx, e.actor).name} pays ${e.cost} G to raise the dead!`);
          await wait(this, 600);
          const b = battle(this.ctx);
          for (const id of e.ids) {
            const c = b.combatants.find((x) => x.id === id)!;
            const pos = this.enemyPos(c.slot);
            // the fallen one in that place makes room
            for (const [oid, old] of this.actors) {
              if (old.side === "enemy" && oid !== id && old.home.x === pos.x && old.home.y === pos.y && !isAlive(getChar(this.ctx, oid))) {
                old.sprite.destroy();
                old.shadow.destroy();
                for (const ic of old.icons) ic.destroy();
                this.actors.delete(oid);
              }
            }
            this.addActor(id, "enemy", pos);
            const a = this.actors.get(id)!;
            a.sprite.setAlpha(0).setTint(0x63c74d);
            this.tweens.add({ targets: a.sprite, alpha: 1, duration: 500, onComplete: () => a.sprite.clearTint() });
          }
          await wait(this, 550);
          this.refreshStatus();
          break;
        }
        case "turnSkipped": {
          const s = this.actors.get(e.actor);
          if (s) popup(this, s.sprite.x, s.sprite.y - s.sprite.displayHeight, "...", COLORS.dim);
          await wait(this, 400);
          break;
        }
        case "message":
          this.message(e.text);
          await wait(this, 700);
          break;
        case "exp":
          this.summary.exp = Math.max(this.summary.exp, e.amount);
          break;
        case "gold":
          this.summary.gold += e.amount;
          break;
        case "itemGained":
          this.summary.items.push(e.item);
          break;
        case "levelUp": {
          const h = getChar(this.ctx, e.target);
          this.summary.levels.push(`${h.name} reached level ${e.level}!`);
          for (const ab of e.abilities) this.summary.levels.push(`${h.name} learned ${this.ctx.db.ability(ab).name}!`);
          break;
        }
        default:
          break;
      }
    }
  }
}

