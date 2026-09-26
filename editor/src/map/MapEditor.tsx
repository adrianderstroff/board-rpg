import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { getGrid } from "../../../src/core/board/grid";
import type { Corner, MapDef } from "../../../src/core/data/types";
import type { Dir, Pos } from "../../../src/core/util/grid";
import { K } from "../../../src/game/keys";
import { addEntity, deleteEntity, entitiesAt, entityPath, listEntities, moveEntity, sameRef, type EntityKind, type EntityRef } from "../entities/model";
import { entitySprites } from "../entities/visuals";
import type { Project } from "../project";
import { GridCanvas } from "./GridCanvas";
import { IsoCanvas, type CanvasHandlers, type Ghost, type Marker } from "./IsoCanvas";
import { copyArea, floodArea, inRect, moveArea, paint, pasteArea, rectCells, rectOf, setFacing, setHeights, setOverhead, writeCells, type Clip, type Rect } from "./layers";

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
  { id: "pencil", label: "✎ Pencil", key: "b", title: "Paint cell by cell (B)" },
  { id: "rect", label: "▭ Rectangle", key: "r", title: "Drag a rectangle (R)" },
  { id: "fill", label: "◍ Fill", key: "g", title: "Fill the connected area of the same kind (G)" },
  { id: "pick", label: "⌖ Pick", key: "i", title: "Take the brush from a cell (I)" },
  { id: "select", label: "⬚ Select", key: "m", title: "Select an area (M): drag inside it to move it, Ctrl+C / Ctrl+V to copy, Delete to clear" },
];

/** Copied cells – kept across maps, so areas can be copied from one map into another. */
let clipboard: Clip | null = null;

/** Clockwise on screen: N (up-right) → E → S → W; corners NW (top) → NE → SE → SW. */
const DIRS: Dir[] = ["N", "E", "S", "W"];
const CORNER_ORDER: Corner[] = ["NW", "NE", "SE", "SW"];
export const turnDir = (d: Dir, by: number): Dir => DIRS[(DIRS.indexOf(d) + by + 4) % 4];
export const turnCut = (cut: Corner[], by: number): Corner[] => cut.map((c) => CORNER_ORDER[(CORNER_ORDER.indexOf(c) + by + 4) % 4]);

export interface Brush {
  /** What Board mode paints. */
  board: "terrain" | "piece" | "lintel";
  terrain: string;
  /** Corners a piece cuts off (half cells, points). */
  piece: Corner[];
  lintel: string;
  lintelTop: number;
  decor: string;
  /** Facing of directional decor being placed. */
  decorFacing: Dir;
}

export interface EntitySelection {
  selected: EntityRef | null;
  select: (ref: EntityRef | null) => void;
  /** An entity kind waiting to be placed with the next click. */
  placing: EntityKind | null;
  setPlacing: (kind: EntityKind | null) => void;
}

const typing = (e: KeyboardEvent) => e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement;

