import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { getGrid } from "../../../src/core/board/grid";
import type { MapDef } from "../../../src/core/data/types";
import { resize } from "../map/layers";
import { MapEditor, type Brush, type Mode } from "../map/MapEditor";
import { BoardPalette, DecorPalette, KeyHints } from "../map/Palettes";
import { EntityForm } from "../entities/EntityForm";
import { deleteEntity, KIND_INFO, listEntities, sameRef, type EntityKind, type EntityRef } from "../entities/model";
import { ActionEditor } from "../forms/ActionEditor";
import { Field, fileSetter } from "../forms/fields";
import type { Project } from "../project";

const mapPath = (id: string) => `data/maps/${id}.yaml`;

/**
 * Maps (editor-design §5): the map list, the canvas with its three modes, and the inspector with
 * an Edit tab (brushes, or the selected entity) and an Info tab (the map's properties).
 */
export function MapsScreen({ project, selected: mapSel, onSelect }: { project: Project; selected: string | null; onSelect: (id: string) => void }) {
  const [filter, setFilter] = useState("");
  const [tab, setTab] = useState<"edit" | "info">("edit");
  const [mode, setMode] = useState<Mode>("board");
  const [selected, select] = useState<EntityRef | null>(null);
  const [placing, setPlacing] = useState<EntityKind | null>(null);
  const [brush, setBrush] = useState<Brush>({ board: "terrain", terrain: "grass", piece: [], height: null, lintel: "adobe", lintelTop: 5, decor: "palm", decorFacing: "S" });
  // a resize being prepared on the Info tab (columns / rows added or removed), previewed on the canvas
  const [resizeBy, setResizeBy] = useState({ x: 0, y: 0 });
  const entities = { selected, select, placing, setPlacing };
  // another map: nothing selected, no resize pending
  useEffect(() => {
    select(null);
    setPlacing(null);
    setResizeBy({ x: 0, y: 0 });
  }, [mapSel]);
  // selecting or placing an entity shows its form
  useEffect(() => {
    if (selected || placing) setTab("edit");
  }, [selected, placing]);
  const ids = project.paths("data/maps/").map((p) => p.replace(/^data\/maps\//, "").replace(/\.yaml$/, ""));
  const shown = ids.filter((id) => {
    const name = project.data<MapDef>(mapPath(id))?.name ?? "";
    return `${id} ${name}`.toLowerCase().includes(filter.toLowerCase());
  });
  const dirty = new Set(project.dirtyPaths());
  const db = project.content.db;
  const chip = db && mapSel ? getGrid(db, mapSel).chipset : null;

  return (
    <>
      <main class="main">
        <div class="split">
          <div class="list">
            <input class="search" placeholder="Search maps…" value={filter} onInput={(e) => setFilter(e.currentTarget.value)} />
            {shown.map((id) => (
              <div key={id} class={`item ${mapSel === id ? "active" : ""}`} onClick={() => onSelect(id)}>
                <span>
                  {project.data<MapDef>(mapPath(id))?.name ?? id}
                  {dirty.has(mapPath(id)) && <span class="dirty"> ●</span>}
                </span>
                <small>{id}</small>
              </div>
            ))}
          </div>
          {mapSel ? <MapEditor project={project} mapId={mapSel} mode={mode} setMode={setMode} brush={brush} setBrush={setBrush} entities={entities} resizeBy={resizeBy} /> : <p class="placeholder">Select a map.</p>}
        </div>
      </main>
      <aside class="inspector">
        {mapSel && (
          <>
            <div class="tabs">
              <button class={tab === "edit" ? "on" : ""} onClick={() => setTab("edit")}>
                Edit
              </button>
              <button class={tab === "info" ? "on" : ""} onClick={() => setTab("info")}>
                Info
              </button>
            </div>
            {tab === "edit" && chip && mode === "board" && <BoardPalette chip={chip} brush={brush} setBrush={setBrush} />}
            {tab === "edit" && chip && mode === "decor" && <DecorPalette chip={chip} brush={brush} setBrush={setBrush} />}
            {tab === "edit" && mode === "entity" && <EntitiesPanel project={project} mapId={mapSel} selected={selected} select={select} placing={placing} setPlacing={setPlacing} />}
            {tab === "info" && <MapProperties project={project} id={mapSel} resizeBy={resizeBy} setResizeBy={setResizeBy} />}
          </>
        )}
      </aside>
    </>
  );
}

function MapProperties({ project, id, resizeBy, setResizeBy }: { project: Project; id: string; resizeBy: { x: number; y: number }; setResizeBy: (d: { x: number; y: number }) => void }) {
  const path = mapPath(id);
  const map = project.data<MapDef>(path);
  const db = project.content.db;
  const set = (key: string, value: unknown, label: string, group?: string) =>
    project.edit(path, label, (d) => (value === undefined || value === "" ? d.delete(key) : d.set(key, value)), group);
  const size = useMemo(() => {
    const rows = String(map?.layers?.terrain ?? "").split("\n").filter((r) => r.length);
    return { w: Math.max(0, ...rows.map((r) => r.length)), h: rows.length };
  }, [map?.layers?.terrain]);
  if (!map) return null;

  return (
    <div class="stack">
      <table class="props">
        <tbody>
          <tr>
            <th>Name</th>
            <td>
              <input value={map.name} onInput={(e) => set("name", e.currentTarget.value, "Map name", `name:${id}`)} />
            </td>
          </tr>
          <tr>
            <th>Size</th>
            <td>
              <ResizeForm project={project} id={id} size={size} d={resizeBy} setD={setResizeBy} />
            </td>
          </tr>
          <tr>
            <th>Kind</th>
            <td>
              <div class="segmented">
                <button class={map.kind === "peaceful" ? "on" : ""} onClick={() => set("kind", "peaceful", "Map kind")} title="No random fights">
                  Peace
                </button>
                <button class={map.kind === "wild" ? "on" : ""} onClick={() => set("kind", "wild", "Map kind")} title="Enemies, traps allowed">
                  Wild
                </button>
              </div>
            </td>
          </tr>
          <tr>
            <th>Chipset</th>
            <td>
              <select value={map.chipset} onChange={(e) => set("chipset", e.currentTarget.value, "Chipset")}>
                {[...(db?.chipsets.keys() ?? [])].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </td>
          </tr>
          <tr>
            <th>Music</th>
            <td>
              <div class="row">
                <select aria-label="Music" value={map.music ?? ""} onChange={(e) => set("music", e.currentTarget.value, "Music")}>
                  <option value="">(none)</option>
                  {project.music.map((m) => (
                    <option key={m}>{m}</option>
                  ))}
                </select>
                <MusicPreview track={map.music} />
              </div>
            </td>
          </tr>
          <tr>
            <th>Battle background</th>
            <td>
              <select value={map.battleback} onChange={(e) => set("battleback", e.currentTarget.value, "Battleback")}>
                {Object.keys(db?.graphics.battlebacks ?? {}).map((b) => (
                  <option key={b}>{b}</option>
                ))}
              </select>
            </td>
          </tr>
          <tr class="joined">
            <td colSpan={2}>
              <img src={`/assets/battlebacks/${map.battleback}.png`} class="preview-wide" alt="" />
            </td>
          </tr>
        </tbody>
      </table>
      <label>On entering</label>
      <OnEnter project={project} id={id} />
    </div>
  );
}

/**
 * −x / +x remove / add a column on the right, −y / +y a row at the bottom; the new size (and the
 * canvas) preview it until Resize applies it. New cells are empty; things placed on the map stay.
 */
function ResizeForm(props: { project: Project; id: string; size: { w: number; h: number }; d: { x: number; y: number }; setD: (d: { x: number; y: number }) => void }) {
  const { project, id, size, d, setD } = props;
  const w = size.w + d.x;
  const h = size.h + d.y;
  const step = (label: string, title: string, k: "x" | "y", by: number) => (
    <button title={title} disabled={(k === "x" ? w : h) + by < 1} onClick={() => setD({ ...d, [k]: d[k] + by })}>
      {label}
    </button>
  );
  return (
    <div class="resize">
      <div class="row">
        {/* the new size: a part growing in green, shrinking in red */}
        <b>
          <span class={d.x > 0 ? "grow" : d.x < 0 ? "shrink" : ""}>{w}</span> × <span class={d.y > 0 ? "grow" : d.y < 0 ? "shrink" : ""}>{h}</span>
        </b>
        <span class="spacer" />
        <button
          disabled={!d.x && !d.y}
          onClick={() => {
            try {
              project.edit(mapPath(id), "Resize map", (doc) => resize(doc, doc.toJS() as MapDef, { left: 0, right: d.x, top: 0, bottom: d.y }));
              setD({ x: 0, y: 0 });
            } catch (e) {
              alert((e as Error).message);
            }
          }}
        >
          Resize
        </button>
        <button disabled={!d.x && !d.y} onClick={() => setD({ x: 0, y: 0 })} title="Forget the changes not applied yet">
          Reset
        </button>
      </div>
      <div class="row">
        <div class="segmented">
          {step("−x", "One column less (right side)", "x", -1)}
          {step("+x", "One column more (right side)", "x", 1)}
        </div>
        <div class="segmented">
          {step("−y", "One row less (bottom)", "y", -1)}
          {step("+y", "One row more (bottom)", "y", 1)}
        </div>
      </div>
    </div>
  );
}

/** ▶ / ■ to listen to a track while choosing it. */
function MusicPreview({ track }: { track?: string }) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  // another track or another map: stop listening
  useEffect(
    () => () => {
      audio.current?.pause();
      setPlaying(false);
    },
    [track],
  );
  const toggle = () => {
    if (playing) {
      audio.current?.pause();
      setPlaying(false);
      return;
    }
    if (!track) return;
    audio.current?.pause();
    audio.current = new Audio(`/assets/audio/music/${track}.wav`);
    audio.current.loop = true;
    audio.current.volume = 0.5;
    void audio.current.play();
    setPlaying(true);
  };
  return (
    <button class="play" disabled={!track} onClick={toggle} title={playing ? "Stop" : "Listen"} aria-label={playing ? "Stop" : "Listen"}>
      {playing ? "■" : "▶"}
    </button>
  );
}

/** Actions run every time the party enters the map (MapDef.onEnter). */
function OnEnter({ project, id }: { project: Project; id: string }) {
  const map = project.data<MapDef>(mapPath(id));
  const db = project.content.db;
  if (!db) return null;
  return <ActionEditor value={map.onEnter} onChange={(a) => fileSetter(project, mapPath(id))(["onEnter"], a, "On entering")} db={db} mapId={id} />;
}

/** Entities layer: add new ones, the list of all on this map, and the selected one's form. */
function EntitiesPanel(props: { project: Project; mapId: string; selected: EntityRef | null; select: (r: EntityRef | null) => void; placing: EntityKind | null; setPlacing: (k: EntityKind | null) => void }) {
  const { project, mapId, selected, select, placing, setPlacing } = props;
  const map = project.data<MapDef>(mapPath(mapId));
  const list = listEntities(map);
  const kinds = Object.keys(KIND_INFO) as EntityKind[];
  return (
    <div class="entities-panel">
      <Field label="Add">
        <div class="add-grid">
          {kinds.map((k) => (
            <button key={k} class={placing === k ? "on" : ""} title={KIND_INFO[k].hint} onClick={() => setPlacing(placing === k ? null : k)}>
              {KIND_INFO[k].label}
            </button>
          ))}
        </div>
      </Field>
      {placing && <p class="hint">Click a cell on the map to place the {KIND_INFO[placing].label.toLowerCase()}.</p>}
      {!selected && (
        <KeyHints
          items={[
            ["Click", "select (again: the next one on the cell)"],
            ["Drag", "move"],
            ["Right / Del", "delete"],
            ["A / D", "turn the selected one"],
          ]}
        />
      )}
      {selected && list.some((e) => sameRef(e, selected)) ? (
        <>
          <EntityForm project={project} mapId={mapId} entity={selected} onSelect={select} />
          <button
            style={{ marginTop: 8 }}
            title="Delete (Del)"
            onClick={() => {
              const ref = selected;
              project.edit(mapPath(mapId), `Delete ${ref.kind}`, (doc) => deleteEntity(doc, ref));
              select(null);
            }}
          >
            Delete {KIND_INFO[selected.kind].label.toLowerCase()}
          </button>
        </>
      ) : (
        <div class="entity-list">
          {list.map((e) => (
            <div key={`${e.kind}:${e.key}`} class="item" onClick={() => select({ kind: e.kind, key: e.key })}>
              <span>{e.label}</span>
              <small>
                {KIND_INFO[e.kind].label} · {e.x},{e.y}
              </small>
            </div>
          ))}
        </div>
      )}
      {selected && (
        <button style={{ marginTop: 8 }} onClick={() => select(null)}>
          ← All entities
        </button>
      )}
    </div>
  );
}
