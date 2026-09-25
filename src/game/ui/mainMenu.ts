import type Phaser from "phaser";
import { board, reconcile } from "../../core/board/board";
import { canEquip, computeStats, knownAbilities } from "../../core/chars/character";
import type { Ctx } from "../../core/context";
import type { EquipSlot } from "../../core/data/types";
import { applyEffects } from "../../core/effects/effects";
import { canLearnScroll, equip, inventoryList, readScroll, unequip } from "../../core/items/inventory";
import { canSwitchQuest, questLog, switchQuest } from "../../core/script/quests";
import { listSaves, loadGame, saveGame, SAVE_SLOTS } from "../../core/state/save";
import type { InputRouter } from "../../engine/input";
import { COLORS, Panel, pick, type MenuItem } from "../../engine/ui/widgets";
import { icon } from "../keys";
import { getSession } from "../session";
import { showMessage } from "./dialog";
import { showStats } from "./stats";
import { getAudio, sfx } from "../sound";
import { toggleFullscreen } from "../../engine/fullscreen";

export type MenuResult = "title" | "loaded" | undefined;

const CATEGORY_ORDER = ["consumable", "battle", "scroll", "weapon", "armor", "accessory", "key"];

/** Main menu (§11): Heroes, Items, Quests & Save, System. Board only, on a hero's turn. */
export async function openMainMenu(scene: Phaser.Scene, input: InputRouter): Promise<MenuResult> {
  const session = getSession();
  for (;;) {
    const ctx = session.current.ctx;
    const gold = new Panel(scene, 8, 200, 110, 34);
    gold.text(8, 6, `Gold ${ctx.state.gold}`, { color: COLORS.highlight });
    gold.text(8, 18, `Time ${formatTime(ctx.state.playTime)}`, { color: COLORS.dim });
    const r = await pick(scene, input, [{ label: "Heroes" }, { label: "Items" }, { label: "Quests" }, { label: "Save" }, { label: "System" }], { x: 8, y: 30, width: 110, title: "Menu" });
    gold.destroy();
    if (r === null) return undefined;
    if (r === 0) await heroesPage(scene, input);
    if (r === 1) await itemsPage(scene, input);
    if (r === 2) await questsPage(scene, input);
    if (r === 3) {
      const res = await saveMenu(scene, input);
      if (res) return res;
    }
    if (r === 4) {
      const res = await systemPage(scene, input);
      if (res) return res;
    }
  }
}

function formatTime(s: number) {
  const m = Math.floor(s / 60);
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
}

const ctxNow = (): Ctx => getSession().current.ctx;

// ---------- heroes ----------

async function heroesPage(scene: Phaser.Scene, input: InputRouter) {
  for (;;) {
    const ctx = ctxNow();
    const heroes = ctx.state.roster.map((id) => ctx.state.heroes[id]);
    const r = await pick(
      scene,
      input,
      heroes.map((h) => ({ label: `${h.name}`, right: `Lv${h.level} ${h.hp}/${computeStats(ctx.db, h).maxHp}`, color: h.hp > 0 ? COLORS.text : COLORS.bad })),
      { x: 124, y: 30, width: 170, title: "Heroes" },
    );
    if (r === null) return;
    const hero = heroes[r];
    for (;;) {
      const a = await pick(scene, input, [{ label: "Stats" }, { label: "Equip" }, { label: "Abilities" }], { x: 300, y: 30, title: hero.name });
      if (a === null) break;
      if (a === 0) await showStats(scene, input, ctxNow(), hero);
      if (a === 1) await equipPage(scene, input, hero.id);
      if (a === 2) await abilitiesPage(scene, input, hero.id);
    }
  }
}

