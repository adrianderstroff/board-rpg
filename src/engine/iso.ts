/** Isometric projection helpers (§5). Grid +x → screen down-right, +y → screen down-left. */
export interface IsoMetrics {
  tileWidth: number;
  tileHeight: number;
  blockHeight: number;
}

export const DEFAULT_ISO: IsoMetrics = { tileWidth: 32, tileHeight: 16, blockHeight: 8 };

/** Screen position of the centre of a cell's top face. */
export function isoToScreen(m: IsoMetrics, x: number, y: number, height = 0): { x: number; y: number } {
  return {
    x: ((x - y) * m.tileWidth) / 2,
    y: ((x + y) * m.tileHeight) / 2 - height * m.blockHeight,
  };
}

/** Grid cell (ignoring height) under a screen point. */
export function screenToIso(m: IsoMetrics, sx: number, sy: number): { x: number; y: number } {
  const a = sx / (m.tileWidth / 2);
  const b = sy / (m.tileHeight / 2);
  return { x: Math.floor((a + b + 1) / 2), y: Math.floor((b - a + 1) / 2) };
}

/** Painter's order: later diagonals are in front. Layers: 0 blocks, 20 overlays, 40 decor, 50 characters, 70 markers. */
export const LAYER = { block: 0, overlay: 20, effect: 30, decor: 40, char: 50, marker: 70 } as const;

export function isoDepth(x: number, y: number, layer: number, sub = 0): number {
  return (x + y) * 100 + layer + sub;
}
