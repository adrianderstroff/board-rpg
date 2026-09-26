import { useEffect, useMemo, useState } from "preact/hooks";
import type { MapDef } from "../../../src/core/data/types";
import { getGrid } from "../../../src/core/board/grid";
import type { Dir, Pos } from "../../../src/core/util/grid";
import { FloatingWindow } from "../forms/FloatingWindow";
import { GridCanvas } from "../map/GridCanvas";
import type { CanvasHandlers } from "../map/IsoCanvas";
import type { Project } from "../project";
import { markerKey } from "./icons";
import { entitiesAt } from "./model";
import { frontOf, mapFile, nearestEdge, type Destination } from "./teleports";
import { entitySprites, type EntitySprite } from "./visuals";

const TURN: Dir[] = ["N", "E", "S", "W"];
const turn = (d: Dir, by: number) => TURN[(TURN.indexOf(d) + by + 4) % 4];

/**
 * Where a teleport leads (editor-design §6.4), in a floating window: first the list of maps, then
 * the chosen map – click the arrival cell (A / D: facing), or an existing arrival to use it. With
 * "way back" the click places the return exit instead (its arrival goes in front of it).
 */
export function DestinationWindow({ project, fromMap, wayBack: allowWayBack, onPick, onClose }: { project: Project; fromMap: string; wayBack?: boolean; onPick: (d: Destination) => void; onClose: () => void }) {
  const db = project.content.db;
  const [map, setMap] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [hover, setHover] = useState<Pos | null>(null);
  const [dir, setDir] = useState<Dir>("S");
  const [wayBack, setWayBack] = useState(false);
  const target = map ? project.data<MapDef>(mapFile(map)) : undefined;

  // A / D turn what is placed – before the map editor behind the window sees the keys
  useEffect(() => {
    if (!map) return;
    const key = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      const k = e.key.toLowerCase();
      if (!["a", "d", "w", "s", "q", "e"].includes(k)) return;
      e.stopImmediatePropagation();
      if (k === "a") setDir((d) => turn(d, -1));
      if (k === "d") setDir((d) => turn(d, 1));
    };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  }, [map]);

  // an exit's arrow points off the map: start with the nearest edge
  useEffect(() => {
    if (target && hover && wayBack) setDir(nearestEdge(target, hover));
  }, [wayBack, map]);

  const grid = db && map ? getGrid(db, map) : null;
  const walkable = (p: Pos) => !!grid?.cell(p)?.walkable;
  const arrivalAt = (p: Pos) => Object.entries(target?.spawns ?? {}).find(([, s]) => s.x === p.x && s.y === p.y)?.[0];
  const free = (p: Pos) => !!target && !entitiesAt(target, p).some((e) => e.kind !== "spawn");
  /** Can the click at `p` be taken? And what does it show? */
  const check = (p: Pos) => {
    if (wayBack) {
      const f = frontOf({ ...p, dir });
      return { ok: free(p) && walkable(f) && !target?.exits?.some((e) => e.x === f.x && e.y === f.y), front: f };
    }
    return { ok: !!arrivalAt(p) || (walkable(p) && free(p)), front: null };
  };

  const sprites: EntitySprite[] = useMemo(() => {
    if (!db || !target) return [];
    const all = entitySprites(db, target, 0, null, true);
    if (!hover) return all;
    const { ok, front } = check(hover);
    const ghost = (kind: EntitySprite["kind"], at: Pos, icon: string, d: Dir): EntitySprite => ({ ref: { kind, key: "preview" }, kind, x: at.x, y: at.y, preview: true, blocked: !ok, texture: markerKey(icon), dir: d, flat: true });
    return wayBack
      ? [...all, ghost("exit", hover, "exit", dir), ...(front ? [ghost("spawn", front, "arrival", front.dir)] : [])]
      : [...all, ghost("spawn", hover, "arrival", dir)];
  }, [db, target, hover?.x, hover?.y, dir, wayBack]);

  if (!db) return null;

  if (!map) {
    const maps = project
      .paths("data/maps/")
      .map((p) => p.replace(/^data\/maps\//, "").replace(/\.yaml$/, ""))
      .filter((id) => `${id} ${project.data<MapDef>(mapFile(id))?.name ?? ""}`.toLowerCase().includes(filter.toLowerCase()));
    return (
      <FloatingWindow id="destination" title="Teleport to…" onClose={onClose} size={{ w: 420, h: 480 }} toolbar={<input class="search" placeholder="Search maps…" value={filter} autoFocus onInput={(e) => setFilter(e.currentTarget.value)} />}>
        <div class="map-choice">
          {maps.map((id) => (
            <button key={id} class={id === fromMap ? "here" : ""} onClick={() => setMap(id)}>
              <span>{project.data<MapDef>(mapFile(id))?.name ?? id}</span>
              <small>{id === fromMap ? "this map" : id}</small>
            </button>
          ))}
        </div>
      </FloatingWindow>
    );
  }

  const handlers: CanvasHandlers = {
    down(c, button) {
      if (button !== 0) return;
      const { ok } = check(c);
      if (!ok) return;
      const reuse = wayBack ? undefined : arrivalAt(c);
      onPick({ map, x: c.x, y: c.y, dir: reuse ? (target!.spawns[reuse].dir ?? "S") : dir, reuse, wayBack });
    },
    move(c) {
      setHover(c);
    },
    up() {},
  };

  return (
    <FloatingWindow
      id="destination-place"
      title={`${wayBack ? "Way back on" : "Arrive on"} ${target?.name ?? map}`}
      onClose={onClose}
      size={{ w: 620, h: 560 }}
      toolbar={
        <div class="row">
          <button onClick={() => (setMap(null), setHover(null))}>← Maps</button>
          <span class="spacer" />
          {allowWayBack && (
            <label class="check" title="Also a teleport back: click where the return exit goes – each side's arrival lies one cell in front of its exit">
              <input type="checkbox" checked={wayBack} onChange={(e) => setWayBack(e.currentTarget.checked)} /> way back
            </label>
          )}
          <span class="dim">{wayBack ? "click: the return exit" : "click: where the party arrives"} · A / D: {wayBack ? "arrow" : "facing"} {dir}</span>
        </div>
      }
    >
      <div class="destination-canvas">
        <GridCanvas db={db} mapId={map} hideDecor={false} focus="entity" markers={[]} entities={sprites} ghost={null} showGrid={true} resizeTo={null} handlers={handlers} />
      </div>
    </FloatingWindow>
  );
}
