#!/usr/bin/env node
// Composes contact-sheet previews from the generated PNGs (library/v1/assets, public/assets)
// into tools/art/out/preview-*.png (scaled x3, nearest neighbour).
// Usage: node tools/art/preview.mjs   (also run automatically by generate.mjs)
import { readFileSync, readdirSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readPNG, writePNG } from './png.mjs';
import { Canvas, withAlpha } from './raster.mjs';
import { P } from './palette.mjs';
import { drawText } from './font.mjs';
import { CHIPSET_NAMES } from './chipset.mjs';
import { DECOR_NAMES } from './decor.mjs';
import { ICON_NAMES } from './icons.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const RUNTIME = join(HERE, '..', '..', 'public', 'assets');
const LIBRARY = join(HERE, '..', '..', 'library', 'v1', 'assets');
const ASSETS_OF = (rel) => join(rel.startsWith('system/') ? RUNTIME : LIBRARY, rel);
const OUT = join(HERE, 'out');
const SCALE = 3;

function load(rel) {
  const { width, height, data } = readPNG(ASSETS_OF(rel));
  const c = new Canvas(width, height);
  c.data.set(data);
  return c;
}
const frame = (sheet, i, fw, fh, cols) => sheet.crop((i % cols) * fw, Math.floor(i / cols) * fh, fw, fh);
function checker(w, h, a = 0x2a2f45ff, b = 0x32384fff, size = 8) {
  const c = new Canvas(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) c.set(x, y, ((x / size | 0) + (y / size | 0)) % 2 ? a : b);
  return c;
}

