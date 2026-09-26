import { AxisGizmo, TOP_AXES } from "./Gizmo";
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

/** Letter per entity kind in the top view. */
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
  dim: "board" | "decor" | null;
  markers: Marker[];
  entities: EntitySprite[];
  ghost: Ghost | null;
  showGrid: boolean;
  resizeTo?: { w: number; h: number } | null;
  handlers: CanvasHandlers;
}

/** Where the map sits on the canvas: top-left corner and cell size in pixels. */
interface Camera {
  x: number;
  y: number;
  cell: number;
}

/**
 * Flat top view of the same cells (editor-design §5.1): each terrain's top texture unwarped into a
 * square, height number, decor thumbnail, piece shape, facing; blocked cells darker. Wheel zooms
 * (around the cursor), middle drag or Space + drag pans; right mouse = the tool's eraser.
 */
export function GridCanvas({ db, mapId, hideDecor, dim, markers, entities, ghost, showGrid, resizeTo, handlers }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [cam, setCam] = useState<Camera | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [tops, setTops] = useState<Record<string, HTMLCanvasElement> | null>(null);
  const [decorImg, setDecorImg] = useState<HTMLImageElement | null>(null);
  const [hover, setHover] = useState<Pos | null>(null);
  const painting = useRef(false);
  const pan = useRef<{ x: number; y: number; cam: Camera } | null>(null);
  const space = useRef(false);
  const grid = getGrid(db, mapId);
  const chip = grid.chipset;

  useEffect(() => {
    void terrainTops(chip).then(setTops);
    void loadImage(chip.decorImage).then(setDecorImg);
  }, [chip]);

  // the canvas fills its area
  useEffect(() => {
    const el = host.current!;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // a new map: fit it and centre it
  useEffect(() => {
    if (!size.w || !size.h) return;
    const cell = Math.max(8, Math.min(48, Math.floor(Math.min((size.w - 40) / grid.width, (size.h - 40) / grid.height))));
    setCam({ cell, x: Math.round((size.w - grid.width * cell) / 2), y: Math.round((size.h - grid.height * cell) / 2) });
  }, [mapId, size.w > 0 && size.h > 0]);

  // Space + drag pans
  useEffect(() => {
    const keys = (e: KeyboardEvent) => {
      if (e.code === "Space") space.current = e.type === "keydown";
    };
    window.addEventListener("keydown", keys);
    window.addEventListener("keyup", keys);
    return () => {
      window.removeEventListener("keydown", keys);
      window.removeEventListener("keyup", keys);
    };
  }, []);

  useEffect(() => {
    const cv = canvas.current;
    if (!cv || !tops || !cam) return;
    cv.width = size.w;
    cv.height = size.h;
    const g = cv.getContext("2d")!;
    g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, cv.width, cv.height);
    const S = cam.cell;
    const at = (x: number, y: number) => [cam.x + x * S, cam.y + y * S] as const;
    const decorOf = (id: string, px: number, py: number, alpha = 1) => {
      if (!decorImg) return;
      const f = chip.decor[id].frame;
      const cols = Math.floor(decorImg.width / chip.decorFrameWidth);
      const h = chip.decorAnchorY + 4;
      g.globalAlpha = alpha;
      g.drawImage(decorImg, (f % cols) * chip.decorFrameWidth, Math.floor(f / cols) * chip.decorFrameHeight, chip.decorFrameWidth, h, px, py - S * 0.25, S, S * (h / chip.decorFrameWidth));
      g.globalAlpha = 1;
    };
    for (let y = 0; y < grid.height; y++)
      for (let x = 0; x < grid.width; x++) {
        const c = grid.cell({ x, y });
        const [px, py] = at(x, y);
        if (px > size.w || py > size.h || px + S < 0 || py + S < 0) continue;
        if (!c) {
          // an empty cell of the map: a faint white grid
          if (showGrid) {
            g.strokeStyle = "rgba(255,255,255,0.3)";
            g.strokeRect(px + 0.5, py + 0.5, S - 1, S - 1);
          }
          continue;
        }
        g.save();
        if (c.cut) {
          // only the part of the cell its piece keeps
          const pts = [
            [-0.5, -0.5],
            [0.5, -0.5],
            [0.5, 0.5],
            [-0.5, 0.5],
          ].filter(([cx, cy]) => !c.cut!.some((k) => CORNERS[k].x === Math.sign(cx) && CORNERS[k].y === Math.sign(cy)));
          if (c.cut.length === 2) pts.push([0, 0]);
          g.beginPath();
          const cxy = (p: number[]): [number, number] => [px + (p[0] + 0.5) * S, py + (p[1] + 0.5) * S];
          pts.sort((a, b) => Math.atan2(a[1], a[0]) - Math.atan2(b[1], b[0])).forEach((p, i) => (i ? g.lineTo(...cxy(p)) : g.moveTo(...cxy(p))));
          g.closePath();
          g.clip();
        }
        const top = tops[c.terrain];
        if (top) g.drawImage(top, px, py, S, S);
        // higher cells lighter, so heights read at a glance
        g.fillStyle = `rgba(255,255,255,${Math.min(0.3, c.height * 0.025)})`;
        g.fillRect(px, py, S, S);
        if (!c.walkable || dim === "board") {
          g.fillStyle = dim === "board" ? "rgba(20,22,28,0.55)" : "rgba(0,0,0,0.25)";
          g.fillRect(px, py, S, S);
        }
        g.restore();
        if (c.decor && !hideDecor) {
          decorOf(c.decor, px, py, dim === "decor" ? 0.45 : 1);
          if (c.decorDir) {
            g.fillStyle = "#feae34";
            g.font = `bold ${Math.round(S * 0.45)}px sans-serif`;
            g.fillText(DIR_ARROW[c.decorDir], px + S * 0.62, py + S * 0.95);
          }
        }
        if (c.height) {
          g.fillStyle = "rgba(0,0,0,0.6)";
          g.fillRect(px + 1, py + 1, S * 0.36 + (c.height > 9 ? S * 0.2 : 0), S * 0.36);
          g.fillStyle = "#fff";
          g.font = `${Math.round(S * 0.32)}px monospace`;
          g.fillText(String(c.height), px + 2, py + S * 0.32);
        }
        if (showGrid) {
          g.strokeStyle = "rgba(255,255,255,0.16)";
          g.strokeRect(px + 0.5, py + 0.5, S - 1, S - 1);
        }
      }
    // entities: one mark per kind and cell, in the cell's lower right
    const drawn = new Set<string>();
    g.font = `bold ${Math.round(S * 0.42)}px sans-serif`;
    for (const e of entities) {
      const k = `${e.x},${e.y},${e.kind}`;
      if (drawn.has(k)) continue;
      drawn.add(k);
      const [ch, color] = KIND_MARK[e.kind];
      const n = [...drawn].filter((d) => d.startsWith(`${e.x},${e.y},`)).length - 1;
      const [px, py] = at(e.x, e.y);
      g.fillStyle = "rgba(24,20,37,0.8)";
      g.fillRect(px + S - 11 - n * 10, py + S - 11, 10, 10);
      g.fillStyle = e.selected ? "#63c74d" : color;
      g.fillText(ch, px + S - 10 - n * 10, py + S - 2);
    }
    // a pending resize: the cells it adds green, the ones it drops red
    if (resizeTo) {
      for (let y = 0; y < Math.max(grid.height, resizeTo.h); y++)
        for (let x = 0; x < Math.max(grid.width, resizeTo.w); x++) {
          const add = x >= grid.width || y >= grid.height;
          const drop = !add && (x >= resizeTo.w || y >= resizeTo.h);
          if (!add && !drop) continue;
          const [px, py] = at(x, y);
          g.fillStyle = add ? "rgba(99,199,77,0.2)" : "rgba(228,59,68,0.4)";
          g.fillRect(px, py, S, S);
          g.strokeStyle = add ? "rgba(99,199,77,0.95)" : "rgba(228,59,68,0.95)";
          g.strokeRect(px + 0.5, py + 0.5, S - 1, S - 1);
        }
    }
    // what the next click places
    for (const gc of ghost ? (ghost.cells ?? (hover ? [hover] : [])) : []) {
      if (!ghost) break;
      const [px, py] = at(gc.x, gc.y);
      if (ghost.kind === "block") {
        const id = Object.entries(chip.terrains).find(([, t]) => t.frame === ghost.frame)?.[0];
        if (id && tops[id]) {
          // it replaces the cell for now: clear it, then draw the new block (cut to its piece)
          g.fillStyle = "#14161c";
          g.fillRect(px, py, S, S);
          g.save();
          if (ghost.cut?.length) {
            // only the part the piece keeps
            const pts = [
              [-0.5, -0.5],
              [0.5, -0.5],
              [0.5, 0.5],
              [-0.5, 0.5],
            ].filter(([cx, cy]) => !ghost.cut!.some((k) => CORNERS[k].x === Math.sign(cx) && CORNERS[k].y === Math.sign(cy)));
            if (ghost.cut.length === 2) pts.push([0, 0]);
            const cxy = (p: number[]): [number, number] => [px + (p[0] + 0.5) * S, py + (p[1] + 0.5) * S];
            g.beginPath();
            pts.sort((a, b) => Math.atan2(a[1], a[0]) - Math.atan2(b[1], b[0])).forEach((p, i) => (i ? g.lineTo(...cxy(p)) : g.moveTo(...cxy(p))));
            g.closePath();
            g.clip();
          }
          g.drawImage(tops[id], px, py, S, S);
          g.restore();
          if (ghost.level !== undefined) {
            // the height the click paints
            g.fillStyle = "rgba(254,174,52,0.9)";
            g.fillRect(px + S - S * 0.42, py + 1, S * 0.4, S * 0.36);
            g.fillStyle = "#181425";
            g.font = `bold ${Math.round(S * 0.32)}px monospace`;
            g.fillText(String(ghost.level), px + S - S * 0.38, py + S * 0.32);
          }
        }
      } else {
        const id = Object.entries(chip.decor).find(([, d]) => d.frame === ghost.frame)?.[0];
        if (id) decorOf(id, px, py, 0.6);
      }
    }
    for (const m of [...markers, ...(hover ? [{ ...hover, frame: 0 }] : [])]) {
      const [px, py] = at(m.x, m.y);
      g.strokeStyle = MARKER_COLORS[m.frame] ?? "#fff";
      g.lineWidth = 2;
      g.strokeRect(px + 1, py + 1, S - 2, S - 2);
      g.lineWidth = 1;
    }
  }, [grid, tops, decorImg, cam, size, hover, markers, hideDecor, dim, entities, ghost, showGrid, resizeTo?.w, resizeTo?.h]);

  const cellOf = (e: MouseEvent): Pos | null => {
    if (!cam) return null;
    const r = canvas.current!.getBoundingClientRect();
    const x = Math.floor((e.clientX - r.left - cam.x) / cam.cell);
    const y = Math.floor((e.clientY - r.top - cam.y) / cam.cell);
    return x >= 0 && y >= 0 && x < grid.width && y < grid.height ? { x, y } : null;
  };

  return (
    <div class="grid-canvas" ref={host}>
      <canvas
        ref={canvas}
        onContextMenu={(e) => e.preventDefault()}
        onWheel={(e) => {
          if (!cam) return;
          e.preventDefault();
          // zoom around the cursor
          const r = canvas.current!.getBoundingClientRect();
          const mx = e.clientX - r.left;
          const my = e.clientY - r.top;
          const cell = Math.max(6, Math.min(96, cam.cell * (e.deltaY > 0 ? 0.85 : 1 / 0.85)));
          const k = cell / cam.cell;
          setCam({ cell, x: mx - (mx - cam.x) * k, y: my - (my - cam.y) * k });
        }}
        onMouseDown={(e) => {
          if (!cam) return;
          if (e.button === 1 || (e.button === 0 && space.current)) {
            e.preventDefault();
            pan.current = { x: e.clientX, y: e.clientY, cam };
            return;
          }
          if (e.button !== 0 && e.button !== 2) return;
          const c = cellOf(e);
          if (!c) return;
          painting.current = true;
          handlers.down(c, e.button);
        }}
        onMouseMove={(e) => {
          const p = pan.current;
          if (p) {
            setCam({ ...p.cam, x: p.cam.x + e.clientX - p.x, y: p.cam.y + e.clientY - p.y });
            return;
          }
          const c = cellOf(e);
          if (c?.x !== hover?.x || c?.y !== hover?.y) {
            setHover(c);
            handlers.move(c, painting.current);
          }
        }}
        onMouseUp={(e) => {
          if (pan.current) {
            pan.current = null;
            return;
          }
          if (!painting.current) return;
          painting.current = false;
          handlers.up(cellOf(e));
        }}
        onMouseLeave={() => {
          pan.current = null;
          setHover(null);
          handlers.move(null, false);
          if (painting.current) {
            painting.current = false;
            handlers.up(null);
          }
        }}
      />
      <AxisGizmo axes={TOP_AXES} />
    </div>
  );
}
