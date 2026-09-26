import { useState } from "preact/hooks";
import type { MapDef } from "../../../src/core/data/types";
import type { Pos } from "../../../src/core/util/grid";
import { FloatingWindow } from "../forms/FloatingWindow";
import { Field } from "../forms/fields";
import type { Project } from "../project";
import { ENTITY_ICONS } from "./icons";
import { listEntities, sameRef, type EntityRef } from "./model";
import { PrefabIcon } from "./PrefabPicker";
import { prefabFrom, prefabSlots, savePrefab, SLOT_MODES, type PrefabSlot, type SlotMode } from "./prefabs";

const MODE_LABEL: Record<SlotMode, string> = { perCopy: "per copy", fixed: "fixed", input: "on placement" };

/** The tooltip of a value's mode. */
function modeHint(kind: PrefabSlot["kind"], mode: SlotMode): string {
  const what = kind === "outside" ? "entity" : kind;
  if (mode === "perCopy") return kind === "entity" ? "Each copy is a separate entity" : `Each copy has its own ${what}`;
  if (mode === "input") return kind === "outside" ? "Chosen when placing: which entity of the map" : `Chosen when placing (this one is the default)`;
  if (kind === "entity") return "Each copy is the same entity – ids are unique on a map, so only one copy per map";
  if (kind === "outside") return "Every copy refers to this same entity (it isn't part of the prefab)";
  return `Every copy uses this same ${what}`;
}

/**
 * Save as prefab (editor-design §6.5): the chosen entities of a map become a prefab of the project.
 * Name and category first; below the divider everything else a prefab holds – its description and
 * icon, the anchor (the cell a click places), and for every name its entities use (ids, flags,
 * variables) whether each placed copy gets its own or all copies share it.
 */
export function SavePrefabWindow({ project, mapId, refs, origin, onClose }: { project: Project; mapId: string; refs: EntityRef[]; origin?: Pos; onClose: () => void }) {
  const map = project.data<MapDef>(`data/maps/${mapId}.yaml`);
  const chosen = listEntities(map).filter((e) => e.kind !== "spawn" && refs.some((r) => sameRef(r, e)));
  const chosenRefs = chosen.map((e) => ({ kind: e.kind, key: e.key }));
  const [name, setName] = useState(chosen.length === 1 ? chosen[0].label : "");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [icon, setIcon] = useState(chosen[0]?.kind === "enemy" ? "enemy" : chosen[0]?.kind === "exit" ? "exit" : "event");
  // the anchor: the top-left corner (or the area's), or one of the entities' cells
  const topLeft = origin ?? { x: Math.min(...chosen.map((e) => e.x)), y: Math.min(...chosen.map((e) => e.y)) };
  const [anchor, setAnchor] = useState("corner");
  const at = anchor === "corner" ? topLeft : (() => {
    const e = chosen[Number(anchor)];
    return { x: e.x, y: e.y };
  })();
  const [slots, setSlots] = useState(() => prefabSlots(map, chosenRefs));
  const setSlot = (i: number, patch: Partial<PrefabSlot>) => setSlots(slots.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const [saved, setSaved] = useState<string | null>(null);
  const categories = [...new Set([...(project.content.db?.prefabs.values() ?? [])].map((p) => p.category).filter(Boolean) as string[])].sort();
  const save = () => {
    setSaved(savePrefab(project, name.trim(), category.trim() || undefined, prefabFrom(map, chosenRefs, at, slots), { icon, description: description.trim() || undefined }));
  };
  return (
    <FloatingWindow id="save-prefab" title="Save as prefab" onClose={onClose} size={{ w: 480, h: 620 }}>
      {saved ? (
        <div class="new-project">
          <p>
            Saved as prefab <b>{saved}</b> in data/prefabs.yaml – Save to keep it. The Prefab button places it.
          </p>
          <div class="row end">
            <button class="primary" onClick={onClose}>
              OK
            </button>
          </div>
        </div>
      ) : (
        <form
          class="new-project save-prefab"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim() && chosen.length) save();
          }}
        >
          <p class="hint">
            {chosen.length ? `${chosen.length} entit${chosen.length > 1 ? "ies" : "y"}: ${chosen.map((e) => e.label).join(", ")}` : "No entities in the selection (arrivals are left out)."}
          </p>
          <Field label="Name">
            <input autoFocus value={name} placeholder="Locked door" onInput={(e) => setName(e.currentTarget.value)} />
          </Field>
          <Field label="Category">
            <input value={category} list="prefab-categories" placeholder="mechanisms" onInput={(e) => setCategory(e.currentTarget.value)} />
            <datalist id="prefab-categories">
              {categories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </Field>
          <hr />
          <Field label="Description">
            <textarea rows={2} value={description} placeholder="What it is and how it works" onInput={(e) => setDescription(e.currentTarget.value)} />
          </Field>
          <Field label="Icon">
            <div class="icon-choice">
              {Object.keys(ENTITY_ICONS).map((k) => (
                <button key={k} type="button" class={`icon-button ${icon === k ? "on" : ""}`} title={k} aria-label={k} onClick={() => setIcon(k)}>
                  <PrefabIcon icon={k} size={18} />
                </button>
              ))}
            </div>
          </Field>
          <Field label="Anchor">
            <select value={anchor} onChange={(e) => setAnchor(e.currentTarget.value)}>
              <option value="corner">{origin ? "the selected area's top-left corner" : "their top-left corner"}</option>
              {chosen.map((e, i) => (
                <option key={i} value={String(i)}>
                  {e.label} ({e.x}, {e.y})
                </option>
              ))}
            </select>
          </Field>
          {slots.length > 0 && (
            <Field label="Values">
              <table class="prefab-names">
                <tbody>
                  {slots.map((n, i) => (
                    <tr key={`${n.kind}:${n.value}`}>
                      <td class="dim">{n.kind === "outside" ? "entity (outside)" : n.kind}</td>
                      <td>
                        {n.mode === "input" ? (
                          <input class="slot-label" value={n.label} title={`Asked for when placing – default ${n.value}`} onInput={(e) => setSlot(i, { label: e.currentTarget.value })} />
                        ) : (
                          n.value
                        )}
                      </td>
                      <td>
                        <div class="segmented">
                          {SLOT_MODES[n.kind].map((mode) => (
                            <button key={mode} type="button" class={n.mode === mode ? "on" : ""} title={modeHint(n.kind, mode)} onClick={() => setSlot(i, { mode })}>
                              {MODE_LABEL[mode]}
                            </button>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Field>
          )}
          <div class="row end">
            <button type="button" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" class="primary" disabled={!name.trim() || !chosen.length}>
              Save prefab
            </button>
          </div>
        </form>
      )}
    </FloatingWindow>
  );
}