async function equipPage(scene: Phaser.Scene, input: InputRouter, heroId: string) {
  const slots: EquipSlot[] = ["weapon", "armor", "accessory"];
  for (;;) {
    const ctx = ctxNow();
    const hero = ctx.state.heroes[heroId];
    const r = await pick(
      scene,
      input,
      slots.map((s) => {
        const it = hero.equipment[s] ? ctx.db.item(hero.equipment[s]!) : undefined;
        return { label: `${s[0].toUpperCase()}${s.slice(1)}: ${it?.name ?? "-"}`, icon: icon(it?.icon) };
      }),
      { x: 124, y: 60, width: 220, title: `Equip ${hero.name}` },
    );
    if (r === null) return;
    const slot = slots[r];
    const options = inventoryList(ctx, (d) => d.equip?.slot === slot && canEquip(ctx.db, hero, d.id));
    const items: MenuItem[] = [{ label: "(Remove)" }, ...options.map((o) => ({ label: o.item.name, right: statDiff(ctx, o.item.id, hero.equipment[slot]), icon: icon(o.item.icon) }))];
    const c = await pick(scene, input, items, { x: 150, y: 80, width: 220, title: slot });
    if (c === null) continue;
    if (c === 0) unequip(ctx, hero, slot);
    else equip(ctx, hero, options[c - 1].item.id);
  }
}

function statDiff(ctx: Ctx, itemId: string, currentId?: string): string {
  const a = ctx.db.item(itemId).equip?.stats ?? {};
  const b = currentId ? (ctx.db.item(currentId).equip?.stats ?? {}) : {};
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])] as (keyof typeof a)[];
  const names: Record<string, string> = { str: "ATK", def: "DEF", mag: "MAG", mdef: "MDF", spd: "SPD", maxHp: "HP", maxMp: "MP" };
  return keys
    .map((k) => ({ k, d: (a[k] ?? 0) - (b[k] ?? 0) }))
    .filter((x) => x.d !== 0)
    .slice(0, 2)
    .map((x) => `${names[x.k]}${x.d > 0 ? "+" : ""}${x.d}`)
    .join(" ");
}

async function abilitiesPage(scene: Phaser.Scene, input: InputRouter, heroId: string) {
  const ctx = ctxNow();
  const hero = ctx.state.heroes[heroId];
  const list = knownAbilities(ctx.db, hero).map((id) => ctx.db.ability(id));
  let info: Panel | null = null;
  const describe = (i: number) => {
    info?.destroy();
    info = new Panel(scene, 124, 206, 348, 40);
    const a = list[i];
    const where = [a.battle ? "Battle" : "", a.board ? "Board" : "", a.special ? "Board" : ""].filter(Boolean).join(" / ");
    info.text(8, 5, `${a.type}${a.group ? ` > ${a.group}` : ""}  [${where}]`, { color: COLORS.dim });
    info.text(8, 17, a.description ?? "", { maxWidth: 330 });
  };
  await pick(scene, input, list.map((a) => ({ label: a.name, right: a.mp ? `${a.mp} MP` : "", icon: icon(a.icon) })), {
    x: 124,
    y: 30,
    width: 200,
    maxRows: 12,
    title: `${hero.name}'s abilities`,
    onHighlight: describe,
  });
  (info as Panel | null)?.destroy();
}

// ---------- items ----------

async function itemsPage(scene: Phaser.Scene, input: InputRouter) {
  for (;;) {
    const ctx = ctxNow();
    const list = inventoryList(ctx).sort((a, b) => CATEGORY_ORDER.indexOf(a.item.category) - CATEGORY_ORDER.indexOf(b.item.category));
    if (!list.length) {
      await showMessage(scene, input, ctx, "The bag is empty.");
      return;
    }
    let info: Panel | null = null;
    const r = await pick(scene, input, list.map((e) => ({ label: e.item.name, right: `x${e.count}`, icon: icon(e.item.icon) })), {
      x: 124,
      y: 30,
      width: 200,
      maxRows: 12,
      title: "Items",
      onHighlight: (i) => {
        info?.destroy();
        info = new Panel(scene, 124, 216, 348, 30);
        info.text(8, 9, list[i].item.description ?? list[i].item.category, { maxWidth: 330 });
      },
    });
    (info as Panel | null)?.destroy();
    if (r === null) return;
    await useFromMenu(scene, input, list[r].item.id);
  }
}

