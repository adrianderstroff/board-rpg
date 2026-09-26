import type { Database } from "../../../src/core/data/database";
import type { MapDef } from "../../../src/core/data/types";
import { DIR_VEC, dirFromStep, type Dir } from "../../../src/core/util/grid";
import { EXIT_FRAME, K } from "../../../src/game/keys";
import { markerKey } from "./icons";
import { listEntities, sameRef, type EntityKind, type EntityRef } from "./model";

/** How an entity is drawn on the editor canvas (a sprite from the game's sheets, or a label). */
export interface EntitySprite {
  ref: EntityRef;
  kind: EntityKind;
  x: number;
  y: number;
  /** Texture + frame, drawn standing on the cell (origin = where the feet/anchor are). */
  texture?: string;
  frame?: number;
  originY?: number;
  /** Flat on the cell (exit arrows, traps) instead of standing. */
  flat?: boolean;
  /** Text shown above (editor-only markers always, others when labels are on). */
  label?: string;
  editorOnly?: boolean;
  selected?: boolean;
  /** What placing one would add, see-through under the cursor. */
  preview?: boolean;
}

/** Charset frame of a character standing idle, facing down-right (row 0, column 1). */
const IDLE_FRONT = 1;

const rotateDir = (d: Dir, quarters: number): Dir => {
  let { x, y } = DIR_VEC[d];
  for (let i = 0; i < ((quarters % 4) + 4) % 4; i++) [x, y] = [-y, x];
  return dirFromStep({ x: 0, y: 0 }, { x, y });
};

export function entitySprites(db: Database, map: MapDef, rotation: number, selected: EntityRef | null, labels: boolean): EntitySprite[] {
  const chip = db.chipsets.get(map.chipset);
  const decorFrame = (id: string | undefined) => (id ? chip?.decor[id]?.frame : undefined);
  const decorOrigin = chip ? chip.decorAnchorY / chip.decorFrameHeight : 40 / 48;
  const charset = (id: string | undefined) => (id && db.graphics.charsets[id] ? K.charset(id) : undefined);
  const out: EntitySprite[] = [];
  for (const e of listEntities(map)) {
    const base = { ref: { kind: e.kind, key: e.key }, kind: e.kind, x: e.x, y: e.y, selected: sameRef(selected, e) };
    switch (e.kind) {
      case "event": {
        const ev = map.events![e.key as number];
        // the look of its first page that shows something
        const page = ev.pages.find((p) => p.npc || p.decor || p.keeper) ?? ev.pages[0];
        const npc = page?.npc ?? page?.keeper;
        const tex = npc ? charset(db.npcs.get(npc)?.charset) : undefined;
        if (tex) out.push({ ...base, texture: tex, frame: IDLE_FRONT, originY: 1, label: labels ? ev.id : undefined });
        if (page?.decor) out.push({ ...base, texture: K.decor(map.chipset), frame: decorFrame(page.decor), originY: decorOrigin, label: labels && !tex ? ev.id : undefined });
        // nothing to show yet: a flat marker tile with the event icon
        if (!tex && !page?.decor) out.push({ ...base, texture: markerKey("event"), flat: true, label: labels ? ev.id : undefined, editorOnly: true });
        break;
      }
      case "enemy": {
        const en = map.enemies![e.key as number];
        const tex = charset(db.enemies.get(en.enemy)?.charset);
        out.push({ ...base, texture: tex, frame: IDLE_FRONT, originY: 1, label: labels || !tex ? e.label : undefined });
        break;
      }
      case "exit": {
        const ex = map.exits![e.key as number];
        out.push({ ...base, texture: K.exitArrows, frame: EXIT_FRAME[rotateDir(ex.dir, rotation)], flat: true, label: labels ? e.label : undefined, editorOnly: ex.door });
        break;
      }
      case "gate":
        out.push({ ...base, texture: K.decor(map.chipset), frame: decorFrame("gate_bars"), originY: decorOrigin, label: labels ? e.label : undefined });
        break;
      case "switch":
        out.push({ ...base, texture: K.decor(map.chipset), frame: decorFrame("switch_up"), originY: decorOrigin, label: labels ? e.label : undefined });
        break;
      case "trap":
        out.push({ ...base, texture: K.fieldEffects, frame: 32, flat: true, label: `trap ${e.label}`, editorOnly: true });
        break;
      case "sign":
        if (labels) out.push({ ...base, label: `sign: ${e.label}` });
        break;
      case "spawn":
        out.push({ ...base, texture: markerKey("spawn"), flat: true, label: labels ? e.label : undefined, editorOnly: true });
        break;
      case "quickplay":
        out.push({ ...base, texture: markerKey("quickplay"), flat: true, label: labels ? "Quick Play" : undefined, editorOnly: true });
        break;
    }
  }
  return out;
}

/** The placing preview: the kind's marker tile on the hovered cell. */
export function placingSprite(kind: EntityKind, at: { x: number; y: number }): EntitySprite {
  return { ref: { kind, key: "preview" }, kind, x: at.x, y: at.y, texture: markerKey(kind), flat: true, editorOnly: true, preview: true };
}
