// Shared instruments (tone presets for the sequencer) and drum kits.
// An instrument is a set of `tone()` options without freq/dur, plus
// `gate` (fraction of the step length the note is held, <1 = detached).
import { tone, layer } from './synth.mjs';
import { pluckString, additive, breathFlute, ensemble } from './voices.mjs';

export const INST = {
  // Main melody: 25% pulse, soft low-pass, delayed vibrato.
  lead: {
    wave: 'square', duty: 0.25, lp: 3200, gate: 0.92, vol: 0.42,
    env: { a: 0.008, d: 0.25, s: 0.6, r: 0.08 },
    vibrato: { rate: 5.5, depth: 0.18, delay: 0.2 },
  },
  // Rounder 50% pulse, darker, slower attack (calm tunes).
  leadSoft: {
    wave: 'square', duty: 0.5, lp: 1700, gate: 0.95, vol: 0.4,
    env: { a: 0.02, d: 0.4, s: 0.55, r: 0.2 },
    vibrato: { rate: 5, depth: 0.15, delay: 0.25 },
  },
  // Thin 12.5% pulse for fast arpeggios, kept quiet.
  arp: {
    wave: 'square', duty: 0.125, lp: 2400, gate: 0.85, vol: 0.2,
    env: { a: 0.003, d: 0.12, s: 0.25, r: 0.04 },
  },
  // Plucked oud-like pulse: filter closes quickly after the attack.
  pluck: {
    wave: 'square', duty: 0.25, gate: 0.9, vol: 0.42,
    lp: (t) => 700 + 2600 * Math.exp(-t * 18),
    env: { a: 0.002, d: 0.22, s: 0, r: 0.05 },
  },
  // Sustained dark pad (boss).
  pad: {
    wave: 'square', duty: 0.5, lp: 1100, gate: 0.97, vol: 0.2,
    env: { a: 0.06, d: 0.4, s: 0.7, r: 0.15 },
  },
  // NES-style triangle bass.
  bass: {
    wave: 'triangle', gate: 0.9, vol: 0.6,
    env: { a: 0.004, d: 0.1, s: 0.85, r: 0.03 },
  },
  // Punchier bass for battles: short decay.
  bassDrive: {
    wave: 'triangle', gate: 0.8, vol: 0.65,
    env: { a: 0.003, d: 0.12, s: 0.6, r: 0.03 },
  },
  // Triangle lead (jingles).
  flute: {
    wave: 'triangle', gate: 0.95, vol: 0.6,
    env: { a: 0.01, d: 0.3, s: 0.7, r: 0.15 },
    vibrato: { rate: 5, depth: 0.2, delay: 0.15 },
  },
};

// ------------------------------------------------ acoustic-ish voices ----
// These use voices.mjs (Karplus-Strong, additive, breath noise, chorus).
export const ACOUSTIC = {
  // Concert harp: Karplus-Strong, warm pluck, rings freely.
  harp: { voice: pluckString, t60: 2.2, bright: 0.45, pos: 0.22, lp: 3800, vol: 0.5 },
  // Celesta: nearly pure fundamental + quiet inharmonic "bar" partials, fast upper decay.
  celesta: {
    voice: additive, t60: 1.6, vol: 0.55, gate: 0.95,
    partials: [[1, 1, 1], [2, 0.1, 0.45], [3.02, 0.035, 0.3], [4.17, 0.06, 0.15], [5.4, 0.03, 0.06]],
    env: { a: 0.003, r: 0.35 }, hammer: 0.08,
  },
  // Soft felt piano: stretched harmonics, 2-string unison detune, damper release.
  piano: {
    voice: additive, t60: 3.2, t60Exp: 0.5, vol: 0.28, gate: 0.97, inharm: 0.0004, strings: [0, 1.2],
    partials: [[1, 1, 1], [2, 0.45, 0.6], [3, 0.2, 0.45], [4, 0.1, 0.35], [5, 0.05, 0.28], [6, 0.03, 0.22]],
    env: { a: 0.004, r: 0.3 }, hammer: 0.05,
  },
  // Ney-like breathy flute with slow vibrato; use "~note" in patterns for slides.
  ney: { voice: breathFlute, breath: 0.32, harmonics: [0.18, 0.05], lp: 2600, vol: 0.5, gate: 0.97, vibrato: { rate: 4.6, depth: 0.28, delay: 0.35 } },
  // Light string section: 4 detuned saws, low-passed, slow swell.
  strings: {
    voice: ensemble, wave: 'saw', voices: 4, detune: 14, lp: 1700, vol: 0.12, gate: 1,
    drift: { rate: 0.3, depth: 4 }, env: { a: 0.45, d: 0.6, s: 0.85, r: 0.7 },
  },
  // Heat-haze pad: detuned triangles with slow, deep pitch wander.
  hazePad: {
    voice: ensemble, wave: 'triangle', voices: 3, detune: 18, lp: 1300, vol: 0.24, gate: 1,
    drift: { rate: 0.18, depth: 10 }, env: { a: 1.2, d: 0.8, s: 0.9, r: 1.4 },
  },
};

// ------------------------------------------------------------ drum hits ----
// Each hit is (sr) => Float32Array. Noise `freq` is the LFSR clock rate.
const noise = (o) => tone({ wave: 'noise', freq: 22050, env: { a: 0.001, d: 0.1, s: 0, r: 0.01 }, dur: 0.1, ...o });