export function MapEditor({ project, mapId, mode, setMode, brush, setBrush, entities }: { project: Project; mapId: string; mode: Mode; setMode: (m: Mode) => void; brush: Brush; setBrush: (b: Brush) => void; entities: EntitySelection }) {
  const [tool, setTool] = useState<Tool>("pencil");
  const [view, setView] = useState<"iso" | "grid">("iso");
  const [rotation, setRotation] = useState(0);
  const [hideDecor, setHideDecor] = useState(false);
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
  const chip = db ? getGrid(db, mapId).chipset : null;

  /** Paints (or with `erase` removes) with the brush of the current mode. */
  const apply = (cells: Pos[], erase: boolean, group?: string) => {
    if (!cells.length) return;
    const what = mode === "decor" ? "decor" : brush.board;
    project.edit(
      path,
      `${erase ? "Erase" : "Paint"} ${what}`,
      (doc) => {
        const map = doc.toJS() as MapDef;
        if (mode === "decor") {
          paint(doc, map, "decor", cells, erase ? null : brush.decor);
          // directional decor is placed facing the brush's way
          if (!erase && chip?.decor[brush.decor]?.views) for (const c of cells) setFacing(doc, doc.toJS() as MapDef, c, brush.decorFacing);
        } else if (brush.board === "terrain") paint(doc, map, "terrain", cells, erase ? null : brush.terrain);
        else if (brush.board === "piece") paint(doc, map, "shape", cells, erase || !brush.piece.length ? null : "shape", brush.piece);
        else setOverhead(doc, map, cells, erase ? null : brush.lintel, brush.lintelTop);
      },
      group,
    );
  };

  const pick = (c: Pos) => {
    const cell = db ? getGrid(db, mapId).cell(c) : undefined;
    if (!cell) return;
    if (mode === "decor") {
      if (cell.decor) setBrush({ ...brush, decor: cell.decor, decorFacing: cell.decorDir ?? "S" });
    } else if (cell.overhead && brush.board === "lintel") setBrush({ ...brush, lintel: cell.overhead.terrain, lintelTop: cell.overhead.top });
    else if (cell.cut) setBrush({ ...brush, board: "piece", piece: cell.cut, terrain: cell.terrain });
    else setBrush({ ...brush, board: brush.board === "lintel" ? "terrain" : brush.board, terrain: cell.terrain });
    setTool("pencil");
  };

  // ---------- entity mode ----------
  const entityHandlers: CanvasHandlers = {
    down(c, button) {
      if (button === 2) {
        // right click deletes the (selected or topmost) entity on the cell
        const here = entitiesAt(project.data<MapDef>(path), c);
        const target = here.find((e) => sameRef(e, entities.selected)) ?? here[0];
        if (target) {
          project.edit(path, `Delete ${target.kind}`, (doc) => deleteEntity(doc, target));
          entities.select(null);
        }
        return;
      }
      if (entities.placing) {
        let ref: EntityRef | null = null;
        const kind = entities.placing;
        project.edit(path, `Add ${kind}`, (doc) => {
          ref = addEntity(doc, doc.toJS() as MapDef, kind, c, { map: mapId, enemy: [...(db?.enemies.keys() ?? [])][0], sign: Object.keys(db?.graphics.wallSigns?.frames ?? { inn: 0 })[0] });
        });
        entities.setPlacing(null);
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
      else if (tool === "fill") apply(floodArea(project.data<MapDef>(path), mode === "decor" ? "decor" : brush.board === "piece" ? "shape" : "terrain", c), erase);
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
        } else if (sel.kind === "sign") doc.setIn([...base, "face"], turnDir((doc.getIn([...base, "face"]) as Dir) ?? "S", by));
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
          } else if (brush.board === "piece") setBrush({ ...brush, piece: turnCut(brush.piece, by) });
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
          const ref = entities.selected;
          project.edit(path, `Delete ${ref.kind}`, (doc) => deleteEntity(doc, ref));
          entities.select(null);
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
      ...preview.map((p) => ({ ...p, frame: 3 })),
      ...(sel && mode === "entity" ? [{ x: sel.x, y: sel.y, frame: 2 }] : []),
      ...(area && mode !== "entity" && !moving ? areaCells(area, 3) : []),
      ...(moving ? areaCells(moving, 3) : []),
      ...(pastePreview ? areaCells(pastePreview, 3) : []),
    ],
    [preview, sel?.x, sel?.y, area, mode, moving?.x, moving?.y, pastePreview?.x, pastePreview?.y, pastePreview?.w],
  );
  // entity mode shows everything with labels; the other modes only what the game itself shows
  const sprites = useMemo(() => {
    if (!db) return [];
    const all = entitySprites(db, mapData, rotation, entities.selected, mode === "entity");
    return mode === "entity" ? all : all.filter((e) => e.texture && !e.editorOnly).map((e) => ({ ...e, label: undefined }));
  }, [db, mapData, rotation, entities.selected, mode]);
  // the decor about to be placed, see-through under the cursor
  const ghost: Ghost | null = useMemo(() => {
    const d = chip?.decor[brush.decor];
    if (mode !== "decor" || !d || !chip || tool === "select" || tool === "pick" || tool === "fill") return null;
    const turns = d.views ? (["S", "W", "N", "E"].indexOf(brush.decorFacing) + rotation) % 4 : 0;
    return { texture: K.decor(chip.id), frame: d.frame + (d.views ? turns : 0), originY: chip.decorAnchorY / chip.decorFrameHeight };
  }, [mode, brush.decor, brush.decorFacing, chip, tool, rotation]);

  if (!db) return <div class="placeholder">The content has errors – fix them to see the map (see the problems badge).</div>;
  const grid = getGrid(db, mapId);
  const cell = hover ? grid.cell(hover) : undefined;
  const canvasProps = { db, mapId, hideDecor, dimBoard: mode === "decor", markers, entities: sprites, ghost, handlers };
  // the flat view marks entities with letters – only useful in entity mode
  const gridProps = { ...canvasProps, entities: mode === "entity" ? sprites : [] };

  const hint =
    mode === "entity"
      ? entities.placing
        ? "Click a cell to place it · Esc: cancel"
        : "Click: select (again: next on the cell) · drag: move · right click / Del: delete · A/D: turn"
      : tool === "select"
        ? pasting
          ? "Click where the top-left corner of the pasted area goes · Esc: cancel"
          : `Drag: select${area ? ` (${area.w}×${area.h})` : ""} · drag inside: move · Ctrl+C / Ctrl+V · Del: clear · W/S raise/lower · A/D turn`
        : mode === "board"
          ? "Left: paint · right: holes · W/S: raise / lower · A/D: turn a piece · middle drag / Space: pan · Q/E: turn the view"
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
              <button key={t.id} class={tool === t.id ? "on" : ""} title={t.title} onClick={() => setTool(t.id)}>
                {t.label}
              </button>
            ))}
          </>
        )}
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
        <div class="segmented">
          <button class={view === "iso" ? "on" : ""} onClick={() => setView("iso")} title="The map as the game draws it">
            Iso
          </button>
          <button class={view === "grid" ? "on" : ""} onClick={() => setView("grid")} title="Flat top view – quick for large areas">
            Top
          </button>
        </div>
        {view === "iso" && (
          <>
            <button onClick={() => setRotation((r) => (r + 3) % 4)} title="Turn the view left (Q)">
              ⟲
            </button>
            <button onClick={() => setRotation((r) => (r + 1) % 4)} title="Turn the view right (E)">
              ⟳
            </button>
          </>
        )}
        <label class="check" title="Show decor">
          <input type="checkbox" checked={!hideDecor} onChange={(e) => setHideDecor(!e.currentTarget.checked)} /> decor
        </label>
      </div>
      <div class="canvas-area">{view === "iso" ? <IsoCanvas {...canvasProps} rotation={rotation} /> : <GridCanvas {...gridProps} />}</div>
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
          </>
        ) : (
          <span class="dim">{hint}</span>
        )}
      </div>
    </div>
  );
}
