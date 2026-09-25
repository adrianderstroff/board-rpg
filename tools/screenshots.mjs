// Captures teaser screenshots for the README into docs/images/ (dev server must be running).
// Usage: node tools/screenshots.mjs [url]
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const url = process.argv[2] ?? "http://localhost:5173/";
const OUT = "docs/images";
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const dbg = (expr) => page.evaluate(`(() => { const d = __game.debug; return ${expr}; })()`);
const until = async (expr, ms = 30000) => {
  const t0 = Date.now();
  while (!(await dbg(expr).catch(() => false))) {
    if (Date.now() - t0 > ms) throw new Error(`timeout: ${expr}`);
    await sleep(100);
  }
};
const key = async (k, n = 1, delay = 250) => {
  for (let i = 0; i < n; i++) {
    await page.keyboard.press(k);
    await sleep(delay);
  }
};
const choose = async (label) => {
  await until(`d.menu() && d.menu().items.some(i => i.label.startsWith(${JSON.stringify(label)}))`);
  for (let n = 0; n < 20; n++) {
    const m = await dbg(`d.menu()`);
    const idx = m.items.findIndex((i) => i.label.startsWith(label));
    if (m.index === idx) break;
    await key(m.index < idx ? "ArrowDown" : "ArrowUp", 1, 90);
  }
  await key("Enter", 1, 350);
};
const shot = (name) => page.screenshot({ path: `${OUT}/${name}.png` });

await page.goto(url);
await page.evaluate(() => localStorage.clear());
await page.reload();
await until(`d.activeScenes().includes("title")`);
await sleep(1500);
await shot("title");

// Village: command box with the acting hero
await choose("New Game");
await until(`!!d.heroTurn() && !!d.menu()`);
await sleep(2500); // let the "new quest" toast fade
await shot("village");

// Talking to the elder in the interaction close-up
const actor = await dbg(`d.heroTurn()`);
await dbg(`(d.place("${actor}", 6, 4), true)`);
await choose("Move");
await key("ArrowUp", 1, 200);
await key("Enter", 1, 800);
await choose("Talk");
await sleep(2600);
await shot("dialog");
await until(`d.menu() && d.menu().title === "Choose"`, 60000).catch(async () => {
  for (let i = 0; i < 20 && !(await dbg(`d.menu() && d.menu().title === "Choose"`)); i++) await key("Enter", 1, 400);
});
await choose("Leave");

// Dunes: rotated map with an enemy's movement range and status icons
await page.evaluate(() => {
  const s = __game.debug.state();
  s.flags.gate_open = true;
  s.maps.scorpion_dunes = { defeated: [], removedEvents: [], triggered: ["enter_hint#0"] };
  __game.debug.travel("scorpion_dunes", "from_village");
});
await until(`d.state().board && d.state().board.mapId === "scorpion_dunes"`);
await page.evaluate(() => {
  const s = __game.debug.state();
  for (const c of Object.values(s.board.chars)) if (c.kind === "enemy") c.statuses.push({ id: "sleep", turns: 9 });
  s.heroes.mira.statuses.push({ id: "regen", turns: 3 });
  s.heroes.kit.statuses.push({ id: "haste", turns: 3 });
});
await until(`!!d.heroTurn() && !!d.menu()`);
const hero = await dbg(`d.heroTurn()`);
await dbg(`(d.place("${hero}", 12, 7), true)`);
await key("Escape", 1, 300);
// walk the cursor over to the Emperor (camera follows), inspect him, turn the map once
const emperor = await dbg(`(p => ({ x: p.x, y: p.y }))(d.state().board.pieces["e:emperor"])`);
await key(emperor.x > 12 ? "ArrowRight" : "ArrowLeft", Math.abs(emperor.x - 12), 150);
await key(emperor.y > 7 ? "ArrowDown" : "ArrowUp", Math.abs(emperor.y - 7), 150);
await key("Enter", 1, 600);
await key("e", 1, 600);
await shot("dunes");
await choose("Close");

// Boss battle
await page.evaluate(() => {
  const d = __game.debug;
  const ctx = d.ctx();
  const p = ctx.state.board.pieces["e:emperor"];
  d.place(d.heroTurn(), p.x - 1, p.y);
  for (const c of Object.values(ctx.state.board.chars)) c.statuses = [];
  __game.phaser.scene.getScene("board").battle(() => __game.core.engage(ctx, d.heroTurn(), { x: p.x, y: p.y }));
});
await until(`d.activeScenes().includes("battle") && d.menu() && d.menu().items.some(i => i.label === "Fight")`);
await sleep(1200);
await shot("battle");

await browser.close();
console.log("screenshots written to", OUT);
