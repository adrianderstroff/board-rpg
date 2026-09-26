#!/usr/bin/env node
// Re-parses every generated WAV and prints duration, peak level and size.
// For music it also measures the loop seam (jump from last sample to first).
// Usage: node tools/audio/check.mjs   (also run at the end of generate.mjs)
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseWav } from './wav.mjs';
import { peak, gainToDb } from './synth.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const AUDIO_DIR = join(ROOT, 'public', 'assets', 'audio');
/** Music is library content (docs/projects.md); sound effects belong to the runtime. */
export const MUSIC_DIR = join(ROOT, 'library', 'v1', 'assets', 'audio', 'music');
export const dirOf = (kind) => (kind === 'music' ? MUSIC_DIR : join(AUDIO_DIR, kind));
const LIMITS = { musicFileBytes: 1.6e6, musicTotalBytes: 20e6 };

/** Largest sample-to-sample jump inside the file (reference for the seam). */
function maxStep(s) {
  let m = 0;
  for (let i = 1; i < s.length; i++) m = Math.max(m, Math.abs(s[i] - s[i - 1]));
  return m;
}

export function checkAll({ quiet = false } = {}) {
  const log = quiet ? () => {} : console.log;
  const errors = [];
  const totals = {};
  const rows = [];
  for (const kind of ['sfx', 'music']) {
    const dir = dirOf(kind);
    if (!existsSync(dir)) continue;
    totals[kind] = 0;
    for (const f of readdirSync(dir).filter((f) => f.endsWith('.wav')).sort()) {
      const bytes = readFileSync(join(dir, f));
      try {
        const w = parseWav(bytes);
        if (w.channels !== 1) throw new Error('not mono');
        const p = peak(w.samples);
        if (!(p > 0.01)) throw new Error('silent or invalid samples');
        const row = { kind, file: `${kind}/${f}`, sec: w.duration, db: gainToDb(p), kb: bytes.length / 1024, sr: w.sampleRate };
        if (kind === 'music') {
          const s = w.samples;
          row.seam = Math.abs(s[s.length - 1] - s[0]) / (maxStep(s) || 1);
          if (bytes.length > LIMITS.musicFileBytes) errors.push(`${row.file}: ${bytes.length} bytes > 1.6 MB`);
          if (row.seam > 0.5) errors.push(`${row.file}: loop seam jump is ${(row.seam * 100).toFixed(0)}% of max step`);
        }
        rows.push(row);
        totals[kind] += bytes.length;
      } catch (e) {
        errors.push(`${kind}/${f}: ${e.message}`);
      }
    }
  }
  log('file'.padEnd(28) + 'rate'.padStart(7) + 'sec'.padStart(8) + 'peak dB'.padStart(9) + 'KB'.padStart(8) + '  loop seam');
  for (const r of rows)
    log(
      r.file.padEnd(28) + String(r.sr).padStart(7) + r.sec.toFixed(2).padStart(8) + r.db.toFixed(1).padStart(9) + r.kb.toFixed(1).padStart(8) +
        (r.seam != null ? `  ${(r.seam * 100).toFixed(1)}% of max step` : ''),
    );
  for (const [k, v] of Object.entries(totals)) log(`total ${k}: ${(v / 1e6).toFixed(2)} MB`);
  if ((totals.music ?? 0) > LIMITS.musicTotalBytes) errors.push(`music total ${totals.music} bytes > 20 MB`);
  if (errors.length) for (const e of errors) console.error('ERROR ' + e);
  else log(`OK: ${rows.length} WAV files parsed and valid.`);
  return { rows, errors };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { errors } = checkAll();
  process.exitCode = errors.length ? 1 : 0;
}
