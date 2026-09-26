// Music: seamless looping songs.
//
// Each song = tempo + chord progression + channels. Melodies are written by
// hand (one bar per line, 8 tokens = eighth notes, 16 = sixteenths).
// Accompaniment (arpeggios, bass) is generated from the chord progression
// with `chordPattern`, so it always stays on chord tones / roots.
// `scale` + `chords` are also used by `lintSong` to check the melody.
import { INST, KIT, ACOUSTIC, SOFT_KIT, SHANTY_KIT, RUIN_KIT, ISLAND_KIT, HEART_KIT } from './instruments.mjs';
import { chordPattern } from './theory.mjs';

/** Repeat one bar `n` times as a pattern string. */
const rep = (bar, n) => Array(n).fill(bar).join(' | ');
/** Join bar strings / pattern strings into one pattern. */
const bars = (...parts) => parts.join(' | ');
/** Replace whole bars (1-based) of a pattern, e.g. a glissando instead of the arpeggio. */
const replaceBars = (pattern, repl) =>
  pattern.split('|').map((b, i) => (repl[i + 1] ? ` ${repl[i + 1]} ` : b)).join('|');
/** Sustained chord pad as three channels (root, 3rd, 5th); repeated notes are tied. */
const padChannels = (name, inst, chords, template, low) =>
  ['1', '3', '5'].map((deg) => ({
    name: `${name}${deg}`, inst,
    pattern: chordPattern(chords, template.replace(/1/g, deg), low, { tie: true }),
  }));

// ------------------------------------------------------------------ title ----
// High-fantasy main menu, whimsical waltz. 3/4 at 96 bpm, 16 bars (30 s).
// F Lydian colour (C-major notes over an F tonic; the G major chord and the
// B natural over F give the bright "magic" #4). Celesta melody with echo,
// Karplus-Strong harp arpeggios with glissandi at the phrase ends, soft piano
// bass, light strings.
// A (1-8): F G Em Am | F G C C (half cadence) · B (9-16): Dm Em F G | Dm Em G C -> F.
const titleChords = 'F | G | Em | Am | F | G | C | C | Dm | Em | F | G | Dm | Em | G | C';
const title = {
  name: 'title', bpm: 96, beatsPerBar: 3, bars: 16, tail: 5,
  chords: titleChords,
  scale: 'C D E F G A B',
  channels: [
    {
      name: 'celesta', inst: ACOUSTIC.celesta, lint: true,
      echo: { time: 0.46875, feedback: 0.25, mix: 0.22, lp: 3000 }, // dotted eighth
      pattern: bars(
        'A5 - B5 C6 - A5', // 6 tokens = eighths, 12 = sixteenths
        'B5 - A5 G5 - D5',
        'E5 - - - G5 - - - B5 C6 B5 -',
        'C6 - B5 A5 - E5',
        'A5 - B5 C6 - A5',
        'D6 - C6 B5 - G5',
        'E6 - D6 C6 - G5',
        'C6 - - - - .',
        'F5 - A5 D6 - C6',
        'B5 - - - G5 - A5 G5 E5 - - -',
        'A5 - C6 - B5 A5',
        'B5 - G5 - D5 -',
        'F5 - A5 - D6 -',
        'E6 - D6 - B5 - C6 B5 G5 - - -',
        'D6 - B5 - G5 A5',
        'C6 - G5 - E5 G5',
      ),
    },
    {
      name: 'harp', inst: ACOUSTIC.harp,
      pattern: replaceBars(chordPattern(titleChords, '1 5 8 10 12 10', 'C3'), {
        8: 'C4 D4 E4 F4 G4 A4 B4 C5 D5 E5 F5 G5', // glissando up
        16: 'G3 A3 B3 C4 D4 E4 F4 G4 A4 B4 C5 E5',
      }),
    },
    { name: 'piano', inst: ACOUSTIC.piano, pattern: chordPattern(titleChords, '1 - - - - -', 'D2') },
    ...padChannels('strings', ACOUSTIC.strings, titleChords, '1 1 1', 'F3'),
  ],
};

