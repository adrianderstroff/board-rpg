// Sound effects. Each entry: { name, render: () => Float32Array, peakDb? }.
// generate.mjs trims, adds 5 ms edge fades and normalizes to `peakDb`
// (default -3 dBFS; a few UI/ambient sounds are deliberately quieter).
// Short jingles (levelup, victory, defeat) use the sequencer.
import { SR, tone, layer, concat, echo, rng, silence, noteFreq } from './synth.mjs';
import { INST, HITS } from './instruments.mjs';
import { renderSong } from './sequencer.mjs';

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
};

/** All SFX, written to public/assets/audio/sfx/<name>.wav */
export const SFX = Object.entries(DEFS).map(([name, d]) => ({ name, peakDb: d.peakDb ?? -3, render: d.render }));
