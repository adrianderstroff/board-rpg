import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { getGrid } from "../../../src/core/board/grid";
import type { MapDef } from "../../../src/core/data/types";
import { assetUrl } from "../map/sprites";
import { resize } from "../map/layers";
import { MapEditor, type Brush, type EntitySelection, type Mode } from "../map/MapEditor";
import { BoardPalette, DecorPalette } from "../map/Palettes";
import { EntityForm } from "../entities/EntityForm";
import { HandlerTabs, MAP_TRIGGERS } from "../entities/EntityEventForm";
import { ADD_INFO, KIND_INFO, listEntities, sameRef, type AddKind, type EntityKind, type EntityRef } from "../entities/model";
import { removeEntity } from "../entities/remove";
import { arrivalRole, createTeleport, nearestEdge } from "../entities/teleports";
import { DestinationWindow } from "../entities/DestinationWindow";
import type { Pos } from "../../../src/core/util/grid";
import { usePersistentState } from "../persist";
import { MapContext } from "../mapContext";
import type { Project } from "../project";

const mapPath = (id: string) => `data/maps/${id}.yaml`;

const DEFAULT_BRUSH: Brush = { board: "terrain", terrain: "grass", piece: [], height: null, lintel: "adobe", lintelTop: 5, decor: "palm", decorFacing: "S", decorKind: "object", sign: "inn", signFace: "S", signLevel: null };

/**
 * Maps (editor-design §5): the map list, the canvas with its three modes, and the inspector with
 * an Edit tab (brushes, or the selected entity) and an Info tab (the map's properties).
 */