// ---------------------------------------------------------------- village ----
// Warm market town. D Phrygian dominant (D Eb F# G A Bb C), 100 bpm, 12 bars.
// A (1-4) D D Eb D · A' (5-8) D Gm Eb D · B (9-12) Gm Cm Eb D.
// Eb -> D is the characteristic "hijaz" cadence.
const villageChords = 'D | D | Eb | D | D | Gm | Eb | D | Gm | Cm | Eb | D';
const village = {
  name: 'village', bpm: 100, bars: 12,
  chords: villageChords,
  scale: 'D Eb F# G A Bb C',
  channels: [
    {
      name: 'lead', inst: INST.lead, lint: true,
      pattern: bars(
        'D5 - F#5 G5 A5 - - G5',
        'A5 Bb5 A5 G5 F#5 Eb5 D5 -',
        'Eb5 - G5 - Bb5 - A5 G5',
        'F#5 - - Eb5 D5 - - .',
        'A5 - Bb5 A5 G5 - F#5 G5',
        'Bb5 - A5 G5 D5 - - .',
        'Eb5 F#5 G5 - Bb5 - G5 Eb5',
        'F#5 - - - D5 - - .',
        'G5 - Bb5 - D6 - C6 Bb5',
        'C6 - - Bb5 G5 - Eb5 -',
        'G5 - F#5 G5 Bb5 - A5 G5',
        'F#5 - Eb5 - D5 - - .',
      ),
    },
    { name: 'oud', inst: INST.pluck, pattern: chordPattern(villageChords, '. 3 5 3 . 3 5 3', 'A3') },
    { name: 'bass', inst: INST.bass, pattern: chordPattern(villageChords, '1 - 1 . 5 - . .', 'B2') },
    {
      name: 'drums', kit: KIT, gain: 0.8, // baladi rhythm: doum doum . tek doum . tek .
      pattern: bars(rep('D . D . x . T . D . x t T . t x', 11), 'D . D . T . T . D . T t T t T t'),
    },
  ],
};

// ------------------------------------------------------------------ dunes ----
// Scorching desert, slow and hazy, a little mysterious (mirages).
// E Phrygian dominant / Hijaz (E F G# A B C D), 70 bpm, 8 bars (27.4 s).
// Open-fifth drone E2+B2 throughout; wavering haze pad; breathy ney with
// slides ("~") and a dark echo; sparse soft frame drum / doumbek.
// Phrase 1 (1-4): E F E E · Phrase 2 (5-8): Dm F E E (bar 8 = silence for the echo).
const dunesChords = 'E | F | E | E | Dm | F | E | E';
const dunes = {
  name: 'dunes', bpm: 70, bars: 8, tail: 6,
  chords: dunesChords,
  scale: 'E F G# A B C D',
  channels: [
    {
      name: 'ney', inst: ACOUSTIC.ney, lint: true,
      echo: { time: 0.6429, feedback: 0.38, mix: 0.35, lp: 1800 }, // dotted eighth, darkening repeats
      pattern: bars(
        '. . . . B4 - - - - - - - - - C5 B4', // 16 tokens = sixteenths
        '~A4 - - - - - - - G#4 A4 F4 - - - - -',
        'E4 - - - - - - - . . . . G#4 - A4 -',
        '~B4 - - - - - - - - - - - . . . .',
        '. . . . D5 - - - ~F5 - - - E5 D5 - -',
        'C5 - - - - - - - A4 - C5 - B4 - A4 -',
        'G#4 - - - - - F4 - E4 - - - - - - -',
        '. . . . . . . . . . . . . . . .',
      ),
    },
    ...padChannels('haze', ACOUSTIC.hazePad, dunesChords, '1 1 1 1', 'D3'),
    { name: 'drone', gain: 1, drone: { notes: ['E2', 'B2'], wave: 'triangle', detune: 5, lp: 650, shimmer: { rate: 0.15, depth: 0.3 }, vol: 0.5 } },
    {
      name: 'drums', kit: SOFT_KIT, gain: 0.8,
      pattern: bars(
        rep('D . . . . . k . D . . . T . . . | D . . . x . k . D . . . T . x .', 3),
        'D . . . . . k . D . . . T . . . | D . . . x . k . D . k . T k T k',
      ),
    },
    { name: 'zill', kit: SOFT_KIT, gain: 0.8, pattern: rep('. . . . . . . . Z . . . . . . . | . . . .', 4) },
  ],
};

// ----------------------------------------------------------------- battle ----
// Energetic JRPG battle. A minor (G# only over E), 150 bpm, 16 bars.
// A (1-8): Am F G Am | Am F G7 E · B (9-16): F G Em Am | Dm E F E7.
const battleChords = 'Am | F | G | Am | Am | F | G7 | E | F | G | Em | Am | Dm | E | F | E7';
const DRUM_BATTLE = 'K . H . S . H . K . K . S . H H';
const DRUM_BATTLE_CRASH = 'C . H . S . H . K . K . S . H H';
const DRUM_BATTLE_FILL = 'K . H . S . H . K . S . S S S S';
const battle = {
  name: 'battle', bpm: 150, bars: 16,
  chords: battleChords,
  scale: 'A B C D E F G G#',
  channels: [
    {
      name: 'lead', inst: { ...INST.lead, lp: 3600, vol: 0.4 }, lint: true,
      pattern: bars(
        'E5 - A4 - C5 E5 A5 -',
        'F5 - - E5 - - C5 -',
        'D5 - G5 - B5 - A5 G5',
        'A5 - - - - - - - E5 F5 E5 D5 C5 B4 C5 D5',
        'E5 - A4 - C5 E5 A5 -',
        'C6 - - B5 A5 - F5 -',
        'G5 - - F5 - - D5 -',
        'B4 - - E5 - - G#5 -',
        'A5 - C6 - A5 - F5 -',
        'B5 - D6 - B5 - G5 -',
        'E5 - G5 - B5 - - -',
        'C6 - - - - - - - B5 A5 G5 A5 B5 A5 G5 F5',
        'D5 - F5 - A5 - F5 -',
        'E5 - G#5 - B5 - G#5 -',
        'A5 - C6 - A5 - F5 -',
        'E5 - - D5 - C5 B4 -',
      ),
    },
    { name: 'arp', inst: { ...INST.arp, vol: 0.24 }, pattern: chordPattern(battleChords, '1 3 5 8 1 3 5 8 1 3 5 8 1 3 5 8', 'E3') },
    { name: 'bass', inst: INST.bassDrive, pattern: chordPattern(battleChords, '1 8 1 8 1 8 1 8', 'E2') },
    {
      name: 'drums', kit: KIT, gain: 0.8,
      pattern: bars(
        DRUM_BATTLE_CRASH, rep(DRUM_BATTLE, 6), DRUM_BATTLE_FILL,
        DRUM_BATTLE_CRASH, rep(DRUM_BATTLE, 6), DRUM_BATTLE_FILL,
      ),
    },
  ],
};