async function useFromMenu(scene: Phaser.Scene, input: InputRouter, itemId: string) {
  const ctx = ctxNow();
  const item = ctx.db.item(itemId);
  const heroes = ctx.state.roster.map((id) => ctx.state.heroes[id]);
  if (item.category === "scroll") {
    const r = await pick(scene, input, heroes.map((h) => ({ label: h.name, disabled: !canLearnScroll(ctx, h, itemId) })), { x: 330, y: 60, title: "Who reads it?" });
    if (r === null) return;
    const ev = readScroll(ctx, heroes[r], itemId);
    if (ev.length) await showMessage(scene, input, ctx, `${heroes[r].name} learned *${ctx.db.ability(item.learn!.ability).name}*!`);
    return;
  }
  if (item.category !== "consumable" || !item.battle) {
    await showMessage(scene, input, ctx, item.description ?? item.name);
    return;
  }
  const peaceful = ctx.state.board && ctx.db.map(board(ctx).mapId).kind === "peaceful";
  if (!peaceful) {
    await showMessage(scene, input, ctx, "Out here, use items from a hero's *Item* command so they must be in reach.");
    return;
  }
  const r = await pick(scene, input, heroes.map((h) => ({ label: h.name, right: `${h.hp}/${computeStats(ctx.db, h).maxHp}` })), { x: 330, y: 60, title: "Use on" });
  if (r === null) return;
  const target = heroes[r];
  const wantsFallen = item.battle.target === "fallenAlly";
  if (wantsFallen !== target.hp <= 0) return;
  ctx.state.inventory[itemId]--;
  if (!ctx.state.inventory[itemId]) delete ctx.state.inventory[itemId];
  applyEffects({ ctx, user: target, scope: "board" }, target, item.battle.effects);
  reconcile(ctx);
}

// ---------- quests ----------

async function questsPage(scene: Phaser.Scene, input: InputRouter): Promise<void> {
  for (;;) {
    const ctx = ctxNow();
    const log = questLog(ctx).filter((q) => !q.done || q.active);
    const done = questLog(ctx).filter((q) => q.done);
    let info: Panel | null = null;
    const items: MenuItem[] = [
      ...log.map((q) => ({ label: `${q.active ? "> " : "  "}${q.title}`, color: q.active ? COLORS.highlight : COLORS.text })),
      ...done.map((q) => ({ label: `  ${q.title}`, right: "done", color: COLORS.dim })),
    ];
    if (!items.length) {
      await showMessage(scene, input, ctx, "No quests yet.");
      return;
    }
    const all = [...log, ...done];
    const r = await pick(scene, input, items, {
      x: 124,
      y: 30,
      width: 190,
      title: "Quests",
      onHighlight: (i) => {
        info?.destroy();
        info = null;
        const q = all[i];
        if (!q) return;
        info = new Panel(scene, 124, 150, 348, 100);
        info.text(8, 6, q.description, { maxWidth: 330, color: COLORS.dim });
        q.steps.forEach((s, j) => info!.text(12, 36 + j * 12, `${s.done ? "[x]" : "[ ]"} ${s.objective}`, { color: s.done ? COLORS.dim : COLORS.text }));
      },
    });
    (info as Panel | null)?.destroy();
    if (r === null) return;
    const q = all[r];
    if (q.done || q.active) continue;
    if (!canSwitchQuest(ctx)) await showMessage(scene, input, ctx, "You can't switch quests right now.");
    else switchQuest(ctx, q.id);
  }
}

// ---------- save ----------

