// Shared instruments (tone presets for the sequencer) and drum kits.
// An instrument is a set of `tone()` options without freq/dur, plus
// `gate` (fraction of the step length the note is held, <1 = detached).
import { tone, layer } from './synth.mjs';
import { pluckString, additive, breathFlute, ensemble, reed, gullCry } from './voices.mjs';

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
  // Accordion / fiddle-ish squeezebox: three detuned reeds (musette), bellows vibrato.
  accordion: {
    voice: reed, reeds: [-8, 0, 7], sawMix: 0.45, duty: 0.3, lp: 2600, gate: 0.9, vol: 0.34,
    env: { a: 0.025, d: 0.3, s: 0.75, r: 0.09 },
    vibrato: { rate: 5.8, depth: 0.14, delay: 0.18 },
  },
  // Accordion chord "pah" (left-hand buttons): short, darker, quiet.
  accordionChord: {
    voice: reed, reeds: [-6, 6], sawMix: 0.2, duty: 0.4, lp: 1500, gate: 0.55, vol: 0.45,
    env: { a: 0.01, d: 0.15, s: 0.5, r: 0.06 },
  },
  // Distant seagull: rise-and-fall triangle swoop.
  gull: { voice: gullCry, rise: 1.14, fall: 0.68, lp: 3200, gate: 1, vol: 0.22, vibrato: { rate: 9, depth: 0.2, delay: 0.05 } },
  // Airy concert flute: less breath and darker than the ney, gentle vibrato.
  flute: { voice: breathFlute, breath: 0.18, harmonics: [0.12, 0.03], lp: 3000, vol: 0.22, gate: 0.96, vibrato: { rate: 5.2, depth: 0.16, delay: 0.3 } },
  // Pizzicato strings: short, bright Karplus-Strong pluck, muted after the note.
  pizz: { voice: pluckString, t60: 0.9, bright: 0.55, pos: 0.2, damp: true, lp: 3200, gate: 0.8, vol: 0.32 },
  // Plucked upright bass for calm tunes: rings, dark.
  pluckBass: { voice: pluckString, t60: 2.4, bright: 0.25, pos: 0.3, lp: 900, vol: 0.62 },
  // Glass bells: inharmonic partials, long ring (chimes).
  bells: {
    voice: additive, t60: 3.4, vol: 0.3, gate: 1,
    partials: [[1, 1, 1], [2.76, 0.35, 0.55], [5.4, 0.16, 0.3], [8.93, 0.07, 0.18]],
    env: { a: 0.002, r: 1.2 }, hammer: 0.03,
  },
  // Soft airy pad: detuned triangles, very little drift, slow swell.
  glassPad: {
    voice: ensemble, wave: 'triangle', voices: 3, detune: 9, lp: 1500, vol: 0.14, gate: 1,
    drift: { rate: 0.12, depth: 3 }, env: { a: 1.4, d: 0.8, s: 0.9, r: 1.6 },
  },
  // Muted, dull pluck (palm-muted lute): dark and short.
  mutedPluck: { voice: pluckString, t60: 1.3, bright: 0.2, pos: 0.12, damp: true, lp: 1400, gate: 0.6, vol: 1 },
  // Ghostly distant flute: breathier, darker.
  ghostFlute: { voice: breathFlute, breath: 0.45, harmonics: [0.08, 0.02], lp: 1600, vol: 0.2, gate: 0.97, vibrato: { rate: 3.8, depth: 0.22, delay: 0.5 } },
  // Dissonant swell: detuned saws, slow attack and release, wavering.
  swell: {
    voice: ensemble, wave: 'saw', voices: 4, detune: 22, lp: 1100, vol: 0.22, gate: 1,
    drift: { rate: 0.25, depth: 9 }, env: { a: 1.6, d: 0.2, s: 1, r: 1.6 },
  },
  // Shakuhachi: very breathy, dark bamboo flute with a late, slow, deep vibrato.
  shakuhachi: {
    voice: breathFlute, breath: 0.55, harmonics: [0.1, 0.04], lp: 2000, vol: 0.3, gate: 0.97,
    env: { a: 0.16, d: 0.5, s: 0.8, r: 0.35 }, vibrato: { rate: 4.2, depth: 0.32, delay: 0.7 },
  },
  // Koto / guzheng: bright, twangy Karplus-Strong pluck near the bridge.
  koto: { voice: pluckString, t60: 1.6, bright: 0.75, pos: 0.09, lp: 4200, vol: 0.34 },
  // Low temple bell (bonsho): hum an octave below, minor-third strike tone,
  // inharmonic upper partials, slow beating from a two-"string" detune. Long ring.
  templeBell: {
    voice: additive, t60: 7, vol: 0.3, gate: 1, strings: [0, 2.6],
    partials: [[0.5, 0.7, 1.4], [1, 1, 1], [1.19, 0.35, 0.7], [1.56, 0.3, 0.55], [2, 0.22, 0.45], [2.74, 0.12, 0.3], [3.83, 0.06, 0.2]],
    env: { a: 0.004, r: 1.2 }, hammer: 0.12,
  },
  // Oud: nasal, bright-ish pluck, medium ring.
  oud: { voice: pluckString, t60: 1.2, bright: 0.65, pos: 0.13, lp: 3200, vol: 0.4 },
  // Muted oud ostinato: palm-damped at the end of each note.
  oudMuted: { voice: pluckString, t60: 1.0, bright: 0.5, pos: 0.13, damp: true, lp: 2200, gate: 0.85, vol: 0.3 },
  // Reverberant desert pad: slowly drifting detuned triangles.
  miragePad: {
    voice: ensemble, wave: 'triangle', voices: 3, detune: 12, lp: 1400, vol: 0.13, gate: 1,
    drift: { rate: 0.2, depth: 6 }, env: { a: 1.1, d: 0.8, s: 0.9, r: 1.5 },
  },
  // Steel drum: bright harmonic partials, quick decay, slight two-note shimmer.
  steelPan: {
    voice: additive, t60: 1.1, vol: 0.4, gate: 1, strings: [0, 5],
    partials: [[1, 1, 1], [2, 0.55, 0.7], [3, 0.18, 0.5], [4, 0.22, 0.35], [5.03, 0.05, 0.25]],
    env: { a: 0.004, r: 0.25 }, hammer: 0.05,
  },
  // Marimba: fundamental plus the tuned 4th and 10th bar partials, woody mallet.
  marimba: {
    voice: additive, t60: 0.8, vol: 0.42, gate: 1,
    partials: [[1, 1, 1], [3.98, 0.3, 0.25], [9.9, 0.08, 0.1]],
    env: { a: 0.002, r: 0.12 }, hammer: 0.08,
  },
  // Choir-like pad ("aah"): five detuned saws through a vowel-ish low-pass, quick swell so it also works as a hit.
  choir: {
    voice: ensemble, wave: 'saw', voices: 5, detune: 16, lp: 1500, vol: 0.15, gate: 1,
    drift: { rate: 0.3, depth: 5 }, env: { a: 0.035, d: 0.45, s: 0.6, r: 0.35 },
  },
  // Eerie high tone: pure sine with slow, wide vibrato and slow swell (theremin-ish).
  eerie: {
    wave: 'sine', gate: 1, vol: 0.13, lp: 3000,
    env: { a: 0.7, d: 0.4, s: 0.85, r: 1.2 }, vibrato: { rate: 5.2, depth: 0.35, delay: 0.4 }, glideTime: 0.35,
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

// Shanty percussion (barrel drum, tambourine, hand claps).
export const SHANTY_HITS = {
  // Dull wooden barrel thump.
  barrel: (sr) =>
    layer([
      [tone({ sr, wave: 'sine', freq: 115, to: 72, slideTime: 0.08, dur: 0.22, env: { a: 0.002, d: 0.22, s: 0, r: 0.04 }, vol: 0.9 })],
      [noise({ sr, lp: 900, dur: 0.03, env: { a: 0.001, d: 0.03, s: 0, r: 0.01 }, vol: 0.25, seed: 41 })],
    ], sr),
  // Tambourine: bright noise hiss plus metallic short-LFSR jingles.
  tambourine: (sr) =>
    layer([
      [noise({ sr, hp: 6000, lp: 11000, dur: 0.1, env: { a: 0.002, d: 0.1, s: 0, r: 0.03 }, vol: 0.25, seed: 43 })],
      [tone({ sr, wave: 'noise', short: true, freq: 15000, hp: 4500, lp: 9500, dur: 0.14, env: { a: 0.002, d: 0.14, s: 0, r: 0.03 }, vol: 0.16, seed: 45 })],
    ], sr),
  // Hand clap: three quick band-passed bursts and a short tail.
  clap: (sr) =>
    layer([
      [noise({ sr, hp: 900, lp: 3200, dur: 0.012, env: { a: 0.0005, d: 0.012, s: 0, r: 0.002 }, vol: 0.35, seed: 47 }), 0],
      [noise({ sr, hp: 900, lp: 3200, dur: 0.012, env: { a: 0.0005, d: 0.012, s: 0, r: 0.002 }, vol: 0.35, seed: 48 }), 0.011],
      [noise({ sr, hp: 900, lp: 3200, dur: 0.09, env: { a: 0.0005, d: 0.09, s: 0, r: 0.02 }, vol: 0.4, seed: 49 }), 0.022],
    ], sr),
};

/** Shanty kit: B barrel thump, J tambourine, C clap, X soft shaker. */
export const SHANTY_KIT = {
  B: SHANTY_HITS.barrel, J: SHANTY_HITS.tambourine, C: SHANTY_HITS.clap, X: SOFT_HITS.softShaker,
};

// Eerie, distant percussion (ruins): clock-like ticks, bone rattles, far thuds.
export const RUIN_HITS = {
  // Dry tick: tiny high click.
  tick: (sr) =>
    layer([
      [tone({ sr, wave: 'sine', freq: 2100, dur: 0.012, env: { a: 0.0005, d: 0.012, s: 0, r: 0.004 }, vol: 0.3 })],
      [noise({ sr, hp: 3000, lp: 7000, dur: 0.006, env: { a: 0.0003, d: 0.006, s: 0, r: 0.002 }, vol: 0.3, seed: 51 })],
    ], sr),
  // Bone rattle: five irregular hollow clacks.
  rattle: (sr) =>
    layer(
      [[0, 1180], [0.019, 960], [0.043, 1320], [0.061, 1050], [0.09, 1230]].map(([at, f], k) => [
        layer([
          [tone({ sr, wave: 'triangle', freq: f, to: f * 0.85, dur: 0.018, env: { a: 0.0005, d: 0.018, s: 0, r: 0.005 }, vol: 0.35 })],
          [noise({ sr, hp: 1500, lp: 5000, dur: 0.01, env: { a: 0.0005, d: 0.01, s: 0, r: 0.003 }, vol: 0.3, seed: 53 + k })],
        ], sr),
        at,
        1 - k * 0.14,
      ]),
      sr,
    ),
  // Far-away low thud.
  thud: (sr) =>
    layer([
      [tone({ sr, wave: 'sine', freq: 70, to: 48, slideTime: 0.15, dur: 0.7, env: { a: 0.01, d: 0.7, s: 0, r: 0.1 }, vol: 0.8 })],
      [noise({ sr, lp: 200, dur: 0.12, env: { a: 0.005, d: 0.12, s: 0, r: 0.03 }, vol: 0.3, seed: 59 })],
    ], sr),
};

/** Ruin kit: T tick, R bone rattle, D far thud, X soft shaker. */
export const RUIN_KIT = { T: RUIN_HITS.tick, R: RUIN_HITS.rattle, D: RUIN_HITS.thud, X: SOFT_HITS.softShaker };

// Tropical hand percussion (bongos, conga, maracas).
export const ISLAND_HITS = {
  bongoHi: (sr) =>
    layer([
      [tone({ sr, wave: 'sine', freq: 440, to: 405, slideTime: 0.05, dur: 0.12, env: { a: 0.001, d: 0.12, s: 0, r: 0.02 }, vol: 0.7 })],
      [noise({ sr, hp: 1500, lp: 6000, dur: 0.012, env: { a: 0.0005, d: 0.012, s: 0, r: 0.004 }, vol: 0.35, seed: 61 })],
    ], sr),
  bongoLo: (sr) =>
    layer([
      [tone({ sr, wave: 'sine', freq: 300, to: 270, slideTime: 0.06, dur: 0.16, env: { a: 0.001, d: 0.16, s: 0, r: 0.02 }, vol: 0.75 })],
      [noise({ sr, hp: 1000, lp: 5000, dur: 0.012, env: { a: 0.0005, d: 0.012, s: 0, r: 0.004 }, vol: 0.3, seed: 63 })],
    ], sr),
  // Open conga tone: lower, rounder, a little longer.
  conga: (sr) =>
    layer([
      [tone({ sr, wave: 'sine', freq: 205, to: 185, slideTime: 0.08, dur: 0.25, env: { a: 0.002, d: 0.25, s: 0, r: 0.03 }, vol: 0.8 })],
      [tone({ sr, wave: 'sine', freq: 410, dur: 0.05, env: { a: 0.001, d: 0.05, s: 0, r: 0.01 }, vol: 0.15 })],
      [noise({ sr, lp: 2500, dur: 0.015, env: { a: 0.0005, d: 0.015, s: 0, r: 0.005 }, vol: 0.25, seed: 65 })],
    ], sr),
  // Maracas: short bright shake with a soft attack.
  maraca: (sr) => noise({ sr, hp: 4500, lp: 10000, dur: 0.06, env: { a: 0.012, d: 0.05, s: 0, r: 0.015 }, vol: 0.28, seed: 67 }),
};

/** Island kit: H bongo high, L bongo low, C conga, X maracas. */
export const ISLAND_KIT = { H: ISLAND_HITS.bongoHi, L: ISLAND_HITS.bongoLo, C: ISLAND_HITS.conga, X: ISLAND_HITS.maraca };

// Heartbeat (fear): muffled low "lub" and softer "dub".
export const HEART_HITS = {
  lub: (sr) =>
    layer([
      [tone({ sr, wave: 'sine', freq: 62, to: 44, slideTime: 0.1, dur: 0.16, env: { a: 0.006, d: 0.16, s: 0, r: 0.04 }, vol: 1 })],
      [noise({ sr, lp: 160, dur: 0.05, env: { a: 0.004, d: 0.05, s: 0, r: 0.02 }, vol: 0.35, seed: 71 })],
    ], sr),
  dub: (sr) =>
    layer([
      [tone({ sr, wave: 'sine', freq: 56, to: 42, slideTime: 0.08, dur: 0.12, env: { a: 0.005, d: 0.12, s: 0, r: 0.03 }, vol: 0.7 })],
      [noise({ sr, lp: 140, dur: 0.04, env: { a: 0.004, d: 0.04, s: 0, r: 0.02 }, vol: 0.25, seed: 73 })],
    ], sr),
};

/** Heart kit: L lub, U dub, T tick (far away), R bone rattle. */
export const HEART_KIT = { L: HEART_HITS.lub, U: HEART_HITS.dub, T: RUIN_HITS.tick, R: RUIN_HITS.rattle };