// ------------------------------------------------------------------- boss ----
// Menacing boss battle. D Phrygian (D Eb F G A Bb C) + borrowed A major (C#, E)
// as dominant. 140 bpm, 16 bars. Dm/Eb semitone rocking, then Gm Eb Bb A.
const bossChords = 'Dm | Eb | Dm | Eb | Dm | Eb | Cm | A | Gm | Eb | Bb | A | Gm | Cm | Eb | A';
const DRUM_BOSS = 'K . H K S . H . K K H . S . H K';
const DRUM_BOSS_CRASH = 'C . H K S . H . K K H . S . H K';
const DRUM_BOSS_FILL = 'K . H . S . M . M . M m S S S S';
const boss = {
  name: 'boss', bpm: 140, bars: 16,
  chords: bossChords,
  scale: 'D E Eb F G A Bb C C#',
  channels: [
    {
      name: 'lead', inst: { ...INST.lead, duty: 0.5, lp: 2600, vol: 0.42 }, lint: true,
      pattern: bars(
        'D5 - - - A4 - D5 -',
        'Eb5 - - - Bb4 - Eb5 -',
        'F5 - - - A5 - - -',
        'G5 - F5 - Eb5 - - -',
        'D5 - - - A4 - D5 -',
        'Eb5 - - - Bb4 - Eb5 -',
        'G5 - - - Eb5 - C5 -',
        'C#5 - - - E5 - - -',
        'D5 - - G5 - - Bb5 -',
        'Bb5 - - G5 - - Eb5 -',
        'F5 - - Bb5 - - D6 -',
        'C#6 - - - A5 - - -',
        'Bb5 - - A5 - - G5 -',
        'Eb5 - - D5 - - C5 -',
        'Bb4 - - Eb5 - - G5 -',
        'A5 - - - E5 - C#5 -',
      ),
    },
    { name: 'pad', inst: INST.pad, pattern: chordPattern(bossChords, '3 - - - 5 - - -', 'A3') },
    { name: 'bass', inst: INST.bassDrive, pattern: chordPattern(bossChords, '1 1 8 1 1 1 8 1', 'D2') },
    {
      name: 'drums', kit: KIT, gain: 0.85,
      pattern: bars(
        DRUM_BOSS_CRASH, rep(DRUM_BOSS, 6), DRUM_BOSS_FILL,
        DRUM_BOSS_CRASH, rep(DRUM_BOSS, 6), DRUM_BOSS_FILL,
      ),
    },
  ],
};

// ----------------------------------------------------------------- harbor ----
// Saltmere Harbor: gentle sea shanty, "the journey begins". D major, 6/8
// (beatsPerBar 2 = dotted-quarter beats, 6 tokens per bar = eighths) at 72,
// 16 bars (26.7 s). Accordion lead (detuned musette reeds), oom-pah bass +
// accordion chord "pah"s, barrel/clap/tambourine, distant seagull swoops.
// A (1-8): D G D A | D G A D · B (9-16): Bm G D A | Bm G D-A D.
const harborChords = 'D | G | D | A | D | G | A | D | Bm | G | D | A | Bm | G | D A | D';
const harbor = {
  name: 'harbor', bpm: 72, beatsPerBar: 2, bars: 16, tail: 4,
  chords: harborChords,
  scale: 'D E F# G A B C#',
  channels: [
    {
      name: 'accordion', inst: ACOUSTIC.accordion, lint: true,
      pattern: bars(
        'A4 - D5 D5 - E5',
        'D5 - B4 G4 - B4',
        'A4 - F#4 A4 - D5',
        'E5 - C#5 A4 - -',
        'A4 - D5 D5 - E5',
        'D5 - B4 G5 - F#5',
        'E5 - A4 C#5 - E5',
        'D5 - - - . A4',
        'B4 - C#5 D5 - B4',
        'G5 - F#5 E5 - D5',
        'F#5 - E5 D5 - A4',
        'E5 - F#5 E5 - C#5',
        'D5 - C#5 B4 - F#5',
        'B5 - A5 G5 - E5',
        'F#5 - D5 E5 - C#5',
        'D5 - A4 F#4 - A4',
      ),
    },
    { name: 'bass', inst: { ...INST.bass, gate: 0.55, vol: 0.55 }, pattern: chordPattern(harborChords, '1 . . 5 . .', 'D2') },
    { name: 'chord3', inst: ACOUSTIC.accordionChord, pattern: chordPattern(harborChords, '. . 3 . . 3', 'F#3') },
    { name: 'chord5', inst: ACOUSTIC.accordionChord, pattern: chordPattern(harborChords, '. . 5 . . 5', 'F#3') },
    {
      name: 'gulls', inst: ACOUSTIC.gull,
      echo: { time: 0.5556, feedback: 0.3, mix: 0.45, lp: 2200 }, // two eighths, far away
      pattern: bars(
        rep('. . . . . .', 2), '. . . E6 - -', 'A6 - . . . .',
        rep('. . . . . .', 6), '. . . . F#6 -', '. E6 - - . .',
        rep('. . . . . .', 4),
      ),
    },
    {
      name: 'perc', kit: SHANTY_KIT, gain: 0.55,
      pattern: bars(
        rep('B . j C . j', 7), 'B . J C J J',
        rep('B . j C . j', 7), 'B . J C C J',
      ),
    },
  ],
};

