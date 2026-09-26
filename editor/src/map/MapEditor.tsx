import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { Icon } from "../icons";
import { usePersistentState } from "../persist";
import { getGrid } from "../../../src/core/board/grid";
import type { Corner, MapDef } from "../../../src/core/data/types";
import type { Dir, Pos } from "../../../src/core/util/grid";
import { K } from "../../../src/game/keys";
import { addEntity, entitiesAt, entityPath, listEntities, moveEntity, sameRef, type EntityKind, type EntityRef, duplicateEntity, type AddKind } from "../entities/model";
import { entitySprites, placingSprite } from "../entities/visuals";
import { removeEntity } from "../entities/remove";
import { placeStart } from "../entities/teleports";
import type { Project } from "../project";
import { GridCanvas } from "./GridCanvas";
import { IsoCanvas, type CanvasHandlers, type Ghost, type Marker } from "./IsoCanvas";
import { copyArea, floodArea, inRect, moveArea, paint, pasteArea, rectCells, rectOf, setFacing, setHeights, setOverhead, setWallSigns, writeCells, type Clip, type Rect } from "./layers";

/**
 * Map canvas (editor-design §5): three modes – Board (terrain, pieces, lintels), Decor (objects)
 * and Entity (everything placed) – each with its own tools. Keys on the hovered cell (or the
 * selected area): W/S raise/lower, A/D turn; right mouse = the eraser of the current tool.
 */

export type Mode = "board" | "decor" | "entity";
export type Tool = "pencil" | "rect" | "fill" | "pick" | "select";

export const MODES: { id: Mode; label: string; key: string; title: string }[] = [
  { id: "board", label: "Board", key: "1", title: "Board (1): terrain, holes, pieces, lintels" },
  { id: "decor", label: "Decor", key: "2", title: "Decor (2): trees, rocks, furniture… on the board" },
  { id: "entity", label: "Entity", key: "3", title: "Entity (3): events, exits, spawns, enemies, gates…" },
];
const TOOLS: { id: Tool; label: string; key: string; title: string }[] = [
  { id: "pencil", label: "Pencil", key: "b", title: "Pencil (B): paint cell by cell" },
  { id: "rect", label: "Rectangle", key: "r", title: "Rectangle (R): drag a rectangle" },
  { id: "fill", label: "Fill", key: "g", title: "Fill (G): the connected area of the same kind" },
  { id: "pick", label: "Pick", key: "i", title: "Pick (I): take the brush from a cell" },
  { id: "select", label: "Select", key: "m", title: "Select (M): drag inside the area to move it, Ctrl+C / Ctrl+V to copy, Delete to clear" },
];

/** Copied cells – kept across maps, so areas can be copied from one map into another. */
let clipboard: Clip | null = null;

/** Clockwise on screen: N (up-right) → E → S → W; corners NW (top) → NE → SE → SW. */
const DIRS: Dir[] = ["N", "E", "S", "W"];
const CORNER_ORDER: Corner[] = ["NW", "NE", "SE", "SW"];
export const turnDir = (d: Dir, by: number): Dir => DIRS[(DIRS.indexOf(d) + by + 4) % 4];
export const turnCut = (cut: Corner[], by: number): Corner[] => cut.map((c) => CORNER_ORDER[(CORNER_ORDER.indexOf(c) + by + 4) % 4]);

export interface Brush {
  /** What Board mode paints: terrain (with the piece shape) or door lintels. */
  board: "terrain" | "lintel";
  terrain: string;
  /** Corners the painted piece cuts off: [] full block, one corner a half, two a point. */
  piece: Corner[];
  /** The height painted cells get (set with W/S while the preview shows); null = keep each cell's height. */
  height: number | null;
  lintel: string;
  lintelTop: number;
  decor: string;
  /** Facing of directional decor being placed. */
  decorFacing: Dir;
  /** What Decor mode places: objects on cells, or wall signs on a block's side. */
  decorKind: "object" | "sign";
  sign: string;
  /** The side of the block a sign goes on (world direction). */
  signFace: Dir;
  /** The block (level) whose side it is painted on; null = the top block. */
  signLevel: number | null;
}

