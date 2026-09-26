// Captures the editor for the website (docs/images/editor-*.png; dev server must be running).
// Usage: node tools/editor-screenshots.mjs [url]
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const url = process.argv[2] ?? "http://localhost:5173/editor/";
const OUT = "docs/images";
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 820 } });
await page.goto(url);
await page.evaluate(() => localStorage.clear());
await page.goto(url + "?project=demo");
await page.waitForFunction(() => window.__editor?.project);
// the map editor: Sandhollow with its entities
await page.getByText("Sandhollow", { exact: true }).click();
await sleep(800);
await page.keyboard.press("3");
await sleep(600);
await page.screenshot({ path: `${OUT}/editor-map.png` });
// an entity's states and events
await page.locator(".entity-table tr").nth(3).click();
await sleep(600);
await page.screenshot({ path: `${OUT}/editor-entity.png` });
await browser.close();
console.log("editor screenshots in", OUT);