// ----------------------------------------------------------------- forest ----
// Greenwood River: calm, airy, flowing. G major with a mixolydian F chord
// (F natural). 90 bpm, 12 bars (32 s). Breath-flute lead with a few slides,
// pizzicato sixteenth arpeggios like running water, plucked upright bass,
// soft string pad, shaker on the off-beats and a soft frame drum.
// 1-4: G C G F · 5-8: Em C Am D · 9-12: G F C D.
const forestChords = 'G | C | G | F | Em | C | Am | D | G | F | C | D';
const forest = {
  name: 'forest', bpm: 90, bars: 12, tail: 4,
  chords: forestChords,
  scale: 'G A B C D E F F#',
  channels: [
    {
      name: 'flute', inst: ACOUSTIC.flute, lint: true,
      pattern: bars(
        'B4 - - - D5 - G5 -',
        'E5 - - - - - D5 C5',
        'D5 - - - B4 - G4 -',
        'A4 - - - C5 - F5 -',
        '~G5 - - - - - E5 -',
        'E5 - D5 C5 G4 - - -',
        'A4 - C5 - E5 - D5 C5',
        'F#5 - E5 - D5 - - -',
        'G5 - - - D5 - B4 -',
        'F5 - - - E5 - C5 -',
        'E5 - - - ~G5 - E5 D5',
        'D5 - - - - - . A4',
      ),
    },
    { name: 'pizz', inst: ACOUSTIC.pizz, pattern: chordPattern(forestChords, '1 5 8 10 12 10 8 5 1 5 8 10 12 10 8 5', 'G2') },
    { name: 'bass', inst: ACOUSTIC.pluckBass, pattern: chordPattern(forestChords, '1 - - - . . 5 -', 'D2') },
    ...padChannels('strings', { ...ACOUSTIC.strings, vol: 0.08 }, forestChords, '1 1 1 1', 'D3'),
    {
      name: 'perc', kit: SOFT_KIT, gain: 0.7,
      pattern: bars(
        rep('d . x . . . x . d . x . . . x x', 5), 'd . x . . . x . d . x . k . x x',
        rep('d . x . . . x . d . x . . . x x', 5), 'd . x . . . x . d . x . k . k x',
      ),
    },
  ],
};

// ------------------------------------------------------------- elvenglade ----
// Elf village: magical and serene. D Lydian (D E F# G# A B C#; the E major
// chord over the D tonic is the lydian #4). 72 bpm, 8 bars (26.7 s).
// Celesta melody with echo, harp arpeggios, glass bells every two bars,
// airy glass pad, soft piano bass.
// D E F#m E | Bm C#m D E (E -> D back to the top).
const elvenChords = 'D | E | F#m | E | Bm | C#m | D | E';
const elvenglade = {
  name: 'elvenglade', bpm: 72, bars: 8, tail: 6,
  chords: elvenChords,
  scale: 'D E F# G# A B C#',
  channels: [
    {
      name: 'celesta', inst: { ...ACOUSTIC.celesta, vol: 0.5 }, lint: true,
      echo: { time: 0.625, feedback: 0.3, mix: 0.28, lp: 2800 }, // dotted eighth
      pattern: bars(
        'A5 - - - G#5 - F#5 -',
        'G#5 - - - B5 - - -',
        'A5 - C#6 - - - A5 -',
        'B5 - - - G#5 - E5 -',
        'D6 - - - C#6 - B5 -',
        'E6 - - - C#6 - G#5 -',
        'F#5 - A5 - D6 - C#6 -',
        'B5 - - - G#5 - - -',
      ),
    },
    { name: 'harp', inst: ACOUSTIC.harp, pattern: chordPattern(elvenChords, '1 5 8 10 12 10 8 5 1 5 8 10 15 12 10 8', 'A2') },
    {
      name: 'bells', inst: ACOUSTIC.bells,
      pattern: bars(
        'D6 . . . . . . . | . . . . A5 . . .',
        'C#6 . . . . . . . | . . . . G#5 . . .',
        'F#6 . . . . . . . | . . . . E6 . . .',
        'D6 . . . . . . . | . . . . G#6 . . .',
      ),
    },
    ...padChannels('pad', ACOUSTIC.glassPad, elvenChords, '1 1 1 1', 'D3'),
    { name: 'piano', inst: { ...ACOUSTIC.piano, vol: 0.24 }, pattern: chordPattern(elvenChords, '1 - - - - - - -', 'D2') },
  ],
};