export function buildPreviews() {
  mkdirSync(OUT, { recursive: true });
  const font = { img: load('system/font.png'), json: JSON.parse(readFileSync(ASSETS_OF('system/font.json'), 'utf8')) };
  const label = (c, t, x, y, col = null) => drawText(c, font, t, x, y, col);
  const written = [];
  const save = (name, c) => { writePNG(join(OUT, `preview-${name}.png`), c.scaled(SCALE)); written.push(`preview-${name}.png`); };

  // ---- charsets
  {
    const ids = readdirSync(ASSETS_OF('charsets')).filter((f) => f.endsWith('.png')).map((f) => f.slice(0, -4));
    const cellW = 104, cellH = 144, cols = 6;
    const c = checker(cols * cellW, Math.ceil(ids.length / cols) * cellH);
    ids.forEach((id, i) => {
      const s = load(`charsets/${id}.png`);
      const x = (i % cols) * cellW + 4, y = Math.floor(i / cols) * cellH + 2;
      c.blit(s, x, y + 12);
      label(c, id.replace('hero_', 'h:').replace('npc_', 'n:').replace('enemy_', 'e:'), x, y);
    });
    save('charsets', c);
  }
  // ---- battlers on the desert battleback
  {
    const bb = load('battlebacks/desert.png');
    const c = new Canvas(480, 190 + 150);
    c.fillRect(0, 0, 480, 340, P.navy);
    c.blit(bb, 0, 0);
    // enemies on the left (face right), heroes on the right (face left)
    c.blit(frame(load('battlers/enemy_emperor_scorpion.png'), 0, 96, 72, 4), 20, 150 - 72);
    c.blit(frame(load('battlers/enemy_scorpion.png'), 0, 48, 40, 4), 130, 130 - 40);
    c.blit(frame(load('battlers/enemy_condor.png'), 0, 48, 48, 4), 140, 40);
    ['hero_knight', 'hero_magician', 'hero_thief', 'hero_monk'].forEach((id, i) => {
      c.blit(frame(load(`battlers/${id}.png`), 0, 32, 32, 6), 330 + i * 18, 108 + i * 16);
    });
    // all frames strip below
    let y = 194;
    ['hero_knight', 'hero_magician', 'hero_thief', 'hero_monk'].forEach((id, i) => { const s = load(`battlers/${id}.png`); c.blit(s, (i % 2) * 240, y + Math.floor(i / 2) * 34); });
    y += 70;
    c.blit(load('battlers/enemy_scorpion.png'), 0, y);
    c.blit(load('battlers/enemy_condor.png'), 200, y - 8);
    save('battlers', c);
    const e = checker(384, 72);
    e.blit(load('battlers/enemy_emperor_scorpion.png'), 0, 0);
    save('boss', e);
  }
  // ---- faces: each at x3 plus 1x, 24px and 14px (the in-menu sizes); written unscaled
  {
    const ids = readdirSync(ASSETS_OF('faces')).filter((f) => f.endsWith('.png') && !f.includes('-var')).map((f) => f.slice(0, -4));
    const cellW = 144 + 64, cellH = 144 + 20, cols = 6;
    const c = new Canvas(cols * cellW + 8, Math.ceil(ids.length / cols) * cellH + 8, 0x24252cff);
    const down = (f, n) => { const d = new Canvas(n, n), k = 48 / n; for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) d.set(x, y, f.get(Math.floor((x + 0.5) * k), Math.floor((y + 0.5) * k))); return d; };
    ids.forEach((id, i) => {
      const x = (i % cols) * cellW + 8, y = Math.floor(i / cols) * cellH + 8;
      const f = load('faces/' + id + '.png');
      c.blit(f, x, y, { scale: 3 });
      c.blit(f, x + 150, y);
      c.blit(down(f, 24), x + 150, y + 54);
      c.blit(down(f, 14), x + 150, y + 82);
      label(c, id, x, y + 146);
    });
    writePNG(join(OUT, 'preview-faces.png'), c);
    written.push('preview-faces.png (x3 + 1x/24/14)');
  }
  // ---- tiles: chipset + decor with indices
  {
    const chip = load('chipsets/desert.png'), dec = load('chipsets/desert_decor.png');
    const c = checker(8 * 40, 3 * 40 + 3 * 60 + 8);
    CHIPSET_NAMES.forEach((n, i) => {
      const x = (i % 8) * 40 + 4, y = Math.floor(i / 8) * 40 + 2;
      c.blit(frame(chip, i, 32, 24, 8), x, y);
      label(c, `${i}`, x, y + 25);
    });
    DECOR_NAMES.forEach((n, i) => {
      const x = (i % 8) * 40 + 4, y = 124 + Math.floor(i / 8) * 60;
      c.fillRect(x + 15, y + 40, 2, 1, P.hotRed);
      c.blit(frame(dec, i, 32, 48, 8), x, y);
      label(c, `${i}`, x, y + 46);
    });
    save('tiles', c);
  }
  // ---- iso map with characters
  {
    const chip = load('chipsets/desert.png'), dec = load('chipsets/desert_decor.png');
    const block = (n) => frame(chip, CHIPSET_NAMES.indexOf(n), 32, 24, 8);
    const decor = (n) => frame(dec, DECOR_NAMES.indexOf(n), 32, 48, 8);
    const hl = load('system/highlight.png'), fx = load('system/field_effects.png'), cur = load('system/board_cursor.png');
    const arrows = load('system/exit_arrows.png'), shadow = load('system/shadow.png');
    const N = 8;
    const T = [
      'rock rock sand_ripple sand sand sand stone_path sand',
      'rock sand_dark sand sand oasis_edge grass grass sand',
      'sand sand quicksand sand oasis_edge water_a water_a oasis_edge',
      'sand_ripple sand sand stone_path stone_path water_a water_b grass',
      'plaza plaza plaza plaza stone_path oasis_edge grass sand',
      'plaza plaza plaza plaza stone_path sand sand dirt',
      'adobe adobe_door plaza plaza wood wood sand ice',
      'adobe adobe_window plaza plaza sand sand sand_dark tiled_roof',
    ].map((r) => r.split(' '));
    const Hm = [
      [3, 2, 1, 1, 0, 0, 0, 0], [2, 1, 1, 0, 0, 0, 0, 0], [1, 1, 0, 0, 0, 0, 0, 0], [1, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 1], [2, 2, 0, 0, 0, 0, 1, 1], [2, 2, 0, 0, 0, 0, 1, 3],
    ];
    const objs = {
      '0,2': ['decor', 'cactus'], '2,1': ['decor', 'rock_big'], '1,6': ['decor', 'palm'], '0,5': ['decor', 'palm'], '4,5': ['decor', 'well'],
      '1,4': ['char', 'hero_knight', 0], '2,4': ['char', 'hero_magician', 1], '3,3': ['char', 'hero_thief', 0], '2,5': ['char', 'hero_monk', 2],
      '5,2': ['char', 'enemy_scorpion', 1], '6,3': ['char', 'enemy_condor', 1], '1,1': ['char', 'enemy_emperor_scorpion', 1],
      '3,5': ['char', 'npc_merchant', 0], '5,5': ['decor', 'stall_green'], '4,7': ['char', 'npc_guard', 3], '6,5': ['decor', 'barrel'],
      '7,1': ['decor', 'chest_closed'], '0,3': ['char', 'npc_elder', 0],
    };
    const W = 16 * 2 * N + 40, H = 16 * N + 24 * 4 + 60;
    const c = new Canvas(W, H, 0x1e2233ff);
    const ox = W / 2 - 16, oy = 48;
    const topOf = (x, y) => [ox + (x - y) * 16, oy + (x + y) * 8 - Hm[y][x] * 8];
    // x = grid x (down-right), y = grid y (down-left)
    for (let s = 0; s < 2 * N - 1; s++)
      for (let x = 0; x < N; x++) {
        const y = s - x;
        if (y < 0 || y >= N) continue;
        const t = T[y][x], h = Hm[y][x];
        const fill = t.startsWith('rock') ? 'rock_fill' : t.startsWith('adobe') || t === 'tiled_roof' ? 'adobe' : 'sandstone_fill';
        for (let k = -1; k <= h; k++) c.blit(block(k === h ? t : fill), ox + (x - y) * 16, oy + (x + y) * 8 - k * 8);
        const [tx, ty] = topOf(x, y);
        // overlays
        if (x === 3 && y === 4) c.blit(frame(hl, 0, 32, 16, 6), tx, ty);
        if (x === 4 && y === 4) c.blit(frame(hl, 0, 32, 16, 6), tx, ty);
        if (x === 2 && y === 3) c.blit(frame(hl, 1, 32, 16, 6), tx, ty);
        if (x === 3 && y === 2) c.blit(frame(fx, 0, 32, 24, 8), tx, ty - 8);
        if (x === 4 && y === 1) c.blit(frame(fx, 8, 32, 24, 8), tx, ty - 8);
        if (x === 6 && y === 7) c.blit(frame(fx, 24, 32, 24, 8), tx, ty - 8);
        if (x === 7 && y === 4) c.blit(frame(arrows, 1, 32, 16, 8), tx, ty);
        if (x === 3 && y === 0) c.blit(frame(arrows, 4, 32, 16, 8), tx, ty);
        const o = objs[`${x},${y}`];
        const cx = tx + 16, cy = ty + 8; // tile center
        if (o && o[0] === 'decor') c.blit(decor(o[1]), cx - 16, cy - 40);
        if (o && o[0] === 'char') {
          const sheet = load(`charsets/${o[1]}.png`);
          const fw = sheet.width / 3, fh = sheet.height / 4;
          c.blit(shadow, cx - 8, cy - 3);
          c.blit(frame(sheet, o[2] * 3 + 1, fw, fh, 3), cx - fw / 2, cy + 3 - fh);
        }
        if (x === 3 && y === 3) c.blit(frame(cur, 0, 32, 24, 2), tx, ty);
      }
    // window sample
    const win = load('system/window.png');
    const nine = (dx, dy, w, h) => {
      const b = 8;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const sx = x < b ? x : x >= w - b ? 48 - (w - x) : b + ((x - b) % 32);
        const sy = y < b ? y : y >= h - b ? 48 - (h - y) : b + ((y - b) % 32);
        c.set(dx + x, dy + y, win.get(sx, sy));
      }
    };
    nine(8, H - 52, 200, 46);
    c.blit(load('faces/hero_knight.png'), 8 + 4, H - 52 - 1 + 0, {});
    label(c, 'Aldric  Lv 3  Knight', 60, H - 46);
    label(c, 'HP  42/ 42   MP  6/ 6', 60, H - 34, P.cyan);
    label(c, 'Move: knight leap', 60, H - 22, P.yellow);
    c.blit(load('system/cursor.png').crop(0, 0, 16, 16), 46, H - 22 + 0);
    save('map', c);
  }
  // ---- system sheet
  {
    const c = checker(360, 300);
    let y = 4;
    c.blit(load('system/window.png'), 4, y);
    c.blit(load('system/cursor.png'), 60, y);
    c.blit(load('system/board_cursor.png'), 100, y);
    c.blit(load('system/shadow.png'), 170, y);
    c.blit(load('system/exit_arrows.png'), 60, y + 26);
    y += 56;
    c.blit(load('system/highlight.png'), 4, y);
    y += 20;
    c.blit(load('system/field_effects.png'), 4, y);
    const icons = load('system/icons.png');
    c.blit(icons, 100, y + 4);
    y += 124;
    c.blit(font.img, 4, y);
    label(c, 'The quick brown fox jumps', 136, y);
    label(c, 'over the lazy dog! 0123456789', 136, y + 12);
    label(c, 'Potion x3  HP 120/340 (Lv.12)', 136, y + 24, P.yellow);
    label(c, `${ICON_NAMES.length} icons`, 136, y + 40, P.cyan);
    // status icons on sand, stone, sky and night backgrounds
    const st = load('system/status_icons.png');
    [P.sand, P.grey2, P.blue, P.navy].forEach((bg, k) => { c.fillRect(136, y + 54 + k * 12, st.width + 4, 12, bg); c.blit(st, 138, y + 55 + k * 12); });
    save('system', c);
  }
  // ---- backgrounds
  {
    const c = new Canvas(480, 190 * 2 + 270 + 8);
    c.blit(load('battlebacks/desert.png'), 0, 0);
    c.blit(load('battlebacks/village.png'), 0, 194);
    c.blit(load('system/title_bg.png'), 0, 388);
    writePNG(join(OUT, 'preview-backgrounds.png'), c.scaled(2));
    written.push('preview-backgrounds.png (x2)');
  }
  return written;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  console.log(buildPreviews().join('\n'));
}
