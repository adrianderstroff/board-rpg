// Tiny step sequencer.
//
// Pattern strings: bars separated by '|', tokens separated by whitespace.
// Each bar is divided evenly among its tokens, so a bar with 8 tokens is in
// eighth notes, 16 tokens = sixteenths, 12 tokens = eighth-note triplets.
//   note name  "E4", "G#4", "Bb3"  start a note
//   ~note      "~E4": start a note with a portamento slide from the previous note
//   -          hold (tie) the previous note one more step
//   .          rest (ends the previous note)
// Drum channels use single letters from their kit instead of note names;
// a lowercase letter plays the uppercase hit softer unless the kit defines it.
//
// Song object:
//   { name, bpm, beatsPerBar = 4, bars, tail = 4,
//     chords?, scale?,                     // used by theory.lintSong
//     channels: [
//       { name, inst, pattern, gain = 1, echo?: {time, feedback, mix}, lint? },
//       { name, kit, pattern, gain = 1 },
//       { name, drone: { notes, ... } , gain = 1 },   // voices.loopDrone, loop-synced
//     ] }
// An instrument may set `voice` (see voices.mjs); default voice is synth.tone.
// renderSong(song, { loop: true }) renders exactly `bars` bars. Everything
// that rings past the end (release tails, echoes) is wrapped around onto the
// start, which is exactly what a looping player will hear -> seamless loop.
import { SR, tone, mixInto, echo } from './synth.mjs';
import { loopDrone } from './voices.mjs';

/** Split a pattern into bars of tokens and check the bar count. */
export function parseBars(pattern, expectedBars, label = 'pattern') {
  const bars = pattern
    .split('|')
    .map((b) => b.trim())
    .filter(Boolean)
    .map((b) => b.split(/\s+/));
  if (expectedBars != null && bars.length !== expectedBars)
    throw new Error(`${label}: ${bars.length} bars, expected ${expectedBars}`);
  return bars;
}

/** Melodic bars -> [{ t, dur, note }] (seconds). Ties extend notes, also across bars. */
export function noteEvents(bars, barSec) {
  const events = [];
  let cur = null;
  let last = null;
  bars.forEach((toks, b) => {
    const step = barSec / toks.length;
    toks.forEach((tok, i) => {
      const t = b * barSec + i * step;
      if (tok === '-') {
        if (cur) cur.dur += step;
      } else if (tok === '.') {
        cur = null;
      } else {
        const glide = tok.startsWith('~');
        const note = glide ? tok.slice(1) : tok;
        cur = { t, dur: step, note, glideFrom: glide && last ? last.note : null };
        events.push(cur);
        last = cur;
      }
    });
  });
  return events;
}

/** Drum bars -> [{ t, hit }]. */
export function hitEvents(bars, barSec) {
  const events = [];
  bars.forEach((toks, b) => {
    const step = barSec / toks.length;
    toks.forEach((tok, i) => {
      if (tok !== '.' && tok !== '-') events.push({ t: b * barSec + i * step, hit: tok });
    });
  });
  return events;
}

/** Seconds -> sample index; the epsilon makes exact half-samples round the same way in every bar. */
const toSample = (t, sr) => Math.floor(t * sr + 0.5 + 1e-6);

/** Render one channel into a buffer of `len` samples (content past the end is kept). */
function renderChannel(ch, song, len, sr) {
  const barSec = (60 / song.bpm) * (song.beatsPerBar ?? 4);
  const buf = new Float32Array(len);
  if (ch.drone) {
    mixInto(buf, loopDrone({ ...ch.drone, sr }, songLength(song, sr)));
    return { buf, gain: ch.gain ?? 1 };
  }
  const bars = parseBars(ch.pattern, song.bars, `${song.name}/${ch.name}`);
  if (ch.kit) {
    const cache = {};
    const sample = (hit) => {
      if (!(hit in cache)) {
        const up = hit.toUpperCase();
        if (ch.kit[hit]) cache[hit] = { buf: ch.kit[hit](sr), gain: 1 };
        else if (ch.kit[up]) cache[hit] = { buf: ch.kit[up](sr), gain: 0.45 };
        else throw new Error(`${song.name}/${ch.name}: unknown drum "${hit}"`);
      }
      return cache[hit];
    };
    for (const ev of hitEvents(bars, barSec)) {
      const s = sample(ev.hit);
      mixInto(buf, s.buf, toSample(ev.t, sr), s.gain);
    }
  } else {
    const { gate = 1, voice = tone, ...inst } = ch.inst;
    for (const ev of noteEvents(bars, barSec)) {
      const v = voice({ ...inst, sr, freq: ev.note, dur: ev.dur * gate, ...(ev.glideFrom ? { glideFrom: ev.glideFrom } : {}) });
      mixInto(buf, v, toSample(ev.t, sr));
    }
  }
  const out = ch.echo ? echo(buf, { ...ch.echo, sr }).subarray(0, len) : buf;
  return { buf: out, gain: ch.gain ?? 1 };
}

export function songLength(song, sr = SR) {
  const barSec = (60 / song.bpm) * (song.beatsPerBar ?? 4);
  return Math.round(song.bars * barSec * sr);
}

/**
 * Render a song. loop: true -> exactly `bars` long with tails wrapped to the
 * start; loop: false -> bars + tail (trim afterwards if needed).
 */
export function renderSong(song, { sr = SR, loop = true } = {}) {
  const loopLen = songLength(song, sr);
  const tail = Math.round((song.tail ?? 4) * sr);
  const full = loopLen + tail;
  const mix = new Float32Array(full);
  for (const ch of song.channels) {
    const { buf, gain } = renderChannel(ch, song, full, sr);
    mixInto(mix, buf, 0, gain);
  }
  if (!loop) return mix;
  const out = mix.slice(0, loopLen);
  for (let i = loopLen; i < full; i++) out[(i - loopLen) % loopLen] += mix[i];
  return out;
}