// ------------------------------------------------------------------ ruins ----
// Sunken Ruins: eerie, sparse and tense (skeletons lurk). A Phrygian
// (A Bb C D E F G), 64 bpm, 8 bars (30 s). Low A+E drone with slow breathing,
// muted plucks, a ghostly distant flute (E-F, the phrygian b2), dissonant
// swells (Bb+E tritone in bar 4, F+B in bar 8), distant ticks and bone
// rattles with echo, far thuds. Quiet on purpose (low RMS, peaky).
// Am Bb Am Am | Dm Bb Gm Bb (Bb -> Am phrygian cadence into the loop).
const ruinsChords = 'Am | Bb | Am | Am | Dm | Bb | Gm | Bb';
const ruins = {
  name: 'ruins', bpm: 64, bars: 8, tail: 6,
  chords: ruinsChords,
  scale: 'A Bb C D E F G',
  channels: [
    {
      name: 'pluck', inst: ACOUSTIC.mutedPluck, lint: true,
      echo: { time: 0.7031, feedback: 0.3, mix: 0.3, lp: 1200 }, // dotted eighth
      pattern: bars(
        'A3 . . C4 . . Bb3 .',
        'Bb3 . . . D4 . . .',
        'E4 . . . C4 . Bb3 A3',
        'A3 . . . . . . .',
        'F4 . . . E4 . D4 .',
        'D4 . . . . . F4 .',
        'G3 . . Bb3 . . A3 .',
        'Bb3 . . . . . . .',
      ),
    },
    {
      name: 'ghost', inst: ACOUSTIC.ghostFlute,
      echo: { time: 0.9375, feedback: 0.4, mix: 0.4, lp: 1400 },
      pattern: bars(rep('. . . . . . . .', 4), '. . . . E5 - - -', '~F5 - - - - - E5 -', '- - - . . . . .', '. . . . . . . .'),
    },
    { name: 'drone', gain: 1, drone: { notes: ['A1', 'E2'], wave: 'triangle', detune: 7, lp: 380, shimmer: { rate: 0.1, depth: 0.45 }, vol: 0.45 } },
    { name: 'swellA', inst: ACOUSTIC.swell, pattern: bars(rep('. . . . . . . .', 3), '. . . . Bb3 - - -', rep('. . . . . . . .', 3), '. . . . F3 - - -') },
    { name: 'swellB', inst: ACOUSTIC.swell, pattern: bars(rep('. . . . . . . .', 3), '. . . . E4 - - -', rep('. . . . . . . .', 3), '. . . . B3 - - -') },
    {
      name: 'perc', kit: RUIN_KIT, gain: 0.55,
      echo: { time: 0.4688, feedback: 0.35, mix: 0.5, lp: 1800 }, // eighth: distant, cavernous
      pattern: bars(
        'D . . . . . t . . . t . . . . .',
        '. . t . . . t . . . . . t . . .',
        'D . . . . . t . . . t . . . R .',
        '. . t . . . t . . . . . t . . t',
        'D . . . . . t . . . t . . . . .',
        '. . t . . . t . . . . . t . . .',
        'D . . . . . t . r . t . . . R .',
        '. . t . . . t . . . . . t t t t',
      ),
    },
  ],
};

// ----------------------------------------------------------------- temple ----
// Temple Mountain: calm, zen. D minor pentatonic (D F G A C), 64 bpm, 8 bars
// (30 s). Breathy shakuhachi with slides and a long hall echo, sparse koto
// plucks, a low temple bell every two bars, soft D+A sine drone.
// Chords only use pentatonic tones: Dm7 Dm7 Csus2 Dm7 | F Gsus2 Csus2 Dm7.
const templeChords = 'Dm7 | Dm7 | Csus2 | Dm7 | F | Gsus2 | Csus2 | Dm7';
const temple = {
  name: 'temple', bpm: 64, bars: 8, tail: 9,
  chords: templeChords,
  scale: 'D F G A C',
  channels: [
    {
      name: 'shakuhachi', inst: ACOUSTIC.shakuhachi, lint: true,
      echo: { time: 0.9375, feedback: 0.35, mix: 0.32, lp: 1600 }, // quarter: stone hall
      pattern: bars(
        '. . A4 - - - C5 D5',
        '~F5 - - - - - D5 C5',
        'D5 - - - - - . .',
        '. . C5 - A4 - G4 -',
        'A4 - - - - - C5 -',
        'D5 - - - ~G5 - - -',
        'G5 - F5 - D5 - C5 -',
        'D5 - - - - - . .',
      ),
    },
    {
      name: 'koto', inst: ACOUSTIC.koto, gain: 2.5,
      echo: { time: 0.7031, feedback: 0.3, mix: 0.3, lp: 2500 }, // dotted eighth
      pattern: chordPattern(templeChords, '1 . 5 . 8 . . . | . . 5 8 10 . 8 .', 'C3'),
    },
    { name: 'bell', inst: ACOUSTIC.templeBell, gain: 0.7, pattern: rep('D3 - - - - - - - | - - - - - - - .', 4) },
    { name: 'drone', gain: 1, drone: { notes: ['D2', 'A2'], wave: 'sine', detune: 4, lp: 500, shimmer: { rate: 0.07, depth: 0.35 }, vol: 0.32 } },
  ],
};

