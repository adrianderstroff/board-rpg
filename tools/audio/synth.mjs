// Tiny chiptune synth library. No dependencies, deterministic.
//
// Everything works on mono Float32Array buffers in the range -1..1.
// The main building block is `tone(opts)`: one oscillator voice with an
// ADSR envelope, optional pitch slide / vibrato and a low-/high-pass filter.
// Combine voices with `layer`, `mixInto`, `concat`, then post-process with
// `echo`, `normalize`, `fadeEdges`, `trimSilence`.

export const SR = 22050;
export const TAU = Math.PI * 2;

// ---------------------------------------------------------------- notes ----
const NOTE_INDEX = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/** "A4" -> 69, "C#5" -> 73, "Bb3" -> 58. */
export function noteToMidi(name) {
  const m = /^([A-Ga-g])([#b]?)(-?\d)$/.exec(name);
  if (!m) throw new Error(`Bad note name "${name}"`);
  const pc = NOTE_INDEX[m[1].toUpperCase()] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
  return pc + (parseInt(m[3], 10) + 1) * 12;
}
export const midiToFreq = (m) => 440 * 2 ** ((m - 69) / 12);
export const midiToNote = (m) => SHARP_NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);
/** Note name or Hz -> Hz. */
export const noteFreq = (n) => (typeof n === 'number' ? n : midiToFreq(noteToMidi(n)));
export const isNoteName = (s) => /^[A-G][#b]?-?\d$/.test(s);

export const dbToGain = (db) => 10 ** (db / 20);
export const gainToDb = (g) => (g > 0 ? 20 * Math.log10(g) : -Infinity);

// ------------------------------------------------------------ randomness ----
/** Seeded PRNG (mulberry32) -> function returning [0, 1). */
export function rng(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** NES APU style 15-bit LFSR noise. `short` = 93-step metallic mode. */
export class NesNoise {
  constructor({ short = false, seed = 1 } = {}) {
    this.reg = seed & 0x7fff || 1;
    this.tap = short ? 6 : 1;
  }
  step() {
    const fb = (this.reg ^ (this.reg >> this.tap)) & 1;
    this.reg = (this.reg >> 1) | (fb << 14);
  }
  get out() {
    return this.reg & 1 ? -1 : 1;
  }
}

// ----------------------------------------------------------- oscillators ----
// PolyBLEP: removes most of the aliasing of naive square/saw at 22 kHz.
function blep(t, dt) {
  if (t < dt) {
    t /= dt;
    return t + t - t * t - 1;
  }
  if (t > 1 - dt) {
    t = (t - 1) / dt;
    return t * t + t + t + 1;
  }
  return 0;
}
export const osc = {
  square(p, dt, duty = 0.5) {
    let v = p < duty ? 1 : -1;
    v += blep(p, dt);
    v -= blep((p - duty + 1) % 1, dt);
    return v;
  },
  saw: (p, dt) => 2 * p - 1 - blep(p, dt),
  triangle: (p) => 4 * Math.abs(p - 0.5) - 1,
  sine: (p) => Math.sin(TAU * p),
};

// ------------------------------------------------------------- envelope ----
/**
 * ADSR envelope. a/d/r in seconds, s = sustain level 0..1.
 * Decay and release are exponential-ish (sound natural for plucks);
 * release reaches exactly 0 at `r`. Returns level(t, gateSeconds).
 */
export function adsr({ a = 0.005, d = 0.1, s = 1, r = 0.05 } = {}) {
  const held = (t) => {
    if (t < a) return t / a;
    if (d <= 0) return s;
    return s + (1 - s) * Math.exp((-5 * (t - a)) / d);
  };
  return (t, gate) => {
    if (t < gate) return held(t);
    if (r <= 0) return 0;
    const x = (t - gate) / r;
    return x >= 1 ? 0 : held(gate) * Math.exp(-4 * x) * (1 - x);
  };
}

// --------------------------------------------------------------- filters ----
/** One-pole filter state. Cutoff may change per sample. */
export class OnePole {
  constructor(sr = SR) {
    this.sr = sr;
    this.y = 0;
    this.x1 = 0;
  }
  lp(x, fc) {
    const a = 1 - Math.exp((-TAU * Math.min(fc, this.sr * 0.49)) / this.sr);
    this.y += a * (x - this.y);
    return this.y;
  }
  hp(x, fc) {
    // y = x - lowpass(x)
    return x - this.lp(x, fc);
  }
}
const asFn = (v) => (typeof v === 'function' ? v : () => v);

/** In-place low-pass (poles = cascaded one-pole stages). */
export function lowpass(buf, fc, { sr = SR, poles = 1 } = {}) {
  const f = asFn(fc);
  for (let p = 0; p < poles; p++) {
    const st = new OnePole(sr);
    for (let i = 0; i < buf.length; i++) buf[i] = st.lp(buf[i], f(i / sr));
  }
  return buf;
}
/** In-place high-pass. */
export function highpass(buf, fc, { sr = SR, poles = 1 } = {}) {
  const f = asFn(fc);
  for (let p = 0; p < poles; p++) {
    const st = new OnePole(sr);
    for (let i = 0; i < buf.length; i++) buf[i] = st.hp(buf[i], f(i / sr));
  }
  return buf;
}

// ------------------------------------------------------------------ tone ----
/** Pitch multiplier for a portamento from `from` into f0 (ease-out approach). */
export function glideFactor(from, f0, t, glideTime = 0.08) {
  const x = Math.min(1, t / glideTime);
  const k = 1 - (1 - x) * (1 - x); // ease-out
  return (noteFreq(from) / f0) ** (1 - k);
}
/**
 * Render one voice.
 * @param {object} o
 *  wave     'square' | 'triangle' | 'saw' | 'sine' | 'noise'
 *  freq     note name or Hz (for noise: LFSR clock rate in Hz, e.g. 4000..40000)
 *  to       optional end frequency for a pitch slide
 *  slide    'exp' (default) | 'lin';  slideTime (s, default = dur)
 *  freqFn   optional (t) => Hz, overrides freq/to
 *  glideFrom optional start pitch (note/Hz): portamento into freq over glideTime (default 0.08 s)
 *  duty     square duty 0..1 or (t) => duty (PWM)
 *  short    noise: metallic short LFSR mode;  seed: noise seed
 *  vibrato  { rate Hz, depth semitones, delay s }
 *  env      { a, d, s, r } (see adsr)
 *  dur      gate length in seconds (release is added after it); with
 *           env.s = 0 the gate is at least a + d (one-shot)
 *  lp, hp   cutoff Hz or (t) => Hz;  lpPoles (default 2), hpPoles (default 1)
 *  vol      output gain
 */
export function tone(o) {
  const sr = o.sr ?? SR;
  const env = adsr(o.env);
  // One-shot envelopes (sustain 0) always play their full attack + decay.
  const e = { a: 0.005, d: 0.1, s: 1, ...o.env };
  const dur = e.s === 0 ? Math.max(o.dur ?? 0, e.a + e.d) : o.dur ?? 0.1;
  const rel = o.env?.r ?? 0.05;
  const len = Math.max(1, Math.ceil((dur + rel) * sr));
  const out = new Float32Array(len);
  const wave = o.wave ?? 'square';
  const f0 = noteFreq(o.freq ?? 440);
  const f1 = o.to != null ? noteFreq(o.to) : f0;
  const slideT = o.slideTime ?? dur;
  const duty = asFn(o.duty ?? 0.5);
  const vib = o.vibrato;
  const lpF = o.lp != null ? asFn(o.lp) : null;
  const hpF = o.hp != null ? asFn(o.hp) : null;
  const lpPoles = o.lpPoles ?? 2;
  const hpPoles = o.hpPoles ?? 1;
  const lps = Array.from({ length: lpPoles }, () => new OnePole(sr));
  const hps = Array.from({ length: hpPoles }, () => new OnePole(sr));
  const noise = wave === 'noise' ? new NesNoise({ short: o.short, seed: o.seed ?? 1 }) : null;
  const vol = o.vol ?? 1;
  let phase = o.phase ?? 0;
  let vibPhase = 0;

  for (let i = 0; i < len; i++) {
    const t = i / sr;
    let f;
    if (o.freqFn) f = o.freqFn(t);
    else if (f0 === f1) f = f0;
    else {
      const x = Math.min(t / slideT, 1);
      f = o.slide === 'lin' ? f0 + (f1 - f0) * x : f0 * (f1 / f0) ** x;
    }
    if (o.glideFrom != null) f *= glideFactor(o.glideFrom, f0, t, o.glideTime);
    if (vib && t >= (vib.delay ?? 0)) {
      const ramp = Math.min(1, (t - (vib.delay ?? 0)) / 0.12);
      vibPhase += vib.rate / sr;
      f *= 2 ** ((vib.depth * ramp * Math.sin(TAU * vibPhase)) / 12);
    }
    const dt = f / sr;
    let v;
    if (noise) {
      phase += dt;
      while (phase >= 1) {
        phase -= 1;
        noise.step();
      }
      v = noise.out;
    } else {
      phase += dt;
      phase -= Math.floor(phase);
      v = wave === 'square' ? osc.square(phase, dt, duty(t)) : osc[wave](phase, dt);
    }
    if (lpF) {
      const fc = lpF(t);
      for (const st of lps) v = st.lp(v, fc);
    }
    if (hpF) {
      const fc = hpF(t);
      for (const st of hps) v = st.hp(v, fc);
    }
    out[i] = v * env(t, dur) * vol;
  }
  return out;
}

// ------------------------------------------------------------ buffer ops ----
export const secs = (s, sr = SR) => Math.round(s * sr);
export const silence = (s, sr = SR) => new Float32Array(Math.max(0, secs(s, sr)));

/** Add src into dst starting at sample `at` (clipped to dst). */
export function mixInto(dst, src, at = 0, gain = 1) {
  const n = Math.min(src.length, dst.length - at);
  for (let i = Math.max(0, -at); i < n; i++) dst[at + i] += src[i] * gain;
  return dst;
}

/** Layer parts [buffer, startSeconds = 0, gain = 1] into a new buffer sized to fit. */
export function layer(parts, sr = SR) {
  let len = 0;
  for (const [b, at = 0] of parts) len = Math.max(len, secs(at, sr) + b.length);
  const out = new Float32Array(len);
  for (const [b, at = 0, g = 1] of parts) mixInto(out, b, secs(at, sr), g);
  return out;
}

export function concat(...bufs) {
  const out = new Float32Array(bufs.reduce((n, b) => n + b.length, 0));
  let o = 0;
  for (const b of bufs) {
    out.set(b, o);
    o += b.length;
  }
  return out;
}

export function scale(buf, g) {
  for (let i = 0; i < buf.length; i++) buf[i] *= g;
  return buf;
}

/**
 * Feedback echo; returns a longer buffer containing the tail.
 * lp: optional low-pass (Hz) inside the feedback loop -> each repeat gets darker (tape-style).
 */
export function echo(buf, { time = 0.15, feedback = 0.35, mix = 0.35, lp = null, sr = SR } = {}) {
  const d = secs(time, sr);
  const repeats = Math.ceil(Math.log(0.001) / Math.log(feedback));
  const out = new Float32Array(buf.length + d * repeats);
  out.set(buf);
  const wet = new Float32Array(out.length);
  const st = new OnePole(sr);
  for (let i = d; i < out.length; i++) {
    const fb = lp ? st.lp(wet[i - d], lp) : wet[i - d];
    wet[i] = (buf[i - d] ?? 0) + fb * feedback;
  }
  for (let i = 0; i < out.length; i++) out[i] += wet[i] * mix;
  return out;
}

export function peak(buf) {
  let p = 0;
  for (let i = 0; i < buf.length; i++) p = Math.max(p, Math.abs(buf[i]));
  return p;
}

/** Scale so that the absolute peak is at `db` dBFS. */
export function normalize(buf, db) {
  const p = peak(buf);
  return p > 0 ? scale(buf, dbToGain(db) / p) : buf;
}

/** Linear fade in/out (ms) to kill clicks at the edges. */
export function fadeEdges(buf, inMs = 5, outMs = 5, sr = SR) {
  const fi = Math.min(buf.length, secs(inMs / 1000, sr));
  const fo = Math.min(buf.length, secs(outMs / 1000, sr));
  for (let i = 0; i < fi; i++) buf[i] *= i / fi;
  for (let i = 0; i < fo; i++) buf[buf.length - 1 - i] *= i / fo;
  return buf;
}

/** Drop trailing samples quieter than `rel` × peak. */
export function trimSilence(buf, rel = 1e-3) {
  const th = peak(buf) * rel;
  let end = buf.length;
  while (end > 1 && Math.abs(buf[end - 1]) < th) end--;
  return buf.slice(0, end);
}
