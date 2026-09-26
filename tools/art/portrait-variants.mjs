#!/usr/bin/env node
// Writes the five style studies of Mira's portrait (faces/hero_magician-var1..5.png)
// and a comparison sheet tools/art/out/magician-face-variants.png.
// Usage: node tools/art/portrait-variants.mjs  (also run by generate.mjs)
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { writePNG, readPNG } from './png.mjs';
import { Canvas } from './raster.mjs';
import { P } from './palette.mjs';
import { drawText } from './font.mjs';
import { MAGICIAN_VARIANTS } from './portraits.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ASSETS = join(HERE, '..', '..', 'public', 'assets');
const LIBRARY = join(HERE, '..', '..', 'library', 'v1', 'assets');

export function buildMagicianVariants() {
  const frames = MAGICIAN_VARIANTS.map(([name, fn], i) => {
    const f = fn();
    writePNG(join(LIBRARY, 'faces', `hero_magician-var${i + 1}.png`), f);
    return [name, f];
  });
  // comparison sheet: x4 each, plus 1x, 24px and 14px downscales next to it
  const r = readPNG(join(ASSETS, 'system/font.png'));
  const fimg = new Canvas(r.width, r.height); fimg.data.set(r.data);
  const font = { img: fimg, json: JSON.parse(readFileSync(join(ASSETS, 'system/font.json'), 'utf8')) };
  const cellW = 48 * 4 + 64, W = cellW * frames.length + 16, H = 48 * 4 + 40;
  const sheet = new Canvas(W, H, 0x24252cff);
  const down = (f, n) => {
    const c = new Canvas(n, n);
    const k = 48 / n;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) c.set(x, y, f.get(Math.floor((x + 0.5) * k), Math.floor((y + 0.5) * k)));
    return c;
  };
  frames.forEach(([name, f], i) => {
    const x = 8 + i * cellW;
    sheet.blit(f, x, 8, { scale: 4 });
    sheet.blit(f, x + 48 * 4 + 8, 8);
    sheet.blit(down(f, 24), x + 48 * 4 + 8, 64);
    sheet.blit(down(f, 14), x + 48 * 4 + 8, 96);
    drawText(sheet, font, `var${i + 1} - ${name}`, x, 8 + 48 * 4 + 6, P.white);
  });
  writePNG(join(HERE, 'out', 'magician-face-variants.png'), sheet);
  return frames.map(([n]) => n);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) console.log(buildMagicianVariants().join('\n'));
