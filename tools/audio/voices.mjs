// Richer (non-chiptune) voices built on synth.mjs. Every voice has the same
// call shape as `tone()` -- ({ sr, freq, dur, vol, glideFrom, ... }) => Float32Array --
// so instruments can use them via `voice: <fn>` and the sequencer treats them alike.
//
//   pluckString   Karplus-Strong plucked string (harp, oud, guitar)
//   additive      additive synthesis with (in)harmonic, individually decaying partials
//                 (piano, celesta, bells)
//   breathFlute   sine-ish flute with filtered breath noise, chiff, soft attack,
//                 delayed vibrato and portamento (ney / fantasy flute)
//   ensemble      detuned oscillators with slow independent drift = chorus
//                 (strings, heat-haze pad)
//   loopDrone     sustained, perfectly periodic drone for looping songs
//   reed          detuned "musette" reed pair (accordion / squeezebox)
//   gullCry       short rise-then-fall pitch swoop (distant seagull)
import { SR, TAU, noteFreq, rng, OnePole, adsr, osc, glideFactor, tone, mixInto } from './synth.mjs';

const endFade = (out, sr, ms = 20) => {
  const n = Math.min(out.length, Math.round((ms / 1000) * sr));
  for (let i = 0; i < n; i++) out[out.length - 1 - i] *= i / n;
  return out;
};
/** Decay time scaled by pitch: higher notes die faster (ref 220 Hz). */
const pitchScaled = (t60, f, exp = 0.4) => t60 * (220 / f) ** exp;

// ------------------------------------------------------- Karplus-Strong ----
/**
 * Plucked string. Options: t60 (s, decay of a 220 Hz string), bright (0..1,
 * excitation brightness), pos (pluck position 0..0.5, lower = thinner),
 * damp (true = mute at the end of the note, else it rings out), lp, seed, vol.
 */
export function pluckString(o) {
  const sr = o.sr ?? SR;
  const f = noteFreq(o.freq);
  const t60 = pitchScaled(o.t60 ?? 2, f);
  const len = Math.ceil((o.damp ? (o.dur ?? 0.3) + 0.12 : t60) * sr);
  const out = new Float32Array(len);
  // Delay line: N samples + 0.5 (averaging filter) + d (all-pass fraction) = sr / f
  const period = sr / f;
  let N = Math.floor(period - 0.5);
  let d = period - 0.5 - N;
  if (d < 0.1) {
    N -= 1;
    d += 1;
  }
  const C = (1 - d) / (1 + d);
  const rho = 0.001 ** (1 / (t60 * f)); // loop gain per period
  // Excitation: seeded noise, low-passed by brightness, pluck-position comb, zero mean.
  const r = rng(o.seed ?? Math.round(f * 100));
  const lpS = new OnePole(sr);
  const cutoff = 400 + (o.bright ?? 0.5) * 6000;
  const exc = Array.from({ length: N }, () => lpS.lp(r() * 2 - 1, cutoff));
  const P = Math.max(1, Math.round(N * (o.pos ?? 0.18)));
  const buf = new Float32Array(N);
  let mean = 0;
  for (let i = 0; i < N; i++) mean += (buf[i] = exc[i] - exc[(i - P + N) % N]);
  mean /= N;
  let pk = 0;
  for (let i = 0; i < N; i++) pk = Math.max(pk, Math.abs((buf[i] -= mean)));
  for (let i = 0; i < N; i++) buf[i] /= pk || 1;

  const dampAt = o.damp ? Math.round((o.dur ?? 0.3) * sr) : Infinity;
  const dampRho = 0.001 ** (1 / (0.08 * f));
  let idx = 0;
  let prev = 0;
  let apX = 0;
  let apY = 0;
  const lp = o.lp ? new OnePole(sr) : null;
  for (let i = 0; i < len; i++) {
    const x = buf[idx];
    const avg = 0.5 * (x + prev);
    prev = x;
    const ap = C * avg + apX - C * apY;
    apX = avg;
    apY = ap;
    buf[idx] = ap * (i < dampAt ? rho : dampRho);
    idx = idx + 1 === N ? 0 : idx + 1;
    out[i] = lp ? lp.lp(x, o.lp) : x;
  }
  // 3 ms attack softens the pick click.
  const a = Math.round(0.003 * sr);
  for (let i = 0; i < a && i < len; i++) out[i] *= i / a;
  const vol = o.vol ?? 1;
  for (let i = 0; i < len; i++) out[i] *= vol;
  return endFade(out, sr);
}