export interface EntitySelection {
  selected: EntityRef | null;
  select: (ref: EntityRef | null) => void;
  /** What waits to be placed with the next click. */
  placing: AddKind | null;
  setPlacing: (kind: AddKind | null) => void;
  /** A teleport's exit cell was clicked: now its destination is picked (MapsScreen's window). */
  startTeleport: (at: Pos) => void;
  /** An entity being duplicated: the copy goes where the next click is. */
  copying: EntityRef | null;
  setCopying: (ref: EntityRef | null) => void;
}

const typing = (e: KeyboardEvent) => e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement;

export function MapEditor({ project, mapId, mode, setMode, brush, setBrush, entities, resizeBy }: { project: Project; mapId: string; mode: Mode; setMode: (m: Mode) => void; brush: Brush; setBrush: (b: Brush) => void; entities: EntitySelection; resizeBy: { x: number; y: number } }) {
  const [tool, setTool] = usePersistentState<Tool>("map.tool", "pencil");
  const [view, setView] = usePersistentState<"iso" | "grid">("map.view", "iso");
  const [rotation, setRotation] = usePersistentState("map.rotation", 0);
  const [hideDecor, setHideDecor] = usePersistentState("map.hideDecor", false);
  const [showGrid, setShowGrid] = usePersistentState("map.grid", true);
  const [hover, setHoverState] = useState<Pos | null>(null);
  const hoverRef = useRef<Pos | null>(null);
  const setHover = (p: Pos | null) => {
    hoverRef.current = p;
    setHoverState(p);
  };
  const [preview, setPreview] = useState<Pos[]>([]);
  const stroke = useRef<{ id: string; start: Pos; done: Set<string>; erase: boolean } | null>(null);
  const strokeNo = useRef(0);
  /** The entity being dragged (entity mode). */
  const drag = useRef<{ ref: EntityRef; id: string; at: Pos } | null>(null);
  // area selection (select tool) – refs hold the live values (mouse events can come faster than
  // re-renders), state redraws the previews
  const [area, setAreaState] = useState<Rect | null>(null);
  const areaRef = useRef<Rect | null>(null);
  const setArea = (r: Rect | null) => {
    areaRef.current = r;
    setAreaState(r);
  };
  type AreaDrag = { from: Pos; to: Pos; mode: "select" | "move" };
  const [areaDrag, setAreaDragState] = useState<AreaDrag | null>(null);
  const areaDragRef = useRef<AreaDrag | null>(null);
  const setAreaDrag = (d: AreaDrag | null) => {
    areaDragRef.current = d;
    setAreaDragState(d);
  };
  const [pasting, setPasting] = useState(false);
  const [carryEntities, setCarryEntities] = useState(true);
  const [copied, setCopied] = useState<string | null>(clipboard ? `${clipboard.w}×${clipboard.h}` : null);
  // another map: no selection (the clipboard stays)
  useEffect(() => {
    setArea(null);
    setAreaDrag(null);
    setPasting(false);
  }, [mapId]);

  const path = `data/maps/${mapId}.yaml`;
  const db = project.content.db;
  // keys can repeat faster than re-renders: brush changes from keys go through the latest value
  const brushRef = useRef(brush);
  brushRef.current = brush;
  const updateBrush = (fn: (b: Brush) => Brush) => {
    brushRef.current = fn(brushRef.current);
    setBrush(brushRef.current);
  };
  const chip = db ? getGrid(db, mapId).chipset : null;

  /** Paints (or with `erase` removes) with the brush of the current mode. */
  const apply = (cells: Pos[], erase: boolean, group?: string) => {
    if (!cells.length) return;
    const brush = brushRef.current; // the latest brush, even right after a key press
    const what = mode === "decor" ? (brush.decorKind === "sign" ? "wall sign" : "decor") : brush.board;
    project.edit(
      path,
      `${erase ? "Erase" : "Paint"} ${what}`,
      (doc) => {
        const map = doc.toJS() as MapDef;
        if (mode === "decor" && brush.decorKind === "sign") setWallSigns(doc, map, cells, erase ? null : brush.sign, brush.signFace, brush.signLevel ?? undefined);
        else if (mode === "decor") {
          paint(doc, map, "decor", cells, erase ? null : brush.decor);
          // directional decor is placed facing the brush's way
          if (!erase && chip?.decor[brush.decor]?.views) for (const c of cells) setFacing(doc, doc.toJS() as MapDef, c, brush.decorFacing);
        } else if (brush.board === "terrain") {
          // terrain and piece together (right: holes, which have no piece either)
          paint(doc, map, "terrain", cells, erase ? null : brush.terrain);
          paint(doc, doc.toJS() as MapDef, "shape", cells, erase || !brush.piece.length ? null : "shape", brush.piece);
          if (!erase && brush.height !== null) setHeights(doc, doc.toJS() as MapDef, cells, () => brush.height!);
        } else setOverhead(doc, map, cells, erase ? null : brush.lintel, brush.lintelTop);
      },
      group,
    );
  };

  const pick = (c: Pos) => {
    const cell = db ? getGrid(db, mapId).cell(c) : undefined;
    if (!cell) return;
    if (mode === "decor" && brush.decorKind === "sign") {
      const w = project.data<MapDef>(path).wallDecor?.find((s) => s.x === c.x && s.y === c.y);
      if (w) setBrush({ ...brush, sign: w.sign, signFace: w.face, signLevel: w.level ?? null });
    } else if (mode === "decor") {
      if (cell.decor) setBrush({ ...brush, decor: cell.decor, decorFacing: cell.decorDir ?? "S" });
    } else if (cell.overhead && brush.board === "lintel") setBrush({ ...brush, lintel: cell.overhead.terrain, lintelTop: cell.overhead.top });
    else setBrush({ ...brush, board: "terrain", terrain: cell.terrain, piece: cell.cut ?? [], height: cell.height });
    setTool("pencil");
  };

  // ---------- entity mode ----------
  const entityHandlers: CanvasHandlers = {
    down(c, button) {
      if (button === 2) {
        // right click deletes the (selected or topmost) entity on the cell
        const here = entitiesAt(project.data<MapDef>(path), c);
        const target = here.find((e) => sameRef(e, entities.selected)) ?? here[0];
        if (target && removeEntity(project, mapId, target)) entities.select(null);
        return;
      }
      if (entities.placing || entities.copying) {
        // one entity per cell: only free cells take a new one
        if (entitiesAt(project.data<MapDef>(path), c).length) return;
        let ref: EntityRef | null = null;
        const src = entities.copying;
        const kind = entities.placing;
        if (kind === "teleport") {
          // the exit's cell is chosen – its destination next, in a window
          entities.setPlacing(null);
          entities.startTeleport(c);
          return;
        }
        if (kind === "start" || kind === "quickplay") ref = { kind: "spawn", key: placeStart(project, mapId, c, kind) };
        else if (src)
          project.edit(path, `Duplicate ${src.kind}`, (doc) => {
            ref = duplicateEntity(doc, doc.toJS() as MapDef, src, c);
          });
        else if (kind)
          project.edit(path, `Add ${kind}`, (doc) => {
            ref = addEntity(doc, doc.toJS() as MapDef, kind as EntityKind, c, { map: mapId, enemy: [...(db?.enemies.keys() ?? [])][0] });
          });
        entities.setPlacing(null);
        entities.setCopying(null);
        entities.select(ref);
        return;
      }
      const here = entitiesAt(project.data<MapDef>(path), c);
      if (!here.length) return entities.select(null);
      // clicking again cycles through the entities on one cell
      const i = here.findIndex((e) => sameRef(e, entities.selected));
      const target = here[(i + 1) % here.length];
      entities.select(target);
      drag.current = { ref: target, id: `drag${++strokeNo.current}`, at: c };
    },
    move(c, pressed) {
      setHover(c);
      const d = drag.current;
      if (!d || !pressed || !c || (c.x === d.at.x && c.y === d.at.y)) return;
      d.at = c;
      project.edit(path, "Move entity", (doc) => moveEntity(doc, d.ref, c), d.id);
    },
    up() {
      drag.current = null;
    },
  };

  // ---------- area selection (board and decor modes) ----------
  const selectHandlers: CanvasHandlers = {
    down(c, button) {
      if (button === 2) return;
      if (pasting && clipboard) {
        const clip = clipboard;
        project.edit(path, "Paste area", (doc) => pasteArea(doc, doc.toJS() as MapDef, clip, c));
        setArea({ x: c.x, y: c.y, w: clip.w, h: clip.h });
        setPasting(false);
        return;
      }
      const a = areaRef.current;
      if (a && inRect(a, c)) setAreaDrag({ from: c, to: c, mode: "move" });
      else {
        setArea({ x: c.x, y: c.y, w: 1, h: 1 });
        setAreaDrag({ from: c, to: c, mode: "select" });
      }
    },
    move(c, pressed) {
      setHover(c);
      const d = areaDragRef.current;
      if (!c || !pressed || !d) return;
      setAreaDrag({ ...d, to: c });
      if (d.mode === "select") setArea(rectOf(d.from, c));
    },
    up(c) {
      const d = areaDragRef.current;
      const a = areaRef.current;
      setAreaDrag(null);
      if (!d || d.mode !== "move" || !a || !c) return;
      const to = { x: a.x + c.x - d.from.x, y: a.y + c.y - d.from.y };
      if (to.x === a.x && to.y === a.y) return;
      project.edit(path, "Move area", (doc) => moveArea(doc, doc.toJS() as MapDef, a, to, brush.terrain, carryEntities));
      setArea({ ...a, x: to.x, y: to.y });
    },
  };

  // ---------- painting (board and decor modes) ----------
  const paintHandlers: CanvasHandlers = {
    down(c, button) {
      const erase = button === 2;
      const id = `stroke${++strokeNo.current}`;
      stroke.current = { id, start: c, done: new Set([`${c.x},${c.y}`]), erase };
      if (tool === "pick" && !erase) pick(c);
      else if (tool === "fill") apply(floodArea(project.data<MapDef>(path), mode === "decor" ? "decor" : "terrain", c), erase);
      else if (tool === "rect") setPreview([c]);
      else apply([c], erase, id);
    },
    move(c, pressed) {
      setHover(c);
      const s = stroke.current;
      if (!s || !pressed || !c) return;
      if (tool === "rect") setPreview(rectCells(s.start, c));
      else if (tool === "pencil" || (tool === "pick" && s.erase)) {
        const k = `${c.x},${c.y}`;
        if (s.done.has(k)) return;
        s.done.add(k);
        apply([c], s.erase, s.id);
      }
    },
    up(c) {
      const s = stroke.current;
      stroke.current = null;
      if (s && tool === "rect") {
        apply(rectCells(s.start, c ?? s.start), s.erase);
        setPreview([]);
      }
    },
  };

  const handlers = mode === "entity" ? entityHandlers : tool === "select" ? selectHandlers : paintHandlers;

  /** Cells the keys act on: the selected area when the cursor is in it (or off the map), else the hovered cell. */
  const keyTargets = (): Pos[] => {
    const a = areaRef.current;
    const h = hoverRef.current;
    if (a && (!h || inRect(a, h))) return rectCells({ x: a.x, y: a.y }, { x: a.x + a.w - 1, y: a.y + a.h - 1 });
    return h ? [h] : [];
  };

  /** A/D in entity mode: turn the selected entity (spawn, exit, enemy, NPC, wall sign). */
  const turnEntity = (by: number) => {
    const sel = entities.selected;
    if (!sel) return;
    const map = project.data<MapDef>(path);
    project.edit(
      path,
      "Turn entity",
      (doc) => {
        const base = entityPath(sel);
        if (sel.kind === "event") {
          map.events?.[sel.key as number]?.pages.forEach((p, i) => {
            if (p.npc) doc.setIn([...base, "pages", i, "dir"], turnDir(p.dir ?? "S", by));
          });
        }
        else if (sel.kind === "spawn" || sel.kind === "exit" || sel.kind === "enemy") doc.setIn([...base, "dir"], turnDir((doc.getIn([...base, "dir"]) as Dir) ?? "S", by));
      },
      `turn${sel.kind}${sel.key}`,
    );
  };

  // keys: modes 1–3, tools, W/S height, A/D turn, Q/E camera, area copy/paste/clear, Delete, Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (typing(e) || e.altKey) return;
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (mod) {
        if (mode === "entity") return;
        if (k === "c" && areaRef.current) {
          e.preventDefault();
          clipboard = copyArea(project.data<MapDef>(path), areaRef.current);
          setCopied(`${areaRef.current.w}×${areaRef.current.h}`);
        } else if (k === "v" && clipboard) {
          e.preventDefault();
          setTool("select");
          setPasting(true);
        }
        return;
      }
      const m = MODES.find((x) => x.key === e.key);
      if (m) return setMode(m.id);
      if (k === "q") return setRotation((r) => (r + 3) % 4);
      if (k === "e") return setRotation((r) => (r + 1) % 4);
      if (mode !== "entity") {
        const t = TOOLS.find((x) => x.key === k);
        if (t) return setTool(t.id);
      }
      // while a preview shows under the cursor, W/S and A/D change what the next click places
      const painting = tool === "pencil" || tool === "rect" || tool === "fill";
      const previewing = painting && ((mode === "board" && brush.board === "terrain") || mode === "decor");
      if (previewing && mode === "decor" && brush.decorKind === "sign" && (k === "w" || k === "s")) {
        // the sign's block: from the top block of the hovered cell up or down
        const g = db ? getGrid(db, mapId) : null;
        const h = hoverRef.current;
        updateBrush((b) => {
          const from = b.signLevel ?? (h ? (g?.cell(h)?.height ?? 0) : 0);
          return { ...b, signLevel: Math.max(0, Math.min(35, from + (k === "w" ? 1 : -1))) };
        });
        return;
      }
      if (previewing && mode === "board" && (k === "w" || k === "s")) {
        const g = db ? getGrid(db, mapId) : null;
        const h = hoverRef.current;
        updateBrush((b) => {
          const from = b.height ?? (h ? (g?.cell(h)?.height ?? 0) : 0);
          return { ...b, height: Math.max(0, Math.min(35, from + (k === "w" ? 1 : -1))) };
        });
        return;
      }
      if (previewing && (k === "a" || k === "d")) {
        const by = k === "d" ? 1 : -1;
        if (mode === "board") updateBrush((b) => (b.piece.length ? { ...b, piece: turnCut(b.piece, by) } : b));
        else if (brush.decorKind === "sign") updateBrush((b) => ({ ...b, signFace: turnDir(b.signFace, by) }));
        else updateBrush((b) => ({ ...b, decorFacing: turnDir(b.decorFacing, by) }));
        return;
      }
      if (k === "w" || k === "s") {
        if (mode === "entity") return;
        const cells = keyTargets();
        if (cells.length) project.edit(path, k === "w" ? "Raise" : "Lower", (doc) => setHeights(doc, doc.toJS() as MapDef, cells, (h) => h + (k === "w" ? 1 : -1)));
        return;
      }
      if (k === "a" || k === "d") {
        const by = k === "d" ? 1 : -1;
        if (mode === "entity") return turnEntity(by);
        const g = db ? getGrid(db, mapId) : null;
        const cells = keyTargets();
        if (mode === "board") {
          const shaped = cells.filter((c) => g?.cell(c)?.cut);
          if (shaped.length) {
            project.edit(path, "Turn piece", (doc) => {
              for (const c of shaped) paint(doc, doc.toJS() as MapDef, "shape", [c], "shape", turnCut(g!.cell(c)!.cut!, by));
            });
          } else if (brush.piece.length) setBrush({ ...brush, piece: turnCut(brush.piece, by) });
        } else {
          const turnable = cells.filter((c) => {
            const d = g?.cell(c)?.decor;
            return d && g!.chipset.decor[d].views;
          });
          if (turnable.length) project.edit(path, "Turn decor", (doc) => turnable.forEach((c) => setFacing(doc, doc.toJS() as MapDef, c, turnDir(g!.cell(c)!.decorDir ?? "S", by))));
          else setBrush({ ...brush, decorFacing: turnDir(brush.decorFacing, by) });
        }
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        if (mode === "entity" && entities.selected) {
          if (removeEntity(project, mapId, entities.selected)) entities.select(null);
        } else if (mode !== "entity" && areaRef.current && tool === "select") {
          const r = areaRef.current;
          const cells = rectCells({ x: r.x, y: r.y }, { x: r.x + r.w - 1, y: r.y + r.h - 1 });
          if (mode === "decor") project.edit(path, "Clear decor", (doc) => paint(doc, doc.toJS() as MapDef, "decor", cells, null));
          else project.edit(path, "Clear area", (doc) => writeCells(doc, doc.toJS() as MapDef, cells.map((p) => ({ p, c: { terrain: brush.terrain, height: 0, decor: null, facing: null, shape: null, lintel: null } }))));
        }
        return;
      }
      if (e.key === "Escape") {
        if (pasting) setPasting(false);
        else if (entities.placing) entities.setPlacing(null);
        else if (entities.copying) entities.setCopying(null);
        else setArea(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // ---------- drawing ----------
  const mapData = project.data<MapDef>(path);
  const sel = entities.selected ? (listEntities(mapData).find((e) => sameRef(e, entities.selected)) ?? null) : null;
  const areaCells = (r: Rect, frame: number) => rectCells({ x: r.x, y: r.y }, { x: r.x + r.w - 1, y: r.y + r.h - 1 }).map((p) => ({ ...p, frame }));
  const moving = areaDrag?.mode === "move" && area ? { ...area, x: area.x + areaDrag.to.x - areaDrag.from.x, y: area.y + areaDrag.to.y - areaDrag.from.y } : null;
  const pastePreview = pasting && clipboard && hover ? { x: hover.x, y: hover.y, w: clipboard.w, h: clipboard.h } : null;
  const markers: Marker[] = useMemo(
    () => [
      // a dragged rectangle shows the ghost blocks; only erasing (right drag) or lintels mark it
      ...(stroke.current?.erase || (mode === "board" && brush.board !== "terrain") ? preview.map((p) => ({ ...p, frame: 3 })) : []),
      ...(sel && mode === "entity" ? [{ x: sel.x, y: sel.y, frame: 2 }] : []),
      ...(area && mode !== "entity" && !moving ? areaCells(area, 3) : []),
      ...(moving ? areaCells(moving, 3) : []),
      ...(pastePreview ? areaCells(pastePreview, 3) : []),
    ],
    [preview, brush.board, sel?.x, sel?.y, area, mode, moving?.x, moving?.y, pastePreview?.x, pastePreview?.y, pastePreview?.w],
  );
  // entity mode shows everything with labels; the other modes only what the game itself shows
  const sprites = useMemo(() => {
    if (!db) return [];
    const all = entitySprites(db, mapData, rotation, entities.selected, mode === "entity");
    if (mode !== "entity") return all.filter((e) => e.texture && !e.editorOnly).map((e) => ({ ...e, label: undefined }));
    // placing or duplicating: what the click adds follows the cursor (red on a taken cell)
    if (!hover || (!entities.placing && !entities.copying)) return all;
    const blocked = entitiesAt(mapData, hover).length > 0;
    const src = entities.copying;
    const ghost = src
      ? all.filter((e) => sameRef(e.ref, src)).map((e) => ({ ...e, x: hover.x, y: hover.y, label: undefined, selected: false, preview: true, blocked }))
      : [{ ...placingSprite(entities.placing!, hover), blocked }];
    return [...all, ...ghost];
  }, [db, mapData, rotation, entities.selected, mode, entities.placing, entities.copying, hover?.x, hover?.y]);
  // what the next click places, see-through under the cursor: a terrain block or a decor object
  // the rectangle being dragged (not while erasing) or the area the fill would reach; else the hovered cell
  const ghostCells: Pos[] | undefined = useMemo(() => {
    if (tool === "rect" && preview.length && !stroke.current?.erase) return preview;
    if (tool === "fill") return hover && mode !== "entity" ? floodArea(mapData, mode === "decor" ? "decor" : "terrain", hover) : [];
    return undefined;
  }, [tool, preview, hover?.x, hover?.y, mode, mapData]);
  const ghost: Ghost | null = useMemo(() => {
    if (!chip || tool === "select" || tool === "pick") return null;
    if (mode === "board") {
      const t = chip.terrains[brush.terrain];
      if (brush.board !== "terrain" || !t) return null;
      return { texture: K.chipset(chip.id), frame: t.frame, originY: chip.tileHeight / 2 / chip.frameHeight, kind: "block", level: brush.height ?? undefined, cut: brush.piece, fill: t.fill ?? t.frame, cells: ghostCells };
    }
    const d = chip.decor[brush.decor];
    if (mode !== "decor" || !d || brush.decorKind === "sign") return null;
    const turns = d.views ? (["S", "W", "N", "E"].indexOf(brush.decorFacing) + rotation) % 4 : 0;
    return { texture: K.decor(chip.id), frame: d.frame + (d.views ? turns : 0), originY: chip.decorAnchorY / chip.decorFrameHeight, cells: ghostCells };
  }, [mode, brush.decor, brush.decorFacing, brush.decorKind, brush.terrain, brush.board, brush.height, brush.piece, chip, tool, rotation, ghostCells]);
  // a wall sign to place: see-through on its side of the hovered (or dragged) cells
  const wallPreview = useMemo(() => {
    if (mode !== "decor" || brush.decorKind !== "sign" || tool === "select" || tool === "pick") return null;
    const cells = ghostCells ?? (hover ? [hover] : []);
    return cells.map((c) => ({ x: c.x, y: c.y, sign: brush.sign, face: brush.signFace, level: brush.signLevel ?? undefined }));
  }, [mode, brush.decorKind, brush.sign, brush.signFace, brush.signLevel, tool, ghostCells, hover?.x, hover?.y]);

  if (!db) return <div class="placeholder">The content has errors – fix them to see the map (see the problems badge).</div>;
  const grid = getGrid(db, mapId);
  const cell = hover ? grid.cell(hover) : undefined;
  // the layers the mode doesn't edit are greyed out
  const focus = mode;
  // the Info tab's pending resize, previewed on the canvas
  const resizeTo = resizeBy.x || resizeBy.y ? { w: grid.width + resizeBy.x, h: grid.height + resizeBy.y } : null;
  const canvasProps = { db, mapId, hideDecor, focus, markers, entities: sprites, ghost, showGrid, resizeTo, handlers };
  // the flat view marks entities with letters – only useful in entity mode
  const gridProps = { ...canvasProps, entities: mode === "entity" ? sprites : [] };

  const hint =
    mode === "entity"
      ? entities.placing || entities.copying
        ? "Click a free cell to place it · Esc: cancel"
        : "Click: select (again: next on the cell) · drag: move · right click / Del: delete · A/D: turn"
      : tool === "select"
        ? pasting
          ? "Click where the top-left corner of the pasted area goes · Esc: cancel"
          : `Drag: select${area ? ` (${area.w}×${area.h})` : ""} · drag inside: move · Ctrl+C / Ctrl+V · Del: clear · W/S raise/lower · A/D turn`
        : mode === "board"
          ? "Left: paint · right: holes · W/S: raise / lower · A/D: turn a piece · middle drag / Space: pan · Q/E: turn the view"
          : brush.decorKind === "sign"
            ? // a sign on a side facing away from the camera isn't drawn: say so
              `Left: paint the sign · right: remove the cell's signs · A/D: side · W/S: block${wallPreview?.length && !["S", "E"].includes(turnDir(brush.signFace, rotation)) ? " · this side faces away – Q/E turns the view" : ""}`
            : "Left: place · right: remove · A/D: turn · W/S: raise / lower · middle drag / Space: pan · Q/E: turn the view";

  return (
    <div class="map-editor">
      <div class="strip">
        <div class="segmented">
          {MODES.map((m) => (
            <button key={m.id} class={mode === m.id ? "on" : ""} onClick={() => setMode(m.id)} title={m.title}>
              {m.label}
            </button>
          ))}
        </div>
        {mode !== "entity" && (
          <>
            <span class="sep" />
            {TOOLS.map((t) => (
              <button key={t.id} class={`icon-button ${tool === t.id ? "on" : ""}`} title={t.title} aria-label={t.label} onClick={() => setTool(t.id)}>
                <Icon name={t.id} />
              </button>
            ))}
          </>
        )}
        <span class="sep" />
        <button class={`icon-button ${showGrid ? "on" : ""}`} aria-pressed={showGrid} title="Grid: thin lines around every cell" aria-label="Grid" onClick={() => setShowGrid(!showGrid)}>
          <Icon name="grid" />
        </button>
        <button class={`icon-button ${hideDecor ? "" : "on"}`} aria-pressed={!hideDecor} title="Decor: show trees, rocks, furniture…" aria-label="Decor" onClick={() => setHideDecor(!hideDecor)}>
          <Icon name="decor" />
        </button>
        {mode !== "entity" && tool === "select" && (
          <>
            <span class="sep" />
            <button
              disabled={!area}
              onClick={() => {
                if (!area) return;
                clipboard = copyArea(project.data<MapDef>(path), area);
                setCopied(`${area.w}×${area.h}`);
              }}
              title="Copy the selected area (Ctrl+C)"
            >
              Copy
            </button>
            <button disabled={!copied} class={pasting ? "on" : ""} onClick={() => setPasting(!pasting)} title="Paste: click where its top-left corner goes (Ctrl+V)">
              Paste{copied ? ` ${copied}` : ""}
            </button>
            <label class="check" title="Moving an area takes the events, exits, enemies… standing in it along">
              <input type="checkbox" checked={carryEntities} onChange={(e) => setCarryEntities(e.currentTarget.checked)} /> entities along
            </label>
          </>
        )}
        <span class="spacer" />
        {view === "iso" && (
          <>
            <button class="icon-button" onClick={() => setRotation((r) => (r + 1) % 4)} title="Turn the view right (E)" aria-label="Turn right">
              <Icon name="turnRight" />
            </button>
            <button class="icon-button" onClick={() => setRotation((r) => (r + 3) % 4)} title="Turn the view left (Q)" aria-label="Turn left">
              <Icon name="turnLeft" />
            </button>
          </>
        )}
        <div class="segmented">
          <button class={view === "iso" ? "on" : ""} onClick={() => setView("iso")} title="The map as the game draws it">
            Iso
          </button>
          <button class={view === "grid" ? "on" : ""} onClick={() => setView("grid")} title="Flat top view – quick for large areas">
            Top
          </button>
        </div>
      </div>
      <div class="canvas-area">{view === "iso" ? <IsoCanvas {...canvasProps} rotation={rotation} wallPreview={wallPreview} /> : <GridCanvas {...gridProps} />}</div>
      <div class="status">
        {hover ? (
          <>
            <b>
              {hover.x}, {hover.y}
            </b>
            {cell ? (
              <>
                {" · "}
                {grid.chipset.terrains[cell.terrain]?.name} ({cell.terrain}) · height {cell.height}
                {cell.decor && ` · ${grid.chipset.decor[cell.decor]?.name} (${cell.decor})${cell.decorDir ? ` facing ${cell.decorDir}` : ""}`}
                {cell.cut && ` · piece ${cell.cut.join("+")}`}
                {" · "}
                <span class={cell.walkable ? "ok" : "no"}>{cell.walkable ? "walkable" : "blocked"}</span>
              </>
            ) : (
              " · hole (no cell)"
            )}
            {/* a wall sign on a side facing away from the camera isn't drawn */}
            {wallPreview?.length && !["S", "E"].includes(turnDir(brush.signFace, rotation)) ? <span class="no"> · the {brush.signFace} side faces away – Q / E turns the view</span> : null}
          </>
        ) : (
          <span class="dim">{hint}</span>
        )}
      </div>
    </div>
  );
}
