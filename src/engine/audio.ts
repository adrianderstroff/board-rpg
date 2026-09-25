import type Phaser from "phaser";

/**
 * Music + sound effects on top of Phaser's global sound manager.
 * Missing sounds are ignored silently so content can be added incrementally.
 */
export class AudioManager {
  private music?: Phaser.Sound.BaseSound;
  private musicKey?: string;
  musicVolume = 0.5;
  sfxVolume = 0.7;
  private lastSfx = new Map<string, number>();

  constructor(private readonly game: Phaser.Game) {}

  private has(key: string) {
    return this.game.cache.audio.exists(key);
  }

  /** Crossfades to a looping track (no-op if it is already playing). `undefined` stops the music. */
  playMusic(key: string | undefined, scene?: Phaser.Scene, fadeMs = 500) {
    if (key === this.musicKey) return;
    const old = this.music;
    this.musicKey = key;
    this.music = undefined;
    if (old) this.fade(old, 0, fadeMs, scene, () => old.destroy());
    if (!key || !this.has(key)) return;
    const m = this.game.sound.add(key, { loop: true, volume: 0 });
    m.play();
    this.music = m;
    this.fade(m, this.musicVolume, fadeMs, scene);
  }

  /** Temporarily plays a one-shot jingle instead of the music (victory, level up). */
  jingle(key: string, volume = 1) {
    if (!this.has(key)) return;
    this.game.sound.play(key, { volume: this.sfxVolume * volume });
  }

  sfx(key: string, opts: { volume?: number; rate?: number; throttleMs?: number } = {}) {
    if (!this.has(key) || this.sfxVolume <= 0) return;
    const now = performance.now();
    const throttle = opts.throttleMs ?? 30;
    if (now - (this.lastSfx.get(key) ?? 0) < throttle) return;
    this.lastSfx.set(key, now);
    this.game.sound.play(key, { volume: this.sfxVolume * (opts.volume ?? 1), rate: opts.rate ?? 1 });
  }

  setVolumes(music: number, sfx: number) {
    this.musicVolume = music;
    this.sfxVolume = sfx;
    if (this.music && "setVolume" in this.music) (this.music as Phaser.Sound.WebAudioSound).setVolume(music);
  }

  /** Volume ramp on a plain timer, so fades survive scene changes. */
  private fade(sound: Phaser.Sound.BaseSound, to: number, ms: number, _scene?: Phaser.Scene, done?: () => void) {
    const s = sound as Phaser.Sound.WebAudioSound;
    const canSet = "setVolume" in s;
    const finish = () => {
      if (canSet) s.setVolume(to);
      if (to === 0) s.stop();
      done?.();
    };
    if (!canSet || ms <= 0) return finish();
    const from = s.volume;
    const start = performance.now();
    const timer = setInterval(() => {
      const k = Math.min(1, (performance.now() - start) / ms);
      s.setVolume(from + (to - from) * k);
      if (k >= 1) {
        clearInterval(timer);
        finish();
      }
    }, 30);
  }
}
