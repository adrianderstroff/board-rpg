// End-to-end browser scenarios. Drives the real UI with the keyboard (debug API only for setup)
// against a running dev server and checks the resulting game state.
// Usage: node tools/e2e.mjs [url] [scenario ...]
import { chromium } from "playwright";
import { mkdirSync, rmSync } from "node:fs";

const url = process.argv[2]?.startsWith("http") ? process.argv[2] : "http://localhost:5173/";
const only = process.argv.slice(2).filter((a) => !a.startsWith("http"));
const OUT = "tools/out/e2e";
if (!only.length) rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class Driver {
  constructor(page, name) {
    this.page = page;
    this.name = name;
    this.shots = 0;
  }
  ev(fn, arg) {
    return this.page.evaluate(fn, arg);
  }
  dbg(expr) {
    return this.page.evaluate(`(() => { const d = __game.debug; return ${expr}; })()`);
  }
  async key(k, times = 1, delay = 160) {
    for (let i = 0; i < times; i++) {
      await this.page.keyboard.press(k);
      await sleep(delay);
    }
  }
  async waitFor(expr, timeout = 15000, what = expr) {
    const start = Date.now();
    for (;;) {
      if (await this.dbg(expr).catch(() => false)) return;
      if (Date.now() - start > timeout) throw new Error(`timeout waiting for ${what}`);
      await sleep(100);
    }
  }
  /** Presses a key until `expr` holds (dialogs, battles). */
  async pressUntil(expr, k = "Enter", max = 60, delay = 350) {
    for (let i = 0; i < max; i++) {
      if (await this.dbg(expr).catch(() => false)) return;
      await this.key(k, 1, delay);
    }
    if (!(await this.dbg(expr))) throw new Error(`pressUntil failed: ${expr}`);
  }
  async shot(label) {
    await this.page.screenshot({ path: `${OUT}/${this.name}-${String(++this.shots).padStart(2, "0")}-${label}.png` });
  }
  async click(x, y) {
    const box = await this.page.locator("canvas").boundingBox();
    await this.page.mouse.click(box.x + (x * box.width) / 480, box.y + (y * box.height) / 270);
    await sleep(200);
  }
  async clickCell(x, y) {
    const p = await this.dbg(`d.cellScreen(${x}, ${y})`);
    await this.click(p.x, p.y);
  }
  expect(cond, msg) {
    if (!cond) throw new Error(`assertion failed: ${msg}`);
  }
  /** Fresh page, empty saves, new game, first hero turn with the command box open. */
  async newGame({ keepSaves = false } = {}) {
    await this.page.goto(url);
    if (!keepSaves) await this.ev(() => localStorage.clear());
    await this.page.reload();
    await this.waitFor(`d.activeScenes().includes("title")`);
    await this.choose("New Game");
    await this.waitHeroTurn();
  }
  /** Waits for a hero's turn with the command box open (optionally a different hero than `not`). */
  async waitHeroTurn(not) {
    const cond = not ? `!!d.heroTurn() && d.heroTurn() !== "${not}" && !!d.menu()` : `!!d.heroTurn() && !!d.menu()`;
    await this.waitFor(cond, 40000, "hero turn with command box");
    await sleep(200);
    return this.dbg(`d.heroTurn()`);
  }
  /**
   * Waits for a menu containing an entry starting with `label`, moves the hand cursor onto it
   * and confirms. Robust against disabled entries and changing menu layouts.
   */
  async choose(label, timeout = 10000) {
    const start = Date.now();
    for (;;) {
      const m = await this.dbg(`d.menu()`);
      const idx = m ? m.items.findIndex((i) => i.label.startsWith(label)) : -1;
      if (idx >= 0) {
        if (m.items[idx].disabled) throw new Error(`menu entry "${label}" is disabled`);
        for (let n = 0; n < m.items.length * 2; n++) {
          const cur = await this.dbg(`d.menu()`);
          if (cur.index === idx) break;
          await this.key(cur.index < idx ? "ArrowDown" : "ArrowUp", 1, 90);
        }
        await this.key("Enter", 1, 350);
        return;
      }
      if (Date.now() - start > timeout) throw new Error(`no menu entry "${label}" (menu: ${JSON.stringify(m)})`);
      await sleep(120);
    }
  }
  /** Converts virtual 480x270 coordinates to page coordinates. */
  async pagePos(x, y) {
    const box = await this.page.locator("canvas").boundingBox();
    return { x: box.x + (x * box.width) / 480, y: box.y + (y * box.height) / 270 };
  }
  async tap(x, y) {
    const p = await this.pagePos(x, y);
    await this.page.touchscreen.tap(p.x, p.y);
    await sleep(250);
  }
  async tapCell(x, y) {
    const p = await this.dbg(`d.cellScreen(${x}, ${y})`);
    await this.tap(p.x, p.y);
  }
  /** Taps a menu entry by label (touch equivalent of choose). */
  async tapMenu(label, timeout = 10000) {
    const start = Date.now();
    for (;;) {
      const m = await this.dbg(`d.menu()`);
      const idx = m ? m.items.findIndex((i) => i.label.startsWith(label)) : -1;
      const rect = m?.rects.find((r) => r.index === idx);
      if (rect) {
        await this.tap(rect.x + rect.w / 2, rect.y + rect.h / 2);
        return;
      }
      if (Date.now() - start > timeout) throw new Error(`no visible menu entry "${label}" (menu: ${JSON.stringify(m)})`);
      await sleep(120);
    }
  }
  /** One-finger drag via raw touch events (Playwright has no touch-drag helper). */
  async touchDrag(x1, y1, x2, y2, steps = 8) {
    const cdp = await this.page.context().newCDPSession(this.page);
    const a = await this.pagePos(x1, y1);
    const b = await this.pagePos(x2, y2);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: a.x, y: a.y }] });
    for (let i = 1; i <= steps; i++) {
      const k = i / steps;
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k }] });
      await sleep(20);
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await sleep(250);
  }
  /** From the open command box: Move → cursor steps → select the cell. */
  async moveTo(keys) {
    await this.choose("Move");
    await sleep(250);
    for (const k of keys) await this.key(k, 1, 150);
    await this.key("Enter", 1, 500);
  }
  /** Command box → "End Party" (last entry). */
  async endParty() {
    await d_endParty(this);
  }
  async travelToDunes(defeatAllBut = []) {
    await this.ev((keep) => {
      const s = __game.debug.state();
      const ids = __game.debug.ctx().db.map("scorpion_dunes").enemies.map((e) => e.id);
      s.maps.scorpion_dunes = { defeated: ids.filter((i) => !keep.includes(i)), removedEvents: [], triggered: ["enter_hint#0"] };
      s.flags.gate_open = true;
      __game.debug.travel("scorpion_dunes", "from_village");
    }, defeatAllBut);
    await this.waitFor(`d.state().board && d.state().board.mapId === "scorpion_dunes"`);
  }
}

