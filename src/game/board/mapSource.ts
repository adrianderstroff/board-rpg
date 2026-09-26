import type { Database } from "../../core/data/database";
import type { Corner, MapDef, TerrainDef } from "../../core/data/types";
import { DOOR_CLEARANCE, type GridView } from "../../core/board/grid";
import { DIR_VEC, type Dir, type Pos } from "../../core/util/grid";
import type { IsoCellSource, IsoMapSource, WallDecorSource } from "../../engine/iso/IsoMapView";
import { cutSquare, viewFrames } from "../../engine/iso/shapes";
import { K } from "../keys";

/**
 * How a board's cells are drawn: grid cells + chipset → the engine's IsoMapView sources.
 * Shared by the game's BoardView and the editor's map canvas, so both show a map identically.
 */

/** Continuous rotation of grid coordinates by `quarters` quarter turns (fractional while animating). */
export const rotateContinuous = (x: number, y: number, quarters: number): Pos => {
  const a = (quarters * Math.PI) / 2;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return { x: x * c - y * s, y: x * s + y * c };
};

/** Grid offset signs of the named cell corners (N = -y, W = -x). */
export const CORNERS: Record<Corner, { x: number; y: number }> = { NW: { x: -1, y: -1 }, NE: { x: 1, y: -1 }, SE: { x: 1, y: 1 }, SW: { x: -1, y: 1 } };

/** Sides of a hull cell where a walkable non-hull cell (a gangplank, the quay) joins: no wall there. */
function gangways(g: GridView, cell: Pos): number[] {
  return [
    [1, 0],
    [0, 1],
    [-1, 0],
    [0, -1],
  ].flatMap(([dx, dy], side) => {
    const n = g.cell({ x: cell.x + dx, y: cell.y + dy });
    return n && n.walkable && !g.chipset.terrains[n.terrain].flare ? [side] : [];
  });
}

/** Quarter turns from the default facing S (the board turns S → W → N → E). */
const FACING_TURNS: Record<Dir, number> = { S: 0, W: 1, N: 2, E: 3 };

/** Frames of a directional decor per board rotation, turned to face `dir`. */
function decorViews(d: { frame: number; views?: number }, dir: Dir = "S"): number[] {
  const frames = Array.from({ length: d.views ?? 1 }, (_, i) => d.frame + i);
  return viewFrames(frames, FACING_TURNS[dir] * (frames.length / 4));
}

/** The flat surface (sea) drawn under a hull at height 0. */
function underlay(t: TerrainDef) {
  return { frame: t.frame, height: 0, sink: t.sink ?? (t.frames ? 2 : 0) };
}

/** A door lintel: the overhead terrain's blocks above the door's clearance up to its top. */
function overheadSource(chip: GridView["chipset"], cell: { height: number; overhead?: { terrain: string; top: number } }) {
  const t = chip.terrains[cell.overhead!.terrain];
  return { from: cell.height + DOOR_CLEARANCE + 1, to: cell.overhead!.top, top: t.frame, fill: t.fill ?? t.frame };
}

/** Every cell of a grid as the engine draws it. */
export function cellSources(g: GridView): IsoCellSource[] {
  const chip = g.chipset;
  return g.allCells().map((cell) => {
    const t = chip.terrains[cell.terrain];
    return {
      x: cell.x,
      y: cell.y,
      height: cell.height,
      top: t.frame,
      topFrames: t.frames,
      fill: t.fill ?? t.frame,
      sink: t.sink ?? (t.frames ? 2 : 0),
      decor: cell.decor ? chip.decor[cell.decor].frame : undefined,
      ...(cell.decor && chip.decor[cell.decor].views ? { decorViews: decorViews(chip.decor[cell.decor], cell.decorDir) } : {}),
      ...(cell.decor && !chip.decor[cell.decor].blocks ? { pickDecor: true } : {}),
      ...(cell.overhead ? { overhead: overheadSource(chip, cell) } : {}),
      ...(cell.cut ? { outline: cutSquare(cell.cut.map((k) => CORNERS[k])) } : {}),
      ...(t.flare ? { flare: t.flare } : {}),
      ...(t.underlay ? { under: underlay(chip.terrains[t.underlay]) } : {}),
      ...(t.bulwark ? { bulwark: { height: t.bulwark, thickness: 0.14, open: gangways(g, cell) } } : {}),
    };
  });
}

/** The engine's map source for a grid (textures by the game's texture keys). */
export function isoMapSource(g: GridView): IsoMapSource {
  const chip = g.chipset;
  return {
    metrics: { tileWidth: chip.tileWidth, tileHeight: chip.tileHeight, blockHeight: chip.blockHeight },
    cells: cellSources(g),
    blockTexture: K.chipset(chip.id),
    blockFrameHeight: chip.frameHeight,
    decorTexture: K.decor(chip.id),
    decorFrameHeight: chip.decorFrameHeight,
    decorAnchorY: chip.decorAnchorY,
  };
}

/** Lettering painted on one side of a block (shop signs). */
export function wallDecorSources(db: Database, map: MapDef, g: GridView): WallDecorSource[] {
  const signs = db.graphics.wallSigns;
  return (map.wallDecor ?? []).map((w) => ({
    x: w.x,
    y: w.y,
    face: DIR_VEC[w.face],
    level: w.level ?? g.heightAt(w),
    texture: K.wallSigns,
    frame: signs?.frames[w.sign] ?? 0,
  }));
}
