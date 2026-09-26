import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import type { MapDef } from "../../../src/core/data/types";
import { resize } from "../map/layers";
import { LAYERS, MapEditor, Palette, type Brush, type Layer } from "../map/MapEditor";
import { EntityForm } from "../entities/EntityForm";
import { deleteEntity, KIND_INFO, listEntities, sameRef, type EntityKind, type EntityRef } from "../entities/model";
import { ActionEditor } from "../forms/ActionEditor";
import { Field, fileSetter } from "../forms/fields";
import type { Project } from "../project";
import { QuickPlayForm } from "./QuickPlayForm";

const mapPath = (id: string) => `data/maps/${id}.yaml`;

/** Maps: list, canvas with layers and tools (editor-design §5), inspector with brush, properties and Quick Play. */
export function MapsScreen({ project, selected: mapSel, onSelect }: { project: Project; selected: string | null; onSelect: (id: string) => void }) {
  const [filter, setFilter] = useState("");
  const [tab, setTab] = useState<"paint" | "map" | "quick">("paint");
  const [layer, setLayer] = useState<Layer>("entities");
  const [selected, select] = useState<EntityRef | null>(null);
  const [placing, setPlacing] = useState<EntityKind | null>(null);
  const entities = { selected, select, placing, setPlacing };
  // another map: nothing selected
  useEffect(() => {
    select(null);
    setPlacing(null);
  }, [mapSel]);
  const [brush, setBrush] = useState<Brush>({ terrain: "grass", decor: "palm", heightMode: "raise", height: 1, shape: ["NW"], facing: "N", lintel: "adobe", lintelTop: 5 });
  const ids = project.paths("data/maps/").map((p) => p.replace(/^data\/maps\//, "").replace(/\.yaml$/, ""));
  const shown = ids.filter((id) => {
    const name = project.data<MapDef>(mapPath(id))?.name ?? "";
    return `${id} ${name}`.toLowerCase().includes(filter.toLowerCase());
  });
  const dirty = new Set(project.dirtyPaths());

  // layer shortcuts 1–5
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
      const l = LAYERS.find((x) => x.key === e.key);
      if (l) {
        setLayer(l.id);
        setTab("paint");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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
          {mapSel ? <MapEditor project={project} mapId={mapSel} layer={layer} brush={brush} setBrush={setBrush} entities={entities} /> : <p class="placeholder">Select a map.</p>}
        </div>
      </main>
      <aside class="inspector">
        {mapSel && (
          <>
            <div class="tabs">
              <button class={tab === "paint" ? "on" : ""} onClick={() => setTab("paint")}>
                {layer === "entities" ? "Entities" : "Paint"}
              </button>
              <button class={tab === "map" ? "on" : ""} onClick={() => setTab("map")}>
                Map
              </button>
              <button class={tab === "quick" ? "on" : ""} onClick={() => setTab("quick")}>
                Quick Play
              </button>
            </div>
            {tab === "paint" && (
              <>
                <Palette project={project} mapId={mapSel} layer={layer} setLayer={setLayer} brush={brush} setBrush={setBrush} />
                {layer === "entities" && <EntitiesPanel project={project} mapId={mapSel} selected={selected} select={select} placing={placing} setPlacing={setPlacing} />}
              </>
            )}
            {tab === "map" && <MapProperties project={project} id={mapSel} />}
            {tab === "quick" && <QuickPlayForm project={project} mapId={mapSel} />}
          </>
        )}
      </aside>
    </>
  );
}

function MapProperties({ project, id }: { project: Project; id: string }) {
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
  const counts = [
    ["events", map.events?.length ?? 0],
    ["exits", map.exits?.length ?? 0],
    ["spawns", Object.keys(map.spawns ?? {}).length],
    ["enemies", map.enemies?.length ?? 0],
    ["gates", map.gates?.length ?? 0],
    ["switches", map.switches?.length ?? 0],
  ].filter(([, n]) => n);

  return (
    <div class="stack">
      <label>Name</label>
      <input value={map.name} onInput={(e) => set("name", e.currentTarget.value, "Map name", `name:${id}`)} />
      <label>Kind</label>
      <select value={map.kind} onChange={(e) => set("kind", e.currentTarget.value, "Map kind")}>
        <option value="peaceful">peaceful – no random fights</option>
        <option value="wild">wild – enemies, traps allowed</option>
      </select>
      <label>Chipset</label>
      <select value={map.chipset} onChange={(e) => set("chipset", e.currentTarget.value, "Chipset")}>
        {[...(db?.chipsets.keys() ?? [])].map((c) => (
          <option key={c}>{c}</option>
        ))}
      </select>
      <label>Battleback</label>
      <select value={map.battleback} onChange={(e) => set("battleback", e.currentTarget.value, "Battleback")}>
        {Object.keys(db?.graphics.battlebacks ?? {}).map((b) => (
          <option key={b}>{b}</option>
        ))}
      </select>
      <img src={`/assets/battlebacks/${map.battleback}.png`} class="preview-wide" alt="" />
      <label>Music</label>
      <div class="row">
        <select value={map.music ?? ""} onChange={(e) => set("music", e.currentTarget.value, "Music")}>
          <option value="">(none)</option>
          {project.music.map((m) => (
            <option key={m}>{m}</option>
          ))}
        </select>
        <MusicPreview track={map.music} />
      </div>
      <label>On entering</label>
      <OnEnter project={project} id={id} />
      <label>Contents</label>
      <span>{counts.map(([k, n]) => `${n} ${k}`).join(", ") || "–"}</span>
      <span class="hint">edited on the Entities layer</span>
      <label>
        Size: {size.w} × {size.h}
      </label>
      <ResizeForm project={project} id={id} />
    </div>
  );
}

/** Add (+) or remove (−) rows and columns on each side; things placed on the map move along. */
function ResizeForm({ project, id }: { project: Project; id: string }) {
  const [d, setD] = useState({ left: 0, right: 0, top: 0, bottom: 0 });
  const [fill, setFill] = useState("grass");
  const db = project.content.db;
  const map = project.data<MapDef>(mapPath(id));
  const terrains = db ? Object.keys(db.chipsets.get(map.chipset)?.terrains ?? {}) : [];
  const field = (k: keyof typeof d, label: string) => (
    <label class="check" title={`${label}: + adds, − removes`}>
      {label}
      <input type="number" style={{ width: 52 }} value={d[k]} onInput={(e) => setD({ ...d, [k]: Number(e.currentTarget.value) || 0 })} />
    </label>
  );
  return (
    <div class="resize">
      <div class="row">
        {field("left", "−x")}
        {field("right", "+x")}
      </div>
      <div class="row">
        {field("top", "−y")}
        {field("bottom", "+y")}
      </div>
      <div class="row">
        new cells
        <select value={fill} onChange={(e) => setFill(e.currentTarget.value)}>
          {terrains.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
        <button
          disabled={!d.left && !d.right && !d.top && !d.bottom}
          onClick={() => {
            try {
              project.edit(mapPath(id), "Resize map", (doc) => resize(doc, doc.toJS() as MapDef, d, fill));
              setD({ left: 0, right: 0, top: 0, bottom: 0 });
            } catch (e) {
              alert((e as Error).message);
            }
          }}
        >
          Resize
        </button>
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
    <button disabled={!track} onClick={toggle} title="Listen">
      {playing ? "■ Stop" : "▶ Listen"}
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
