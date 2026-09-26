/** Sound effect names available under public/assets/audio/sfx/<name>.wav. */
export const SFX = [
  "cursor", "confirm", "cancel", "buzzer", "step", "hit", "crit", "miss", "magic_fire", "magic_ice", "magic_thunder",
  "heal", "status", "ko", "levelup", "victory", "defeat", "coin", "travel", "chest", "trap", "freeze", "burn",
  "encounter", "escape", "save", "dialog_blip", "party", "sleep", "zap", "gate", "splash", "grow", "cut", "gulp", "spit",
] as const;
export type SfxName = (typeof SFX)[number];
