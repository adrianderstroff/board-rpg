// Music theory helpers: chord symbols, chord-driven pattern generation,
// and a "lint" that checks melodies against the song's scale and chords
// (we cannot listen to the output, so we let the code check the theory).
import { noteToMidi, midiToNote, isNoteName } from './synth.mjs';
import { parseBars, noteEvents } from './sequencer.mjs';

const PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const QUALITIES = {
  '': [0, 4, 7],
  m: [0, 3, 7],
  '7': [0, 4, 7, 10],
  m7: [0, 3, 7, 10],
  maj7: [0, 4, 7, 11],
  dim: [0, 3, 6],
  dim7: [0, 3, 6, 9],
  aug: [0, 4, 8],
  sus2: [0, 2, 7],
  sus4: [0, 5, 7],
  '5': [0, 7],
};

export const pitchClass = (note) => ((noteToMidi(note) % 12) + 12) % 12;
const pcOfName = (n) => (PC[n[0]] + (n[1] === '#' ? 1 : n[1] === 'b' ? -1 : 0) + 12) % 12;

/** "Dm" -> { root: 2, intervals: [0,3,7], pcs: Set{2,5,9} } */
export function parseChord(sym) {
  const m = /^([A-G][#b]?)(.*)$/.exec(sym);
  if (!m || !(m[2] in QUALITIES)) throw new Error(`Unknown chord "${sym}"`);
  const root = pcOfName(m[1]);
  const intervals = QUALITIES[m[2]];
  return { sym, root, intervals, pcs: new Set(intervals.map((i) => (root + i) % 12)) };
}

/** "D E F# G" -> Set of pitch classes */
export const parseScale = (s) => new Set(s.trim().split(/\s+/).map(pcOfName));

/** Progression string "Dm | Bb | F C" -> array of bars, each an array of chords. */
export const parseProgression = (prog) =>
  prog
    .split('|')
    .map((b) => b.trim())
    .filter(Boolean)
    .map((b) => b.split(/\s+/).map(parseChord));

/**
 * Build a pattern string from a chord progression and a per-bar template of
 * chord degrees. Tokens: 1/R root, 3, 5, 7 (chord 7th), 8 (octave), 10, 12, 15
 * (compound 3rd/5th/2 octaves); prefix L = one octave lower (L5 = fifth below root).
 * '.' and '-' pass through; note names pass through unchanged.
 * If a bar has several chords, the bar's tokens are split evenly between them.
 * `low` = lowest allowed root, e.g. 'A2' puts every root in A2..G#3.
 * opts.tie: a note equal to the one still sounding becomes '-' (sustained pads).
 */
export function chordPattern(progression, template, low, { tie = false } = {}) {
  const bars = parseProgression(progression);
  const tBars = template
    .split('|')
    .map((b) => b.trim())
    .filter(Boolean)
    .map((b) => b.split(/\s+/));
  const lowMidi = noteToMidi(low);
  let sounding = null;
  return bars
    .map((chords, bi) => {
      const toks = tBars[bi % tBars.length];
      return toks
        .map((tok, i) => {
          if (tok === '.') sounding = null;
          if (tok === '.' || tok === '-') return tok;
          const ch = chords[Math.floor((i * chords.length) / toks.length)];
          const rootMidi = lowMidi + ((ch.root - lowMidi) % 12 + 12) % 12;
          const note = isNoteName(tok) ? tok : midiToNote(rootMidi + degree(tok, ch));
          if (tie && note === sounding) return '-';
          sounding = note;
          return note;
        })
        .join(' ');
    })
    .join(' | ');
}

function degree(tok, ch) {
  let shift = 0;
  if (tok.startsWith('L')) {
    shift = -12;
    tok = tok.slice(1);
  }
  const iv = ch.intervals;
  const need = (k) => {
    if (iv[k] == null) throw new Error(`Chord ${ch.sym} has no degree for "${tok}"`);
    return iv[k];
  };
  const map = { 1: () => 0, R: () => 0, 3: () => need(1), 5: () => need(iv.length === 2 ? 1 : 2), 7: () => need(3), 8: () => 12, 10: () => 12 + need(1), 12: () => 12 + need(2), 15: () => 24 };
  if (!(tok in map)) throw new Error(`Unknown degree token "${tok}"`);
  return map[tok]() + shift;
}

/**
 * Check melodic channels (those with `lint: true`) of a song:
 *  - every note is in `song.scale`
 *  - the note sounding at each bar's downbeat is a tone of that bar's first chord
 * Returns a list of warning strings (empty = clean).
 */
export function lintSong(song) {
  const warnings = [];
  if (!song.chords) return warnings;
  const prog = parseProgression(song.chords);
  if (prog.length !== song.bars) warnings.push(`${song.name}: chords have ${prog.length} bars, song has ${song.bars}`);
  const scale = song.scale ? parseScale(song.scale) : null;
  const barSec = (60 / song.bpm) * (song.beatsPerBar ?? 4);
  for (const ch of song.channels) {
    if (!ch.lint) continue;
    const events = noteEvents(parseBars(ch.pattern, song.bars, `${song.name}/${ch.name}`), barSec);
    for (const ev of events) {
      const pc = pitchClass(ev.note);
      const bar = Math.floor(ev.t / barSec + 1e-9);
      if (scale && !scale.has(pc)) warnings.push(`${song.name}/${ch.name} bar ${bar + 1}: ${ev.note} not in scale`);
    }
    for (let b = 0; b < song.bars; b++) {
      const t = b * barSec + 1e-6;
      const ev = events.find((e) => e.t <= t && e.t + e.dur > t);
      const chord = prog[b]?.[0];
      if (ev && chord && !chord.pcs.has(pitchClass(ev.note)))
        warnings.push(`${song.name}/${ch.name} bar ${b + 1}: downbeat ${ev.note} is not in ${chord.sym}`);
    }
  }
  return warnings;
}
