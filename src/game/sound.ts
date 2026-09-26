import type Phaser from "phaser";
import { AudioManager } from "../engine/audio";
import { loadAudio } from "../engine/assets";
import { setUiSoundHook } from "../engine/ui/widgets";
import type { Database } from "../core/data/database";
import type { GameEvent } from "../core/events";
import type { Ctx } from "../core/context";

import { SFX, type SfxName } from "./sfxNames";

export { SFX, type SfxName };

export const sfxKey = (n: string) => `sfx:${n}`;
export const musicKey = (n: string) => `music:${n}`;

let audio: AudioManager | null = null;

export function initAudio(game: Phaser.Game, volumes: { music: number; sfx: number }) {
  audio = new AudioManager(game);
  audio.setVolumes(volumes.music, volumes.sfx);
  setUiSoundHook((name) => sfx(name));
  return audio;
}

export function getAudio(): AudioManager | null {
  return audio;
}

/** All music tracks referenced by content (config + maps). */
export function musicTracks(db: Database): string[] {
  const set = new Set<string>(Object.values(db.config.music ?? {}));
  for (const m of db.maps.values()) if (m.music) set.add(m.music);
  for (const e of db.enemies.values()) if (e.music) set.add(e.music);
  return [...set];
}

export function preloadAudio(scene: Phaser.Scene, db: Database) {
  for (const n of SFX) loadAudio(scene, sfxKey(n), `audio/sfx/${n}.wav`);
  for (const m of musicTracks(db)) loadAudio(scene, musicKey(m), `audio/music/${m}.wav`);
}

export function sfx(name: SfxName, opts?: { volume?: number; rate?: number; throttleMs?: number }) {
  audio?.sfx(sfxKey(name), opts);
}

export function music(name: string | undefined, scene?: Phaser.Scene) {
  audio?.playMusic(name ? musicKey(name) : undefined, scene);
}

/** Sound for a rule event (board and battle share this). */
export function sfxForEvent(ctx: Ctx, e: GameEvent) {
  switch (e.type) {
    case "move":
      if (e.mode === "slide") sfx("freeze", { volume: 0.5 });
      else if (e.mode === "leap") sfx("step", { rate: 1.3 });
      else sfx("step", { volume: 0.6 });
      break;
    case "damage":
      sfx(e.crit ? "crit" : "hit");
      break;
    case "miss":
      sfx("miss");
      break;
    case "heal":
      if (e.amount > 0) sfx("heal");
      break;
    case "revive":
      sfx("heal", { rate: 0.8 });
      break;
    case "status":
      if (e.added && ctx.db.status(e.status).negative) sfx("status");
      break;
    case "ko":
      sfx("ko");
      break;
    case "fieldEffect":
      if (e.rounds > 0) sfx(e.effect === "burning" ? "burn" : e.effect === "frozen" ? "freeze" : "status");
      break;
    case "trap":
      sfx(e.triggeredBy ? "trap" : "confirm");
      break;
    case "terrain":
      sfx("burn", { rate: 0.8, volume: 0.6 });
      break;
    case "decor":
      sfx(e.cause === "cut" ? "cut" : e.cause === "grown" ? "grow" : "burn", { volume: 0.6 });
      break;
    case "shock":
      sfx("zap");
      break;
    case "state":
      sfx("gate", { volume: 0.7 });
      break;
    case "swallow":
      sfx("gulp");
      break;
    case "spit":
    case "release":
      sfx("spit");
      break;
    case "summoned":
      sfx("status", { rate: 0.6 });
      break;
    case "melt":
      sfx("freeze", { rate: 0.6 });
      break;
    case "wake":
      sfx("ko", { rate: 0.7 });
      break;
    case "uncovered":
      sfx("chest", { rate: 1.2 });
      break;
    case "steal":
      sfx(e.item ? "coin" : "buzzer");
      break;
    case "itemGained":
      sfx("chest");
      break;
    case "gold":
      sfx("coin");
      break;
    case "levelUp":
      audio?.jingle(sfxKey("levelup"));
      break;
    case "join":
      sfx("party");
      break;
    default:
      break;
  }
}

/** Element-based cast sound for battle abilities. */
export function castSound(ctx: Ctx, abilityId: string | undefined) {
  if (!abilityId) return;
  const a = ctx.db.ability(abilityId);
  const effects = a.battle?.effects ?? [];
  const el = effects.map((e) => ("element" in e ? e.element : undefined)).find(Boolean);
  if (el === "fire") sfx("magic_fire");
  else if (el === "ice") sfx("magic_ice");
  else if (el === "thunder") sfx("magic_thunder");
  else if (effects.some((e) => e.type === "heal" || e.type === "revive")) sfx("heal");
  else if (a.type === "Magic") sfx("magic_ice", { rate: 1.4 });
}