async function saveMenu(scene: Phaser.Scene, input: InputRouter): Promise<MenuResult> {
  for (;;) {
    const hasSaves = listSaves(getSession().storage).some(Boolean);
    const r = await pick(scene, input, [{ label: "Save" }, { label: "Load", disabled: !hasSaves }], { x: 124, y: 30, width: 110, title: "Save" });
    if (r === null) return undefined;
    if (r === 0) await savePage(scene, input);
    else if (await loadPage(scene, input)) return "loaded";
  }
}

function slotItems(): MenuItem[] {
  const saves = listSaves(getSession().storage);
  return Array.from({ length: SAVE_SLOTS }, (_, i) => {
    const s = saves[i];
    return s
      ? { label: `Slot ${i + 1}: ${s.mapName}`, right: `Lv${Math.max(...s.heroes.map((h) => h.level))} ${formatTime(s.playTime)}` }
      : { label: `Slot ${i + 1}: - empty -`, color: COLORS.dim };
  });
}

async function savePage(scene: Phaser.Scene, input: InputRouter) {
  const r = await pick(scene, input, slotItems(), { x: 150, y: 60, width: 250, title: "Save to" });
  if (r === null) return;
  const s = getSession();
  saveGame(s.db, s.current.state, s.storage, r);
  sfx("save");
  await showMessage(scene, input, s.current.ctx, `Saved to slot ${r + 1}.`);
}

export async function loadPage(scene: Phaser.Scene, input: InputRouter): Promise<boolean> {
  const saves = listSaves(getSession().storage);
  const items = slotItems().map((it, i) => ({ ...it, disabled: !saves[i] }));
  if (!items.some((i) => !i.disabled)) return false;
  const r = await pick(scene, input, items, { x: 150, y: 60, width: 250, title: "Load" });
  if (r === null) return false;
  const state = loadGame(getSession().storage, r);
  if (!state) return false;
  getSession().loadState(state);
  return true;
}

// ---------- system ----------

async function systemPage(scene: Phaser.Scene, input: InputRouter): Promise<MenuResult> {
  const s = getSession();
  const speeds = [
    { label: "Slow", v: 25 },
    { label: "Normal", v: 45 },
    { label: "Fast", v: 90 },
  ];
  for (;;) {
    const cur = speeds.find((x) => x.v === s.settings.textSpeed)?.label ?? "Normal";
    const pct = (v: number) => `${Math.round(v * 100)}%`;
    const r = await pick(
      scene,
      input,
      [
        { label: "Text speed", right: cur },
        { label: "Music", right: pct(s.settings.musicVolume) },
        { label: "Sound", right: pct(s.settings.sfxVolume) },
        { label: "Fullscreen", right: scene.scale.isFullscreen ? "On" : "Off" },
        { label: "Back to title" },
        { label: "Exit game" },
      ],
      { x: 124, y: 30, width: 170, title: "System" },
    );
    if (r === null) return undefined;
    const step = (v: number) => (v >= 0.99 ? 0 : Math.round((v + 0.25) * 4) / 4);
    if (r === 0) {
      const i = speeds.findIndex((x) => x.label === cur);
      s.settings.textSpeed = speeds[(i + 1) % speeds.length].v;
      s.saveSettings();
    } else if (r === 1 || r === 2) {
      if (r === 1) s.settings.musicVolume = step(s.settings.musicVolume);
      else s.settings.sfxVolume = step(s.settings.sfxVolume);
      getAudio()?.setVolumes(s.settings.musicVolume, s.settings.sfxVolume);
      s.saveSettings();
      sfx("confirm");
    } else if (r === 3) {
      toggleFullscreen(scene);
    } else {
      const ok = await pick(scene, input, [{ label: "Yes" }, { label: "No" }], { x: 200, y: 80, title: "Unsaved progress is lost." });
      if (ok !== 0) continue;
      if (r === 5) {
        window.close();
      }
      return "title";
    }
  }
}