// ----------------------------------------------------------------- mirage ----
// Endless Dunes & Mirage Tower: hypnotic, shimmering, mysterious. A Hijaz /
// Phrygian dominant (A Bb C# D E F G), 96 bpm, 12 bars (30 s). Oud melody
// with echo over a muted-oud sixteenth ostinato, plucked bass, reverberant
// drifting pad, high celesta glints with long echoes, soft maqsum on darbuka.
// A Bb A A | Dm Gm Bb A | Dm Bb Gm A (Bb -> A is the hijaz cadence).
const mirageChords = 'A | Bb | A | A | Dm | Gm | Bb | A | Dm | Bb | Gm | A';
const DARBUKA = 'D . T k . k T . D . k . T . k .';
const mirage = {
  name: 'mirage', bpm: 96, bars: 12, tail: 6, saturate: 1.2,
  chords: mirageChords,
  scale: 'A Bb C# D E F G',
  channels: [
    {
      name: 'oud', inst: ACOUSTIC.oud, gain: 2.4, lint: true,
      echo: { time: 0.46875, feedback: 0.3, mix: 0.28, lp: 2200 }, // dotted eighth
      pattern: bars(
        'E5 - F5 E5 C#5 - Bb4 A4',
        'Bb4 - D5 - F5 - E5 D5',
        'C#5 - D5 C#5 Bb4 - A4 -',
        'A4 - - - . . . .',
        'D5 - F5 - A5 - G5 F5',
        'G5 - F5 E5 D5 - Bb4 -',
        'F5 - E5 D5 C#5 - D5 -',
        'E5 - - - . . . .',
        'A5 - Bb5 A5 G5 - F5 -',
        'D5 - F5 - Bb5 - A5 G5',
        'Bb4 - D5 - G5 F5 E5 D5',
        'C#5 - - Bb4 A4 - - .',
      ),
    },
    { name: 'ostinato', inst: ACOUSTIC.oudMuted, gain: 2, pattern: chordPattern(mirageChords, '1 . 1 5 . 1 8 . 1 . 1 5 3 . 5 .', 'D3') },
    { name: 'bass', inst: { ...ACOUSTIC.pluckBass, vol: 0.5 }, pattern: chordPattern(mirageChords, '1 - - . 1 - 5 -', 'D2') },
    ...padChannels('pad', ACOUSTIC.miragePad, mirageChords, '1 1 1 1', 'D3').map((c) => ({
      ...c, gain: 2, echo: { time: 0.9375, feedback: 0.45, mix: 0.4, lp: 1500 },
    })),
    {
      name: 'glint', inst: { ...ACOUSTIC.celesta, vol: 0.2 }, gain: 2,
      echo: { time: 0.46875, feedback: 0.5, mix: 0.5, lp: 4000 },
      pattern: bars(
        '. . . . . . . . . . E6 . . . . .', '. . . . . . F6 . . . . . . . . .',
        '. . . . . . . . . . A6 . . . . .', '. . . . . . C#7 . . . . . . . . .',
        '. . . . . . . . . . A6 . . . . .', '. . . . . . D6 . . . . . . . . .',
        '. . . . . . . . . . F6 . . . . .', '. . . . . . E6 . . . . . . . . .',
        '. . . . . . . . . . D7 . . . . .', '. . . . . . Bb6 . . . . . . . . .',
        '. . . . . . . . . . G6 . . . . .', '. . . . . . E6 . . . C#7 . . . . .',
      ),
    },
    {
      name: 'darbuka', kit: SOFT_KIT, gain: 0.45,
      pattern: bars(rep(DARBUKA, 11), 'D . T k T k T . D k T k T k T k'),
    },
    { name: 'zill', kit: SOFT_KIT, gain: 1, pattern: rep('Z . . . . . . . . . . . . . . . | . . . . | . . . . | . . . .', 3) },
  ],
};

