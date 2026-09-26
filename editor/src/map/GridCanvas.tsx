import { useEffect, useRef, useState } from "preact/hooks";
import { getGrid } from "../../../src/core/board/grid";
import type { Database } from "../../../src/core/data/database";
import type { Pos } from "../../../src/core/util/grid";
import { CORNERS } from "../../../src/game/board/mapSource";
import type { CanvasHandlers, Marker } from "./IsoCanvas";
import { loadImage, terrainColors } from "./sprites";

const MARKER_COLORS = ["#0099db", "#e43b44", "#63c74d", "#feae34", "#ffffff", "#8b9bb4"];
const DIR_ARROW: Record<string, string> = { N: "↑", E: "→", S: "↓", W: "←" };

/**
 * Flat top-down view of the same cells (editor-design §5.1): terrain colour, height number, decor
 * thumbnail, shape, facing; blocked cells darker. Fast for painting large areas. Ctrl+wheel zooms.
 */
export function GridCanvas({ db, mapId, hideDecor, markers, handlers }: { db: Database; mapId: string; hideDecor: boolean; markers: Marker[]; handlers: CanvasHandlers }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState(26);
  const [colors, setColors] = useState<Record<string, string> | null>(null);
  const [decorImg, setDecorImg] = useState<HTMLImageElement | null>(null);
  const [hover, setHover] = useState<Pos | null>(null);
  const painting = useRef(false);
  const grid = getGrid(db, mapId);
  const chip = grid.chipset;

  useEffect(() => {
    void terrainColors(chip).then(setColors);
    void loadImage(chip.decorImage).then(setDecorImg);
  }, [chip]);

  useEffect(() => {
    const cv = canvas.current;
    if (!cv || !colors) return;
    cv.width = grid.width * size;
    cv.height = grid.height * size;
    const g = cv.getContext("2d")!;
    g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, cv.width, cv.height);
    for (let y = 0; y < grid.height; y++)
      for (let x = 0; x < grid.width; x++) {
        const c = grid.cell({ x, y });
        const px = x * size;
        const py = y * size;
        if (!c) {
          g.fillStyle = "#0b0c10";
          g.fillRect(px, py, size, size);
          continue;
        }
        g.save();
        if (c.cut) {
          // only the part of the cell its shape keeps
          const pts = [
            [-0.5, -0.5],
            [0.5, -0.5],
            [0.5, 0.5],
            [-0.5, 0.5],
          ].filter(([cx, cy]) => !c.cut!.some((k) => CORNERS[k].x === Math.sign(cx) && CORNERS[k].y === Math.sign(cy)));
          if (c.cut.length === 2) pts.push([0, 0]);
          g.beginPath();
          const cxy = (p: number[]) => [px + (p[0] + 0.5) * size, py + (p[1] + 0.5) * size];
          const sorted = pts.sort((a, b) => Math.atan2(a[1], a[0]) - Math.atan2(b[1], b[0]));
          sorted.forEach((p, i) => (i ? g.lineTo(...(cxy(p) as [number, number])) : g.moveTo(...(cxy(p) as [number, number]))));
          g.closePath();
          g.clip();
        }
        g.fillStyle = colors[c.terrain] ?? "#555";
        g.fillRect(px, py, size, size);
        // higher cells lighter, so heights read at a glance
        g.fillStyle = `rgba(255,255,255,${Math.min(0.35, c.height * 0.03)})`;
        g.fillRect(px, py, size, size);
        if (!c.walkable) {
          g.fillStyle = "rgba(0,0,0,0.28)";
          g.fillRect(px, py, size, size);
        }
        g.restore();
        if (c.decor && !hideDecor && decorImg) {
          const f = chip.decor[c.decor].frame;
          const cols = Math.floor(decorImg.width / chip.decorFrameWidth);
          g.drawImage(decorImg, (f % cols) * chip.decorFrameWidth, Math.floor(f / cols) * chip.decorFrameHeight, chip.decorFrameWidth, chip.decorAnchorY + 4, px, py, size, size * ((chip.decorAnchorY + 4) / chip.decorFrameWidth) * 0.9);
          if (c.decorDir) {
            g.fillStyle = "#feae34";
            g.font = `bold ${Math.round(size * 0.45)}px sans-serif`;
            g.fillText(DIR_ARROW[c.decorDir], px + size * 0.62, py + size * 0.95);
          }
        }
        if (c.height) {
          g.fillStyle = "rgba(0,0,0,0.65)";
          g.font = `${Math.round(size * 0.36)}px monospace`;
          g.fillText(String(c.height), px + 2, py + size * 0.36);
        }
        g.strokeStyle = "rgba(0,0,0,0.25)";
        g.strokeRect(px + 0.5, py + 0.5, size - 1, size - 1);
      }
    for (const m of [...markers, ...(hover ? [{ ...hover, frame: 0 }] : [])]) {
      g.strokeStyle = MARKER_COLORS[m.frame] ?? "#fff";
      g.lineWidth = 2;
      g.strokeRect(m.x * size + 1, m.y * size + 1, size - 2, size - 2);
      g.lineWidth = 1;
    }
  }, [grid, colors, decorImg, size, hover, markers, hideDecor]);

  const cellOf = (e: MouseEvent): Pos | null => {
    const r = canvas.current!.getBoundingClientRect();
    const x = Math.floor((e.clientX - r.left) / size);
    const y = Math.floor((e.clientY - r.top) / size);
    return grid.has({ x, y }) || (x >= 0 && y >= 0 && x < grid.width && y < grid.height) ? { x, y } : null;
  };

  return (
    <div
      class="grid-canvas"
      onWheel={(e) => {
        if (!e.ctrlKey) return;
        e.preventDefault();
        setSize((s) => Math.max(10, Math.min(64, Math.round(s * (e.deltaY > 0 ? 0.85 : 1.18)))));
      }}
    >
      <canvas
        ref={canvas}
        onMouseDown={(e) => {
          if (e.button !== 0) return;
          const c = cellOf(e);
          if (!c) return;
          painting.current = true;
          handlers.down(c);
        }}
        onMouseMove={(e) => {
          const c = cellOf(e);
          if (c?.x !== hover?.x || c?.y !== hover?.y) {
            setHover(c);
            handlers.move(c, painting.current);
          }
        }}
        onMouseUp={(e) => {
          if (!painting.current) return;
          painting.current = false;
          handlers.up(cellOf(e));
        }}
        onMouseLeave={() => {
          setHover(null);
          if (painting.current) {
            painting.current = false;
            handlers.up(null);
          }
        }}
      />
    </div>
  );
}
