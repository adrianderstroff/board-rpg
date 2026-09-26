// Sound effects. Each entry: { name, render: () => Float32Array, peakDb? }.
// generate.mjs trims, adds 5 ms edge fades and normalizes to `peakDb`
// (default -3 dBFS; a few UI/ambient sounds are deliberately quieter).
// Short jingles (levelup, victory, defeat, sleep) use the sequencer.
import { SR, tone, layer, concat, echo, rng, silence, noteFreq } from './synth.mjs';
import { INST, HITS, ACOUSTIC } from './instruments.mjs';
import { renderSong } from './sequencer.mjs';
import { chordPattern } from './theory.mjs';

const T = (o) => tone({ sr: SR, ...o });
const env = (a, d, s = 0, r = 0.02) => ({ a, d, s, r });
const noise = (o) => T({ wave: 'noise', freq: 22050, ...o });
/** Quick percussive square blip. */
const blip = (freq, dur, o = {}) => T({ wave: 'square', duty: 0.25, freq, dur, env: env(0.002, dur * 1.5, 0.3, 0.03), lp: 5000, ...o });
/** Bell-ish chime: triangle + quieter octave partial. */
const bell = (note, dur = 0.6, vol = 1) => {
  const freq = noteFreq(note);
  return layer([
    [T({ wave: 'triangle', freq, dur, env: env(0.002, dur, 0, 0.05), vol })],
    [T({ wave: 'sine', freq: freq * 2, dur: dur * 0.5, env: env(0.002, dur * 0.5, 0, 0.03), vol: vol * 0.35 })],
    [T({ wave: 'square', duty: 0.125, freq, dur: dur * 0.3, env: env(0.002, dur * 0.3, 0, 0.03), lp: 4000, vol: vol * 0.2 })],
  ]);
};
/** Random short crackle clicks (fire/ice), seeded. */
function crackles(count, span, seed, { hp = 3000, vol = 0.5 } = {}) {
  const r = rng(seed);
  const parts = [];
  for (let i = 0; i < count; i++)
    parts.push([noise({ dur: 0.006, env: env(0.0005, 0.008, 0, 0.004), hp, seed: 1 + i * 97, vol: vol * (0.4 + 0.6 * r()) }), r() * span]);
  return layer(parts);
}
/** Render a tiny non-looping song (jingle). */
const jingle = (song) => renderSong({ tail: 1.5, ...song }, { loop: false });

/** Seeded random step function: (t) => value in [0, 1), new value every stepSec (jittery pitch). */
function steps(stepSec, span, seed) {
  const r = rng(seed);
  const v = Array.from({ length: Math.ceil(span / stepSec) + 2 }, () => r());
  return (t) => v[Math.min(v.length - 1, Math.floor(t / stepSec))];
}
/** Irregular amplitude flicker (in place): random gain 1-depth..1 per step, slightly smoothed. */
function flicker(buf, stepSec, depth, seed) {
  const g = steps(stepSec, buf.length / SR, seed);
  let cur = 1;
  const k = 1 - Math.exp(-1 / (0.002 * SR));
  for (let i = 0; i < buf.length; i++) {
    cur += k * (1 - depth * g(i / SR) - cur);
    buf[i] *= cur;
  }
  return buf;
}

