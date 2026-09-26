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
  /**
   * Fresh page, empty saves, new game. By default the prologue (harbor → forest → ruins) is
   * skipped and the party starts in Sandhollow like the original demo; `prologue: true` keeps
   * the real start at Saltmere Harbor.
   */
  async newGame({ keepSaves = false, prologue = false } = {}) {
    await this.page.goto(url);
    if (!keepSaves) await this.ev(() => localStorage.clear());
    await this.page.reload();
    await this.waitFor(`d.activeScenes().includes("title")`);
    await this.choose("New Game");
    await this.waitFor(`d.activeScenes().includes("board") && !!d.state().board`, 20000, "board");
    if (!prologue) {
      await sleep(400);
      await this.dbg(`(d.skipPrologue(), true)`);
      await this.waitFor(`d.state().board && d.state().board.mapId === "sandhollow"`, 20000, "sandhollow");
    } else return; // the captain's intro dialog is showing
    await this.waitReady();
  }
  /**
   * Waits until the player can act: a hero's command box in turn-based mode, or the idle map
   * while exploring (§8.10). Returns the acting / selected hero.
   */
  async waitReady() {
    await this.waitFor(`(!!d.heroTurn() && !!d.menu()) || !!d.explorer()`, 40000, "hero turn or exploration");
    await sleep(200);
    return this.dbg(`d.heroTurn() || d.explorer()`);
  }
  /** Opens the selected hero's commands while exploring (Enter on its own cell, first party member). */
  async openCommands() {
    await this.waitFor(`!!d.explorer()`, 10000, "exploring");
    await this.dbg(`(p => (d.place(d.explorer(), p.x, p.y), true))(Object.values(d.state().board.pieces).find(p => p.members.includes(d.explorer())))`);
    await this.key("Enter", 1, 400);
    if (await this.dbg(`d.menu() && d.menu().title === "Who?"`)) await this.key("Enter", 1, 400);
    await this.waitFor(`d.menu() && d.menu().items.some(i => i.label === "Stats")`, 5000, "command box");
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
  /** After an action the menus close: select the hero again (the cursor is back on it) for the command box. */
  async reopenBox() {
    await sleep(300);
    if (!(await this.dbg(`!!d.menu() && d.menu().items.some(i => i.label === "Stats")`))) await this.key("Enter", 1, 400);
    await this.waitFor(`d.menu() && d.menu().items.some(i => i.label === "Stats")`, 5000, "command box");
  }
  /** Picks an ability-type level (Magic, Skill…) only if the menu shows one (single types go straight to the list). */
  async chooseType(label) {
    await this.waitFor(`!!d.menu()`, 5000, "a menu");
    await sleep(150);
    if (await this.dbg(`d.menu().items.some(i => i.label === ${JSON.stringify(label)})`)) await this.choose(label);
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
  /** Turn-based: Move from the command box. Exploring: the map is already waiting for a cell. */
  async startMove() {
    if (await this.dbg(`d.exploring()`)) await this.waitFor(`!!d.explorer()`, 10000, "exploring");
    else await this.choose("Move");
    await sleep(250);
  }
  /** Move → cursor steps → select the cell. */
  async moveTo(keys) {
    await this.startMove();
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
  /** Editor: select an area, move it (entities along), copy + paste it; the inn's wake-up facing. */
  async editorArea(d) {
    const page = d.page;
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.setViewportSize({ width: 1400, height: 820 });
    await page.goto(new URL("editor/", url).href);
    await page.getByText("Sandhollow", { exact: true }).click();
    await page.waitForFunction(() => window.__editorMap?.props?.mapId === "sandhollow");
    await sleep(500);
    const f = "data/maps/sandhollow.yaml";
    const data = () => page.evaluate((f) => window.__editor.project.data(f), f);
    const rows = async (layer) => (await data()).layers[layer].split(/\n/);
    const at = (x, y) => page.evaluate(([x, y]) => window.__editorMap.cellScreen(x, y), [x, y]);
    const drag = async (a, b) => {
      const p = await at(...a);
      const q = await at(...b);
      await page.mouse.move(p.x, p.y);
      await page.mouse.down();
      await page.mouse.move(q.x, q.y, { steps: 8 });
      await page.mouse.up();
      await sleep(200);
    };
    await page.keyboard.press("1"); // board mode
    await page.keyboard.press("m"); // select tool (the toolbar grows, the canvas moves)
    await sleep(300);
    const before = await rows("terrain");
    const decorBefore = await rows("decor");
    // the market stalls (row 7, x 6..10) and the nia event nearby: select the stall row and move it one row up
    await drag([6, 7], [10, 8]); // the stalls and the shopkeepers in front of them
    await drag([8, 7], [8, 6]);
    const decor = await rows("decor");
    d.expect(decor[6].slice(6, 11) === decorBefore[7].slice(6, 11), `stalls moved up (${decor[6]})`);
    d.expect(decor[7].slice(6, 11) === ".....", `left behind: no decor (${decor[7]})`);
    const smith = (await data()).events.find((e) => e.id === "smith");
    d.expect(smith.x === 6 && smith.y === 7, `the smith in the area moved along (${smith.x},${smith.y})`);
    await d.shot("moved");
    // copy the moved stalls and paste them at the bottom left
    await page.keyboard.press("Control+c");
    await page.keyboard.press("Control+v");
    const p = await at(2, 9);
    await page.mouse.move(p.x, p.y);
    await sleep(200);
    await d.shot("paste-preview");
    await page.mouse.down();
    await page.mouse.up();
    await sleep(200);
    d.expect((await rows("decor"))[9].slice(2, 7) === decorBefore[7].slice(6, 11), `pasted a copy (${(await rows("decor"))[9]})`);
    // all undone
    await page.locator(".status").click();
    for (let i = 0; i < 4; i++) await page.keyboard.press("Control+z");
    d.expect(JSON.stringify(await rows("terrain")) === JSON.stringify(before), "undo restored the terrain");
    d.expect(await page.getByRole("button", { name: "Save", exact: true }).isDisabled(), "nothing left to save");
    // the inn: wake up upstairs, facing east
    await page.getByText("The Sleeping Camel", { exact: true }).click();
    await page.waitForFunction(() => window.__editorMap?.props?.mapId === "sandhollow_inn");
    await sleep(400);
    await page.keyboard.press("3"); // entity mode (the toolbar shrinks, the canvas moves)
    await sleep(300);
    const inn = "data/maps/sandhollow_inn.yaml";
    // (events are entities: the keeper's inn option is on an interact handler)
    const keeper = await page.evaluate((f) => window.__editor.project.data(f).events.find((e) => (e.on ?? []).some((h) => h.options?.some((i) => i.type === "inn"))), inn);
    const k = await at(keeper.x, keeper.y);
    await page.mouse.click(k.x, k.y);
    await sleep(300);
    const facing = page.locator(".list-row select").filter({ hasText: "(the spawn's)" }).first();
    await facing.selectOption("E");
    const wake = await page.evaluate((f) => window.__editor.project.data(f).events.flatMap((e) => (e.on ?? []).flatMap((h) => h.options ?? [])).find((i) => i.type === "inn").wakeAt, inn);
    d.expect(wake.dir === "E" && wake.map === "sandhollow_inn_upper", `wake-up facing set (${JSON.stringify(wake)})`);
    await d.shot("inn");
    await page.locator(".status").click();
    await page.keyboard.press("Control+z");
    d.expect(!errors.length, `no page errors (${errors})`);
  },

  /** Editor entities (editor-design §6): place an exit, drag an event, give a page a condition, delete, undo. */
  async editorEntities(d) {
    const page = d.page;
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.setViewportSize({ width: 1400, height: 820 });
    await page.goto(new URL("editor/", url).href);
    await page.getByText("Temple of the Still Sky").click();
    await page.waitForFunction(() => window.__editorMap?.props?.mapId === "temple");
    await sleep(500);
    const f = "data/maps/temple.yaml";
    const data = () => page.evaluate((f) => window.__editor.project.data(f), f);
    const at = (x, y) => page.evaluate(([x, y]) => window.__editorMap.cellScreen(x, y), [x, y]);
    const exits0 = (await data()).exits.length;
    await page.keyboard.press("3"); // entity mode
    await sleep(300);
    // place a new teleport: its exit here, then – in the destination window – Sandhollow's arrival by the inn
    await page.locator(".add-row").getByRole("button", { name: /^Teleport/ }).click();
    await page.getByRole("menuitem", { name: "Teleport", exact: true }).click();
    let p = await at(2, 7);
    await page.mouse.click(p.x, p.y);
    await page.locator(".map-choice button", { hasText: "Sandhollow" }).first().click();
    await sleep(500);
    const sh = await page.evaluate(() => window.__editor.project.data("data/maps/sandhollow.yaml"));
    const inn = sh.spawns.from_inn;
    // the top view fits the map into the window: cell size and offset as GridCanvas computes them
    const rows = sh.layers.terrain.split("\n").filter((r) => r.length);
    const gw = Math.max(...rows.map((r) => r.length));
    const box = await page.locator(".destination-canvas canvas").boundingBox();
    const cell = Math.max(8, Math.min(48, Math.floor(Math.min((box.width - 40) / gw, (box.height - 40) / rows.length))));
    const px = box.x + Math.round((box.width - gw * cell) / 2) + (inn.x + 0.5) * cell;
    const py = box.y + Math.round((box.height - rows.length * cell) / 2) + (inn.y + 0.5) * cell;
    await page.mouse.move(px, py);
    await page.mouse.click(px, py);
    await sleep(300);
    let m = await data();
    d.expect(m.exits.length === exits0 + 1 && m.exits[exits0].to === "sandhollow" && m.exits[exits0].spawn === "from_inn", `new teleport to sandhollow/from_inn (${JSON.stringify(m.exits[exits0])})`);
    await d.shot("exit");
    // drag the free cushion one cell over
    p = await at(5, 5);
    const q = await at(6, 5);
    await page.mouse.move(p.x, p.y);
    await page.mouse.down();
    await page.mouse.move(q.x, q.y, { steps: 6 });
    await page.mouse.up();
    await sleep(300);
    m = await data();
    const cushion = m.events.find((e) => e.id === "free_cushion");
    d.expect(cushion.x === 6 && cushion.y === 5, `dragged the cushion (${cushion.x},${cushion.y})`);
    // its handler only runs once a flag is set
    await page.locator(".page-form .condition select").first().selectOption("flag");
    await page.locator(".page-form .condition input").first().fill("monks_awake");
    m = await data();
    d.expect(m.events.find((e) => e.id === "free_cushion").on[0].when?.flag === "monks_awake", "handler condition set");
    d.expect((await page.evaluate(() => window.__editor.project.content.problems)).length === 0, "still no problems");
    await d.shot("page");
    // select the new exit again and delete it with the Delete key
    await page.getByRole("button", { name: "← All", exact: true }).click();
    p = await at(2, 7);
    await page.mouse.click(p.x, p.y);
    await page.locator(".status").click();
    await page.keyboard.press("Delete");
    d.expect((await data()).exits.length === exits0, "deleted the exit");
    for (let i = 0; i < 12; i++) await page.keyboard.press("Control+z");
    d.expect(await page.getByRole("button", { name: "Save", exact: true }).isDisabled(), "undo back to the file on disk");
    d.expect(!errors.length, `no page errors (${errors})`);
  },

  /** Editor map canvas (editor-design §5): pencil, rectangle, fill, pick, height, rotation, undo – with the real mouse. */
  async editorMapPaint(d) {
    const page = d.page;
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.setViewportSize({ width: 1400, height: 820 });
    await page.goto(new URL("editor/", url).href);
    await page.getByText("Sandhollow", { exact: true }).click();
    await page.waitForFunction(() => window.__editorMap?.props?.mapId === "sandhollow");
    await page.waitForTimeout(500);
    const f = "data/maps/sandhollow.yaml";
    const row = (layer, y) => page.evaluate(([f, layer, y]) => window.__editor.project.data(f).layers[layer].split(/\n/)[y], [f, layer, y]);
    const at = (x, y) => page.evaluate(([x, y]) => window.__editorMap.cellScreen(x, y), [x, y]);
    const click = async (x, y) => {
      const p = await at(x, y);
      await page.mouse.move(p.x, p.y);
      await page.mouse.down();
      await page.mouse.up();
      await sleep(150);
    };
    const drag = async (a, b) => {
      const p = await at(...a);
      const q = await at(...b);
      await page.mouse.move(p.x, p.y);
      await page.mouse.down();
      await page.mouse.move(q.x, q.y, { steps: 8 });
      await page.mouse.up();
      await sleep(150);
    };
    const before = await row("terrain", 7);
    await page.keyboard.press("1"); // board mode
    // pencil: grass (the default brush) on one cell
    await click(4, 7);
    d.expect((await row("terrain", 7))[4] === "g", "pencil painted grass");
    // rectangle of rock over 3x2 cells (rock is 'r' in the legend)
    await page.getByRole("button", { name: /Rectangle/ }).click();
    await page.getByRole("button", { name: "rock", exact: true }).click();
    await drag([5, 8], [7, 9]);
    d.expect((await row("terrain", 8)).slice(5, 8) === "rrr" && (await row("terrain", 9)).slice(5, 8) === "rrr", "rectangle of rock");
    // pick takes the brush from a cell, then the pencil paints with it
    await page.keyboard.press("i");
    await click(4, 7);
    await page.keyboard.press("b");
    await click(9, 9);
    d.expect((await row("terrain", 9))[9] === "g", "picked grass and painted it");
    // the preview's height: W/S set the height the next click paints (it stays for the next cells)
    const hoverCell = async (x, y) => {
      const p = await at(x, y);
      await page.mouse.move(p.x, p.y);
      await sleep(120);
    };
    await hoverCell(10, 9);
    await page.keyboard.press("w");
    await page.keyboard.press("w");
    d.expect((await row("height", 9))[10] === "0", "W with the pencil changes only the preview");
    await click(10, 9);
    d.expect((await row("height", 9))[10] === "2", "the click painted at the preview's height");
    await click(11, 9);
    d.expect((await row("height", 9))[11] === "2", "the height stays for the next cells");
    // the select tool: W/S change the cells on the map; after turning the view the cursor still finds them
    await page.keyboard.press("m");
    await page.keyboard.press("e");
    await sleep(900); // the view turns smoothly (~0.65 s)
    await hoverCell(10, 9);
    await page.keyboard.press("w");
    d.expect((await row("height", 9))[10] === "3", "picking works rotated");
    await page.keyboard.press("s");
    d.expect((await row("height", 9))[10] === "2", "S lowers");
    await page.keyboard.press("q");
    await sleep(900);
    // right click draws a hole – and the hole can be painted again
    await page.keyboard.press("b");
    const p1 = await at(3, 5);
    await page.mouse.move(p1.x, p1.y);
    await page.mouse.down({ button: "right" });
    await page.mouse.up({ button: "right" });
    await sleep(150);
    d.expect((await row("terrain", 5))[3] === " ", "right click made a hole");
    await page.mouse.move(p1.x, p1.y + 2);
    await page.mouse.move(p1.x, p1.y);
    await page.mouse.down();
    await page.mouse.up();
    await sleep(150);
    d.expect((await row("terrain", 5))[3] !== " ", "the hole was painted again");
    // a piece: A/D turn it in the preview; the click places it turned
    await page.getByRole("button", { name: "Half", exact: true }).click();
    await hoverCell(6, 3);
    await page.keyboard.press("d");
    await click(6, 3);
    const cut = await page.evaluate(() => JSON.stringify(Object.values(window.__editor.project.data("data/maps/sandhollow.yaml").legend.shapes ?? {})));
    d.expect(cut.includes('"NE"'), `the piece was placed turned (${cut})`);
    // with the select tool, D turns the piece on the map
    await page.keyboard.press("m");
    await hoverCell(6, 3);
    await page.keyboard.press("d");
    const cut2 = await page.evaluate(() => JSON.stringify(Object.values(window.__editor.project.data("data/maps/sandhollow.yaml").legend.shapes ?? {})));
    d.expect(cut2.includes('"SE"'), `D turned the piece on the map (${cut2})`);
    await d.shot("painted");
    // everything undoes back to the file on disk
    await page.locator(".status").click();
    for (let i = 0; i < 20; i++) await page.keyboard.press("Control+z");
    d.expect((await row("terrain", 7)) === before, "undo restored the terrain");
    d.expect(await page.getByRole("button", { name: "Save", exact: true }).isDisabled(), "nothing left to save");
    d.expect(!errors.length, `no page errors (${errors})`);
  },

  /** Editor (editor-design §4): Quick Play settings → ▶ Quick Play runs the unsaved content on that map. */
  async editorQuickPlay(d) {
    const page = d.page;
    await page.goto(new URL("editor/", url).href);
    await page.getByText("Temple of the Still Sky").click();
    await page.waitForFunction(() => window.__editorMap?.props?.mapId === "temple");
    await page.keyboard.press("3"); // entity mode
    await sleep(300);
    // place the Quick Play start
    await page.locator(".add-row").getByRole("button", { name: /^Teleport/ }).click();
    await page.getByRole("menuitem", { name: "Quick Play start" }).click();
    const qp = await page.evaluate(() => window.__editorMap.cellScreen(5, 6));
    await page.mouse.click(qp.x, qp.y);
    await sleep(300);
    await page.getByRole("button", { name: "+ Hero" }).click();
    const party = page.locator(".inspector select").filter({ has: page.locator("option[value=\"lib:tarek\"]") }).first();
    await party.selectOption("lib:tarek");
    await page.locator(".inspector input[type=number]").nth(3).fill("9"); // level (the arrival's x, y, gold, level)
    await page.locator(".inspector input[placeholder^='e.g.']").fill("monks_trial");
    // an unsaved edit the play-test must see: other music
    await page.getByRole("button", { name: "Info", exact: true }).click();
    await page.getByRole("combobox", { name: "Music" }).selectOption("lib:boss");
    d.expect(await page.getByRole("button", { name: "Save (1)" }).isVisible(), "the map is marked unsaved");
    await d.shot("editor");
    const [game] = await Promise.all([page.context().waitForEvent("page"), page.getByRole("button", { name: /▶ Quick Play/ }).click()]);
    await game.waitForFunction(() => {
      try {
        return window.__game.debug.state().board.mapId === "temple";
      } catch {
        return false; // still loading
      }
    }, null, { timeout: 30000 });
    await game.waitForTimeout(1500);
    const st = await game.evaluate(() => {
      const s = __game.debug.state();
      const p = Object.values(s.board.pieces).find((x) => x.members.includes("lib:tarek"));
      return { roster: s.roster, level: s.heroes["lib:tarek"].level, flag: s.flags.monks_trial, music: __game.debug.ctx().db.map("temple").music, at: [p.x, p.y] };
    });
    await game.screenshot({ path: `${OUT}/editorQuickPlay-02-game.png` });
    d.expect(JSON.stringify(st.roster) === '["lib:tarek"]', `party from Quick Play (${st.roster})`);
    d.expect(st.level === 9, `level 9 (${st.level})`);
    d.expect(st.flag === true, "flag set");
    d.expect(st.music === "lib:boss", "unsaved edit reached the game");
    d.expect(st.at[0] === 5 && st.at[1] === 6, `started on the Quick Play start (${st.at})`);
    // nothing was written to disk: undo everything
    await page.bringToFront();
    await page.locator(".status").click(); // focus out of the form fields
    for (let i = 0; i < 8; i++) await page.keyboard.press("Control+z");
    d.expect(await page.getByRole("button", { name: "Save", exact: true }).isDisabled(), "undo brought the files back");
  },

  /** The Gull (§5.9): a pointed bow and a flared hull, from all four sides and mid-spin. */
  async shipLook(d) {
    await d.newGame({ prologue: true });
    await d.pressUntil(`!!d.explorer()`, "Enter", 30, 400);
    await d.dbg(`(d.cursorTo(2, 4), true)`);
    await sleep(600);
    await d.shot("ship-0");
    for (let i = 1; i <= 4; i++) {
      await d.key("e", 1, 250);
      if (i === 1) await d.shot("mid-spin");
      await d.waitFor(`d.rotation() === ${i % 4}`, 8000, "rotation");
      await sleep(500);
      await d.shot(`ship-${i % 4 === 0 ? "0-again" : i}`);
      // close-up of the steering wheel on the stern (it turns with the board)
      const w = await d.dbg(`d.cellScreen(2, 9)`);
      const c = await d.pagePos(w.x, w.y);
      await d.page.screenshot({ path: `${OUT}/shipLook-wheel-r${i % 4}.png`, clip: { x: c.x - 60, y: c.y - 90, width: 120, height: 110 } });
    }
    d.expect(!(await d.dbg(`__game.core.moveOptions(d.ctx(), d.explorer()).has("2,1")`)), "the bow tip is not walkable");
  },

  /** Visits every map of the Mountain Temple chapter (§18.7-12) and takes a screenshot of each. */
  async chapterTour(d) {
    await d.newGame();
    for (const h of ["lib:aldric", "lib:mira", "lib:kit", "lib:tarek"]) await d.dbg(`d.setLevel("${h}", 30)`);
    const stops = [
      ["temple_mountain", "from_dunes"], ["temple_mountain", "from_temple"], ["temple", "from_mountain"], ["hall_of_fears", "from_temple"],
      ["reed_pond", "from_mountain"], ["endless_dunes", "north"], ["mirage_sands", "from_dunes"], ["mirage_tower_1", "start"],
      ["mirage_tower_2", "west"], ["mirage_tower_3", "west"], ["mirage_tower_4", "west"], ["mirage_tower_5", "west"],
      ["verdant_isle", "from_ship"], ["grove_garden", "from_isle"], ["mora_house", "from_garden"], ["grave_cave", "from_mountain"],
    ];
    for (const [map, spawn] of stops) {
      await d.dbg(`(d.travel("${map}", "${spawn}"), true)`);
      await d.waitFor(`d.state().board && d.state().board.mapId === "${map}"`, 20000, map);
      await d.pressUntil(`!d.activeScenes().includes("battle") && ((!!d.heroTurn() && !!d.menu()) || !!d.explorer())`, "Enter", 200, 300);
      await d.shot(`${map}-${spawn}`);
    }
  },
  /** Temple (§18.8): sitting on the free cushion starts the monks' talk; then Rhea sails to the Verdant Isle. */
  async templeTrial(d) {
    await d.newGame();
    await d.dbg(`(d.travel("temple", "from_mountain"), true)`);
    await d.waitFor(`d.state().board && d.state().board.mapId === "temple"`);
    await d.waitReady();
    // (right after a debug travel the new scene may still put the cursor on the party: set it until it stays)
    for (let i = 0; i < 10; i++) {
      await d.dbg(`(d.cursorTo(5, 5), true)`);
      await sleep(250);
      if (await d.dbg(`d.cursor().x === 5 && d.cursor().y === 5`)) break;
    }
    await d.key("Enter", 1, 1500); // onto the cushion
    await d.shot("cushion");
    const speakers = [];
    for (let i = 0; i < 60 && !(await d.dbg(`!!d.explorer()`)); i++) {
      const who = await d.ev(() => {
        const s = __game.phaser.scene.getScenes(true).map((x) => x.sys.settings.key);
        return s.join(",");
      });
      speakers.push(who);
      if (i === 4) await d.shot("monks-talk");
      await d.key("Enter", 1, 350);
    }
    d.expect(await d.dbg(`d.state().flags.monks_trial === true`), "the monks gave the task");
    // Saltmere: Captain Rhea now sails to the island
    await d.dbg(`(d.travel("saltmere_harbor", "start"), true)`);
    await d.waitFor(`d.state().board && d.state().board.mapId === "saltmere_harbor"`);
    await d.pressUntil(`!!d.explorer()`, "Enter", 30, 400);
    await d.dbg(`(d.cursorTo(2, 6), true)`);
    await d.key("Enter", 1, 800);
    await d.choose("Talk");
    await d.pressUntil(`d.menu() && d.menu().items.some(i => i.label.startsWith("Sail"))`, "Enter", 20, 400);
    await d.shot("captain");
    await d.choose("Sail to the Verdant Isle");
    await d.waitFor(`d.state().board && d.state().board.mapId === "verdant_isle"`, 20000, "sailed to the isle");
    await sleep(1200);
    await d.shot("isle");
  },

  /** Reed Pond (§5.6): Thunder into the water runs through the connected water and hits the swimmers. */
  async pondLightning(d) {
    await d.newGame();
    for (const h of ["lib:aldric", "lib:mira", "lib:kit", "lib:tarek"]) await d.dbg(`d.setLevel("${h}", 10)`);
    await d.ev(() => {
      __game.debug.state().maps.reed_pond = { defeated: [], removedEvents: [], triggered: ["pond_intro#0"] };
      __game.debug.travel("reed_pond", "from_mountain");
    });
    await d.waitFor(`d.state().board && d.state().board.mapId === "reed_pond"`);
    let t = await d.waitHeroTurn();
    await d.dbg(`d.place("${t}", 1, 4)`);
    for (let i = 0; i < 6 && t !== "lib:mira"; i++) {
      await d.choose("End Turn");
      t = await d.waitHeroTurn(t);
    }
    d.expect(t === "lib:mira", "Mira's turn");
    const hp = () => d.ev(() => Object.fromEntries(Object.values(__game.debug.state().board.chars).map((c) => [c.id, c.hp])));
    const before = await hp();
    const heroesBefore = await d.dbg(`d.state().roster.map(id => d.state().heroes[id].hp)`);
    await d.choose("Ability");
    await d.chooseType("Magic");
    await d.chooseType("Attack");
    await d.choose("Thunder");
    await d.dbg(`(d.cursorTo(3, 4), true)`);
    await sleep(300);
    await d.shot("aim");
    await d.key("Enter", 1, 300);
    await sleep(1600);
    await d.shot("shock");
    const after = await hp();
    const hit = Object.keys(before).filter((id) => after[id] === undefined || after[id] < before[id]);
    d.expect(hit.length >= 1, `lightning ran through the water into the swimmers (${hit})`);
    const heroesAfter = await d.dbg(`d.state().roster.map(id => d.state().heroes[id].hp)`);
    d.expect(JSON.stringify(heroesAfter) === JSON.stringify(heroesBefore), "the heroes on dry land were not hit");
  },

  /** Verdant Isle (§18.11): the produce fights together on the board – spit (soaked), zap, seeds, fire. */
  async islandCombo(d) {
    await d.newGame();
    for (const h of ["lib:aldric", "lib:mira", "lib:kit", "lib:tarek"]) await d.dbg(`d.setLevel("${h}", 16)`);
    await d.ev(() => {
      for (const e of __game.debug.ctx().db.enemies.values()) for (const a of e.boardAi.abilities ?? []) a.chance = 1;
      __game.debug.state().maps.verdant_isle = { defeated: [], removedEvents: [], triggered: ["isle_intro#0"] };
      __game.debug.travel("verdant_isle", "from_ship");
    });
    await d.waitFor(`d.state().board && d.state().board.mapId === "verdant_isle"`);
    const first = await d.waitHeroTurn();
    await d.dbg(`d.place("${first}", 6, 9)`);
    // record what the board plays (abilities, field effects, lightning)
    await d.ev(() => {
      const scene = __game.phaser.scene.getScene("board");
      const play = scene.play.bind(scene);
      window.__seen = [];
      scene.play = (events) => {
        for (const e of events) window.__seen.push(e.type === "fieldEffect" ? `fx:${e.effect}` : e.type === "action" ? `ability:${e.ability ?? e.name}` : e.type);
        return play(events);
      };
    });
    for (let i = 0; i < 4; i++) {
      await d.choose("End Party");
      await d.pressUntil(`!d.activeScenes().includes("battle") && !!d.heroTurn() && !!d.menu()`, "Enter", 150, 300);
      await d.shot(`round${i}`);
      if (await d.ev(() => window.__seen.includes("shock"))) break;
    }
    const seen = await d.ev(() => [...new Set(window.__seen)]);
    d.expect(seen.includes("fx:lib:soaked"), `the tomato soaked the ground (${seen})`);
    d.expect(seen.includes("shock"), `the lemon sent lightning into the wet ground (${seen})`);
  },

  /** Mirage Tower 1F (§5.8, §5.3): the gate closes behind the plate, the heroes split up, each team climbs its own stairs. */
  async towerSplit(d) {
    await d.newGame();
    await d.ev(() => {
      __game.debug.state().maps.mirage_tower_1 = { defeated: [], removedEvents: [], triggered: ["tower_intro#0"] };
      __game.debug.travel("mirage_tower_1", "start");
    });
    await d.waitFor(`d.state().board && d.state().board.mapId === "mirage_tower_1"`);
    await d.waitReady();
    const walk = async (x, y) => {
      await d.waitFor(`!!d.explorer()`, 15000, "exploring");
      await d.dbg(`(d.cursorTo(${x}, ${y}), true)`);
      await d.key("Enter", 1, 500);
    };
    const at = (id) => d.dbg(`(p => [p.x, p.y])(Object.values(d.state().board.pieces).find(p => p.members.includes("${id}")))`);
    await walk(3, 8); // everyone onto the plate
    await d.waitFor(`d.entityState("east_gate") === "open"`, 10000, "east gate open");
    await d.shot("plate");
    await walk(5, 8); // and off again: the gate slams shut
    await d.pressUntil(`!!d.explorer()`, "Enter", 30, 400);
    d.expect(await d.dbg(`d.state().flags.tower_split && d.entityState("east_gate") === "closed"`), "gate closed, split flag set");
    await d.shot("closed");
    // Aldric leaves the party and holds the plate
    await d.openCommands();
    await d.choose("Party");
    await d.choose("Leave Party");
    await walk(3, 8);
    await d.waitFor(`d.entityState("east_gate") === "open"`, 10000, "east gate open for the others");
    // the others go through and step on the inner plate
    await walk(5, 8); // selects their piece
    await walk(9, 2);
    await d.waitFor(`d.entityState("west_gate") === "open"`, 10000, "west gate open");
    await d.shot("split");
    const others = await at("lib:mira");
    d.expect(others[0] === 9 && others[1] === 2, `the team crossed to the inner plate (${others})`);
    // Aldric climbs the west stairs, the others the east stairs
    await walk(3, 8); // select Aldric
    await walk(2, 1);
    await sleep(800);
    d.expect((await d.dbg(`d.state().board.mapId`)) === "mirage_tower_1", "waits for the others");
    await walk(9, 2); // select the others
    await walk(10, 1);
    await d.waitFor(`d.state().board && d.state().board.mapId === "mirage_tower_2"`, 20000, "2F");
    await d.pressUntil(`!!d.explorer()`, "Enter", 30, 400);
    const aldric = await at("lib:aldric");
    const kit = await at("lib:kit");
    d.expect(aldric[0] === 3 && aldric[1] === 9 && kit[0] === 9 && kit[1] === 9, `teams arrive apart (${aldric} / ${kit})`);
    await d.shot("2F");
  },

  /** The Grave Toad (§12.7): swallow → digest → spit, acolytes raised again for gold, release on death. */
  async graveToad(d) {
    await d.newGame();
    for (const h of ["lib:aldric", "lib:mira", "lib:kit", "lib:tarek"]) await d.dbg(`d.setLevel("${h}", 14)`);
    await d.ev(() => {
      const db = __game.debug.ctx().db;
      // make the rare moves happen right away for this check
      db.enemies.get("lib:grave_toad").ai = [
        { action: "lib:swallow", weight: 1, priority: true, when: { cooldown: 4 } },
        { action: "lib:raise_dead", weight: 1, priority: true, when: { alone: true } },
        { action: "attack", weight: 1 },
      ];
      const s = __game.debug.state();
      s.flags.orb_claimed = true;
      s.maps.grave_cave = { defeated: ["cave_skel_a", "cave_skel_b"], removedEvents: [], triggered: ["cave_intro#0"] };
      __game.debug.travel("grave_cave", "from_mountain");
    });
    await d.waitFor(`d.state().board && d.state().board.mapId === "grave_cave"`);
    const a = await d.waitReady();
    await d.dbg(`d.place("${a}", 5, 4)`);
    await d.moveTo(["ArrowUp"]); // onto the toad
    await d.waitFor(`d.activeScenes().includes("battle") && !!d.state().battle`);
    await d.ev(() => (__game.debug.state().board.chars["grave_toad#0"].hp = 3000));
    await sleep(1200);
    await d.shot("layout");
    const toad = `d.state().battle`;
    await d.pressUntil(`${toad}.swallowed && ${toad}.swallowed.length > 0`, "Enter", 150, 300);
    await sleep(900);
    await d.shot("swallowed");
    const victim = await d.dbg(`${toad}.swallowed[0].target`);
    const hp0 = await d.dbg(`d.state().heroes["${victim}"].hp`);
    await d.pressUntil(`${toad}.swallowed.length === 0`, "Enter", 150, 300);
    await sleep(700);
    await d.shot("spat");
    const hp1 = await d.dbg(`d.state().heroes["${victim}"].hp`);
    d.expect(hp1 < hp0, `${victim} lost HP in the stomach (${hp0} → ${hp1})`);
    // both acolytes down → the toad pays for new ones
    await d.ev(() => {
      const c = __game.debug.state().board.chars;
      c["grave_toad#1"].hp = 0;
      c["grave_toad#2"].hp = 0;
    });
    await d.pressUntil(`${toad}.combatants.some(c => c.summoned)`, "Enter", 150, 300);
    await sleep(1500);
    await d.shot("summoned");
    d.expect((await d.dbg(`${toad}.spent`)) === 120, "raising the dead cost 120 G");
    // swallowed again – and the toad falls with a hero inside: out without the loss
    await d.pressUntil(`${toad}.swallowed.length > 0`, "Enter", 200, 300);
    const inside = await d.dbg(`${toad}.swallowed[0].target`);
    const hpIn = await d.dbg(`d.state().heroes["${inside}"].hp`);
    await d.ev(() => {
      const c = __game.debug.state().board.chars;
      for (const ch of [...Object.values(c), ...Object.values(__game.debug.state().battle.guests)]) if (ch.kind === "enemy" && ch.hp > 0) ch.hp = 1;
    });
    await d.pressUntil(`!d.activeScenes().includes("battle")`, "Enter", 200, 300);
    d.expect((await d.dbg(`d.state().heroes["${inside}"].hp`)) === hpIn, "released hero kept its HP");
    await sleep(1500);
    await d.shot("demo-end");
    d.expect(await d.dbg(`(m => (m.ranOnce ?? []).includes("toad_defeated#1") || m.triggered.includes("toad_defeated#1"))(d.state().maps.grave_cave)`), "the end-of-demo scene ran");
    await d.pressUntil(`!!d.explorer()`, "Enter", 30, 400);
    await d.shot("after");
  },

  /** The inn's stairs lead up to the beds (and back down). */
  async innStairs(d) {
    await d.newGame();
    await d.dbg(`(d.travel("sandhollow_inn", "from_town"), true)`);
    await d.waitFor(`d.state().board.mapId === "sandhollow_inn"`);
    await d.waitReady();
    // click the middle of the staircase picture (it rises over the wall behind its cell)
    const st = await d.dbg(`d.cellScreen(6, 1)`);
    await d.click(st.x, st.y - 16);
    await sleep(300);
    await d.shot("stairs");
    await d.click(st.x, st.y - 16); // tap again to go
    await d.waitFor(`d.state().board.mapId === "sandhollow_inn_upper"`, 10000, "upstairs");
    await sleep(1200);
    await d.shot("upstairs");
  },

  async inn(d) {
    await d.newGame();
    const actor = await d.waitReady();
    await d.dbg(`d.place("${actor}", 10, 3)`);
    const other = actor === "lib:mira" ? "lib:tarek" : "lib:mira";
    await d.dbg(`d.setHp("${actor}", 3)`);
    await d.shot("outside");
    // stepping into the doorway enters the inn (no question)
    await d.moveTo(["ArrowUp"]);
    await d.waitFor(`d.state().board.mapId === "sandhollow_inn"`, 10000, "inside the inn");
    await sleep(1200);
    const a2 = await d.waitReady();
    await d.dbg(`d.setHp("${other}", 0)`);
    d.expect(await d.dbg(`Object.values(d.state().board.pieces).some(p => p.fallen)`), "a fallen hero lies on the floor");
    await d.shot("inside");
    // talk to Dara across the counter
    await d.dbg(`d.place("${a2}", 3, 3)`);
    await d.moveTo(["ArrowUp"]);
    await d.waitFor(`d.menu() && d.menu().title === "Choose"`, 10000, "counter close-up");
    await d.shot("counter");
    await d.choose("Rest");
    await d.choose("Rest (");
    // black screen, sleep jingle → the party wakes up upstairs by the beds
    await d.waitFor(`d.state().board.mapId === "sandhollow_inn_upper"`, 15000, "woke up upstairs");
    await sleep(1500);
    await d.shot("upstairs");
    await d.pressUntil(`!!d.explorer()`, "Enter", 10, 400); // "The party has recovered!"
    const r = await d.ev(() => {
      const s = __game.debug.state();
      return { gold: s.gold, fallen: Object.values(s.board.pieces).filter((p) => p.fallen).length, hp: s.roster.map((id) => s.heroes[id].hp) };
    });
    d.expect(r.gold === 260, `inn cost 40 gold (gold ${r.gold})`);
    d.expect(r.fallen === 0, "no fallen heroes after resting");
    d.expect(r.hp.every((h) => h > 20), `everyone healed ${r.hp}`);
    // down the stairs and out: the party stands in front of the door, not on it
    await d.dbg(`d.place("${actor}", 4, 4)`);
    await d.moveTo(["ArrowRight"]);
    await d.waitFor(`d.state().board.mapId === "sandhollow_inn"`, 10000, "downstairs");
    await sleep(1200);
    const a3 = await d.waitReady();
    await d.dbg(`d.place("${a3}", 3, 5)`);
    await d.moveTo(["ArrowDown"]);
    await d.waitFor(`d.state().board.mapId === "sandhollow"`, 10000, "back outside");
    await sleep(1200);
    const pos = await d.dbg(`(p => [p.x, p.y])(Object.values(d.state().board.pieces).find(p => p.faction === "hero" && !p.fallen))`);
    d.expect(pos[0] === 10 && pos[1] === 3, `outside, in front of the inn door (${pos})`);
  },

  async exitWalk(d) {
    await d.newGame();
    const actor = await d.waitReady();
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
    const actor = await d.waitReady();
    await d.dbg(`(d.give("lib:scroll_venom_mist"), d.give("lib:iron_sword"), true)`);
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
    // read the scroll from the main menu (the menu key works on the idle map)
    await d.waitReady();
    await d.key("m", 1, 500);
    await d.choose("Items");
    await d.choose("Scroll: Venom Mist");
    await d.shot("who-reads");
    await d.choose("Mira");
    await sleep(400);
    await d.pressUntil(`d.menu() && d.menu().title === "Items"`, "Enter", 6, 400);
    d.expect(await d.dbg(`d.state().heroes["lib:mira"].learned.includes("lib:venom_mist")`), "Mira learned Venom Mist");
    await d.key("Escape", 1, 300);
    // equip the iron sword on Aldric
    await d.choose("Heroes");
    await d.choose("Aldric");
    await d.choose("Equip");
    await d.choose("Weapon:");
    await d.shot("equip");
    await d.choose("Iron Sword");
    const eq = await d.dbg(`[d.state().heroes["lib:aldric"].equipment.weapon, d.state().inventory["lib:bronze_sword"]]`);
    d.expect(eq[0] === "lib:iron_sword" && eq[1] === 1, `equipped iron sword (${eq})`);
    await d.key("Escape", 5, 250);
  },

  async stealNpc(d) {
    await d.newGame();
    // exploring: whoever leads the party talks, Kit steals for them
    await d.dbg(`d.place("lib:kit", 8, 9)`);
    await d.moveTo(["ArrowUp"]); // Salma
    await d.shot("options");
    await d.choose("Steal");
    await sleep(800);
    await d.shot("stolen");
    d.expect(await d.dbg(`d.state().board.turn.abilityUsed.includes("lib:kit")`), "stealing used Kit's ability action");
  },

  async trapFreezeSlide(d) {
    await d.newGame();
    await d.travelToDunes(["scorp_a"]);
    await d.ev(() => {
      const s = __game.debug.state();
      s.board.chars["scorp_a#0"].statuses.push({ id: "lib:sleep", turns: 9 });
      // everyone can cast Ice for this test
      for (const id of s.roster) {
        s.heroes[id].learned.push("lib:ice");
      }
    });
    await d.dbg(`d.setLevel("lib:kit", 3)`);
    const actor = await d.waitHeroTurn();
    d.expect(actor === "lib:kit", `Kit's turn (${actor})`);
    await d.dbg(`d.place("lib:kit", 3, 4)`);
    // Trap: Ability → Skill → Trap → click an empty cell
    await d.choose("Ability");
    await d.chooseType("Skill");
    await d.choose("Trap");
    await d.clickCell(3, 6);
    await sleep(800);
    await d.shot("trap");
    // the snare is a prefab placed during play: an entity in the map's memory
    d.expect(await d.dbg(`(d.state().maps[d.state().board.mapId].spawned || []).some(t => t.x === 3 && t.y === 6)`), "trap placed at 3,6");
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
      return { traps: (s.maps[s.board.mapId].spawned ?? []).length, hp: c?.hp, stuck: c?.statuses.some((x) => x.id === "lib:stuck") };
    });
    d.expect(trapped.traps === 0 && trapped.stuck && trapped.hp < 30, `trap triggered ${JSON.stringify(trapped)}`);
    await d.shot("trapped");
    await d.reopenBox();
    await d.choose("End Turn");
    const next = await d.waitHeroTurn("lib:kit");
    // Ability → Magic → (Attack) → Ice at (5,4)
    await d.choose("Ability");
    await d.chooseType("Magic");
    if (next === "lib:mira") await d.chooseType("Attack");
    await d.choose("Ice");
    await d.clickCell(5, 4);
    await sleep(900);
    await d.shot("frozen");
    const frozen = await d.dbg(`d.state().board.fieldEffects.filter(f => f.effect === "lib:frozen").map(f => f.x + "," + f.y)`);
    await d.reopenBox();
    d.expect(frozen.length === 3 && ["4,4", "5,4", "6,4"].every((c) => frozen.includes(c)), `on land, ice freezes a line of 3 (${frozen})`);
    await d.choose("Move");
    await d.key("ArrowRight", 1, 150); // onto (4,4) → slides east
    await d.key("Enter", 1, 500);
    await sleep(1500);
    await d.shot("slid");
    const pos = await d.dbg(`(p => [p.x, p.y])(Object.values(d.state().board.pieces).find(p => p.members.includes("lib:kit")))`);
    d.expect(pos[0] === 7 && pos[1] === 4, `slid over the ice to 7,4 (at ${pos})`);
    // sliding is an effect → the move can't be undone
    await d.waitFor(`d.menu() && d.menu().items.some(i => i.label === "Stats")`);
    d.expect(!(await d.dbg(`d.menu().items.some(i => i.label === "Undo Move")`)), "no Undo Move after sliding");
  },

  async hiddenEnding(d) {
    await d.newGame();
    const actor = await d.waitReady();
    // the Elder is at home: in through his door, up to him
    await d.dbg(`d.place("${actor}", 6, 3)`);
    await d.moveTo(["ArrowUp"]);
    await d.waitFor(`d.state().board.mapId === "elder_house"`, 10000, "inside the elder's house");
    await sleep(1200);
    const a1 = await d.waitReady();
    await d.dbg(`d.place("${a1}", 3, 3)`);
    await d.moveTo(["ArrowUp"]); // elder
    await d.pressUntil(`d.state().flags.gate_open && d.menu() && d.menu().title === "Choose"`, "Enter", 40, 400);
    d.expect((await d.dbg(`d.state().quests.active`)) === "clear_dunes", "sub quest active after talking");
    await d.choose("Leave");
    for (const h of ["lib:aldric", "lib:mira", "lib:kit", "lib:tarek"]) await d.dbg(`d.setLevel("${h}", 18)`);
    await d.dbg(`(d.travel("sandhollow", "from_elder"), true)`);
    await d.waitFor(`d.state().board.mapId === "sandhollow"`);
    await sleep(1200);
    // exploring the village: walk straight on through the east exit
    const a3 = await d.waitReady();
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
    await d.moveTo(["ArrowRight"]); // onto the Emperor: attacks right away
    await d.waitFor(`d.activeScenes().includes("battle")`);
    await sleep(1500);
    await d.shot("boss");
    await d.pressUntil(`!d.activeScenes().includes("battle") && d.state().quests.entries.clear_dunes && d.state().quests.entries.clear_dunes.status === "done"`, "Enter", 150, 300);
    d.expect((await d.dbg(`d.state().quests.entries.clear_dunes.ending`)) === "cleansed", "hidden ending reached");
    d.expect(!!(await d.dbg(`d.state().flags.dunes_cleansed`)), "dunes_cleansed flag set");
    await d.shot("after-boss");
    // the dunes are clear → free exploration; back to the village and report
    const a6 = await d.waitReady();
    d.expect(await d.dbg(`d.exploring()`), "exploring the cleared dunes");
    await d.dbg(`d.place("${a6}", 1, 7)`);
    await d.moveTo(["ArrowLeft"]);
    await d.choose("Yes");
    await d.waitFor(`d.state().board.mapId === "sandhollow"`);
    await sleep(1200);
    await d.dbg(`(d.travel("elder_house", "from_town"), true)`);
    await d.waitFor(`d.state().board.mapId === "elder_house"`);
    await sleep(1200);
    const a7 = await d.waitReady();
    await d.dbg(`d.place("${a7}", 3, 3)`);
    await d.moveTo(["ArrowUp"]);
    await d.pressUntil(`d.state().quests.entries.road_to_oasis.status === "done" && !!d.menu()`, "Enter", 40, 400);
    await d.shot("reward");
    d.expect((await d.dbg(`d.state().inventory["lib:flame_blade"]`)) === 1, "Elder gave the Flame Blade bonus");
  },

  async touch(d) {
    await d.page.goto(url);
    await d.ev(() => localStorage.clear());
    await d.page.reload();
    await d.waitFor(`d.activeScenes().includes("title")`);
    await d.tapMenu("New Game");
    await d.waitFor(`d.activeScenes().includes("board") && !!d.state().board`, 20000, "board");
    await sleep(400);
    await d.dbg(`(d.skipPrologue(), true)`);
    await d.waitFor(`d.state().board && d.state().board.mapId === "sandhollow"`, 20000, "sandhollow");
    const actor = await d.waitReady();
    await d.shot("board");
    // Exploring the village: one tap on a cell walks there
    const before = await d.dbg(`(p => [p.x, p.y])(Object.values(d.state().board.pieces).find(p => p.members.includes("${actor}")))`);
    const target = { x: before[0] + 1, y: before[1] };
    await d.tapCell(target.x, target.y);
    await sleep(800);
    const after = await d.dbg(`(p => [p.x, p.y])(Object.values(d.state().board.pieces).find(p => p.members.includes("${actor}")))`);
    d.expect(after[0] === target.x && after[1] === target.y, `a tap moved the party (${after})`);
    // tapping the party opens its commands (after choosing who)
    await d.waitReady();
    await d.tapCell(target.x, target.y);
    await d.waitFor(`d.menu() && d.menu().title === "Who?"`, 5000, "member choice");
    await d.tapMenu(await d.dbg(`d.menu().items[0].label`));
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
    const actor = await d.waitReady();
    await d.dbg(`d.place("${actor}", 8, 9)`);
    await d.moveTo(["ArrowUp"]); // onto Salma's cell → close-up
    await d.waitFor(`d.menu() && d.menu().title === "Choose"`);
    await d.shot("close-up");
    const onNpc = await d.dbg(`(p => [p.x, p.y])(Object.values(d.state().board.pieces).find(p => p.members.includes("${actor}")))`);
    d.expect(onNpc[0] === 8 && onNpc[1] === 8, `hero stands on Salma's cell (${onNpc})`);
    await d.key("Escape", 1, 500); // back out → the move is undone
    const back = await d.dbg(`(p => [p.x, p.y])(Object.values(d.state().board.pieces).find(p => p.members.includes("${actor}")))`);
    d.expect(back[0] === 8 && back[1] === 9, `cancel returned the hero (${back})`);
    d.expect(!(await d.dbg(`d.state().board.turn.moved.some(id => !!d.state().heroes[id])`)), "move not spent");
    await d.waitReady();
    // rotating keeps the cursor cell in place on screen – also at a map corner (0,0)
    await d.key("Escape", 1, 300); // roam
    await d.dbg(`(d.place("${actor}", 1, 1), true)`);
    for (let i = 0; i < 4; i++) {
      const cell = await d.dbg(`d.cursor()`);
      const s0 = await d.dbg(`d.cellScreen(${cell.x}, ${cell.y})`);
      await d.key("e", 1, 1200); // animated turn
      const s1 = await d.dbg(`d.cellScreen(${cell.x}, ${cell.y})`);
      d.expect(Math.abs(s0.x - s1.x) <= 1 && Math.abs(s0.y - s1.y) <= 1, `cursor cell stayed in place on turn ${i + 1} (${JSON.stringify(s0)} → ${JSON.stringify(s1)})`);
    }
    d.expect((await d.dbg(`d.rotation()`)) === 0, "four quarter turns = full circle");
    await d.dbg(`(d.place("${actor}", 6, 4), true)`);
    await d.waitReady();
    // rotate the map and move by clicking a cell
    await d.key("e", 1, 1200);
    d.expect((await d.dbg(`d.rotation()`)) === 1, "map rotated a quarter turn");
    await d.shot("rotated");
    await d.startMove();
    // a cell two steps away whose top is visible in this view (the houses in front hide some – clicks pick what is drawn)
    let target = [4, 4];
    for (const [x, y] of [[4, 4], [5, 4], [4, 5], [6, 2], [5, 3], [4, 3]])
      if (await d.dbg(`d.pickable(${x}, ${y})`)) {
        target = [x, y];
        break;
      }
    await d.clickCell(target[0], target[1]);
    await sleep(900);
    const moved = await d.dbg(`(p => [p.x, p.y])(Object.values(d.state().board.pieces).find(p => p.members.includes("${actor}")))`);
    d.expect(moved[0] === target[0] && moved[1] === target[1], `clicking a cell on the rotated map moved there (${moved}, target ${target})`);
    await d.key("q", 1, 1200);
    d.expect((await d.dbg(`d.rotation()`)) === 0, "rotated back");
  },

  async actAndShop(d) {
    await d.newGame();
    const actor = await d.waitReady();
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
    // Leave keeps the hero there; "Act" reopens the close-up any number of times
    await d.openCommands();
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
      s.board.chars["scorp_a#0"].statuses.push({ id: "lib:sleep", turns: 9 });
      s.heroes["lib:kit"].statuses.push({ id: "lib:poison", turns: 5 }, { id: "lib:protect", turns: 3 });
      s.heroes["lib:mira"].statuses.push({ id: "lib:regen", turns: 3 });
      __game.debug.resync();
    });
    const actor = await d.waitHeroTurn();
    d.expect(actor === "lib:kit", `Kit's turn (${actor})`);
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
      d2.place("lib:kit", p.x + 1, p.y);
      __game.phaser.scene.getScene("board").battle(() => __game.core.engage(ctx, "lib:kit", { x: p.x, y: p.y }));
    });
    await d.waitFor(`d.activeScenes().includes("battle") && d.menu() && d.menu().items.some(i => i.label === "Fight")`, 20000);
    await d.shot("battle-icons");
    const icons = await d.ev(() => [...__game.phaser.scene.getScene("battle").actors.values()].map((a) => a.icons.length));
    d.expect(icons.some((n) => n >= 2), `a battler shows two status icons side by side (${icons})`);
  },

  async undoMove(d) {
    await d.newGame();
    await d.travelToDunes(["scorp_a"]); // a (sleeping) enemy keeps the board turn-based
    await d.ev(() => __game.debug.state().board.chars["scorp_a#0"].statuses.push({ id: "lib:sleep", turns: 9 }));
    const actor = await d.waitHeroTurn();
    await d.dbg(`d.place("${actor}", 3, 4)`);
    await d.moveTo(["ArrowRight"]); // (4,4): plain sand, no effects
    await d.waitFor(`d.menu() && d.menu().items.some(i => i.label === "Undo Move")`);
    await d.shot("undo-offered");
    await d.choose("Undo Move");
    const back = await d.dbg(`(p => [p.x, p.y])(Object.values(d.state().board.pieces).find(p => p.members.includes("${actor}")))`);
    d.expect(back[0] === 3 && back[1] === 4, `undo returned the party (${back})`);
    d.expect(await d.dbg(`d.menu().items.some(i => i.label === "Move" && !i.disabled)`), "Move is available again");
    // move onto a burning cell: effects happened → no undo
    await d.ev(() => { __game.debug.state().board.fieldEffects.push({ x: 4, y: 4, effect: "lib:burning", rounds: 3 }); __game.debug.resync(); });
    await d.moveTo(["ArrowRight"]);
    await d.waitFor(`d.menu() && d.menu().items.some(i => i.label === "Stats")`);
    d.expect(!(await d.dbg(`d.menu().items.some(i => i.label === "Undo Move")`)), "no undo after taking fire damage");
  },

  async explore(d) {
    await d.newGame();
    const actor = await d.waitReady();
    d.expect(await d.dbg(`d.exploring()`), "the peaceful village is explored freely");
    const pos = () => d.dbg(`(p => [p.x, p.y])(Object.values(d.state().board.pieces).find(p => p.members.includes("${actor}")))`);
    const start = await pos();
    // a far cell, beyond any move pattern: one click walks there
    const far = await d.ev(() => {
      const o = [...__game.core.moveOptions(__game.debug.ctx(), __game.debug.explorer()).values()].filter((o) => o.kind === "move");
      const best = o.reduce((a, b) => (b.path.length > a.path.length && b.path.length < 12 ? b : a));
      return { x: best.pos.x, y: best.pos.y, steps: best.path.length };
    });
    d.expect(far.steps > 4, `far cell is ${far.steps} steps away`);
    await d.clickCell(far.x, far.y);
    await sleep(500);
    await d.waitFor(`!!d.explorer()`, 20000, "walk finished");
    let p = await pos();
    d.expect(p[0] === far.x && p[1] === far.y, `walked to ${far.x},${far.y} (at ${p})`);
    // and again right away (keyboard this time) – no turns, no End Turn
    await d.dbg(`(d.cursorTo(${start[0]}, ${start[1]}), true)`);
    await d.key("Enter", 1, 300);
    await sleep(500);
    await d.waitFor(`!!d.explorer()`, 20000, "walk back finished");
    p = await pos();
    d.expect(p[0] === start[0] && p[1] === start[1], `walked back to ${start} (at ${p}; far ${JSON.stringify(far)}, cursor ${JSON.stringify(await d.dbg(`d.cursor()`))})`);
    d.expect((await d.dbg(`d.state().board.turn.current`)) === null, "nobody's turn while exploring");
    await d.shot("village");
    // villagers wander on their own while the player idles
    const npcs0 = await d.dbg(`JSON.stringify(Object.values(d.state().board.pieces).filter(p => p.faction === "npc").map(p => [p.x, p.y]))`);
    await d.waitFor(`JSON.stringify(Object.values(d.state().board.pieces).filter(p => p.faction === "npc").map(p => [p.x, p.y])) !== ${JSON.stringify(npcs0)}`, 15000, "a villager wandered");
    // wild map: tactics while an enemy lives, exploration once it's gone
    await d.travelToDunes(["scorp_a"]);
    await d.ev(() => __game.debug.state().board.chars["scorp_a#0"].statuses.push({ id: "lib:sleep", turns: 9 }));
    await d.waitHeroTurn();
    d.expect(!(await d.dbg(`d.exploring()`)), "turn-based with an enemy around");
    await d.dbg(`d.setHp("scorp_a#0", 0)`);
    await d.choose("Stats");
    await d.key("Escape", 1, 400);
    await d.waitFor(`!!d.explorer()`, 10000, "exploring the cleared dunes");
    await d.shot("dunes-clear");
  },

  async harborSearch(d) {
    await d.newGame({ prologue: true });
    d.expect((await d.dbg(`d.state().board.mapId`)) === "saltmere_harbor", "the journey starts at the harbor");
    await d.shot("arrival");
    await d.pressUntil(`!!d.explorer()`, "Enter", 30, 400); // captain's intro
    await d.shot("harbor");
    const actor = await d.waitReady();
    const potions = await d.dbg(`d.state().inventory["lib:potion"] ?? 0`);
    await d.dbg(`d.place("${actor}", 8, 4)`);
    await d.moveTo(["ArrowUp"]); // the herring barrel at (8,3)
    await d.waitFor(`d.menu() && d.menu().title === "Choose"`);
    await d.shot("barrel-close-up");
    await d.choose("Search");
    await d.pressUntil(`d.menu() && d.menu().title === "Choose"`, "Enter", 10, 400);
    d.expect((await d.dbg(`d.state().inventory["lib:potion"]`)) === potions + 1, "found a potion in the barrel");
    // searching again only tells what's left – no second potion
    await d.choose("Search");
    await d.pressUntil(`d.menu() && d.menu().title === "Choose"`, "Enter", 10, 400);
    d.expect((await d.dbg(`d.state().inventory["lib:potion"]`)) === potions + 1, "only one potion in the barrel");
    await d.choose("Leave");
  },

  async riverIce(d) {
    await d.newGame({ prologue: true });
    await d.pressUntil(`!!d.explorer()`, "Enter", 30, 400);
    await d.ev(() => {
      const s = __game.debug.state();
      s.heroes["lib:mira"].learned.push("lib:ice", "lib:fire");
      __game.debug.travel("greenwood", "from_harbor");
    });
    await d.waitFor(`d.state().board.mapId === "greenwood"`);
    await sleep(1500); // scene restart + intro dialog
    await d.pressUntil(`!!d.explorer()`, "Enter", 30, 400); // forest intro
    const actor = await d.waitReady();
    await d.dbg(`d.place("${actor}", 16, 6)`);
    await sleep(400);
    d.expect(!(await d.dbg(`__game.core.moveOptions(d.ctx(), "${actor}").has("20,6")`)), "the river blocks the way");
    // Mira casts Ice on the river
    await d.key("Enter", 1, 400);
    await d.choose("Mira");
    await d.choose("Ability");
    await d.chooseType("Magic");
    await d.chooseType("Attack");
    await d.choose("Ice");
    await d.dbg(`(d.cursorTo(18, 6), true)`);
    await d.key("Enter", 1, 300);
    await sleep(1200);
    await d.shot("frozen-river");
    const frozen = await d.dbg(`d.state().board.fieldEffects.filter(f => f.effect === "lib:frozen").length`);
    d.expect(frozen === 9, `ice froze 9 cells (${frozen})`);
    await d.key("Escape", 2, 300);
    await d.waitReady();
    await d.dbg(`(d.cursorTo(21, 6), true)`);
    await d.key("Enter", 1, 300);
    await d.waitFor(`!!d.explorer()`, 20000, "walked across");
    const pos = await d.dbg(`(p => [p.x, p.y])(Object.values(d.state().board.pieces).find(p => p.members.includes("${actor}")))`);
    d.expect(pos[0] >= 20, `crossed the river on the ice (at ${pos})`);
    // Fire burns away the two cacti blocking the stairs (it spreads from one to the other)
    await d.dbg(`d.place("${actor}", 26, 5)`);
    await sleep(300);
    await d.key("Enter", 1, 400);
    await d.choose("Mira");
    await d.choose("Ability");
    await d.chooseType("Magic");
    await d.chooseType("Attack");
    await d.choose("Fire");
    await d.dbg(`(d.cursorTo(28, 5), true)`);
    await d.key("Enter", 1, 300);
    await sleep(1200);
    await d.key("Escape", 2, 300);
    await sleep(600);
    await d.shot("burning-stairs");
    const gone = await d.dbg(`d.state().maps.greenwood.decor ?? {}`);
    d.expect(gone["28,5"] === null && gone["28,6"] === null, `both cacti burnt away (${JSON.stringify(gone)})`);
  },

  async ruinsHidden(d) {
    await d.newGame({ prologue: true });
    await d.pressUntil(`!!d.explorer()`, "Enter", 30, 400);
    await d.dbg(`(d.travel("sunken_ruins", "from_forest"), true)`);
    await d.waitFor(`d.state().board.mapId === "sunken_ruins"`);
    await sleep(1500); // scene restart + intro dialog
    await d.pressUntil(`!!d.explorer()`, "Enter", 30, 400); // ruins intro
    const actor = await d.waitReady();
    d.expect(await d.dbg(`d.exploring()`), "dormant skeletons don't count as enemies");
    await d.shot("ruins");
    const kitCast = async (skill, pickTarget = false) => {
      await d.key("Enter", 1, 400);
      await d.choose("Kit");
      await d.choose("Ability");
      await d.chooseType("Skill");
      await d.choose(skill);
      await sleep(300);
      if (pickTarget) await d.key("Enter", 1, 300); // cursor starts on the first valid target (Discover goes off at once)
      await sleep(1600);
      await d.key("Escape", 2, 300);
      await d.waitReady();
    };
    // Discover near the invisible chest: its reach lights up, then the chest appears
    await d.dbg(`d.place("${actor}", 7, 12)`);
    await sleep(300);
    await kitCast("Discover");
    d.expect(await d.dbg(`Object.values(d.state().board.pieces).some(p => p.sourceId === "hidden_chest")`), "the invisible chest appeared");
    await d.shot("chest-found");
    // Discover next to a trap reveals it; Defuse turns it into a Snare
    await d.dbg(`d.place("${actor}", 3, 8)`); // out of the skeletons' reach, next to the trap at 4,7
    await sleep(300);
    await kitCast("Discover");
    d.expect((await d.dbg(`Object.values(d.state().maps.sunken_ruins.states ?? {}).filter((st) => st === "revealed").length`)) === 1, "Discover revealed the trap next to Kit");
    await d.shot("trap-revealed");
    await kitCast("Defuse", true);
    d.expect((await d.dbg(`d.state().inventory["lib:snare"] ?? 0`)) === 1, "the defused trap is a Snare now");
    // walking along the road: a trap nobody found stops the party
    await d.dbg(`d.place("${actor}", 6, 6)`);
    await sleep(300);
    await d.dbg(`(d.cursorTo(10, 6), true)`);
    await d.key("Enter", 1, 300);
    await sleep(1500);
    const at = await d.dbg(`(p => [p.x, p.y])(Object.values(d.state().board.pieces).find(p => p.members.includes("${actor}")))`);
    d.expect(at[0] === 8 && at[1] === 6, `stopped on the hidden trap at 8,6 (at ${at})`);
    await d.shot("trapped");
    // ...and within reach of the "remains", a skeleton rises and ambushes
    await d.waitReady();
    await d.dbg(`(d.cursorTo(5, 6), true)`);
    await d.key("Enter", 1, 300);
    await d.waitFor(`!d.exploring()`, 10000, "a skeleton rose");
    await d.waitFor(`d.activeScenes().includes("battle") && d.state().battle && d.state().battle.kind === "ambush"`, 15000, "the skeleton ambushes the party");
    await sleep(1500);
    await d.shot("ambush");
  },

  async enemyAi(d) {
    await d.newGame();
    for (const h of ["lib:aldric", "lib:mira", "lib:kit", "lib:tarek"]) await d.dbg(`d.setLevel("${h}", 12)`);
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
          sticky: s.board.fieldEffects.some((f) => f.effect === "lib:sticky"),
          statuses: s.roster.some((id) => s.heroes[id].statuses.some((x) => ["lib:slow", "lib:poison"].includes(x.id))),
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
