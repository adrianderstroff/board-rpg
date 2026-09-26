import { useEffect, useRef, useState } from "preact/hooks";
import { getGrid } from "../../../src/core/board/grid";
import type { Database } from "../../../src/core/data/database";
import type { Pos } from "../../../src/core/util/grid";
import { CORNERS } from "../../../src/game/board/mapSource";
import type { EntitySprite } from "../entities/visuals";
import type { CanvasHandlers, Ghost, Marker } from "./IsoCanvas";
import { loadImage, terrainTops } from "./sprites";

const MARKER_COLORS = ["#0099db", "#e43b44", "#63c74d", "#feae34", "#ffffff", "#8b9bb4"];
const DIR_ARROW: Record<string, string> = { N: "↑", E: "→", S: "↓", W: "←" };

/** Letter per entity kind in the grid view. */
const KIND_MARK: Record<string, [string, string]> = {
  event: ["E", "#feae34"],
  exit: ["→", "#feae34"],
  spawn: ["⚑", "#2ce8f5"],
  enemy: ["☠", "#e43b44"],
  gate: ["G", "#c0cbdc"],
  switch: ["P", "#c0cbdc"],
  trap: ["T", "#2ce8f5"],
  sign: ["S", "#c0cbdc"],
  quickplay: ["▶", "#63c74d"],
};

interface Props {
  db: Database;
  mapId: string;
  hideDecor: boolean;
  dimBoard: boolean;
  markers: Marker[];
  entities: EntitySprite[];
  ghost: Ghost | null;
  handlers: CanvasHandlers;
}

/**
 * Flat top-down view of the same cells (editor-design §5.1): each terrain's top texture unwarped
 * into a square, height number, decor thumbnail, shape, facing; blocked cells darker. Quick for
 * painting large areas. Ctrl+wheel zooms; right button = the tool's eraser.
 */
export function GridCanvas({ db, mapId, hideDecor, dimBoard, markers, entities, ghost, handlers }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState(28);
  const [tops, setTops] = useState<Record<string, HTMLCanvasElement> | null>(null);
  const [decorImg, setDecorImg] = useState<HTMLImageElement | null>(null);
  const [hover, setHover] = useState<Pos | null>(null);
  const painting = useRef(false);
  const grid = getGrid(db, mapId);
  const chip = grid.chipset;

  useEffect(() => {
    void terrainTops(chip).then(setTops);
    void loadImage(chip.decorImage).then(setDecorImg);
  }, [chip]);

  useEffect(() => {
    const cv = canvas.current;
    if (!cv || !tops) return;
    cv.width = grid.width * size;
    cv.height = grid.height * size;
    const g = cv.getContext("2d")!;
    g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, cv.width, cv.height);
    const decorOf = (id: string, px: number, py: number, alpha = 1) => {
      if (!decorImg) return;
      const f = chip.decor[id].frame;
      const cols = Math.floor(decorImg.width / chip.decorFrameWidth);
      const h = chip.decorAnchorY + 4;
      g.globalAlpha = alpha;
      g.drawImage(decorImg, (f % cols) * chip.decorFrameWidth, Math.floor(f / cols) * chip.decorFrameHeight, chip.decorFrameWidth, h, px, py - size * 0.25, size, size * (h / chip.decorFrameWidth));
      g.globalAlpha = 1;
    };
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
          const cxy = (p: number[]): [number, number] => [px + (p[0] + 0.5) * size, py + (p[1] + 0.5) * size];
          pts.sort((a, b) => Math.atan2(a[1], a[0]) - Math.atan2(b[1], b[0])).forEach((p, i) => (i ? g.lineTo(...cxy(p)) : g.moveTo(...cxy(p))));
          g.closePath();
          g.clip();
        }
        const top = tops[c.terrain];
        if (top) g.drawImage(top, px, py, size, size);
        // higher cells lighter, so heights read at a glance
        g.fillStyle = `rgba(255,255,255,${Math.min(0.3, c.height * 0.025)})`;
        g.fillRect(px, py, size, size);
        if (!c.walkable || dimBoard) {
          g.fillStyle = dimBoard ? "rgba(20,22,28,0.55)" : "rgba(0,0,0,0.25)";
          g.fillRect(px, py, size, size);
        }
        g.restore();
        if (c.decor && !hideDecor) {
          decorOf(c.decor, px, py);
          if (c.decorDir) {
            g.fillStyle = "#feae34";
            g.font = `bold ${Math.round(size * 0.45)}px sans-serif`;
            g.fillText(DIR_ARROW[c.decorDir], px + size * 0.62, py + size * 0.95);
          }
        }
        if (c.height) {
          g.fillStyle = "rgba(0,0,0,0.6)";
          g.fillRect(px + 1, py + 1, size * 0.36 + (c.height > 9 ? size * 0.2 : 0), size * 0.36);
          g.fillStyle = "#fff";
          g.font = `${Math.round(size * 0.32)}px monospace`;
          g.fillText(String(c.height), px + 2, py + size * 0.32);
        }
        g.strokeStyle = "rgba(0,0,0,0.25)";
        g.strokeRect(px + 0.5, py + 0.5, size - 1, size - 1);
      }
    // entities: one mark per kind and cell, in the cell's lower right
    const drawn = new Set<string>();
    g.font = `bold ${Math.round(size * 0.42)}px sans-serif`;
    for (const e of entities) {
      const k = `${e.x},${e.y},${e.kind}`;
      if (drawn.has(k)) continue;
      drawn.add(k);
      const [ch, color] = KIND_MARK[e.kind];
      const n = [...drawn].filter((d) => d.startsWith(`${e.x},${e.y},`)).length - 1;
      g.fillStyle = "rgba(24,20,37,0.8)";
      g.fillRect(e.x * size + size - 11 - n * 10, e.y * size + size - 11, 10, 10);
      g.fillStyle = e.selected ? "#63c74d" : color;
      g.fillText(ch, e.x * size + size - 10 - n * 10, e.y * size + size - 2);
    }
    for (const m of [...markers, ...(hover ? [{ ...hover, frame: 0 }] : [])]) {
      g.strokeStyle = MARKER_COLORS[m.frame] ?? "#fff";
      g.lineWidth = 2;
      g.strokeRect(m.x * size + 1, m.y * size + 1, size - 2, size - 2);
      g.lineWidth = 1;
    }
    // the decor about to be placed
    if (ghost && hover && ghost.texture.startsWith("decor:")) {
      const id = Object.entries(chip.decor).find(([, d]) => d.frame === ghost.frame)?.[0];
      if (id) decorOf(id, hover.x * size, hover.y * size, 0.6);
    }
  }, [grid, tops, decorImg, size, hover, markers, hideDecor, dimBoard, entities, ghost]);

  const cellOf = (e: MouseEvent): Pos | null => {
    const r = canvas.current!.getBoundingClientRect();
    const x = Math.floor((e.clientX - r.left) / size);
    const y = Math.floor((e.clientY - r.top) / size);
    return x >= 0 && y >= 0 && x < grid.width && y < grid.height ? { x, y } : null;
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
        onContextMenu={(e) => e.preventDefault()}
        onMouseDown={(e) => {
          if (e.button !== 0 && e.button !== 2) return;
          const c = cellOf(e);
          if (!c) return;
          painting.current = true;
          handlers.down(c, e.button);
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
          handlers.move(null, false);
          if (painting.current) {
            painting.current = false;
            handlers.up(null);
          }
        }}
      />
    </div>
  );
}
