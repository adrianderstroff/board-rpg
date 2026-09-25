// Music: seamless looping songs.
//
// Each song = tempo + chord progression + channels. Melodies are written by
// hand (one bar per line, 8 tokens = eighth notes, 16 = sixteenths).
// Accompaniment (arpeggios, bass) is generated from the chord progression
// with `chordPattern`, so it always stays on chord tones / roots.
// `scale` + `chords` are also used by `lintSong` to check the melody.
import { INST, KIT, ACOUSTIC, SOFT_KIT } from './instruments.mjs';
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

/** All songs, written to public/assets/audio/music/<name>.wav */
export const SONGS = [title, village, dunes, battle, boss];