// ------------------------------------------------------------ additive ----
/**
 * Additive voice. partials: [[ratio, amp, decayScale], ...]; ratio may be
 * inharmonic. Each partial decays exponentially with t60 * decayScale
 * (t60 is scaled by pitch). `inharm` (B) stretches ratio k -> k*sqrt(1+B k^2)
 * like piano strings. `strings`: detune pairs in cents (e.g. [0, 0.9]) for a
 * chorused unison. env.a = attack, env.r = damper release after dur.
 * `hammer`: amount of short filtered noise at the onset.
 */
export function additive(o) {
  const sr = o.sr ?? SR;
  const f = noteFreq(o.freq);
  const t60 = pitchScaled(o.t60 ?? 2, f, o.t60Exp ?? 0.4);
  const dur = o.dur ?? 0.5;
  const rel = o.env?.r ?? 0.25;
  const atk = o.env?.a ?? 0.002;
  const len = Math.ceil(Math.min(dur + rel, t60 * 1.2) * sr);
  const out = new Float32Array(len);
  const B = o.inharm ?? 0;
  const detunes = o.strings ?? [0];
  const nyq = sr * 0.45;
  for (const [ratio, amp, dScale = 1] of o.partials) {
    const k = ratio;
    const pf0 = f * k * Math.sqrt(1 + B * k * k);
    const tau = (t60 * dScale) / 6.91; // exp time constant for 60 dB
    for (const cents of detunes) {
      const pf = pf0 * 2 ** (cents / 1200);
      if (pf > nyq) continue;
      const a = amp / detunes.length;
      const w = (TAU * pf) / sr;
      for (let i = 0; i < len; i++) out[i] += a * Math.sin(w * i) * Math.exp(-i / sr / tau);
    }
  }
  if (o.hammer) {
    const r = rng(o.seed ?? 17);
    const st = new OnePole(sr);
    const n = Math.round(0.012 * sr);
    for (let i = 0; i < n && i < len; i++) out[i] += o.hammer * st.lp(r() * 2 - 1, Math.min(4000, f * 4)) * (1 - i / n);
  }
  const env = adsr({ a: atk, d: 0, s: 1, r: rel });
  const vol = o.vol ?? 1;
  for (let i = 0; i < len; i++) out[i] *= env(i / sr, dur) * vol;
  return endFade(out, sr, 5);
}

// --------------------------------------------------------- breath flute ----
/**
 * Breathy flute / ney. Mostly sine with weak 2nd/3rd harmonics, band-limited
 * breath noise that follows the pitch, a short chiff at the onset, soft
 * attack, delayed vibrato (pitch + a little amplitude) and portamento
 * (glideFrom). Options: breath (0..1), harmonics [h2, h3], vibrato, env, lp.
 */
