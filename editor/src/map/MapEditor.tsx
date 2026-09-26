import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { getGrid } from "../../../src/core/board/grid";
import type { Corner, MapDef } from "../../../src/core/data/types";
import type { Dir, Pos } from "../../../src/core/util/grid";
import type { Project } from "../project";
import { GridCanvas } from "./GridCanvas";
import { IsoCanvas, type CanvasHandlers, type Marker } from "./IsoCanvas";
import { copyArea, floodArea, inRect, MAX_HEIGHT, moveArea, paint, pasteArea, rectCells, rectOf, setFacing, setHeights, setOverhead, writeCells, type Clip, type Rect } from "./layers";
import { frameStyle } from "./sprites";
import { addEntity, deleteEntity, entitiesAt, listEntities, moveEntity, sameRef, type EntityKind, type EntityRef } from "../entities/model";
import { entitySprites } from "../entities/visuals";

/** Map canvas with layers and tools (editor-design §5.1–5.3). */

export type Layer = "entities" | "terrain" | "height" | "decor" | "shape" | "facing" | "lintel";
export type Tool = "pencil" | "rect" | "fill" | "pick" | "select";

export const LAYERS: { id: Layer; label: string; key: string }[] = [
  { id: "entities", label: "Entities", key: "0" },
  { id: "terrain", label: "Terrain", key: "1" },
  { id: "height", label: "Height", key: "2" },
  { id: "decor", label: "Decor", key: "3" },
  { id: "shape", label: "Shape", key: "4" },
  { id: "facing", label: "Facing", key: "5" },
  { id: "lintel", label: "Lintel", key: "6" },
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

export const SHAPES: { label: string; cut: Corner[] }[] = [
  { label: "Full cell", cut: [] },
  { label: "Half – NW cut", cut: ["NW"] },
  { label: "Half – NE cut", cut: ["NE"] },
  { label: "Half – SE cut", cut: ["SE"] },
  { label: "Half – SW cut", cut: ["SW"] },
  { label: "Point to N", cut: ["NW", "NE"] },
  { label: "Point to E", cut: ["NE", "SE"] },
  { label: "Point to S", cut: ["SE", "SW"] },
  { label: "Point to W", cut: ["SW", "NW"] },
];

export interface Brush {
  terrain: string | null;
  decor: string | null;
  heightMode: "raise" | "lower" | "set";
  height: number;
  shape: Corner[];
  facing: Dir;
  /** Door lintel: terrain (null = remove) and the level of its top. */
  lintel: string | null;
  lintelTop: number;
}

export interface EntitySelection {
  selected: EntityRef | null;
  select: (ref: EntityRef | null) => void;
  /** An entity kind waiting to be placed with the next click. */
  placing: EntityKind | null;
  setPlacing: (kind: EntityKind | null) => void;
}

export function MapEditor({ project, mapId, layer, brush, setBrush, entities }: { project: Project; mapId: string; layer: Layer; brush: Brush; setBrush: (b: Brush) => void; entities: EntitySelection }) {
  const [tool, setTool] = useState<Tool>("pencil");
  const [view, setView] = useState<"iso" | "grid">("iso");
  const [rotation, setRotation] = useState(0);
  const [hideDecor, setHideDecor] = useState(false);
  const [hover, setHover] = useState<Pos | null>(null);
  const [preview, setPreview] = useState<Pos[]>([]);
  const stroke = useRef<{ id: string; start: Pos; done: Set<string> } | null>(null);
  /** The entity being dragged (entities layer). */
  const drag = useRef<{ ref: EntityRef; id: string; at: Pos } | null>(null);
  // area selection (select tool)
  // refs hold the live values (mouse events can come faster than re-renders); state redraws the previews
  const [area, setAreaState] = useState<Rect | null>(null);
  const areaRef = useRef<Rect | null>(null);
  const setArea = (r: Rect | null) => {
    areaRef.current = r;
    setAreaState(r);
  };
  const [areaDrag, setAreaDragState] = useState<{ from: Pos; to: Pos; mode: "select" | "move" } | null>(null);
  const areaDragRef = useRef<{ from: Pos; to: Pos; mode: "select" | "move" } | null>(null);
  const setAreaDrag = (d: { from: Pos; to: Pos; mode: "select" | "move" } | null) => {
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
  const strokeNo = useRef(0);
  const path = `data/maps/${mapId}.yaml`;
  const db = project.content.db;
  const effTool: Tool = layer === "facing" ? "pencil" : layer === "lintel" && tool === "fill" ? "pencil" : tool;

  // apply the brush to cells
  const apply = (cells: Pos[], group?: string) => {
    if (!cells.length) return;
    const label = `Paint ${layer}`;
    project.edit(
      path,
      label,
      (doc) => {
        const map = doc.toJS() as MapDef;
        if (layer === "terrain") paint(doc, map, "terrain", cells, brush.terrain);
        else if (layer === "decor") paint(doc, map, "decor", cells, brush.decor);
        else if (layer === "shape") paint(doc, map, "shape", cells, brush.shape.length ? "shape" : null, brush.shape);
        else if (layer === "height") setHeights(doc, map, cells, (h) => (brush.heightMode === "raise" ? h + 1 : brush.heightMode === "lower" ? h - 1 : brush.height));
        else if (layer === "lintel") setOverhead(doc, map, cells, brush.lintel, brush.lintelTop);
        else if (layer === "facing") {
          const g = db ? getGrid(db, mapId) : null;
          for (const c of cells) {
            const cell = g?.cell(c);
            if (cell?.decor && g!.chipset.decor[cell.decor].views) setFacing(doc, doc.toJS() as MapDef, c, brush.facing);
          }
        }
      },
      group,
    );
  };

  const pick = (c: Pos) => {
    if (!db) return;
    const cell = getGrid(db, mapId).cell(c);
    if (!cell) return setBrush({ ...brush, terrain: null });
    if (layer === "terrain") setBrush({ ...brush, terrain: cell.terrain });
    else if (layer === "decor") setBrush({ ...brush, decor: cell.decor ?? null });
    else if (layer === "height") setBrush({ ...brush, heightMode: "set", height: cell.height });
    else if (layer === "shape") setBrush({ ...brush, shape: cell.cut ?? [] });
    setTool("pencil");
  };

  const entityHandlers: CanvasHandlers = {
    down(c) {
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
      const pick = here[(i + 1) % here.length];
      entities.select(pick);
      drag.current = { ref: pick, id: `drag${++strokeNo.current}`, at: c };
    },
    move(c, buttons) {
      setHover(c);
      const d = drag.current;
      if (!d || !buttons || !c || (c.x === d.at.x && c.y === d.at.y)) return;
      d.at = c;
      project.edit(path, "Move entity", (doc) => moveEntity(doc, d.ref, c), d.id);
    },
    up() {
      drag.current = null;
    },
  };

  const selectHandlers: CanvasHandlers = {
    down(c) {
      if (pasting && clipboard) {
        const clip = clipboard;
        project.edit(path, "Paste area", (doc) => pasteArea(doc, doc.toJS() as MapDef, clip, c));
        setArea({ x: c.x, y: c.y, w: clip.w, h: clip.h });
        setPasting(false);
        return;
      }
      const area = areaRef.current;
      if (area && inRect(area, c)) setAreaDrag({ from: c, to: c, mode: "move" });
      else {
        setArea({ x: c.x, y: c.y, w: 1, h: 1 });
        setAreaDrag({ from: c, to: c, mode: "select" });
      }
    },
    move(c, buttons) {
      setHover(c);
      const areaDrag = areaDragRef.current;
      if (!c || !buttons || !areaDrag) return;
      setAreaDrag({ ...areaDrag, to: c });
      if (areaDrag.mode === "select") setArea(rectOf(areaDrag.from, c));
    },
    up(c) {
      const d = areaDragRef.current;
      const area = areaRef.current;
      setAreaDrag(null);
      if (!d || d.mode !== "move" || !area || !c) return;
      const to = { x: area.x + c.x - d.from.x, y: area.y + c.y - d.from.y };
      if (to.x === area.x && to.y === area.y) return;
      const r = area;
      project.edit(path, "Move area", (doc) => moveArea(doc, doc.toJS() as MapDef, r, to, brush.terrain, carryEntities));
      setArea({ ...r, x: to.x, y: to.y });
    },
  };

  const copyAreaNow = () => {
    if (!area) return;
    clipboard = copyArea(project.data<MapDef>(path), area);
    setCopied(`${area.w}×${area.h}`);
  };

  const paintHandlers: CanvasHandlers = {
    down(c) {
      const id = `stroke${++strokeNo.current}`;
      stroke.current = { id, start: c, done: new Set([`${c.x},${c.y}`]) };
      if (effTool === "pick") pick(c);
      else if (effTool === "fill") {
        const map = project.data<MapDef>(path);
        const src = layer === "height" ? "height" : layer === "decor" ? "decor" : layer === "shape" ? "shape" : "terrain";
        apply(floodArea(map, src, c));
      } else if (effTool === "rect") setPreview([c]);
      else apply([c], id);
    },
    move(c, buttons) {
      setHover(c);
      const s = stroke.current;
      if (!s || !buttons || !c) return;
      if (effTool === "rect") setPreview(rectCells(s.start, c));
      else if (effTool === "pencil") {
        const k = `${c.x},${c.y}`;
        if (s.done.has(k)) return; // raise/lower each cell once per stroke
        s.done.add(k);
        apply([c], s.id);
      }
    },
    up(c) {
      const s = stroke.current;
      stroke.current = null;
      if (s && effTool === "rect") {
        apply(rectCells(s.start, c ?? s.start));
        setPreview([]);
      }
    },
  };

  const handlers = layer === "entities" ? entityHandlers : effTool === "select" ? selectHandlers : paintHandlers;

  // area keys: Ctrl+C copy, Ctrl+V paste, Delete clear, Escape cancel
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (layer === "entities" || e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "c" && area) {
        e.preventDefault();
        copyAreaNow();
      } else if (mod && e.key.toLowerCase() === "v" && clipboard) {
        e.preventDefault();
        setTool("select");
        setPasting(true);
      } else if ((e.key === "Delete" || e.key === "Backspace") && area && effTool === "select") {
        const r = area;
        const empty = { terrain: brush.terrain, height: 0, decor: null, facing: null, shape: null, lintel: null };
        project.edit(path, "Clear area", (doc) => writeCells(doc, doc.toJS() as MapDef, rectCells({ x: r.x, y: r.y }, { x: r.x + r.w - 1, y: r.y + r.h - 1 }).map((p) => ({ p, c: empty }))));
      } else if (e.key === "Escape") {
        if (pasting) setPasting(false);
        else setArea(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // Delete removes the selected entity; Escape stops placing
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (layer !== "entities" || e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
      if ((e.key === "Delete" || e.key === "Backspace") && entities.selected) {
        const ref = entities.selected;
        project.edit(path, `Delete ${ref.kind}`, (doc) => deleteEntity(doc, ref));
        entities.select(null);
      } else if (e.key === "Escape") entities.setPlacing(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // keyboard: tools and rotation (not while typing)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
      const t = TOOLS.find((x) => x.key === e.key.toLowerCase());
      if (t) setTool(t.id);
      else if (e.key.toLowerCase() === "q") setRotation((r) => (r + 3) % 4);
      else if (e.key.toLowerCase() === "e") setRotation((r) => (r + 1) % 4);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const mapData = project.data<MapDef>(path);
  const sel = entities.selected ? (listEntities(mapData).find((e) => sameRef(e, entities.selected)) ?? null) : null;
  const areaCells = (r: Rect, frame: number) => rectCells({ x: r.x, y: r.y }, { x: r.x + r.w - 1, y: r.y + r.h - 1 }).map((p) => ({ ...p, frame }));
  const moving = areaDrag?.mode === "move" && area ? { ...area, x: area.x + areaDrag.to.x - areaDrag.from.x, y: area.y + areaDrag.to.y - areaDrag.from.y } : null;
  const pastePreview = pasting && clipboard && hover ? { x: hover.x, y: hover.y, w: clipboard.w, h: clipboard.h } : null;
  const markers: Marker[] = useMemo(
    () => [
      ...preview.map((p) => ({ ...p, frame: 3 })),
      ...(sel ? [{ x: sel.x, y: sel.y, frame: 2 }] : []),
      ...(area && layer !== "entities" && !moving ? areaCells(area, 3) : []),
      ...(moving ? areaCells(moving, 3) : []),
      ...(pastePreview ? areaCells(pastePreview, 3) : []),
    ],
    [preview, sel?.x, sel?.y, area, layer, moving?.x, moving?.y, pastePreview?.x, pastePreview?.y, pastePreview?.w],
  );
  const sprites = useMemo(() => (db ? entitySprites(db, mapData, rotation, entities.selected, layer === "entities") : []), [db, mapData, rotation, entities.selected, layer]);
  if (!db) return <div class="placeholder">The content has errors – fix them to see the map (see the problems badge).</div>;
  const grid = getGrid(db, mapId);
  const cell = hover ? grid.cell(hover) : undefined;

  return (
    <div class="map-editor">
      <div class="strip">
        {layer !== "entities" && TOOLS.map((t) => (
          <button key={t.id} class={effTool === t.id ? "on" : ""} disabled={layer === "facing" && t.id !== "pencil"} title={t.title} onClick={() => setTool(t.id)}>
            {t.label}
          </button>
        ))}
        {layer !== "entities" && effTool === "select" && (
          <>
            <span class="sep" />
            <button disabled={!area} onClick={copyAreaNow} title="Copy the selected area (Ctrl+C)">
              Copy
            </button>
            <button disabled={!copied} class={pasting ? "on" : ""} onClick={() => setPasting(!pasting)} title="Paste: click where its top-left corner goes (Ctrl+V)">
              Paste{copied ? ` ${copied}` : ""}
            </button>
            <label class="check" title="Moving an area takes the events, exits, enemies… standing in it along">
              <input type="checkbox" checked={carryEntities} onChange={(e) => setCarryEntities(e.currentTarget.checked)} /> entities move along
            </label>
          </>
        )}
        <span class="sep" />
        <button class={view === "iso" ? "on" : ""} onClick={() => setView("iso")} title="The map as the game draws it">
          Iso
        </button>
        <button class={view === "grid" ? "on" : ""} onClick={() => setView("grid")} title="Flat top-down grid – quick for large areas">
          Grid
        </button>
        {view === "iso" && (
          <>
            <button onClick={() => setRotation((r) => (r + 3) % 4)} title="Turn left (Q)">
              ⟲
            </button>
            <button onClick={() => setRotation((r) => (r + 1) % 4)} title="Turn right (E)">
              ⟳
            </button>
          </>
        )}
        <label class="check">
          <input type="checkbox" checked={!hideDecor} onChange={(e) => setHideDecor(!e.currentTarget.checked)} /> decor
        </label>
      </div>
      <div class="canvas-area">
        {view === "iso" ? (
          <IsoCanvas db={db} mapId={mapId} rotation={rotation} hideDecor={hideDecor} markers={markers} entities={sprites} handlers={handlers} />
        ) : (
          <GridCanvas db={db} mapId={mapId} hideDecor={hideDecor} markers={markers} entities={sprites} handlers={handlers} />
        )}
      </div>
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
                {cell.cut && ` · shape ${cell.cut.join("+")}`}
                {" · "}
                <span class={cell.walkable ? "ok" : "no"}>{cell.walkable ? "walkable" : "blocked"}</span>
              </>
            ) : (
              " · hole (no cell)"
            )}
          </>
        ) : (
          <span class="dim">
            {layer === "entities"
              ? entities.placing
                ? `Click a cell to place the ${entities.placing} · Esc: cancel`
                : "Click: select (again: next on the cell) · drag: move · Delete: remove · right drag: pan · wheel: zoom"
              : effTool === "select"
                ? pasting
                  ? "Click where the top-left corner of the pasted area goes · Esc: cancel"
                  : `Drag: select an area${area ? ` (${area.w}×${area.h})` : ""} · drag inside it: move (left behind: ${brush.terrain ?? "holes"}) · Ctrl+C / Ctrl+V · Delete: clear · Esc`
                : `Left: ${LAYERS.find((l) => l.id === layer)!.label.toLowerCase()} with the ${effTool} · right drag: pan · wheel: zoom · Q/E: turn`}
          </span>
        )}
      </div>
    </div>
  );
}

/** The brush for the active layer (inspector "Paint" tab). */
export function Palette({ project, mapId, layer, setLayer, brush, setBrush }: { project: Project; mapId: string; layer: Layer; setLayer: (l: Layer) => void; brush: Brush; setBrush: (b: Brush) => void }) {
  const db = project.content.db;
  const [filter, setFilter] = useState("");
  if (!db) return null;
  const chip = getGrid(db, mapId).chipset;
  const f = filter.toLowerCase();
  const match = (id: string, name: string) => !f || id.toLowerCase().includes(f) || name.toLowerCase().includes(f);
  return (
    <>
      <div class="layers">
        {LAYERS.map((l) => (
          <button key={l.id} class={layer === l.id ? "on" : ""} onClick={() => setLayer(l.id)} title={`Layer (${l.key})`}>
            {l.label}
          </button>
        ))}
      </div>
      {(layer === "terrain" || layer === "decor") && <input class="search" placeholder="Search…" value={filter} onInput={(e) => setFilter(e.currentTarget.value)} />}
      {layer === "terrain" && (
        <div class="palette">
          <button class={brush.terrain === null ? "on" : ""} onClick={() => setBrush({ ...brush, terrain: null })} title="Remove cells (a hole in the map)">
            <span class="swatch hole" />
            Hole
          </button>
          {Object.entries(chip.terrains)
            .filter(([id, t]) => match(id, t.name))
            .map(([id, t]) => (
              <button key={id} class={brush.terrain === id ? "on" : ""} onClick={() => setBrush({ ...brush, terrain: id })} title={`${t.name} (${id})${t.walkable ? "" : " – blocks"}`}>
                <span class="swatch" style={frameStyle(chip.image, chip.frameWidth, chip.frameHeight, 8, t.frame, 1, chip.frameHeight)} />
                {id}
              </button>
            ))}
        </div>
      )}
      {layer === "decor" && (
        <div class="palette">
          <button class={brush.decor === null ? "on" : ""} onClick={() => setBrush({ ...brush, decor: null })} title="Remove decor">
            <span class="swatch hole" />
            Erase
          </button>
          {Object.entries(chip.decor)
            .filter(([id, d]) => match(id, d.name))
            .map(([id, d]) => (
              <button key={id} class={brush.decor === id ? "on" : ""} onClick={() => setBrush({ ...brush, decor: id })} title={`${d.name} (${id})${d.blocks ? " – blocks" : ""}`}>
                <span class="swatch tall" style={frameStyle(chip.decorImage, chip.decorFrameWidth, chip.decorFrameHeight, 8, d.frame, 1, chip.decorAnchorY + 4)} />
                {id}
              </button>
            ))}
        </div>
      )}
      {layer === "height" && (
        <div class="stack">
          {(["raise", "lower", "set"] as const).map((m) => (
            <label key={m} class="check">
              <input type="radio" checked={brush.heightMode === m} onChange={() => setBrush({ ...brush, heightMode: m })} />
              {m === "raise" ? "Raise by 1" : m === "lower" ? "Lower by 1" : "Set to"}
              {m === "set" && <input type="number" min={0} max={MAX_HEIGHT} style={{ width: 60 }} value={brush.height} onInput={(e) => setBrush({ ...brush, heightMode: "set", height: Number(e.currentTarget.value) })} />}
            </label>
          ))}
          <p class="hint">One level = 8 px. Heroes climb at most 1 level per step; use stairs cells between ledges.</p>
        </div>
      )}
      {layer === "shape" && (
        <div class="palette shapes">
          {SHAPES.map((s) => (
            <button key={s.label} class={JSON.stringify(brush.shape) === JSON.stringify(s.cut) ? "on" : ""} onClick={() => setBrush({ ...brush, shape: s.cut })}>
              <ShapeIcon cut={s.cut} />
              {s.label}
            </button>
          ))}
          <p class="hint">Corners cut along the diagonals, e.g. a ship's bow. Shaped cells can't be walked on (§5.9).</p>
        </div>
      )}
      {layer === "lintel" && (
        <div class="stack">
          <label>Lintel block</label>
          <select value={brush.lintel ?? ""} onChange={(e) => setBrush({ ...brush, lintel: e.currentTarget.value || null })}>
            <option value="">(remove lintel)</option>
            {Object.entries(chip.terrains).map(([id, t]) => (
              <option key={id} value={id}>
                {t.name} ({id})
              </option>
            ))}
          </select>
          <label>Top at level</label>
          <input type="number" min={0} max={MAX_HEIGHT} value={brush.lintelTop} onInput={(e) => setBrush({ ...brush, lintelTop: Number(e.currentTarget.value) })} />
          <p class="hint">The wall continues over a doorway: the block starts 4 levels above the doorway's floor (a character's height) and ends at this level. Use the wall's own height.</p>
        </div>
      )}
      {layer === "facing" && (
        <div class="stack">
          <div class="row">
            {(["N", "E", "S", "W"] as Dir[]).map((d) => (
              <button key={d} class={brush.facing === d ? "on" : ""} onClick={() => setBrush({ ...brush, facing: d })}>
                {d}
              </button>
            ))}
          </div>
          <p class="hint">Click a directional decor (the ship's wheel) to turn it. S is the default.</p>
        </div>
      )}
    </>
  );
}

function ShapeIcon({ cut }: { cut: Corner[] }) {
  const corners: [Corner, number, number][] = [
    ["NW", 0, 0],
    ["NE", 16, 0],
    ["SE", 16, 16],
    ["SW", 0, 16],
  ];
  const pts = corners.filter(([k]) => !cut.includes(k)).map(([, x, y]) => [x, y]);
  if (cut.length === 2) pts.push([8, 8]);
  pts.sort((a, b) => Math.atan2(a[1] - 8, a[0] - 8) - Math.atan2(b[1] - 8, b[0] - 8));
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" class="swatch">
      <polygon points={pts.map((p) => p.join(",")).join(" ")} fill="#feae34" />
    </svg>
  );
}
