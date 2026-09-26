# Audio (generated)

`npm run audio` (`node tools/audio/generate.mjs`) generates every WAV file: the sound effects here (`sfx/`, the runtime's own) and the music into the library (`library/v1/assets/audio/music/`, docs/projects.md). Do not edit the files by hand. Change the generator in `tools/audio/` and run it again. The output is deterministic because all noise is seeded, so the same code always writes the same bytes.

- Format: RIFF WAV, 16-bit PCM, mono, **22050 Hz**.
- SFX peak at **-3 dBFS** and have 5 ms fade-in/out. Four small UI and ambient sounds are quieter on purpose: `cursor` -9, `dialog_blip` -12 and `step` -15 dBFS. The `sleep` jingle peaks at -6 dBFS so it stays gentle over a black screen.
- Music peaks at **-6 dBFS**, so SFX sit on top of it (`fear` peaks at -8 dBFS on purpose). Every song is a seamless loop: loop the **whole file**, from sample 0 to the end (no loop points needed).
- `node tools/audio/check.mjs` re-parses every file and prints its rate, duration, peak and size, plus the loop-seam jump for music. `generate.mjs` also runs it at the end.

## Sound effects: `sfx/<name>.wav`

| name | dur (s) | use / character |
|---|---|---|
| `cursor` | 0.03 | tiny tick when the menu or board cursor moves (-9 dBFS) |
| `confirm` | 0.20 | two rising blips (E5→B5) |
| `cancel` | 0.15 | two falling blips (E5→A4) |
| `buzzer` | 0.29 | invalid action, low detuned double buzz |
| `dialog_blip` | 0.03 | typewriter text, played every 2–3 characters (-12 dBFS) |
| `save` | 1.19 | three-bell chime G5–D6–G6 with echo |
| `party` | 0.27 | a character joins: two quick notes D5→A5 |
| `coin` | 0.43 | buy/sell, E6→B6 |
| `step` | 0.06 | soft footstep on sand (-15 dBFS) |
| `travel` | 0.58 | whoosh for a map change |
| `chest` | 1.02 | creak, clunk, then a G major sparkle |
| `trap` | 0.26 | metallic snap |
| `encounter` | 0.83 | battle-start rising swoosh ending in a hit |
| `escape` | 0.66 | scurrying steps, then a whoosh |
| `hit` | 0.13 | physical hit |
| `crit` | 0.32 | heavier double hit with a metallic clank |
| `miss` | 0.25 | whoosh |
| `magic_fire` | 0.76 | roar and crackle |
| `magic_ice` | 1.00 | high shimmering tinkle |
| `magic_thunder` | 0.99 | zap, crack and rumble |
| `heal` | 1.06 | rising C-major sparkle |
| `status` | 0.59 | debuff wobble (falling, detuned vibrato) |
| `ko` | 0.84 | long falling tone |
| `freeze` | 0.41 | ice crack |
| `burn` | 0.48 | fire whoosh with crackles |
| `zap` | 0.44 | electric crackle for lightning on the board: flickering, jittery saw arc, metallic short-LFSR fizz, dense crackles and two snaps |
| `gate` | 0.63 | heavy stone/metal gate sliding: stuttering low grind and rumble, a scraping metallic band, then a clunk as it stops |
| `splash` | 0.35 | water splash: low plop, falling spray of noise, then rising droplet bloops |
| `grow` | 0.62 | magical plant growth: a swelling leaf rustle, a rising shimmer sweep and a quick G-major-pentatonic sparkle run |
| `cut` | 0.28 | sword slash through bushes: fast swish, thin blade ring, snapping twigs and a leaf rustle |
| `gulp` | 0.46 | big wet swallow: squelch, gurgling throat slide down, the gulp plop and one small bubble |
| `spit` | 0.36 | wet spit-out: lip pop and spray, then a low wet splat with droplet crackles |
| `levelup` | 1.08 | bright C-major jingle |
| `victory` | 2.84 | fanfare (C: I – IV V – I) |
| `defeat` | 3.28 | slow A-minor lament |
| `sleep` | 3.29 | inn rest lullaby (-6 dBFS), F major 3/4 (F – Bb C – F): celesta music-box line C6-A5-F5, D6-Bb5-G5-E5 settling on a held F5, over harp arpeggios, a soft glass pad, plucked bass and one bell; the tail fades out smoothly to silence |

## Music: `music/<name>.wav`

Each file is exactly N bars long. Anything that rings past the last bar, such as release tails, harp rings or echoes, is already mixed into the start of the file. Looping the file sample-for-sample therefore sounds like one continuous performance. This has been verified against a two-pass render. The dunes drone is periodic by construction: every frequency is snapped to a whole number of cycles per loop.

| name | dur (s) | size | tempo / bars | key & form |
|---|---|---|---|---|
| `title` | 30.00 | 1.29 MB | 3/4 waltz, 96 bpm, 16 bars | High-fantasy, whimsical. F Lydian colour (C-major notes over F, with the G major chord). A: F G Em Am · F G C C · B: Dm Em F G · Dm Em G C. Celesta melody with echo, Karplus-Strong harp arpeggios, harp glissandi in bars 8 and 16, soft piano bass, light strings. About 2–3 dB quieter (RMS) than the other tracks: a calm menu with a peaky celesta |
| `village` | 28.80 | 1.24 MB | 100 bpm, 12 bars | D Phrygian dominant (hijaz). D D Eb D · D Gm Eb D · Gm Cm Eb D. Lead, oud-like pluck, bass, baladi hand-drum rhythm |
| `dunes` | 27.43 | 1.18 MB | 70 bpm, 8 bars | Hot, slow and hazy, mirage-mysterious. E Phrygian dominant (Hijaz). E F E E · Dm F E E. Breathy ney with slides and a darkening echo, an E+B open-fifth drone, a wavering heat-haze pad, sparse frame drum / doumbek / shaker, and a finger cymbal every two bars. Bar 8 is left open for the echo |
| `battle` | 25.60 | 1.10 MB | 150 bpm, 16 bars | A minor. Am F G Am · Am F G7 E · F G Em Am · Dm E F E7. Octave-bouncing bass, rock kit, fills in bars 8 and 16 |
| `boss` | 27.43 | 1.18 MB | 140 bpm, 16 bars | D Phrygian with an A-major dominant. Dm/Eb semitone rocking, then Gm Eb Bb A. Pad, pedal bass, toms |
| `harbor` | 26.67 | 1.15 MB | 6/8 shanty, dotted quarter = 72 (`beatsPerBar: 2`), 16 bars | Saltmere Harbor, warm "journey begins". D major. D G D A · D G A D · Bm G D A · Bm G D-A D. Accordion lead (`reed` voice: three detuned musette reeds, pulse + saw, bellows vibrato), oom-pah triangle bass with accordion chord "pah"s on the off-beats, barrel thump / clap / tambourine (`SHANTY_KIT`), and distant seagull swoops (`gullCry`) with echo in bars 3–4 and 11–12 |
| `forest` | 32.00 | 1.38 MB | 90 bpm, 12 bars | Greenwood River, calm and airy. G major with a mixolydian F chord. G C G F · Em C Am D · G F C D. Breath-flute lead with a few slides, pizzicato sixteenth arpeggios (damped Karplus-Strong) flowing like water, plucked upright bass, soft string pad, off-beat shaker and a soft frame drum |
| `elvenglade` | 26.67 | 1.15 MB | 72 bpm, 8 bars | Elf village, magical and serene. D Lydian (the E major chord over D is the #4). D E F#m E · Bm C#m D E. Celesta melody with echo, harp arpeggios, glass bells every two bars, airy detuned-triangle pad, soft piano bass. About 3 dB quieter (RMS) than village, like `title` |
| `ruins` | 30.00 | 1.29 MB | 64 bpm, 8 bars | Sunken Ruins, eerie, sparse and tense. A Phrygian. Am Bb Am Am · Dm Bb Gm Bb (Bb→Am cadence into the loop). Loop-synced A1+E2 drone with slow breathing, muted plucks with a dark echo, a ghostly distant flute (E→F slide) in bars 5–7, dissonant saw swells (Bb+E tritone in bar 4, F+B in bar 8), and distant ticks, bone rattles and far thuds (`RUIN_KIT`) through a cavernous echo. Kept quiet on purpose (about 4 dB lower RMS than village) |
| `temple` | 30.00 | 1.29 MB | 64 bpm, 8 bars | Temple Mountain, calm and zen. D minor pentatonic (D F G A C); the chords use only pentatonic tones: Dm7 Dm7 Csus2 Dm7 · F Gsus2 Csus2 Dm7. Breathy shakuhachi (`shakuhachi`: very breathy, late deep vibrato) with slides and a long stone-hall echo, sparse koto plucks (`koto`, bright Karplus-Strong near the bridge) with echo, a low temple bell (`templeBell`: sub-octave hum, minor-third strike tone, slow beating) every two bars, and a soft D2+A2 sine drone |
| `mirage` | 30.00 | 1.29 MB | 96 bpm, 12 bars | Endless Dunes & Mirage Tower, hypnotic and shimmering. A Hijaz / Phrygian dominant (A Bb C# D E F G). A Bb A A · Dm Gm Bb A · Dm Bb Gm A. Oud melody (`oud`) with echo over a muted-oud sixteenth ostinato (`oudMuted`), plucked bass, a reverberant drifting pad (`miragePad` + long echo), high celesta glints with long echoes, soft maqsum on darbuka (`SOFT_KIT`) and a finger cymbal every four bars. Uses `saturate: 1.2` |
| `island` | 30.48 | 1.31 MB | 126 bpm, 16 bars | Verdant Isle, tropical calypso with mischief. C major. C F G7 C · Am D7 G G7 · C F F#dim7 C · Ab G Ab G7 (the B section sneaks in sideways with F#dim7 and a staccato bVI). Steel-drum lead (`steelPan`), marimba comping (`marimba`) with chromatic snicker runs in bars 8 and 16, bouncy damped plucked bass, bongos / conga / maracas (`ISLAND_KIT`). Uses `saturate: 1.8` |
| `fear` | 26.67 | 1.15 MB | 72 bpm, 8 bars | Hall of Fears, dark, tense and sparse, no chords. Loop-synced C2+G2 drone, dissonant saw swells (C/Db, F#/G, B/C), a 72 bpm heartbeat (`HEART_KIT`) that skips a beat in bars 4 and 8, eerie theremin-like sine tones (`eerie`) sliding by semitones (B5→C6, F#6→F6) with echo, and a few far ticks and a rattle through a cavernous echo. Peaks at -8 dBFS (`peakDb`), about 1 dB lower RMS than `ruins` |
| `final` | 22.86 | 0.98 MB | 168 bpm, 16 bars | Final boss (undead toad in a poisonous cave): heavy, driving, grand; faster than `boss`. C minor with a harmonic-minor G major dominant and a Neapolitan Db. Cm Cm Ab G · Cm Cm Ab-Bb G · Fm Ab Fm G · Cm Ab Db G. The riff C C Eb C F C F# G (chromatic F→F#→G) is played by the lead and doubled by a low saw in bars 1, 3 and 5; the B section soars over sustained choir chords. Choir-like pad (`choir`: five detuned saws) hits on the A-section downbeats with a cave echo, octave-pumping bass, pounding kick/snare/tom kit with fills in bars 8 and 16 |

Total music size is about 17.4 MB. Every file is under 1.6 MB (`check.mjs` allows 20 MB in total; raised from 14 MB when temple, mirage, island, fear and final were added).

## Generator layout (`tools/audio/`)

| file | contents |
|---|---|
| `voices.mjs` | Non-chiptune voices with the same call shape as `tone()`. `pluckString` is a Karplus-Strong string (harp). `additive` builds piano, celesta and bells from inharmonic, individually decaying partials, with a unison-detune chorus and a hammer noise. `breathFlute` is a sine-ish flute with pitch-following breath noise, a chiff, soft attack, delayed vibrato and portamento. `ensemble` gives detuned drifting oscillators (strings, heat haze). `loopDrone` renders a loop-synced periodic drone. `reed` layers detuned pulse + saw reeds (accordion). `gullCry` is a rise-then-fall pitch swoop (seagull). |
| `synth.mjs` | Oscillators: PolyBLEP square with duty, triangle, saw, sine and NES 15-bit LFSR noise (long and short/metallic modes). Also the ADSR envelope, pitch slides, portamento (`glideFrom`), vibrato, one-pole low/high-pass filters, `layer`/`mixInto`/`concat`, `echo` (optionally with a low-pass in the feedback loop), `normalize`, `saturate` (tanh soft-clip), `fadeEdges` and note name → frequency. |
| `sequencer.mjs` | Pattern strings → note events → rendered song (looping or one-shot). |
| `theory.mjs` | Chord symbols, `chordPattern` (generates arpeggios and bass lines from a progression) and `lintSong` (checks melodies against the scale and the chords). |
| `instruments.mjs` | Instrument presets. `INST` holds the chiptune ones (`lead`, `arp`, `pluck`, `bass`, …). `ACOUSTIC` holds `harp`, `celesta`, `piano`, `ney`, `strings`, `hazePad`, `accordion`, `accordionChord`, `gull`, `flute`, `pizz`, `pluckBass`, `bells`, `glassPad`, `mutedPluck`, `ghostFlute`, `swell`, `shakuhachi`, `koto`, `templeBell`, `oud`, `oudMuted`, `miragePad`, `steelPan`, `marimba`, `choir` and `eerie`. Also the drum kits `KIT` (chip), `SOFT_KIT` (hand percussion), `SHANTY_KIT`, `RUIN_KIT`, `ISLAND_KIT` and `HEART_KIT`. |
| `sfx.mjs` | All sound effects. |
| `music.mjs` | All songs. |
| `wav.mjs` | WAV writer and validating parser. |
| `check.mjs` | Verification report. |

`node tools/audio/generate.mjs hit battle` regenerates only the files you name, which is faster while you iterate.

## Adding a sound effect

Add an entry to `DEFS` in `tools/audio/sfx.mjs`:

```js
whistle: {
  // peakDb: -6,           // optional, default -3
  render: () => layer([
    [T({ wave: 'square', duty: 0.25, freq: 'C6', to: 'G6', dur: 0.15, env: env(0.01, 0.1, 0.6, 0.05), lp: 4000 })],
    [noise({ dur: 0.05, env: env(0.001, 0.05), hp: 3000, vol: 0.3 }), 0.1],   // [buffer, startSec, gain]
  ]),
},
```

`tone()` options:
- `wave`: square, triangle, saw, sine or noise.
- `freq`: a note name or a number in Hz. For noise it is the LFSR clock rate.
- `to` and `slideTime`: pitch slide.
- `duty`: pulse width, either a number or a function of time.
- `vibrato`: `{ rate, depth (semitones), delay }`.
- `env`: `{ a, d, s, r }`. With `s: 0` the sound is a one-shot that always plays its full decay.
- `lp` and `hp`: filter cutoff in Hz, either a number or a function of time.
- `vol`

Trimming, fades and normalization are applied automatically. For a short melodic jingle, use `jingle({...})`, which takes the same song format as the music (see `levelup`).

## Adding a song

Add a song object to `tools/audio/music.mjs` and append it to `SONGS`:

```js
const chords = 'Am | F | G | E';
const mySong = {
  name: 'cave', bpm: 96, bars: 4, chords, scale: 'A B C D E F G G#',
  channels: [
    { name: 'lead', inst: INST.lead, lint: true, pattern: bars(
      'E5 - - C5 A4 - - .',           // 8 tokens = eighth notes
      'F5 - E5 - C5 - A4 -',
      'D5 - G5 - B5 - - .',
      'B4 - - - G#4 - - -',
    ) },
    { name: 'arp',  inst: INST.arp,  pattern: chordPattern(chords, '1 3 5 8 1 3 5 8 1 3 5 8 1 3 5 8', 'E3') },
    { name: 'bass', inst: INST.bass, pattern: chordPattern(chords, '1 - 5 - 1 - 5 -', 'E2') },
    { name: 'drums', kit: KIT, pattern: rep('K . H . S . H . K . K . S . H .', 4) },
  ],
};
```

Pattern syntax:
- Bars are separated by `|`. Each bar is divided evenly among its tokens: 8 tokens are eighth notes, 16 are sixteenths, 12 are triplets.
- `E4`, `G#4` and `Bb3` start a note. `~E4` slides into the note from the previous one (portamento). `-` holds the previous note, also across a bar line. `.` is a rest.
- A song can set `beatsPerBar: 3` for waltz time (see `title`). For 6/8, set `beatsPerBar: 2` with `bpm` = dotted quarters and write 6 tokens per bar (see `harbor`).
- Drums use kit letters: `K` kick, `S` snare, `H` hat, `O` open hat, `C` crash, `X` shaker, `D` doum, `T` tek and `M` tom. `SOFT_KIT` letters are `D` frame-drum doum, `T` doumbek tek, `K` ka, `X` shaker and `Z` finger cymbal. `SHANTY_KIT`: `B` barrel thump, `J` tambourine, `C` clap, `X` shaker. `RUIN_KIT`: `T` tick, `R` bone rattle, `D` far thud, `X` shaker. `ISLAND_KIT`: `H` bongo high, `L` bongo low, `C` conga, `X` maracas. `HEART_KIT`: `L` heartbeat lub, `U` dub, `T` tick, `R` bone rattle. A lowercase letter plays the same drum softer.

Other channel and instrument features:
- An instrument with `voice: pluckString` (or another voice) uses that voice instead of `tone`. Voice options sit next to it in the preset.
- `{ name, drone: { notes: ['E2', 'B2'], wave, detune, lp, shimmer, vol } }` gives a sustained, loop-synced drone channel.
- `echo: { time, feedback, mix, lp }` on a channel adds a feedback delay.
- Song-level `peakDb` (default -6) normalizes one song quieter (see `fear`). Song-level `saturate: k` applies a stateless tanh soft-clip before normalizing, which lifts the RMS of peaky plucked/mallet mixes by a few dB without touching the loop seam (see `mirage`, `island`).
- `padChannels(name, inst, chords, '1 1 1 1', low)` returns three tied pad channels (root, 3rd and 5th). `replaceBars(pattern, { 8: '...' })` swaps single bars, for example a glissando.

Avoid time-varying effects (chorus, LFOs) on a whole channel of a looping song. Put them inside a voice instead, as `ensemble` does, or snap their rates to the loop, as `loopDrone` does. Each note is rendered separately, so it wraps around the loop correctly.

`chordPattern` degree tokens are `1`, `3`, `5`, `7`, `8`, `10`, `12` and `15`. With `{ tie: true }`, a repeated note is held instead of played again. An `L` prefix plays the degree an octave lower. A bar with several chords (`'F G'`) splits its tokens evenly between them. The `low` argument sets the lowest note a chord root can take.

Checks when you add a song:
- Keep `bars × 240 / bpm × 22050` an integer so that the loop length is sample-exact. The generator warns if it is not.
- Keep the file under about 35 s (1.6 MB).
- `lintSong` warns about melody notes outside `scale` and about bar downbeats that are not in that bar's first chord. Channels opt in with `lint: true`.