const DEFS = {
  // ------------------------------------------------------------- UI ----
  cursor: {
    peakDb: -9,
    render: () => T({ wave: 'square', duty: 0.25, freq: 1400, to: 1250, dur: 0.012, env: env(0.001, 0.02, 0, 0.012), lp: 5000 }),
  },
  confirm: {
    render: () => layer([[blip('E5', 0.045)], [blip('B5', 0.09, { env: env(0.002, 0.12, 0.3, 0.07) }), 0.05]]),
  },
  cancel: {
    render: () => layer([[blip('E5', 0.04, { duty: 0.5, lp: 3000 })], [blip('A4', 0.08, { duty: 0.5, lp: 3000 }), 0.045]]),
  },
  buzzer: {
    render: () => {
      const buzz = (d) => layer([
        [T({ wave: 'square', freq: 98, dur: d, env: env(0.003, 0.2, 0.9, 0.02), lp: 1800 })],
        [T({ wave: 'square', freq: 104, dur: d, env: env(0.003, 0.2, 0.9, 0.02), lp: 1800 })],
      ]);
      return concat(buzz(0.1), silence(0.03), buzz(0.12));
    },
  },
  dialog_blip: {
    peakDb: -12,
    render: () => layer([
      [T({ wave: 'triangle', freq: 740, dur: 0.018, env: env(0.002, 0.025, 0, 0.012) })],
      [T({ wave: 'square', duty: 0.125, freq: 740, dur: 0.012, env: env(0.002, 0.015, 0, 0.01), lp: 2500, vol: 0.15 })],
    ]),
  },
  save: {
    render: () => echo(layer([[bell('G5', 0.5)], [bell('D6', 0.5), 0.12], [bell('G6', 0.8), 0.24]]), { time: 0.15, feedback: 0.3, mix: 0.3 }),
  },
  party: {
    render: () => layer([[blip('D5', 0.07)], [blip('A5', 0.12, { env: env(0.002, 0.15, 0.4, 0.08) }), 0.08]]),
  },
  coin: {
    render: () => echo(layer([
      [T({ wave: 'square', duty: 0.5, freq: 'E6', dur: 0.06, env: env(0.001, 0.1, 0.8, 0.01), lp: 6000 })],
      [T({ wave: 'square', duty: 0.5, freq: 'B6', dur: 0.05, env: env(0.001, 0.25, 0, 0.2), lp: 6000 }), 0.065],
    ]), { time: 0.07, feedback: 0.25, mix: 0.2 }),
  },

  // --------------------------------------------------------- board ----
  step: {
    peakDb: -15,
    render: () => {
      const grain = (seed, vol) => noise({ freq: 7000, seed, dur: 0.02, env: env(0.003, 0.035, 0, 0.02), lp: 1300, hp: 250, vol });
      return layer([[grain(21, 1)], [grain(42, 0.6), 0.018]]);
    },
  },
  travel: {
    render: () => layer([
      [noise({ dur: 0.35, env: env(0.15, 0.2, 0.8, 0.25), hp: 200, lp: (t) => (t < 0.35 ? 400 + 3600 * (t / 0.35) : 4000 - 3300 * Math.min(1, (t - 0.35) / 0.25)) })],
      [T({ wave: 'square', freq: 150, to: 900, dur: 0.45, env: env(0.2, 0.3, 0.7, 0.15), lp: 1200, vol: 0.15 })],
    ]),
  },
  chest: {
    render: () => {
      const creak = T({ wave: 'saw', freq: 90, dur: 0.2, env: env(0.02, 0.1, 0.8, 0.04), lp: 900, vibrato: { rate: 18, depth: 1.5 }, vol: 0.5 });
      const clunk = T({ wave: 'triangle', freq: 200, to: 80, dur: 0.08, env: env(0.001, 0.08, 0, 0.02) });
      const sparkle = echo(layer(['G5', 'B5', 'D6', 'G6'].map((n, i) => [blip(n, i === 3 ? 0.2 : 0.05), i * 0.055])), { time: 0.08, feedback: 0.3, mix: 0.3 });
      return layer([[creak], [clunk, 0.2], [sparkle, 0.28, 0.8]]);
    },
  },
  trap: {
    render: () => layer([
      [noise({ short: true, freq: 12000, dur: 0.06, env: env(0.0005, 0.08, 0, 0.02), hp: 1500, vol: 0.7 })],
      ...[1400, 1980, 2650].map((f) => [T({ wave: 'square', freq: f, dur: 0.25, env: env(0.001, 0.25, 0, 0.05), lp: 6000, vol: 0.2 })]),
      [T({ wave: 'triangle', freq: 160, to: 60, dur: 0.1, env: env(0.001, 0.1, 0, 0.02), vol: 0.8 })],
    ]),
  },
  encounter: {
    render: () => layer([
      [T({ wave: 'square', duty: 0.25, freq: 110, to: 1760, dur: 0.55, env: env(0.02, 0.5, 1, 0.05), lp: 4000, vibrato: { rate: 25, depth: 0.6 }, vol: 0.45 })],
      [noise({ dur: 0.55, env: env(0.4, 0.2, 1, 0.05), lp: (t) => 300 + 8000 * t, vol: 0.45 })],
      [noise({ dur: 0.25, env: env(0.001, 0.25, 0, 0.05), hp: 1500, lp: 9000, vol: 0.8 }), 0.57],
      [T({ wave: 'triangle', freq: 180, to: 50, dur: 0.15, env: env(0.001, 0.15, 0, 0.03), vol: 0.9 }), 0.57],
    ]),
  },
  escape: {
    render: () => {
      const feet = [0, 0.07, 0.14, 0.21, 0.28].flatMap((t, i) => [
        [noise({ dur: 0.02, env: env(0.001, 0.03, 0, 0.01), lp: 2000, seed: 5 + i, vol: 0.6 }), t],
        [T({ wave: 'triangle', freq: 600 + i * 110, dur: 0.03, env: env(0.001, 0.04, 0, 0.01), vol: 0.6 }), t],
      ]);
      const whoosh = noise({ dur: 0.2, env: env(0.08, 0.2, 0.6, 0.2), hp: 300, lp: (t) => 3500 - 3000 * Math.min(1, t / 0.4), vol: 0.5 });
      return layer([...feet, [whoosh, 0.3]]);
    },
  },

  // -------------------------------------------------------- combat ----
  hit: {
    render: () => layer([
      [noise({ dur: 0.02, env: env(0.001, 0.12, 0, 0.05), lp: (t) => 500 + 5000 * Math.exp(-t * 10) })],
      [T({ wave: 'square', freq: 180, to: 50, slideTime: 0.1, dur: 0.02, env: env(0.001, 0.1, 0, 0.05), lp: 1200, vol: 0.8 })],
    ]),
  },
  crit: {
    render: () => {
      const hit = layer([
        [noise({ dur: 0.03, env: env(0.001, 0.25, 0, 0.08), lp: (t) => 700 + 7000 * Math.exp(-t * 8) })],
        [T({ wave: 'square', freq: 220, to: 40, slideTime: 0.18, dur: 0.05, env: env(0.001, 0.2, 0, 0.08), lp: 1400, vol: 0.9 })],
      ]);
      const clank = noise({ short: true, freq: 9000, dur: 0.02, env: env(0.0005, 0.05, 0, 0.02), hp: 2000, vol: 0.5 });
      return layer([[hit], [clank], [hit, 0.07, 0.6]]);
    },
  },
  miss: {
    render: () => noise({
      dur: 0.12, env: env(0.09, 0.05, 0.8, 0.15), hp: 400, vol: 0.7,
      lp: (t) => (t < 0.1 ? 600 + 29000 * t : Math.max(800, 3500 - 15000 * (t - 0.1))),
    }),
  },
  magic_fire: {
    render: () => layer([
      [noise({ dur: 0.45, env: env(0.05, 0.3, 0.8, 0.3), lp: (t) => 900 + 1800 * Math.sin((Math.PI * t) / 0.8), vol: 0.8 })],
      [crackles(25, 0.7, 101), 0.02],
      [T({ wave: 'saw', freq: 70, to: 55, dur: 0.5, env: env(0.05, 0.3, 0.8, 0.3), lp: 300, vibrato: { rate: 9, depth: 1 }, vol: 0.5 })],
    ]),
  },
  magic_ice: {
    render: () => {
      const notes = ['E6', 'B6', 'G#6', 'E7', 'B6', 'E7', 'G#7'];
      const tinkle = layer(notes.map((n, i) => [layer([
        [T({ wave: 'triangle', freq: n, dur: 0.02, env: env(0.001, 0.15, 0, 0.05), vol: 0.6 })],
        [T({ wave: 'square', duty: 0.125, freq: n, dur: 0.02, env: env(0.001, 0.08, 0, 0.03), lp: 6000, vol: 0.15 })],
      ]), i * 0.06]));
      const shing = noise({ short: true, freq: 15000, dur: 0.1, env: env(0.08, 0.4, 0, 0.1), hp: 5000, vol: 0.2 });
      return layer([[echo(tinkle, { time: 0.09, feedback: 0.4, mix: 0.35 })], [shing]]);
    },
  },
  magic_thunder: {
    render: () => {
      const crack = (vol, seed) => noise({ dur: 0.02, env: env(0.0005, 0.08, 0, 0.03), hp: 800, vol, seed });
      const rumble = noise({ freq: 3000, dur: 0.05, env: env(0.02, 0.9, 0, 0.1), lp: 400, seed: 77 });
      return layer([
        [T({ wave: 'square', freq: 1800, to: 80, slideTime: 0.15, dur: 0.15, env: env(0.001, 0.2, 0.5, 0.03), lp: 5000, vol: 0.5 })],
        [crack(1, 3), 0.02],
        [rumble, 0.05, 1.2],
        [crack(0.6, 8), 0.15],
      ]);
    },
  },
  heal: {
    render: () => {
      const notes = ['C6', 'E6', 'G6', 'C7', 'E7', 'G7'];
      const run = layer(notes.map((n, i) => [layer([
        [T({ wave: 'triangle', freq: n, dur: 0.05, env: env(0.002, 0.2, 0, 0.08), vol: 0.7 })],
        [T({ wave: 'square', duty: 0.125, freq: n, dur: 0.04, env: env(0.002, 0.12, 0, 0.05), lp: 5000, vol: 0.2 })],
      ]), i * 0.07]));
      return echo(run, { time: 0.11, feedback: 0.35, mix: 0.35 });
    },
  },
  status: {
    render: () => layer([
      [T({ wave: 'square', freq: 520, to: 260, dur: 0.5, env: env(0.01, 0.1, 0.8, 0.1), lp: 2200, vibrato: { rate: 9, depth: 1.2 } })],
      [T({ wave: 'triangle', freq: 551, to: 276, dur: 0.5, env: env(0.01, 0.1, 0.8, 0.1), vibrato: { rate: 7, depth: 1.2 }, vol: 0.5 })],
    ]),
  },
  ko: {
    render: () => T({
      wave: 'square', duty: 0.25, freq: 880, to: 110, dur: 0.7, env: env(0.005, 0.7, 0.5, 0.15),
      lp: (t) => Math.max(600, 3000 - 2500 * t), vibrato: { rate: 7, depth: 0.3 },
    }),
  },
  freeze: {
    render: () => layer([
      [noise({ dur: 0.02, env: env(0.0005, 0.03, 0, 0.01), hp: 2500 })],
      [crackles(8, 0.25, 202, { hp: 3000, vol: 0.7 })],
      [noise({ short: true, freq: 16000, dur: 0.05, env: env(0.01, 0.3, 0, 0.05), hp: 4000, vol: 0.3 })],
      [T({ wave: 'triangle', freq: 'B6', dur: 0.03, env: env(0.001, 0.15, 0, 0.05), vol: 0.4 }), 0.1],
      [T({ wave: 'triangle', freq: 'F#6', dur: 0.03, env: env(0.001, 0.2, 0, 0.05), vol: 0.4 }), 0.2],
    ]),
  },
  burn: {
    render: () => layer([
      [noise({ dur: 0.1, env: env(0.05, 0.4, 0, 0.1), lp: (t) => (t < 0.15 ? 800 + 11000 * t : Math.max(1000, 2450 - 3000 * (t - 0.15))), vol: 0.9 })],
      [crackles(12, 0.45, 303, { vol: 0.4 }), 0.03],
      [T({ wave: 'saw', freq: 60, dur: 0.3, env: env(0.04, 0.2, 0.5, 0.15), lp: 250, vol: 0.4 })],
    ]),
  },

  // ------------------------------------------------------ field / map ----
  // Electric crackle (lightning striking the board): jittery buzzing arc,
  // metallic short-LFSR fizz and dense crackles, all flickering (~0.5 s).
  zap: {
    render: () => {
      const jit = steps(0.012, 0.5, 404);
      const arc = T({
        wave: 'saw', freqFn: (t) => 90 + 520 * jit(t), dur: 0.36, env: env(0.002, 0.42, 0, 0.06), hp: 250, lp: 5000, vol: 0.5,
      });
      const fizz = noise({ short: true, freq: 15000, dur: 0.34, env: env(0.001, 0.42, 0, 0.06), hp: 2500, vol: 0.45, seed: 61 });
      const snap = noise({ dur: 0.012, env: env(0.0005, 0.03, 0, 0.01), hp: 1200, seed: 62 });
      return layer([
        [flicker(layer([[arc], [fizz]]), 0.018, 0.5, 405)],
        [crackles(30, 0.42, 406, { hp: 1800, vol: 0.9 })],
        [snap],
        [snap, 0.13, 0.6],
      ]);
    },
  },
  // Heavy stone / metal gate sliding: grinding low rumble with irregular
  // stutter, a scraping metallic band, and a clunk as it stops (~0.6 s).
  gate: {
    render: () => {
      const grind = flicker(
        noise({ freq: 5000, dur: 0.46, env: env(0.04, 0.3, 0.9, 0.06), lp: 420, hp: 40, seed: 81 }),
        0.03, 0.55, 82,
      );
      const rumble = T({ wave: 'saw', freq: 48, to: 42, dur: 0.46, env: env(0.04, 0.3, 0.9, 0.06), lp: 220, vibrato: { rate: 23, depth: 1.2 }, vol: 0.55 });
      const scrape = noise({ short: true, freq: 7000, dur: 0.42, env: env(0.06, 0.3, 0.7, 0.06), hp: 900, lp: (t) => 1900 + 900 * Math.sin(t * 17), vol: 0.13, seed: 83 });
      const clunk = layer([
        [T({ wave: 'triangle', freq: 130, to: 45, dur: 0.12, env: env(0.001, 0.14, 0, 0.03), vol: 1 })],
        [noise({ dur: 0.03, env: env(0.0005, 0.05, 0, 0.02), lp: 1500, vol: 0.6, seed: 84 })],
        [T({ wave: 'square', duty: 0.5, freq: 740, dur: 0.02, env: env(0.001, 0.12, 0, 0.04), lp: 3000, vol: 0.08 })],
      ]);
      return layer([[grind], [rumble], [scrape], [clunk, 0.48]]);
    },
  },
  // Water splash: low plop, a falling spray of filtered noise, then a few
  // rising droplet bloops (~0.4 s).
  splash: {
    render: () => {
      const r = rng(91);
      const drops = [0.12, 0.17, 0.23, 0.3].map((at, i) => {
        const f = 700 + r() * 900;
        return [T({ wave: 'sine', freq: f, to: f * 1.9, slideTime: 0.04, dur: 0.03, env: env(0.002, 0.05, 0, 0.02), vol: 0.3 - i * 0.05 }), at];
      });
      return layer([
        [T({ wave: 'sine', freq: 190, to: 70, slideTime: 0.08, dur: 0.08, env: env(0.002, 0.1, 0, 0.02), vol: 0.7 })],
        [noise({ dur: 0.06, env: env(0.004, 0.3, 0, 0.06), hp: 400, lp: (t) => 800 + 6000 * Math.exp(-t * 9), vol: 0.9, seed: 92 }), 0.01],
        [crackles(14, 0.25, 93, { hp: 2500, vol: 0.35 }), 0.03],
        ...drops,
      ]);
    },
  },
  // Magical plant growth: a rustle of leaves that swells upward, a rising
  // shimmer sweep and a quick pentatonic sparkle run (~0.5 s).
  grow: {
    render: () => {
      const rustle = flicker(
        noise({ freq: 12000, dur: 0.36, env: env(0.08, 0.3, 0.7, 0.08), hp: 700, lp: (t) => 1500 + 5000 * (t / 0.45), vol: 0.6, seed: 95 }),
        0.02, 0.6, 96,
      );
      const sweep = T({ wave: 'triangle', freq: 330, to: 1320, dur: 0.38, env: env(0.05, 0.3, 0.7, 0.08), vibrato: { rate: 14, depth: 0.25 }, vol: 0.25 });
      const run = layer(['G5', 'A5', 'C6', 'D6', 'E6', 'G6'].map((n, i) => [
        T({ wave: 'triangle', freq: n, dur: 0.03, env: env(0.002, 0.12, 0, 0.04), vol: 0.35 }), 0.08 + i * 0.045,
      ]));
      return layer([[rustle], [sweep], [echo(run, { time: 0.06, feedback: 0.3, mix: 0.3 })]]);
    },
  },
  // Sword slash through bushes: fast rising-then-falling swish, a thin blade
  // ring and a spray of snapping twigs / leaves (~0.3 s).
  cut: {
    render: () => layer([
      [noise({
        dur: 0.08, env: env(0.03, 0.08, 0.6, 0.08), hp: 600, vol: 0.8,
        lp: (t) => (t < 0.05 ? 1200 + 120000 * t : Math.max(1000, 7200 - 30000 * (t - 0.05))),
      })],
      [noise({ short: true, freq: 18000, dur: 0.03, env: env(0.003, 0.08, 0, 0.03), hp: 5000, vol: 0.15, seed: 97 }), 0.03],
      [crackles(16, 0.14, 98, { hp: 1500, vol: 0.7 }), 0.05],
      [flicker(noise({ freq: 9000, dur: 0.16, env: env(0.005, 0.1, 0.5, 0.07), hp: 900, lp: (t) => 4500 - 9000 * Math.min(t, 0.25), vol: 0.5, seed: 99 }), 0.012, 0.7, 100), 0.06],
    ]),
  },
  // Big wet swallow: squelchy onset, a gurgling throat slide down, the
  // "gulp" plop and one little bubble after it (~0.5 s).
  gulp: {
    render: () => layer([
      [noise({ dur: 0.04, env: env(0.005, 0.06, 0, 0.02), hp: 200, lp: 1100, vol: 0.5, seed: 111 })],
      [crackles(8, 0.12, 112, { hp: 600, vol: 0.45 })],
      [T({ wave: 'saw', freq: 120, to: 62, dur: 0.22, env: env(0.02, 0.2, 0.7, 0.05), lp: 520, vibrato: { rate: 28, depth: 1.8 }, vol: 0.55 }), 0.03],
      [T({ wave: 'sine', freq: 340, to: 105, slideTime: 0.06, dur: 0.07, env: env(0.002, 0.1, 0, 0.03), vol: 1 }), 0.27],
      [noise({ dur: 0.03, env: env(0.002, 0.05, 0, 0.02), lp: 700, vol: 0.4, seed: 113 }), 0.27],
      [T({ wave: 'sine', freq: 260, to: 620, slideTime: 0.05, dur: 0.04, env: env(0.002, 0.06, 0, 0.02), vol: 0.3 }), 0.4],
    ]),
  },
  // Wet spit-out and splat: a lip "p" pop, a spray of bright noise, then a
  // low wet splat with droplet crackles (~0.4 s).
  spit: {
    render: () => layer([
      [T({ wave: 'sine', freq: 420, to: 180, slideTime: 0.02, dur: 0.015, env: env(0.001, 0.03, 0, 0.01), vol: 0.6 })],
      [noise({ dur: 0.08, env: env(0.004, 0.12, 0, 0.04), hp: 1200, lp: (t) => 6500 - 30000 * Math.min(t, 0.15), vol: 0.7, seed: 121 }), 0.01],
      [crackles(10, 0.1, 122, { hp: 2500, vol: 0.4 }), 0.02],
      [noise({ dur: 0.04, env: env(0.002, 0.12, 0, 0.04), lp: 900, vol: 0.9, seed: 123 }), 0.2],
      [T({ wave: 'sine', freq: 170, to: 60, slideTime: 0.05, dur: 0.05, env: env(0.001, 0.08, 0, 0.03), vol: 0.8 }), 0.2],
      [crackles(12, 0.15, 124, { hp: 1500, vol: 0.5 }), 0.21],
    ]),
  },

  // ------------------------------------------------------- jingles ----
  // C major arpeggio up to a held E6 (~1.2 s).
  levelup: {
    render: () => jingle({
      name: 'levelup', bpm: 200, bars: 1, tail: 0.6,
      channels: [
        { name: 'lead', inst: { ...INST.lead, vol: 0.45, lp: 4500 }, pattern: 'C5 E5 G5 C6 - G5 C6 E6 - - - - - - . .' },
        { name: 'harm', inst: { ...INST.arp, vol: 0.25 }, pattern: 'G4 C5 E5 G5 - E5 G5 C6 - - - - - - . .' },
        { name: 'bass', inst: INST.bass, pattern: 'C3 - - - - - - - C4 - - - - - . .' },
      ],
    }),
  },
  // C major fanfare: I - (IV V) - I, ~3 s.
  victory: {
    render: () => jingle({
      name: 'victory', bpm: 160, bars: 2, tail: 0.6,
      channels: [
        { name: 'lead', inst: { ...INST.lead, vol: 0.45, lp: 4000 }, pattern: 'C5 . C5 E5 G5 - E5 G5 | A5 - - B5 C6 - - .' },
        { name: 'harm', inst: { ...INST.lead, duty: 0.125, vol: 0.25, lp: 3000 }, pattern: 'G4 . G4 C5 E5 - C5 E5 | F5 - - G5 E5 - - .' },
        { name: 'bass', inst: INST.bass, pattern: 'C3 - G2 - C3 - G2 - | F2 - - G2 C3 - - .' },
        { name: 'drums', kit: { S: HITS.snare, K: HITS.kick, C: HITS.crash }, gain: 0.6, pattern: 'K . s s S . s S | C . . . K . . .' },
      ],
    }),
  },
  // A minor lament: Am  Dm/F  Am/E  E  -> Am, ~3 s.
  defeat: {
    render: () => jingle({
      name: 'defeat', bpm: 132, bars: 2, tail: 0.8,
      channels: [
        { name: 'lead', inst: { ...INST.leadSoft, vol: 0.45 }, pattern: 'E5 - D5 - C5 - B4 - | A4 - - - - - . .' },
        { name: 'harm', inst: { ...INST.flute, vol: 0.4 }, pattern: 'C5 - A4 - A4 - G#4 - | E4 - - - - - . .' },
        { name: 'bass', inst: INST.bass, pattern: 'A2 - F2 - E2 - E2 - | A2 - - - - - . .' },
      ],
    }),
  },
  // Inn rest lullaby, F major 3/4: F | Bb C | F. Music-box celesta falls
  // C6-A5-F5, D6-Bb5-G5-E5 and settles on a held F5 (E->F leading tone),
  // over harp arpeggios, a soft glass pad and a plucked bass. Harp and pad
  // rings are faded out smoothly so it ends in silence (~3.3 s).
  sleep: {
    peakDb: -6,
    render: () => {
      const chords = 'F | Bb C | F';
      const pad = { ...ACOUSTIC.glassPad, vol: 0.12, env: { a: 0.35, d: 0.6, s: 0.85, r: 0.9 } };
      const buf = jingle({
        name: 'sleep', bpm: 200, beatsPerBar: 3, bars: 3, tail: 0.75,
        channels: [
          { name: 'melody', inst: { ...ACOUSTIC.celesta, vol: 0.5 }, echo: { time: 0.3, feedback: 0.25, mix: 0.22, lp: 2500 },
            pattern: 'C6 - A5 - F5 - | D6 - Bb5 - G5 E5 | F5 - - - - -' },
          { name: 'harp', inst: { ...ACOUSTIC.harp, vol: 0.3 }, pattern: chordPattern(chords, '1 5 8 10 8 5 | 1 5 8 1 5 8 | 1 5 8 10 - -', 'F3') },
          ...['1', '3', '5'].map((deg) => ({
            name: `pad${deg}`, inst: pad,
            pattern: chordPattern(chords, '1 - - - - - | 1 - - 1 - - | 1 - - - - -'.replace(/1/g, deg), 'C4', { tie: true }),
          })),
          { name: 'bass', inst: { ...ACOUSTIC.pluckBass, vol: 0.4 }, pattern: 'F2 - - - - - | Bb2 - - C3 - - | F2 - - - - -' },
          { name: 'bell', inst: { ...ACOUSTIC.bells, vol: 0.12 }, pattern: '. . . . . . | . . . . . . | F6 - - - - -' },
        ],
      });
      // Smooth (raised-cosine) fade over the last 0.8 s instead of a hard cut.
      const fo = Math.round(0.8 * SR);
      for (let i = 0; i < fo; i++) buf[buf.length - fo + i] *= 0.5 + 0.5 * Math.cos((Math.PI * i) / fo);
      return buf;
    },
  },
};

/** All SFX, written to public/assets/audio/sfx/<name>.wav */
export const SFX = Object.entries(DEFS).map(([name, d]) => ({ name, peakDb: d.peakDb ?? -3, render: d.render }));