export function MapsScreen({ project, selected: mapSel, onSelect }: { project: Project; selected: string | null; onSelect: (id: string) => void }) {
  // remembered across reloads (persist.ts)
  const [filter, setFilter] = usePersistentState("maps.filter", "");
  const [tab, setTab] = usePersistentState<"edit" | "info">("maps.tab", "edit");
  const [mode, setMode] = usePersistentState<Mode>("maps.mode", "board");
  const [selected, select] = usePersistentState<EntityRef | null>("maps.selected", null);
  const [placing, setPlacing] = useState<AddKind | null>(null);
  // a teleport being placed: its exit cell, while the destination window is open
  const [pendingTeleport, setPendingTeleport] = useState<Pos | null>(null);
  const [copying, setCopying] = useState<EntityRef | null>(null);
  const [brush, setBrush] = usePersistentState<Brush>("maps.brush", DEFAULT_BRUSH, (b) => ({ ...DEFAULT_BRUSH, ...b }));
  // a resize being prepared on the Info tab (columns / rows added or removed), previewed on the canvas
  const [resizeBy, setResizeBy] = usePersistentState("maps.resizeBy", { x: 0, y: 0 });
  const entities = { selected, select, placing, setPlacing, copying, setCopying, startTeleport: setPendingTeleport };
  // another map: nothing selected, no resize pending (not on the first render: that's a reload)
  const shownMap = useRef(mapSel);
  useEffect(() => {
    if (shownMap.current === mapSel) return;
    shownMap.current = mapSel;
    select(null);
    setPlacing(null);
    setCopying(null);
    setResizeBy({ x: 0, y: 0 });
  }, [mapSel]);
  // selecting or placing an entity shows its form
  useEffect(() => {
    if (selected || placing) setTab("edit");
  }, [selected, placing]);
  // an entity's form fills the inspector: its content scrolls, its action bar stays at the bottom
  const formShown = tab === "edit" && mode === "entity" && !!mapSel && !!selected && listEntities(project.data<MapDef>(mapPath(mapSel))).some((e) => sameRef(e, selected));
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
              <div key={id} class={`item ${mapSel === id ? "active" : ""}`} title={id} onClick={() => onSelect(id)}>
                <span>
                  {project.data<MapDef>(mapPath(id))?.name ?? id}
                  {dirty.has(mapPath(id)) && <span class="dirty"> ●</span>}
                </span>
              </div>
            ))}
          </div>
          {mapSel ? <MapEditor project={project} mapId={mapSel} mode={mode} setMode={setMode} brush={brush} setBrush={setBrush} entities={entities} resizeBy={resizeBy} /> : <p class="placeholder">Select a map.</p>}
        </div>
      </main>
      {pendingTeleport && mapSel && (
        <DestinationWindow
          project={project}
          fromMap={mapSel}
          wayBack
          onPick={(dest) => {
            const map = project.data<MapDef>(mapPath(mapSel));
            const index = createTeleport(project, mapSel, { ...pendingTeleport, dir: nearestEdge(map, pendingTeleport) }, dest);
            setPendingTeleport(null);
            select({ kind: "exit", key: index });
          }}
          onClose={() => setPendingTeleport(null)}
        />
      )}
      <aside class={`inspector ${formShown ? "fill" : ""}`}>
        <MapContext.Provider value={mapSel}>
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
            {tab === "edit" && chip && mode === "decor" && <DecorPalette chip={chip} signs={db?.graphics.wallSigns} brush={brush} setBrush={setBrush} />}
            {tab === "edit" && mode === "entity" && <EntitiesPanel project={project} mapId={mapSel} entities={entities} />}
            {tab === "info" && <MapProperties project={project} id={mapSel} resizeBy={resizeBy} setResizeBy={setResizeBy} />}
          </>
        )}
        </MapContext.Provider>
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
                <MusicPreview src={map.music && db ? assetUrl(db.musicPath(map.music)) : undefined} />
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
              <img src={assetUrl(db?.graphics.battlebacks[map.battleback]?.image ?? "")} class="preview-wide" alt="" />
            </td>
          </tr>
        </tbody>
      </table>
      <h3 title="What happens on this map as a whole: when the party arrives (map loaded) or when a condition turns true (intro scenes, all enemies defeated…)">Events</h3>
      {db && <HandlerTabs project={project} file={path} path={["on"]} handlers={map.on ?? []} triggers={MAP_TRIGGERS} db={db} mapId={id} resetKey={id} />}
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
function MusicPreview({ src: track }: { src?: string }) {
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
    audio.current = new Audio(track);
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

/** Entities layer: add new ones, the list of all on this map, and the selected one's form. */
function EntitiesPanel({ project, mapId, entities }: { project: Project; mapId: string; entities: EntitySelection }) {
  const { selected, select, placing, setPlacing, copying, setCopying } = entities;
  const map = project.data<MapDef>(mapPath(mapId));
  const list = listEntities(map);
  const adds = Object.keys(ADD_INFO) as AddKind[];
  const typeOf = (e: { kind: EntityKind; key: number | string }) => {
    if (e.kind !== "spawn") return KIND_INFO[e.kind].label;
    const role = arrivalRole(project, mapId, e.key as string);
    return role === "start" ? "Game start" : role === "quickplay" ? "Quick Play start" : KIND_INFO.spawn.label;
  };
  return (
    <div class="entities-panel">
      <div class="add-grid">
        {adds.map((k) => (
          <button key={k} class={placing === k ? "on" : ""} title={`${ADD_INFO[k].hint} Click a cell to place it.`} onClick={() => (setCopying(null), setPlacing(placing === k ? null : k))}>
            {ADD_INFO[k].label}
          </button>
        ))}
      </div>
      {selected && list.some((e) => sameRef(e, selected)) ? (
        <>
          <EntityForm project={project} mapId={mapId} entity={selected} onSelect={select} />
          <div class="entity-actions">
            <button onClick={() => select(null)} title="Back to the list of all entities">
              ← All
            </button>
            <span class="spacer" />
            <button
              class={copying ? "on" : ""}
              disabled={selected.kind === "spawn"}
              title={selected.kind === "spawn" ? "Arrivals come with the teleport or start that leads here" : "Duplicate: click a free cell on the map for the copy (Esc: cancel)"}
              onClick={() => (setPlacing(null), setCopying(copying ? null : selected))}
            >
              Duplicate {typeOf(selected).toLowerCase()}
            </button>
            <button
              title="Delete (Del)"
              onClick={() => {
                if (removeEntity(project, mapId, selected)) select(null);
              }}
            >
              Delete {typeOf(selected).toLowerCase()}
            </button>
          </div>
        </>
      ) : (
        <table class="entity-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Type</th>
              <th>Position</th>
            </tr>
          </thead>
          <tbody>
            {list.map((e) => (
              <tr key={`${e.kind}:${e.key}`} onClick={() => select({ kind: e.kind, key: e.key })}>
                <td>{e.label}</td>
                <td>{typeOf(e)}</td>
                <td>
                  {e.x}, {e.y}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