// ----------------------------------------------------------------- island ----
// Verdant Isle: tropical and lively, a little mischievous (the vegetables are
// up to something). C major calypso, 126 bpm, 16 bars (30.5 s). Steel-drum
// lead, marimba comping with chromatic "snicker" runs in bars 8 and 16,
// bouncy plucked bass, bongos / conga / maracas. The B section sneaks in
// sideways: F#dim7 and the borrowed Ab (bVI) against G, played staccato.
// C F G7 C | Am D7 G G7 | C F F#dim7 C | Ab G Ab G7.
const islandChords = 'C | F | G7 | C | Am | D7 | G | G7 | C | F | F#dim7 | C | Ab | G | Ab | G7';
const islandPerc = (last) => bars(rep('H . h L H . h L H . h L H . L L', 7), last);
const island = {
  name: 'island', bpm: 126, bars: 16, tail: 3, saturate: 1.8,
  chords: islandChords,
  scale: 'C D Eb E F F# G Ab A B',
  channels: [
    {
      name: 'pan', inst: ACOUSTIC.steelPan, lint: true,
      pattern: bars(
        'E5 . G5 . C6 - A5 G5',
        'A5 - . F5 A5 . C6 -',
        'B5 - . G5 D5 . F5 E5',
        'E5 - - . . G5 F5 E5',
        'C5 - . A4 C5 . E5 -',
        'F#5 - . D5 F#5 . A5 -',
        'G5 - . B5 - . A5 G5',
        'F5 - . D5 B4 - . .',
        'E5 . G5 . C6 - A5 G5',
        'A5 - . F5 A5 . C6 -',
        'C6 - . A5 F#5 . A5 -',
        'G5 - - - E5 - . .',
        'Eb5 . C5 . Eb5 . Ab5 .',
        'G5 . . F#5 G5 . D5 .',
        'C6 . Ab5 . Eb5 . C5 .',
        'B4 . D5 F5 . G5 . .',
      ),
    },
    {
      name: 'marimba', inst: ACOUSTIC.marimba,
      pattern: replaceBars(chordPattern(islandChords, '1 . 5 8 . 5 3 .', 'G3'), {
        8: 'B5 Bb5 A5 Ab5 G5 . . .', // chromatic "snicker"
        16: 'D6 C#6 C6 B5 . G5 . .',
      }),
    },
    { name: 'bass', inst: { ...ACOUSTIC.pluckBass, damp: true, gate: 0.7, lp: 1100, vol: 0.85 }, pattern: chordPattern(islandChords, '1 . . 5 8 . 5 .', 'E2') },
    { name: 'bongos', kit: ISLAND_KIT, gain: 0.5, pattern: bars(islandPerc('H . h L H h L L H . L L H L H L'), islandPerc('H h H L H h L L H L H L H . . .')) },
    { name: 'conga', kit: ISLAND_KIT, gain: 0.55, pattern: rep('. . . . . . C C . . . . . . C .', 16) },
    { name: 'maracas', kit: ISLAND_KIT, gain: 2.4, pattern: rep('X x x x X x x x X x x x X x x x', 16) },
  ],
};

// ------------------------------------------------------------------- fear ----
// Hall of Fears: dark, tense, sparse. No tonal centre to lean on: a low C+G
// drone, dissonant swells (C/Db minor 2nd, F#/G, B/C), a 72 bpm heartbeat
// that skips a beat in bars 4 and 8, eerie theremin-like high tones sliding
// by semitones, and a few far-off ticks and rattles. 72 bpm, 8 bars (26.7 s).
// Kept quiet on purpose: peaks at -8 dBFS (`peakDb`), about 1 dB below `ruins` in RMS.
const HEART = 'L U . . L U . . L U . . L U . .';
const HEART_SKIP = 'L U . . L U . . . . . . L U . .';
const fear = {
  name: 'fear', bpm: 72, bars: 8, tail: 6, peakDb: -8,
  channels: [
    { name: 'drone', gain: 0.35, drone: { notes: ['C2', 'G2'], wave: 'triangle', detune: 9, lp: 330, shimmer: { rate: 0.08, depth: 0.5 }, vol: 0.5 } },
    { name: 'heart', kit: HEART_KIT, gain: 0.4, pattern: bars(rep(HEART, 3), HEART_SKIP, rep(HEART, 3), HEART_SKIP) },
    {
      name: 'swellA', inst: { ...ACOUSTIC.swell, vol: 0.15 },
      pattern: bars('C3 - - - - - - - | - - - . . . . .', rep('. . . . . . . .', 2), 'F#3 - - - - - - - | - - - . . . . .', '. . . . . . . .', '. . . . B2 - - -'),
    },
    {
      name: 'swellB', inst: { ...ACOUSTIC.swell, vol: 0.15 },
      pattern: bars('. . Db3 - - - - - | - - - . . . . .', rep('. . . . . . . .', 2), '. . G3 - - - - - | - - - . . . . .', '. . . . . . . .', '. . . . C3 - - -'),
    },
    {
      name: 'eerie', inst: ACOUSTIC.eerie,
      echo: { time: 0.625, feedback: 0.45, mix: 0.45, lp: 2500 }, // dotted eighth
      pattern: bars(rep('. . . . . . . .', 2), '. . . . B5 - - -', '~C6 - - - - - . .', rep('. . . . . . . .', 2), '. . F#6 - - - ~F6 -', '- - - . . . . .'),
    },
    {
      name: 'far', kit: HEART_KIT, gain: 0.4,
      echo: { time: 0.4167, feedback: 0.4, mix: 0.5, lp: 1600 }, // eighth: cavernous
      pattern: bars(
        '. . . . . . . . . . t . . . . .', '. . . . . . . . . . . . . . . .',
        '. . . . . . t . . . . . . . . .', '. . . . . . . . . . R . . . . .',
        '. . . . . . . . . . t . . . . .', '. . . . . . . . . . . . . . . .',
        '. . t . . . . . . . t . . . . .', '. . . . . . . . . . . . . . r .',
      ),
    },
  ],
};

