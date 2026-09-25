// Browser smoke test: drives the running dev server with Playwright and saves screenshots.
// Usage: node tools/smoke.mjs [url] [outDir] "step;;step;;..."
//   steps: key:Enter | wait:500 | shot:name | click:x,y (virtual 480x270 coords) | eval:js
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const url = process.argv[2] ?? "http://localhost:5173/";
const out = process.argv[3] ?? "tools/out";
const steps = (process.argv[4] ?? "wait:2500;;shot:title;;key:Enter;;wait:2500;;shot:board").split(";;").filter(Boolean);
mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errors = [];
page.on("console", (m) => {
  if (m.type() === "error" || m.type() === "warning") errors.push(`[${m.type()}] ${m.text()}`);
});
page.on("pageerror", (e) => errors.push(`[pageerror] ${e.message}\n${e.stack ?? ""}`));
await page.goto(url);

for (const step of steps) {
  const [cmd, ...rest] = step.split(":");
  const arg = rest.join(":");
  if (cmd === "key") await page.keyboard.press(arg);
  else if (cmd === "wait") await page.waitForTimeout(Number(arg));
  else if (cmd === "shot") await page.screenshot({ path: `${out}/${arg}.png` });
  else if (cmd === "click") {
    const [x, y] = arg.split(",").map(Number);
    const box = await page.locator("canvas").boundingBox();
    await page.mouse.click(box.x + (x * box.width) / 480, box.y + (y * box.height) / 270);
  } else if (cmd === "move") {
    const [x, y] = arg.split(",").map(Number);
    const box = await page.locator("canvas").boundingBox();
    await page.mouse.move(box.x + (x * box.width) / 480, box.y + (y * box.height) / 270);
  } else if (cmd === "eval") console.log(await page.evaluate(arg));
}
console.log(errors.length ? errors.join("\n") : "no console errors");
await browser.close();