export function breathFlute(o) {
  const sr = o.sr ?? SR;
  const f0 = noteFreq(o.freq);
  const env = adsr({ a: 0.09, d: 0.3, s: 0.85, r: 0.18, ...o.env });
  const dur = o.dur ?? 0.5;
  const len = Math.ceil((dur + (o.env?.r ?? 0.18)) * sr);
  const out = new Float32Array(len);
  const [h2, h3] = o.harmonics ?? [0.2, 0.07];
  const breath = o.breath ?? 0.3;
  const vib = { rate: 5, depth: 0.25, delay: 0.3, ...o.vibrato };
  const r = rng(o.seed ?? Math.round(f0 * 7));
  const bHp = new OnePole(sr);
  const bLp1 = new OnePole(sr);
  const bLp2 = new OnePole(sr);
  const chiffLp = new OnePole(sr);
  const tone = new OnePole(sr);
  const drift = r() * TAU;
  let ph = 0;
  let vph = 0;
  for (let i = 0; i < len; i++) {
    const t = i / sr;
    let f = f0;
    if (o.glideFrom != null) f *= glideFactor(o.glideFrom, f0, t, o.glideTime ?? 0.12);
    let vibAmt = 0;
    if (t > vib.delay) {
      const ramp = Math.min(1, (t - vib.delay) / 0.4); // vibrato fades in slowly
      vph += vib.rate / sr;
      vibAmt = ramp * Math.sin(TAU * vph);
    }
    f *= 2 ** ((vib.depth * vibAmt + 0.04 * Math.sin(TAU * 0.7 * t + drift)) / 12);
    ph += f / sr;
    ph -= Math.floor(ph);
    let v = Math.sin(TAU * ph) + h2 * Math.sin(2 * TAU * ph) + h3 * Math.sin(3 * TAU * ph);
    v = tone.lp(v, o.lp ?? 3500);
    // breath noise, band-passed around the upper harmonics of the note
    const n = r() * 2 - 1;
    const bn = bLp2.lp(bLp1.lp(bHp.hp(n, f * 0.9), f * 3), f * 3);
    const chiff = t < 0.06 ? chiffLp.lp(n, 3000) * (1 - t / 0.06) * 0.6 : 0;
    const e = env(t, dur);
    out[i] = (v * (1 + 0.08 * vibAmt) + bn * breath * 2.2 + chiff * breath) * e;
  }
  const vol = o.vol ?? 1;
  for (let i = 0; i < len; i++) out[i] *= vol;
  return out;
}

// ------------------------------------------------------------ ensemble ----
/**
 * Detuned oscillator ensemble (chorus). voices: number of oscillators,
 * detune: spread in cents, wave, drift: { rate, depth cents } slow per-voice
 * pitch wander (heat haze / string section), lp cutoff, env (long a/r).
 */
export function ensemble(o) {
  const sr = o.sr ?? SR;
  const f0 = noteFreq(o.freq);
  const env = adsr({ a: 0.4, d: 0.5, s: 0.9, r: 0.8, ...o.env });
  const dur = o.dur ?? 1;
  const len = Math.ceil((dur + (o.env?.r ?? 0.8)) * sr);
  const out = new Float32Array(len);
  const n = o.voices ?? 3;
  const spread = o.detune ?? 10;
  const wave = o.wave ?? 'saw';
  const drift = { rate: 0.2, depth: 6, ...o.drift };
  const r = rng(o.seed ?? Math.round(f0 * 13));
  const vs = Array.from({ length: n }, (_, k) => ({
    cents: n === 1 ? 0 : -spread / 2 + (spread * k) / (n - 1),
    ph: r(),
    lfoPh: r(),
    lfoRate: drift.rate * (0.7 + 0.6 * r()),
  }));
  const lps = [new OnePole(sr), new OnePole(sr)];
  const lp = o.lp ?? 1500;
  for (let i = 0; i < len; i++) {
    const t = i / sr;
    let v = 0;
    for (const s of vs) {
      const cents = s.cents + drift.depth * Math.sin(TAU * (s.lfoPh + s.lfoRate * t));
      const f = f0 * 2 ** (cents / 1200);
      const dt = f / sr;
      s.ph += dt;
      s.ph -= Math.floor(s.ph);
      v += wave === 'square' ? osc.square(s.ph, dt, 0.5) : osc[wave](s.ph, dt);
    }
    v /= Math.sqrt(n);
    for (const st of lps) v = st.lp(v, lp);
    out[i] = v * env(t, dur);
  }
  const vol = o.vol ?? 1;
  for (let i = 0; i < len; i++) out[i] *= vol;
  return out;
}

