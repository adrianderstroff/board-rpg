import { useState } from "preact/hooks";
import type { MapDef } from "../../../src/core/data/types";
import type { Project } from "../project";
import { DestinationWindow } from "./DestinationWindow";
import { mapFile, type Destination } from "./teleports";

/**
 * Where something teleports to – "Temple · from_elder_house (2, 2)" and Change…, which opens the
 * destination window (editor-design §6.4). The caller turns the pick into edits.
 */
export function TeleportTarget({ project, value, fromMap, wayBack, onPick }: { project: Project; value: { map: string; spawn: string } | undefined; fromMap: string; wayBack?: boolean; onPick: (d: Destination) => void }) {
  const [open, setOpen] = useState(false);
  const m = value?.map ? project.data<MapDef>(mapFile(value.map)) : undefined;
  const s = value?.spawn ? m?.spawns?.[value.spawn] : undefined;
  return (
    <div class="row teleport-target">
      <span class={s ? "" : "bad-text"} title={s ? `arrival "${value!.spawn}" on ${m!.name}` : "The target is missing – pick one"}>
        {s ? `${m!.name} (${s.x}, ${s.y})` : m ? `${m.name} – pick where` : "nowhere yet"}
      </span>
      <span class="spacer" />
      <button onClick={() => setOpen(true)}>Change…</button>
      {open && (
        <DestinationWindow
          project={project}
          fromMap={fromMap}
          wayBack={wayBack}
          onPick={(d) => {
            setOpen(false);
            onPick(d);
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}