async function d_endParty(d) {
  await d.choose("End Party");
}

// ---------------- scenarios ----------------

const scenarios = {
  async inn(d) {
    await d.newGame();
    const actor = await d.dbg(`d.heroTurn()`);
    await d.dbg(`d.place("${actor}", 10, 4)`);
    const other = actor === "mira" ? "tarek" : "mira";
    await d.dbg(`d.setHp("${other}", 0)`);
    await d.dbg(`d.setHp("${actor}", 3)`);
    d.expect(await d.dbg(`Object.values(d.state().board.pieces).some(p => p.fallen)`), "a fallen hero lies on the board");
    await d.shot("fallen");
    await d.moveTo(["ArrowUp"]); // onto the innkeeper
    await d.shot("options");
    await d.choose("Rest");
    await d.choose("Rest (");
    await sleep(1200);
    await d.shot("rested");
    await d.pressUntil(`!!d.menu()`, "Enter", 8, 400);
    const r = await d.ev(() => {
      const s = __game.debug.state();
      return { gold: s.gold, fallen: Object.values(s.board.pieces).filter((p) => p.fallen).length, hp: s.roster.map((id) => s.heroes[id].hp) };
    });
    d.expect(r.gold === 260, `inn cost 40 gold (gold ${r.gold})`);
    d.expect(r.fallen === 0, "no fallen heroes after resting");
    d.expect(r.hp.every((h) => h > 20), `everyone healed ${r.hp}`);
  },

  async exitWalk(d) {
    await d.newGame();
    const actor = await d.dbg(`d.heroTurn()`);
    await d.dbg(`d.setFlag("gate_open")`);
    await d.dbg(`d.place("${actor}", 12, 5)`);
    await d.moveTo(["ArrowRight"]);
    await d.shot("travel-prompt");
    await d.choose("Yes");
    await d.waitFor(`d.state().board.mapId === "scorpion_dunes"`);
    await sleep(1500);
    await d.shot("arrived");
  },

  async saveContinue(d) {
    await d.newGame();
    await d.dbg(`(d.state().gold = 777)`);
    await d.key("m", 1, 500);
    await d.choose("Save"); // main menu → Save
    await d.waitFor(`d.menu() && d.menu().title === "Save"`);
    await d.choose("Save"); // Save / Load submenu
    await d.shot("slots");
    await d.choose("Slot 1");
    await sleep(600);
    await d.shot("saved");
    await d.pressUntil(`d.menu() && d.menu().title === "Save"`, "Enter", 6, 400);
    await d.key("Escape", 2, 300);
    d.expect(await d.ev(() => !!localStorage.getItem("board-rpg:save:0")), "save slot 1 written");
    await d.page.reload();
    await d.waitFor(`d.activeScenes().includes("title")`);
    await d.choose("Continue");
    await d.shot("load-menu");
    await d.choose("Slot 1");
    await d.waitFor(`d.activeScenes().includes("board")`);
    await sleep(800);
    d.expect((await d.dbg(`d.state().gold`)) === 777, "loaded game has the saved gold");
  },

  async gameOver(d) {
    await d.newGame();
    await d.ev(() => {
      for (const id of __game.debug.state().roster) __game.debug.setHp(id, 0);
    });
    await d.key("Escape", 2, 400);
    await d.waitFor(`d.activeScenes().includes("gameover")`, 10000);
    await sleep(800);
    await d.shot("gameover");
    await d.choose("Title");
    await d.waitFor(`d.activeScenes().includes("title")`);
  },

  async shopScrollEquip(d) {
    await d.newGame();
    const actor = await d.dbg(`d.heroTurn()`);
    await d.dbg(`(d.give("scroll_venom_mist"), d.give("iron_sword"), true)`);
    const gold0 = await d.dbg(`d.state().gold`);
    await d.dbg(`d.place("${actor}", 6, 9)`);
    await d.moveTo(["ArrowUp"]); // Brann
    await d.choose("Buy/Sell");
    await d.choose("Sell");
    await d.shot("sell");
    await d.choose("Fire Bomb");
    await d.key("Enter", 1, 400); // quantity dialog: sell 1
    const gold1 = await d.dbg(`d.state().gold`);
    d.expect(gold1 === gold0 + 30, `sold fire bomb for 30 (${gold0} → ${gold1})`);
    await d.key("Escape", 1, 300);
    await d.choose("Leave"); // shop
    await d.waitFor(`d.menu() && d.menu().title === "Choose"`);
    await d.choose("Leave"); // close-up
    // read the scroll from the main menu (menu key works from the command box)
    await d.waitFor(`d.menu() && d.menu().items.some(i => i.label === "Stats")`);
    await d.key("m", 1, 500);
    await d.choose("Items");
    await d.choose("Scroll: Venom Mist");
    await d.shot("who-reads");
    await d.choose("Mira");
    await sleep(400);
    await d.pressUntil(`d.menu() && d.menu().title === "Items"`, "Enter", 6, 400);
    d.expect(await d.dbg(`d.state().heroes.mira.learned.includes("venom_mist")`), "Mira learned Venom Mist");
    await d.key("Escape", 1, 300);
    // equip the iron sword on Aldric
    await d.choose("Heroes");
    await d.choose("Aldric");
    await d.choose("Equip");
    await d.choose("Weapon:");
    await d.shot("equip");
    await d.choose("Iron Sword");
    const eq = await d.dbg(`[d.state().heroes.aldric.equipment.weapon, d.state().inventory.bronze_sword]`);
    d.expect(eq[0] === "iron_sword" && eq[1] === 1, `equipped iron sword (${eq})`);
    await d.key("Escape", 5, 250);
  },

  async stealNpc(d) {
    await d.newGame();
    const actor = await d.dbg(`d.heroTurn()`);
    d.expect(actor === "kit", `Kit acts first (${actor})`);
    await d.dbg(`d.place("kit", 8, 9)`);
    await d.moveTo(["ArrowUp"]); // Salma
    await d.shot("options");
    await d.choose("Steal");
    await sleep(800);
    await d.shot("stolen");
    d.expect(await d.dbg(`d.state().board.turn.abilityUsed.includes("kit")`), "stealing used Kit's ability action");
  },

  async trapFreezeSlide(d) {
    await d.newGame();
    await d.travelToDunes(["scorp_a"]);
    await d.ev(() => {
      const s = __game.debug.state();
      s.board.chars["scorp_a#0"].statuses.push({ id: "sleep", turns: 9 });
      // everyone can cast Ice for this test
      for (const id of s.roster) {
        s.heroes[id].learned.push("ice");
      }
    });
    await d.dbg(`d.setLevel("kit", 3)`);
    const actor = await d.waitHeroTurn();
    d.expect(actor === "kit", `Kit's turn (${actor})`);
    await d.dbg(`d.place("kit", 3, 4)`);
    // Trap: Ability → Skill → Trap → click an empty cell
    await d.choose("Ability");
    await d.choose("Skill");
    await d.choose("Trap");
    await d.clickCell(3, 6);
    await sleep(800);
    await d.shot("trap");
    d.expect(await d.dbg(`d.state().board.traps.some(t => t.x === 3 && t.y === 6)`), "trap placed at 3,6");
    // an enemy walks into it
    await d.ev(() => {
      const dbg = __game.debug;
      const p = Object.values(dbg.state().board.pieces).find((x) => x.members.includes("scorp_a#0"));
      p.x = 3;
      p.y = 7;
      dbg.stepOnto("scorp_a#0", 3, 6);
    });
    const trapped = await d.ev(() => {
      const s = __game.debug.state();
      const c = s.board.chars["scorp_a#0"];
      return { traps: s.board.traps.length, hp: c?.hp, stuck: c?.statuses.some((x) => x.id === "stuck") };
    });
    d.expect(trapped.traps === 0 && trapped.stuck && trapped.hp < 30, `trap triggered ${JSON.stringify(trapped)}`);
    await d.shot("trapped");
    await d.choose("End Turn");
    const next = await d.waitHeroTurn("kit");
    // Ability → Magic → (Attack) → Ice at (5,4)
    await d.choose("Ability");
    await d.choose("Magic");
    if (next === "mira") await d.choose("Attack");
    await d.choose("Ice");
    await d.clickCell(5, 4);
    await sleep(900);
    await d.shot("frozen");
    const frozen = await d.dbg(`d.state().board.fieldEffects.filter(f => f.effect === "frozen").map(f => f.x + "," + f.y)`);
    d.expect(frozen.length === 5 && frozen.includes("5,4"), `ice froze a cross of 5 cells (${frozen})`);
    await d.choose("Move");
    await d.key("ArrowRight", 1, 150); // onto (4,4) → slides east
    await d.key("Enter", 1, 500);
    await sleep(1500);
    await d.shot("slid");
    const pos = await d.dbg(`(p => [p.x, p.y])(Object.values(d.state().board.pieces).find(p => p.members.includes("kit")))`);
    d.expect(pos[0] === 7 && pos[1] === 4, `slid over the ice to 7,4 (at ${pos})`);
    // sliding is an effect → the move can't be undone
    await d.waitFor(`d.menu() && d.menu().items.some(i => i.label === "Stats")`);
    d.expect(!(await d.dbg(`d.menu().items.some(i => i.label === "Undo Move")`)), "no Undo Move after sliding");
  },

  async hiddenEnding(d) {
    await d.newGame();
    const actor = await d.dbg(`d.heroTurn()`);
    await d.dbg(`d.place("${actor}", 6, 4)`);
    await d.moveTo(["ArrowUp"]); // elder
    await d.pressUntil(`d.state().flags.gate_open && d.menu() && d.menu().title === "Choose"`, "Enter", 40, 400);
    d.expect((await d.dbg(`d.state().quests.active`)) === "clear_dunes", "sub quest active after talking");
    await d.choose("Leave");
    for (const h of ["aldric", "mira", "kit", "tarek"]) await d.dbg(`d.setLevel("${h}", 18)`);
    // the party already moved this round: End Party, then walk through the east exit
    await d.endParty();
    const a3 = await d.waitHeroTurn();
    await d.dbg(`d.place("${a3}", 12, 5)`);
    // everything but the Emperor is already gone → defeating him triggers the hidden ending
    await d.ev(() => {
      const s = __game.debug.state();
      const ids = __game.debug.ctx().db.map("scorpion_dunes").enemies.map((e) => e.id);
      s.maps.scorpion_dunes = { defeated: ids.filter((i) => i !== "emperor"), removedEvents: [], triggered: ["enter_hint#0"] };
    });
    await d.moveTo(["ArrowRight"]);
    await d.choose("Yes");
    await d.waitFor(`d.state().board.mapId === "scorpion_dunes"`);
    const a4 = await d.waitHeroTurn();
    await d.dbg(`d.place("${a4}", 14, 6)`);
    await d.moveTo(["ArrowRight"]); // onto the Emperor
    await d.choose("Yes");
    await d.waitFor(`d.activeScenes().includes("battle")`);
    await sleep(1500);
    await d.shot("boss");
    await d.pressUntil(`!d.activeScenes().includes("battle") && d.state().quests.entries.clear_dunes && d.state().quests.entries.clear_dunes.status === "done"`, "Enter", 150, 300);
    d.expect((await d.dbg(`d.state().quests.entries.clear_dunes.ending`)) === "cleansed", "hidden ending reached");
    d.expect(!!(await d.dbg(`d.state().flags.dunes_cleansed`)), "dunes_cleansed flag set");
    await d.shot("after-boss");
    // back to the village and report
    await d.waitHeroTurn();
    await d.endParty();
    const a6 = await d.waitHeroTurn();
    await d.dbg(`d.place("${a6}", 1, 7)`);
    await d.moveTo(["ArrowLeft"]);
    await d.choose("Yes");
    await d.waitFor(`d.state().board.mapId === "sandhollow"`);
    const a7 = await d.waitHeroTurn();
    await d.dbg(`d.place("${a7}", 6, 4)`);
    await d.moveTo(["ArrowUp"]);
    await d.pressUntil(`d.state().quests.entries.road_to_oasis.status === "done" && !!d.menu()`, "Enter", 40, 400);
    await d.shot("reward");
    d.expect((await d.dbg(`d.state().inventory.flame_blade`)) === 1, "Elder gave the Flame Blade bonus");
  },

  async touch(d) {
    await d.page.goto(url);
    await d.ev(() => localStorage.clear());
    await d.page.reload();
    await d.waitFor(`d.activeScenes().includes("title")`);
    await d.tapMenu("New Game");
    const actor = await d.waitHeroTurn();
    await d.shot("board");
    // Move: first tap previews, second tap confirms
    await d.tapMenu("Move");
    await sleep(300);
    const before = await d.dbg(`(p => [p.x, p.y])(Object.values(d.state().board.pieces).find(p => p.members.includes("${actor}")))`);
    const target = { x: before[0] + 1, y: before[1] };
    await d.tapCell(target.x, target.y);
    await d.shot("preview");
    const still = await d.dbg(`(p => [p.x, p.y])(Object.values(d.state().board.pieces).find(p => p.members.includes("${actor}")))`);
    d.expect(still[0] === before[0] && still[1] === before[1], "first tap only previews");
    await d.tapCell(target.x, target.y);
    await sleep(800);
    const after = await d.dbg(`(p => [p.x, p.y])(Object.values(d.state().board.pieces).find(p => p.members.includes("${actor}")))`);
    d.expect(after[0] === target.x && after[1] === target.y, `second tap moved the party (${after})`);
    // Back button closes a sub menu
    await d.waitFor(`d.menu() && d.menu().items.some(i => i.label === "Stats")`);
    await d.tapMenu("Item");
    await d.waitFor(`d.menu() && d.menu().title === "Items"`);
    await d.shot("items");
    await d.tap(480 - 4 - 46 - 4 - 23, 270 - 26 + 11); // "Back" (second button from the right)
    await d.waitFor(`d.menu() && d.menu().items.some(i => i.label === "Stats")`, 5000, "back to the command box");
    // Menu button opens the main menu
    await d.tap(480 - 4 - 23, 270 - 26 + 11); // "Menu"
    await d.waitFor(`d.menu() && d.menu().title === "Menu"`, 5000, "main menu");
    await d.shot("menu");
    await d.tap(480 - 4 - 46 - 4 - 23, 270 - 26 + 11); // Back
    await d.waitFor(`d.menu() && d.menu().items.some(i => i.label === "Stats")`, 5000, "main menu closed");
    // Talking to a villager shows the close-up; Back cancels it
    // (Kit's party already moved, so this part uses the next hero's turn)
    // Drag pans the camera and doesn't select anything
    const cam0 = await d.dbg(`d.camera()`);
    await d.touchDrag(240, 120, 180, 90);
    const cam1 = await d.dbg(`d.camera()`);
    d.expect(cam1.x !== cam0.x || cam1.y !== cam0.y, `drag scrolled the camera (${JSON.stringify(cam0)} → ${JSON.stringify(cam1)})`);
    d.expect(await d.dbg(`d.menu() && d.menu().items.some(i => i.label === "Stats")`), "drag did not trigger a tap");
    await d.shot("dragged");
  },

  async interactCancelRotate(d) {
    await d.newGame();
    const actor = await d.dbg(`d.heroTurn()`);
    await d.dbg(`d.place("${actor}", 6, 4)`);
    await d.moveTo(["ArrowUp"]); // onto Elder Hamid's cell → close-up
    await d.waitFor(`d.menu() && d.menu().title === "Choose"`);
    await d.shot("close-up");
    const onElder = await d.dbg(`(p => [p.x, p.y])(Object.values(d.state().board.pieces).find(p => p.members.includes("${actor}")))`);
    d.expect(onElder[0] === 6 && onElder[1] === 3, `hero stands on the elder's cell (${onElder})`);
    await d.key("Escape", 1, 500); // back out → the move is undone
    const back = await d.dbg(`(p => [p.x, p.y])(Object.values(d.state().board.pieces).find(p => p.members.includes("${actor}")))`);
    d.expect(back[0] === 6 && back[1] === 4, `cancel returned the hero (${back})`);
    d.expect(!(await d.dbg(`d.state().board.turn.moved.some(id => !!d.state().heroes[id])`)), "move not spent");
    // walk *through* a villager: elder at (6,3); from (6,4) the rook/queen slides north past him
    await d.waitFor(`d.menu() && d.menu().items.some(i => i.label === "Move" && !i.disabled)`);
    // rotating keeps the cursor cell in place on screen – also at a map corner (0,0)
    await d.key("Escape", 1, 300); // roam
    await d.dbg(`(d.place("${actor}", 1, 1), true)`);
    for (let i = 0; i < 4; i++) {
      const cell = await d.dbg(`d.cursor()`);
      const s0 = await d.dbg(`d.cellScreen(${cell.x}, ${cell.y})`);
      await d.key("e", 1, 300);
      const s1 = await d.dbg(`d.cellScreen(${cell.x}, ${cell.y})`);
      d.expect(Math.abs(s0.x - s1.x) <= 1 && Math.abs(s0.y - s1.y) <= 1, `cursor cell stayed in place on turn ${i + 1} (${JSON.stringify(s0)} → ${JSON.stringify(s1)})`);
    }
    d.expect((await d.dbg(`d.rotation()`)) === 0, "four quarter turns = full circle");
    await d.dbg(`(d.place("${actor}", 6, 4), true)`);
    await d.pressUntil(`d.menu() && d.menu().items.some(i => i.label === "Move")`, "Enter", 5, 400);
    // rotate the map and move by clicking a cell
    await d.key("e", 1, 400);
    d.expect((await d.dbg(`d.rotation()`)) === 1, "map rotated a quarter turn");
    await d.shot("rotated");
    await d.choose("Move");
    await d.clickCell(4, 4);
    await sleep(900);
    const moved = await d.dbg(`(p => [p.x, p.y])(Object.values(d.state().board.pieces).find(p => p.members.includes("${actor}")))`);
    d.expect(moved[0] === 4 && moved[1] === 4, `clicking a cell on the rotated map moved there (${moved})`);
    await d.key("q", 1, 300);
    d.expect((await d.dbg(`d.rotation()`)) === 0, "rotated back");
  },

  async actAndShop(d) {
    await d.newGame();
    const actor = await d.dbg(`d.heroTurn()`);
    await d.dbg(`d.place("${actor}", 8, 9)`);
    await d.moveTo(["ArrowUp"]); // onto Salma (item shop)
    await d.waitFor(`d.menu() && d.menu().title === "Choose"`);
    const labels = await d.dbg(`d.menu().items.map(i => i.label)`);
    d.expect(labels[labels.length - 1] === "Leave", `Leave is the last option (${labels})`);
    // shop while the close-up stays open
    await d.choose("Buy/Sell");
    await d.choose("Buy");
    await d.shot("shop-with-close-up");
    d.expect(await d.ev(() => __game.phaser.scene.getScene("board").closeUp !== undefined), "close-up still shown during the shop");
    const gold0 = await d.dbg(`d.state().gold`);
    await d.choose("Potion");
    await sleep(300);
    d.expect((await d.dbg(`d.state().gold`)) === gold0, "choosing an item alone buys nothing");
    await d.key("ArrowUp", 1, 200); // 2 potions
    await d.shot("quantity");
    await d.key("Enter", 1, 400);
    d.expect((await d.dbg(`d.state().gold`)) === gold0 - 40, "bought two potions for 40");
    await d.key("Escape", 1, 300);
    await d.choose("Leave"); // shop
    await d.waitFor(`d.menu() && d.menu().title === "Choose"`); // back to the close-up
    await d.choose("Talk");
    await d.pressUntil(`d.menu() && d.menu().title === "Choose"`, "Enter", 20, 400);
    await d.choose("Leave");
    // the move was spent (Leave keeps the hero there); "Act" reopens the close-up any number of times
    await d.waitFor(`d.menu() && d.menu().items.some(i => i.label === "Act")`);
    const pos = await d.dbg(`(p => [p.x, p.y])(Object.values(d.state().board.pieces).find(p => p.members.includes("${actor}")))`);
    d.expect(pos[0] === 8 && pos[1] === 8, `hero stays on Salma's cell after Leave (${pos})`);
    for (let i = 0; i < 2; i++) {
      await d.choose("Act");
      await d.waitFor(`d.menu() && d.menu().title === "Choose"`);
      await d.key("Escape", 1, 400); // Back = Leave here (no undo for Act)
      await d.waitFor(`d.menu() && d.menu().items.some(i => i.label === "Act")`);
    }
    await d.shot("act");
  },

  async statusAndInspect(d) {
    await d.newGame();
    await d.travelToDunes(["scorp_a"]);
    await d.ev(() => {
      const s = __game.debug.state();
      s.board.chars["scorp_a#0"].statuses.push({ id: "sleep", turns: 9 });
      s.heroes.kit.statuses.push({ id: "poison", turns: 5 }, { id: "protect", turns: 3 });
      s.heroes.mira.statuses.push({ id: "regen", turns: 3 });
      __game.debug.resync();
    });
    const actor = await d.waitHeroTurn();
    d.expect(actor === "kit", `Kit's turn (${actor})`);
    await d.shot("header-and-board-icons");
    // inspect the scorpion: its movement range is highlighted
    await d.key("Escape", 1, 300);
    const e = await d.dbg(`(p => ({ x: p.x, y: p.y }))(Object.values(d.state().board.pieces).find(p => p.faction === "enemy"))`);
    await d.clickCell(e.x, e.y);
    await d.waitFor(`d.menu() && d.menu().items.some(i => i.label === "Close")`);
    const hl = await d.dbg(`d.highlights()`);
    d.expect((hl.inspect ?? 0) > 0, `enemy movement range highlighted (${JSON.stringify(hl)})`);
    await d.shot("enemy-range");
    await d.choose("Close");
    d.expect(!(await d.dbg(`"inspect" in d.highlights()`)), "range cleared after closing");
    // battle: status icons above the battlers
    await d.ev(() => {
      const d2 = __game.debug; const ctx = d2.ctx();
      const p = Object.values(ctx.state.board.pieces).find((x) => x.faction === "enemy");
      d2.place("kit", p.x + 1, p.y);
      __game.phaser.scene.getScene("board").battle(() => __game.core.engage(ctx, "kit", { x: p.x, y: p.y }));
    });
    await d.waitFor(`d.activeScenes().includes("battle") && d.menu() && d.menu().items.some(i => i.label === "Fight")`, 20000);
    await d.shot("battle-icons");
    const icons = await d.ev(() => [...__game.phaser.scene.getScene("battle").actors.values()].map((a) => a.icons.length));
    d.expect(icons.some((n) => n >= 2), `a battler shows two status icons side by side (${icons})`);
  },

  async undoMove(d) {
    await d.newGame();
    const actor = await d.dbg(`d.heroTurn()`);
    await d.dbg(`d.place("${actor}", 3, 7)`);
    await d.moveTo(["ArrowRight"]); // (4,7): plain sand, no effects
    await d.waitFor(`d.menu() && d.menu().items.some(i => i.label === "Undo Move")`);
    await d.shot("undo-offered");
    await d.choose("Undo Move");
    const back = await d.dbg(`(p => [p.x, p.y])(Object.values(d.state().board.pieces).find(p => p.members.includes("${actor}")))`);
    d.expect(back[0] === 3 && back[1] === 7, `undo returned the party (${back})`);
    d.expect(await d.dbg(`d.menu().items.some(i => i.label === "Move" && !i.disabled)`), "Move is available again");
    // move onto a burning cell: effects happened → no undo
    await d.ev(() => { __game.debug.state().board.fieldEffects.push({ x: 4, y: 7, effect: "burning", rounds: 3 }); __game.debug.resync(); });
    await d.moveTo(["ArrowRight"]);
    await d.waitFor(`d.menu() && d.menu().items.some(i => i.label === "Stats")`);
    d.expect(!(await d.dbg(`d.menu().items.some(i => i.label === "Undo Move")`)), "no undo after taking fire damage");
  },

  async enemyAi(d) {
    await d.newGame();
    for (const h of ["aldric", "mira", "kit", "tarek"]) await d.dbg(`d.setLevel("${h}", 12)`);
    // make board abilities deterministic for this check
    await d.ev(() => {
      for (const e of __game.debug.ctx().db.enemies.values()) for (const a of e.boardAi.abilities ?? []) a.chance = 1;
    });
    await d.travelToDunes(["condor_pair", "emperor", "scorp_pair"]);
    const first = await d.waitHeroTurn();
    await d.dbg(`d.place("${first}", 11, 6)`);
    let sawPack = false;
    let sawAbility = false;
    for (let i = 0; i < 4 && !(sawPack && sawAbility); i++) {
      await d.choose("End Party");
      await d.pressUntil(`!d.activeScenes().includes("battle") && !!d.heroTurn() && !!d.menu()`, "Enter", 150, 300);
      await d.shot(`round${i}`);
      const snap = await d.ev(() => {
        const s = __game.debug.state();
        const enemyPieces = Object.values(s.board.pieces).filter((p) => p.faction === "enemy");
        return {
          maxParty: Math.max(0, ...enemyPieces.map((p) => p.members.length)),
          sticky: s.board.fieldEffects.some((f) => f.effect === "sticky"),
          statuses: s.roster.some((id) => s.heroes[id].statuses.some((x) => ["slow", "poison"].includes(x.id))),
        };
      });
      if (snap.maxParty > 1) sawPack = true;
      if (snap.sticky || snap.statuses) sawAbility = true;
    }
    d.expect(sawPack, "condors formed a party");
    d.expect(sawAbility, "an enemy used a board ability (quake / wind shear / venom spit)");
  },
};

// ---------------- runner ----------------

const browser = await chromium.launch();
const results = [];
for (const [name, fn] of Object.entries(scenarios)) {
  if (only.length && !only.includes(name)) continue;
  // The touch scenario runs in an emulated landscape phone.
  const context =
    name === "touch"
      ? await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
      : await browser.newContext({ viewport: { width: 960, height: 540 } });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}
${e.stack}`));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`${m.text()} @ ${JSON.stringify(m.location())}`);
  });
  const d = new Driver(page, name);
  const t0 = Date.now();
  try {
    await fn(d);
    if (errors.length) throw new Error(`console errors:\n  ${errors.join("\n  ")}`);
    results.push({ name, ok: true, ms: Date.now() - t0 });
  } catch (e) {
    await d.shot("FAIL").catch(() => {});
    results.push({ name, ok: false, ms: Date.now() - t0, error: e.message });
  }
  await context.close();
}
await browser.close();
for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"} ${r.name} (${(r.ms / 1000).toFixed(1)}s)${r.ok ? "" : `\n     ${r.error}`}`);
process.exit(results.every((r) => r.ok) ? 0 : 1);