// ---------------------------------------------------------------- drone ----
/**
 * Perfectly periodic drone for a loop of `loopLen` samples: every frequency
 * (notes, detune, tremolo) is snapped to a whole number of cycles per loop,
 * and filters are run over one extra loop so they are in steady state.
 * notes: note names; detune (cents, per note two voices ±detune/2);
 * shimmer: { rate Hz, depth 0..1 } slow amplitude breathing; wave; lp; vol.
 */
export function loopDrone(o, loopLen) {
  const sr = o.sr ?? SR;
  const loopSec = loopLen / sr;
  const snap = (hz) => Math.max(1, Math.round(hz * loopSec)) / loopSec;
  const oscs = [];
  for (const note of o.notes) {
    const f = noteFreq(note);
    for (const c of [-(o.detune ?? 6) / 2, (o.detune ?? 6) / 2]) oscs.push({ f: snap(f * 2 ** (c / 1200)), ph: 0 });
  }
  const trem = o.shimmer ? { f: snap(o.shimmer.rate), depth: o.shimmer.depth } : null;
  const wave = o.wave ?? 'triangle';
  const lps = [new OnePole(sr), new OnePole(sr)];
  const out = new Float32Array(loopLen);
  for (let i = 0; i < 2 * loopLen; i++) {
    const t = i / sr;
    let v = 0;
    for (const s of oscs) {
      const p = (s.f * t) % 1;
      v += wave === 'sine' ? Math.sin(TAU * p) : osc.triangle(p);
    }
    v /= oscs.length;
    for (const st of lps) v = st.lp(v, o.lp ?? 800);
    if (trem) v *= 1 - trem.depth * 0.5 * (1 - Math.cos(TAU * trem.f * t));
    if (i >= loopLen) out[i - loopLen] = v * (o.vol ?? 1);
  }
  return out;
}

// ----------------------------------------------------------------- reed ----
/**
 * Accordion / squeezebox: `reeds` (cents offsets, e.g. [-7, 0, 7]) of a pulse
 * + saw mix rendered with tone() and summed, so the detuned reeds beat like a
 * musette register. All tone() options (env, vibrato, lp, glideFrom) apply.
 * `sawMix` (0..1) blends in a saw reed for a brighter, fiddle-ish edge.
 */
export function reed(o) {
  const { reeds = [-7, 0, 7], sawMix = 0.4, duty = 0.3, ...rest } = o;
  const f = noteFreq(o.freq);
  const parts = [];
  reeds.forEach((cents, k) => {
    const fr = f * 2 ** (cents / 1200);
    parts.push(tone({ ...rest, wave: 'square', duty, freq: fr, phase: (k * 0.37) % 1 }));
    if (sawMix > 0) parts.push(tone({ ...rest, wave: 'saw', freq: fr, phase: (k * 0.61) % 1, vol: (rest.vol ?? 1) * sawMix }));
  });
  const out = new Float32Array(Math.max(...parts.map((p) => p.length)));
  for (const p of parts) mixInto(out, p, 0, 1 / Math.sqrt(parts.length));
  return out;
}

// ------------------------------------------------------------ gull cry ----
/**
 * Seagull-like "kee-ow": the pitch rises quickly above the written note, then
 * falls well below it over the note. Triangle/sine through a low-pass, a bit
 * of fast warble. Options: rise (ratio), fall (ratio), riseTime (s), plus tone() options.
 */
export function gullCry(o) {
  const f = noteFreq(o.freq);
  const dur = o.dur ?? 0.4;
  const rise = o.rise ?? 1.12;
  const fall = o.fall ?? 0.7;
  const rt = o.riseTime ?? 0.07;
  const freqFn = (t) => {
    const w = 1 + 0.012 * Math.sin(TAU * 23 * t);
    if (t < rt) return f * 0.92 * (rise / 0.92) ** (t / rt) * w;
    return f * rise * (fall / rise) ** Math.min(1, (t - rt) / Math.max(0.05, dur - rt)) * w;
  };
  return tone({ wave: 'triangle', env: { a: 0.02, d: 0.1, s: 0.8, r: 0.12 }, ...o, freqFn });
}
