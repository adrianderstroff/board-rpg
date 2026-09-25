#!/usr/bin/env node
// Generates all procedural chiptune audio into public/assets/audio/.
// Usage: node tools/audio/generate.mjs [name ...]   (or: npm run audio)
//   Optional names limit generation to matching sfx/songs, e.g. `hit battle`.
// Deterministic: all noise is seeded; re-running produces identical files.
//
// Layout:
//   synth.mjs       oscillators, envelopes, filters, buffer ops
//   voices.mjs      Karplus-Strong harp, additive piano/celesta, breath flute, ensemble pad, loop drone
//   sequencer.mjs   pattern strings -> notes -> rendered (looping) songs
//   theory.mjs      chord symbols, chord-driven patterns, melody lint
//   instruments.mjs instrument presets + drum kit
//   sfx.mjs         sound effect definitions
//   music.mjs       song definitions
//   wav.mjs         16-bit PCM WAV writer/parser
//   check.mjs       re-parses output, prints duration / peak / size
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { SR, fadeEdges, normalize, trimSilence } from './synth.mjs';
import { renderSong } from './sequencer.mjs';
import { lintSong } from './theory.mjs';
import { encodeWav } from './wav.mjs';
import { SFX } from './sfx.mjs';
import { SONGS } from './music.mjs';
import { checkAll, AUDIO_DIR } from './check.mjs';

const MUSIC_PEAK_DB = -6;
const only = process.argv.slice(2);
const wanted = (name) => only.length === 0 || only.includes(name);

function write(rel, samples) {
  const path = join(AUDIO_DIR, rel);
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, encodeWav(samples, SR));
}

const t0 = Date.now();
let count = 0;

for (const s of SFX.filter((s) => wanted(s.name))) {
  let buf = trimSilence(s.render(), 1e-3);
  buf = normalize(fadeEdges(buf, 5, 5), s.peakDb);
  write(`sfx/${s.name}.wav`, buf);
  count++;
}

let lintWarnings = 0;
for (const song of SONGS.filter((s) => wanted(s.name))) {
  const exact = song.bars * (60 / song.bpm) * (song.beatsPerBar ?? 4) * SR;
  if (Math.abs(exact - Math.round(exact)) > 1e-6)
    console.warn(`warn: ${song.name} loop is ${exact.toFixed(2)} samples (not an integer); pick a bpm that divides evenly`);
  for (const w of lintSong(song)) {
    console.warn('lint: ' + w);
    lintWarnings++;
  }
  // No edge fades: the loop is seamless by construction (tails wrap to the start).
  const buf = normalize(renderSong(song, { sr: SR, loop: true }), MUSIC_PEAK_DB);
  write(`music/${song.name}.wav`, buf);
  count++;
}

console.log(`Generated ${count} files in ${Date.now() - t0} ms (${lintWarnings} lint warnings).\n`);
const { errors } = checkAll();
process.exitCode = errors.length ? 1 : 0;
