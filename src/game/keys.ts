import type Phaser from "phaser";
import type { Database } from "../core/data/database";
import { graphicsOf } from "../core/chars/character";
import type { Character } from "../core/state/types";
import type { Dir } from "../core/util/grid";
import type { FacingRow } from "../engine/sprites/CharSprite";

/** Texture key conventions shared by the boot loader and the scenes. */
export const K = {
  charset: (id: string) => `charset:${id}`,
  battler: (id: string) => `battler:${id}`,
  face: (id: string) => `face:${id}`,
  battleback: (id: string) => `battleback:${id}`,
  chipset: (id: string) => `chipset:${id}`,
  decor: (id: string) => `decor:${id}`,
  boardCursor: "board_cursor",
  highlight: "highlight",
  fieldEffects: "field_effects",
  exitArrows: "exit_arrows",
  shadow: "shadow",
  titleBg: "title_bg",
  /** 10x10 status icons shown above characters. */
  statusMini: "status_icons",
};

/** Highlight frames in system/highlight.png. */
export const HL = { move: 0, attack: 1, ability: 2, area: 3, path: 4, disabled: 5 };

/** Grid facing → charset row. N = screen up-right, E = down-right, S = down-left, W = up-left. */
export const DIR_ROW: Record<Dir, FacingRow> = { E: 0, S: 1, N: 2, W: 3 };

/** Exit arrow frame for a grid direction (0 NE/N, 1 SE/E, 2 SW/S, 3 NW/W; +4 disabled). */
export const EXIT_FRAME: Record<Dir, number> = { N: 0, E: 1, S: 2, W: 3 };

export function faceKey(db: Database, c: Character): string | undefined {
  const f = graphicsOf(db, c).face;
  return f ? K.face(f) : undefined;
}

let iconIndex: Record<string, number> = {};
export function setIconIndex(idx: Record<string, number>) {
  iconIndex = idx;
}
export function icon(name: string | undefined): number | undefined {
  return name ? iconIndex[name] : undefined;
}

export function hasTexture(scene: Phaser.Scene, key: string) {
  return scene.textures.exists(key);
}

let miniIndex: Record<string, number> = {};
export function setMiniStatusIndex(idx: Record<string, number>) {
  miniIndex = idx;
}

/** Unique statuses of one or more characters, in order of appearance. */
function uniqueStatuses(chars: Character[]): string[] {
  const out: string[] = [];
  for (const c of chars) for (const s of c.statuses) if (!out.includes(s.id)) out.push(s.id);
  return out;
}

/** 16px icon frames (system/icons.png) for the statuses of one or more characters. */
export function statusIconsOf(db: Database, chars: Character[]): number[] {
  return uniqueStatuses(chars)
    .map((id) => icon(db.status(id).icon))
    .filter((i): i is number => i !== undefined);
}

/** 10px icon frames (system/status_icons.png): by status id, or by the icon name without "status_". */
export function miniStatusIconsOf(db: Database, chars: Character[]): number[] {
  return uniqueStatuses(chars)
    .map((id) => miniIndex[id] ?? miniIndex[(db.status(id).icon ?? "").replace(/^status_/, "")])
    .filter((i): i is number => i !== undefined);
}