// ------------------------------------------------------------------ final ----
// Final boss (undead toad in a poisonous cave): heavy, driving, dark and grand.
// C minor with a harmonic-minor G major dominant, the Neapolitan Db in the
// B section and a chromatic F-F#-G in the riff. 168 bpm (faster than `boss`),
// 16 bars (22.9 s). The riff (C C Eb C F C F# G) is stated by the lead and a
// low saw an octave+ below in bars 1, 3 and 5; the B section soars over
// sustained choir chords. Choir-like pad hits on the A-section downbeats,
// octave-pumping bass, pounding kick/tom kit with fills in bars 8 and 16.
// A: Cm Cm Ab G | Cm Cm Ab-Bb G · B: Fm Ab Fm G | Cm Ab Db G.
const finalChords = 'Cm | Cm | Ab | G | Cm | Cm | Ab Bb | G | Fm | Ab | Fm | G | Cm | Ab | Db | G';
const FINAL_RIFF = 'C5 C5 Eb5 C5 F5 C5 F#5 G5';
const DRUM_FINAL = 'K . H K S . K H K . H K S . K H';
const DRUM_FINAL_CRASH = 'C . H K S . K H K . H K S . K H';
const DRUM_FINAL_FILL = 'K . M . M . m m S . S S M M S S';
const HIT = '1 - - . . . . .';
const final = {
  name: 'final', bpm: 168, bars: 16, tail: 3,
  chords: finalChords,
  scale: 'C D Db Eb F F# G Ab Bb B',
  channels: [
    {
      name: 'lead', inst: { ...INST.lead, lp: 3400, vol: 0.4 }, lint: true,
      pattern: bars(
        FINAL_RIFF,
        'Eb5 - D5 C5 Bb4 - G4 -',
        FINAL_RIFF,
        'G5 - F5 - D5 - B4 -',
        FINAL_RIFF,
        'C6 - Bb5 G5 Ab5 - G5 F5',
        'Eb5 - C5 - F5 - D5 -',
        'D5 - B4 - G4 - - .',
        'C6 - - - Ab5 - F5 -',
        'Eb6 - - - C6 - Ab5 -',
        'F5 - Ab5 - C6 - Db6 C6',
        'B5 - - - D6 - - -',
        'G5 - Eb5 - C5 - Eb5 G5',
        'C6 - - - Bb5 Ab5 G5 -',
        'Db6 - - - Ab5 - F5 -',
        'B5 - D6 - B5 - G5 F5',
      ),
    },
    {
      name: 'riff', gain: 2, inst: { wave: 'saw', gate: 0.8, lp: 1300, vol: 0.3, env: { a: 0.003, d: 0.12, s: 0.6, r: 0.03 } },
      pattern: bars(
        'C3 C3 Eb3 C3 F3 C3 F#3 G3', '. . . . . . . .',
        'C3 C3 Eb3 C3 F3 C3 F#3 G3', '. . . . . . . .',
        'C3 C3 Eb3 C3 F3 C3 F#3 G3', rep('. . . . . . . .', 11),
      ),
    },
    { name: 'bass', inst: INST.bassDrive, pattern: chordPattern(finalChords, '1 1 8 1 1 8 1 8', 'C2') },
    ...padChannels('choir', ACOUSTIC.choir, finalChords, [
      HIT, HIT, HIT, HIT, HIT, HIT, '1 - . . 1 - . .', HIT,
      ...Array(8).fill('1 1 1 1 1 1 1 1'),
    ].join(' | '), 'G3').map((c) => ({ ...c, gain: 2, echo: { time: 0.5357, feedback: 0.3, mix: 0.3, lp: 1800 } })), // 3 eighths: cave
    {
      name: 'drums', kit: KIT, gain: 0.85,
      pattern: bars(
        DRUM_FINAL_CRASH, rep(DRUM_FINAL, 6), DRUM_FINAL_FILL,
        DRUM_FINAL_CRASH, rep(DRUM_FINAL, 6), DRUM_FINAL_FILL,
      ),
    },
  ],
};

/** All songs, written to library/v1/assets/audio/music/<name>.wav */
export const SONGS = [title, village, dunes, battle, boss, harbor, forest, elvenglade, ruins, temple, mirage, island, fear, final];
