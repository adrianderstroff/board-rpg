import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import type { MapDef } from "../../../src/core/data/types";
import type { Project } from "../project";
import { QuickPlayForm } from "./QuickPlayForm";

const mapPath = (id: string) => `data/maps/${id}.yaml`;

/** Maps: list, properties (editor-design §5.4) and the Quick Play settings (§6.3). The canvas comes with E3. */
export function MapsScreen({ project, selected, onSelect }: { project: Project; selected: string | null; onSelect: (id: string) => void }) {
  const [filter, setFilter] = useState("");
  const ids = project.paths("data/maps/").map((p) => p.replace(/^data\/maps\//, "").replace(/\.yaml$/, ""));
  const shown = ids.filter((id) => {
    const name = project.data<MapDef>(mapPath(id))?.name ?? "";
    return `${id} ${name}`.toLowerCase().includes(filter.toLowerCase());
  });
  const dirty = new Set(project.dirtyPaths());

  return (
    <>
      <main class="main">
        <div class="split">
          <div class="list">
            <input class="search" placeholder="Search maps…" value={filter} onInput={(e) => setFilter(e.currentTarget.value)} />
            {shown.map((id) => (
              <div key={id} class={`item ${selected === id ? "active" : ""}`} onClick={() => onSelect(id)}>
                <span>
                  {project.data<MapDef>(mapPath(id))?.name ?? id}
                  {dirty.has(mapPath(id)) && <span class="dirty"> ●</span>}
                </span>
                <small>{id}</small>
              </div>
            ))}
          </div>
          <div class="content">{selected ? <MapProperties project={project} id={selected} /> : <p class="placeholder">Select a map.</p>}</div>
        </div>
      </main>
      <aside class="inspector">{selected && <QuickPlayForm project={project} mapId={selected} />}</aside>
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
    <>
      <h2>{map.name}</h2>
      <div class="form">
        <label>Name</label>
        <input value={map.name} onInput={(e) => set("name", e.currentTarget.value, "Map name", `name:${id}`)} />
        <span />

        <label>Kind</label>
        <select value={map.kind} onChange={(e) => set("kind", e.currentTarget.value, "Map kind")}>
          <option value="peaceful">peaceful – no random fights</option>
          <option value="wild">wild – enemies, traps allowed</option>
        </select>
        <span />

        <label>Chipset</label>
        <select value={map.chipset} onChange={(e) => set("chipset", e.currentTarget.value, "Chipset")}>
          {[...(db?.chipsets.keys() ?? [])].map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <span />

        <label>Battleback</label>
        <select value={map.battleback} onChange={(e) => set("battleback", e.currentTarget.value, "Battleback")}>
          {Object.keys(db?.graphics.battlebacks ?? {}).map((b) => (
            <option key={b}>{b}</option>
          ))}
        </select>
        <img src={`/assets/battlebacks/${map.battleback}.png`} style={{ height: 48, borderRadius: 4 }} alt="" />

        <label>Music</label>
        <select value={map.music ?? ""} onChange={(e) => set("music", e.currentTarget.value, "Music")}>
          <option value="">(none)</option>
          {project.music.map((m) => (
            <option key={m}>{m}</option>
          ))}
        </select>
        <MusicPreview track={map.music} />

        <label>Size</label>
        <span>
          {size.w} × {size.h} cells
        </span>
        <span class="hint">painted in the map canvas (E3)</span>

        <label>Contents</label>
        <span>{counts.map(([k, n]) => `${n} ${k}`).join(", ") || "–"}</span>
        <span class="hint">edited as entities (E4)</span>
      </div>
    </>
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
