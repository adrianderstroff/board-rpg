#!/usr/bin/env node
// Generates all placeholder pixel-art assets: content sheets into the library (library/v1/assets/),
// the runtime's own (system/) into public/assets/ (docs/projects.md).
// Usage: node tools/art/generate.mjs   (or: npm run art)
// Deterministic: all randomness is seeded; re-running produces identical files.
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writePNG } from './png.mjs';
import { Canvas } from './raster.mjs';
import { CHARACTERS, charsetSheet, heroBattlerFrames } from './characters.mjs';
import { flatFace, FLAT_FACE_IDS } from './flatfaces.mjs';
import {
  scorpionCharset, condorCharset, emperorCharset, scorpionBattler, condorBattler, emperorBattler,
} from './creatures.mjs';
import { chipsetSheet } from './chipset.mjs';
import { decorSheet } from './decor.mjs';
import { windowSkin, cursor, boardCursor, highlights, fieldEffects, exitArrows, shadow, wallSigns } from './system.mjs';
import { iconSheet, statusIconSheet } from './icons.mjs';
import { buildFont } from './font.mjs';
import * as BG from './backgrounds.mjs';
import { CREATURES2 } from './creatures2.mjs';
import { buildPreviews } from './preview.mjs';
import { buildMagicianVariants } from './portrait-variants.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const RUNTIME = join(ROOT, 'public', 'assets');
const LIBRARY = join(ROOT, 'library', 'v1', 'assets');
/** Where a sheet goes: content (charsets, faces, chipsets …) into the library, system graphics stay with the runtime. */
const OUT = (rel) => join(rel.startsWith('system/') ? RUNTIME : LIBRARY, rel);
let count = 0;
const png = (rel, canvas) => { writePNG(OUT(rel), canvas); count++; };
const json = (rel, obj) => { mkdirSync(dirname(OUT(rel)), { recursive: true }); writeFileSync(OUT(rel), JSON.stringify(obj, null, 2) + '\n'); count++; };
const row = (frames, fw, fh) => { const c = new Canvas(fw * frames.length, fh); frames.forEach((f, i) => c.blit(f, i * fw, 0, { blend: false })); return c; };

const t0 = Date.now();
// 1. charsets
for (const [id, spec] of Object.entries(CHARACTERS)) png(`charsets/${id}.png`, charsetSheet(spec));
png('charsets/enemy_scorpion.png', scorpionCharset());
png('charsets/enemy_condor.png', condorCharset());
png('charsets/enemy_emperor_scorpion.png', emperorCharset());

// 2. battlers
for (const id of ['hero_knight', 'hero_magician', 'hero_thief', 'hero_monk']) png(`battlers/${id}.png`, row(heroBattlerFrames(CHARACTERS[id]), 32, 32));
png('battlers/enemy_scorpion.png', row(scorpionBattler(), 48, 40));
png('battlers/enemy_condor.png', row(condorBattler(), 48, 48));
png('battlers/enemy_emperor_scorpion.png', row(emperorBattler(), 96, 72));
// humanoid enemies: the hero battler poses, mirrored to face right (frames: idle, idle2, attack, cast, hurt, ko)
for (const id of ['enemy_skeleton', 'enemy_fishfolk', 'enemy_shadow_knight', 'enemy_shadow_mage', 'enemy_shadow_thief', 'enemy_shadow_monk', 'enemy_bone_acolyte']) if (CHARACTERS[id]) png(`battlers/${id}.png`, row(heroBattlerFrames(CHARACTERS[id]).map((f) => f.mirrorX()), 32, 32));

// creatures of the Temple Mountain chapter (creatures2.mjs)
for (const [id, c] of Object.entries(CREATURES2)) {
  png(`charsets/${id}.png`, c.charset());
  png(`battlers/${id}.png`, c.battler());
  png(`faces/${id}.png`, c.face());
}

// 3. faces (flat graphic style, see flatfaces.mjs)
for (const id of FLAT_FACE_IDS) png(`faces/${id}.png`, flatFace(id));

// 4-5. chipsets
png('chipsets/desert.png', chipsetSheet());
png('chipsets/desert_decor.png', decorSheet());

// 6. system
png('system/window.png', windowSkin());
png('system/cursor.png', cursor());
png('system/board_cursor.png', boardCursor());
png('system/highlight.png', highlights());
png('system/field_effects.png', fieldEffects());
png('system/exit_arrows.png', exitArrows());
png('system/shadow.png', shadow());
png('signs/wall_signs.png', wallSigns());
const icons = iconSheet();
png('system/icons.png', icons.img);
json('system/icons.json', icons.json);
const sicons = statusIconSheet();
png('system/status_icons.png', sicons.img);
json('system/status_icons.json', sicons.json);
const font = buildFont();
png('system/font.png', font.img);
json('system/font.json', font.json);
png('system/title_bg.png', BG.titleBackground());

// 7. battlebacks
// battlebacks (480x190): id -> exported builder in backgrounds.mjs
const BATTLEBACKS = { desert: 'battlebackDesert', village: 'battlebackVillage', harbor: 'battlebackHarbor', forest: 'battlebackForest', ruins: 'battlebackRuins', elvenglade: 'battlebackElvenglade', mountain: 'battlebackMountain', temple: 'battlebackTemple', pond: 'battlebackPond', mirage: 'battlebackMirage', jungle: 'battlebackJungle', fear: 'battlebackFear', cave: 'battlebackCave', interior: 'battlebackInterior', elfshop: 'battlebackElfShop' };
for (const [id, fn] of Object.entries(BATTLEBACKS)) if (BG[fn]) png(`battlebacks/${id}.png`, BG[fn]());

// style study: faces/hero_magician-var1..5.png + tools/art/out/magician-face-variants.png
buildMagicianVariants(); count += 5;
console.log(`art: wrote ${count} files to library/v1/assets and public/assets in ${Date.now() - t0} ms`);
if (!process.argv.includes('--no-preview')) {
  const files = buildPreviews();
  console.log(`art: previews -> ${files.join(', ')}`);
}