export const HITS = {
  kick: (sr) =>
    layer([
      [tone({ sr, wave: 'triangle', freq: 150, to: 45, slideTime: 0.09, dur: 0.16, env: { a: 0.001, d: 0.16, s: 0, r: 0.02 } })],
      [noise({ sr, lp: 2500, dur: 0.01, env: { a: 0.0005, d: 0.01, s: 0, r: 0.005 }, vol: 0.3 })],
    ], sr),
  snare: (sr) =>
    layer([
      [noise({ sr, hp: 900, lp: 7000, dur: 0.13, env: { a: 0.001, d: 0.13, s: 0, r: 0.02 }, vol: 0.55, seed: 7 })],
      [tone({ sr, wave: 'triangle', freq: 210, to: 150, dur: 0.08, env: { a: 0.001, d: 0.08, s: 0, r: 0.01 }, vol: 0.5 })],
    ], sr),
  hat: (sr) => noise({ sr, hp: 6500, lp: 10000, dur: 0.035, env: { a: 0.0005, d: 0.035, s: 0, r: 0.01 }, vol: 0.4, seed: 3 }),
  openHat: (sr) => noise({ sr, hp: 5500, lp: 10000, dur: 0.18, env: { a: 0.001, d: 0.18, s: 0, r: 0.03 }, vol: 0.3, seed: 5 }),
  crash: (sr) => noise({ sr, hp: 2500, lp: 9000, dur: 0.9, env: { a: 0.001, d: 0.9, s: 0, r: 0.1 }, vol: 0.4, seed: 11 }),
  shaker: (sr) => noise({ sr, hp: 5000, lp: 9500, dur: 0.07, env: { a: 0.018, d: 0.05, s: 0, r: 0.02 }, vol: 0.3, seed: 13 }),
  // Hand drums (darbuka / riq flavored)
  doum: (sr) =>
    layer([
      [tone({ sr, wave: 'sine', freq: 125, to: 85, slideTime: 0.07, dur: 0.3, env: { a: 0.002, d: 0.3, s: 0, r: 0.05 } })],
      [noise({ sr, lp: 600, dur: 0.04, env: { a: 0.001, d: 0.04, s: 0, r: 0.01 }, vol: 0.25 })],
    ], sr),
  tek: (sr) =>
    layer([
      [noise({ sr, hp: 2500, lp: 8000, dur: 0.035, env: { a: 0.0005, d: 0.035, s: 0, r: 0.01 }, vol: 0.5, seed: 9 })],
      [tone({ sr, wave: 'triangle', freq: 720, dur: 0.03, env: { a: 0.0005, d: 0.03, s: 0, r: 0.01 }, vol: 0.3 })],
    ], sr),
  tom: (sr) => tone({ sr, wave: 'triangle', freq: 190, to: 100, dur: 0.2, env: { a: 0.001, d: 0.2, s: 0, r: 0.03 }, vol: 0.8 }),
};

// Soft hand percussion (frame drum, doumbek, shaker, finger cymbal).
export const SOFT_HITS = {
  frameDoum: (sr) =>
    layer([
      [tone({ sr, wave: 'sine', freq: 92, to: 70, slideTime: 0.12, dur: 0.55, env: { a: 0.004, d: 0.55, s: 0, r: 0.08 } })],
      [tone({ sr, wave: 'sine', freq: 176, to: 150, dur: 0.12, env: { a: 0.003, d: 0.12, s: 0, r: 0.03 }, vol: 0.25 })],
      [noise({ sr, lp: 280, dur: 0.1, env: { a: 0.003, d: 0.1, s: 0, r: 0.02 }, vol: 0.35, seed: 31 })],
    ], sr),
  doumbekTek: (sr) =>
    layer([
      [noise({ sr, hp: 1800, lp: 4500, dur: 0.05, env: { a: 0.001, d: 0.05, s: 0, r: 0.01 }, vol: 0.4, seed: 33 })],
      [tone({ sr, wave: 'sine', freq: 560, to: 530, dur: 0.09, env: { a: 0.001, d: 0.09, s: 0, r: 0.02 }, vol: 0.3 })],
    ], sr),
  doumbekKa: (sr) =>
    layer([
      [noise({ sr, hp: 1200, lp: 3500, dur: 0.035, env: { a: 0.002, d: 0.035, s: 0, r: 0.01 }, vol: 0.3, seed: 35 })],
      [tone({ sr, wave: 'sine', freq: 430, dur: 0.05, env: { a: 0.002, d: 0.05, s: 0, r: 0.01 }, vol: 0.15 })],
    ], sr),
  softShaker: (sr) => noise({ sr, hp: 3500, lp: 7500, dur: 0.1, env: { a: 0.035, d: 0.07, s: 0, r: 0.03 }, vol: 0.2, seed: 37 }),
  // Finger cymbal: two inharmonic partials, long gentle ring, low level.
  zill: (sr) =>
    layer([
      [tone({ sr, wave: 'sine', freq: 2640, dur: 1.2, env: { a: 0.002, d: 1.2, s: 0, r: 0.1 }, vol: 0.24 })],
      [tone({ sr, wave: 'sine', freq: 3910, dur: 0.6, env: { a: 0.002, d: 0.6, s: 0, r: 0.1 }, vol: 0.12 })],
    ], sr),
};

/** Standard kit letters. Lowercase = same hit, softer. */
export const KIT = {
  K: HITS.kick, S: HITS.snare, H: HITS.hat, O: HITS.openHat, C: HITS.crash,
  X: HITS.shaker, D: HITS.doum, T: HITS.tek, M: HITS.tom,
};

/** Soft hand-drum kit: D frame-drum doum, T doumbek tek, K ka, X shaker, Z finger cymbal. */
export const SOFT_KIT = {
  D: SOFT_HITS.frameDoum, T: SOFT_HITS.doumbekTek, K: SOFT_HITS.doumbekKa,
  X: SOFT_HITS.softShaker, Z: SOFT_HITS.zill,
};
