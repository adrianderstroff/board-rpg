import { useState } from "preact/hooks";
import type { MapDef } from "../../../src/core/data/types";
import type { Pos } from "../../../src/core/util/grid";
import { FloatingWindow } from "../forms/FloatingWindow";
import { Field } from "../forms/fields";
import type { Project } from "../project";
import { ENTITY_ICONS } from "./icons";
import { listEntities, sameRef, type EntityRef } from "./model";
import { PrefabIcon } from "./PrefabPicker";
import { prefabFrom, prefabNames, savePrefab } from "./prefabs";

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
  const [names, setNames] = useState(() => prefabNames(map, chosenRefs));
  const [saved, setSaved] = useState<string | null>(null);
  const categories = [...new Set([...(project.content.db?.prefabs.values() ?? [])].map((p) => p.category).filter(Boolean) as string[])].sort();
  const save = () => {
    const perCopy = names.filter((n) => n.perCopy).map((n) => n.name);
    setSaved(savePrefab(project, name.trim(), category.trim() || undefined, prefabFrom(map, chosenRefs, at, perCopy), { icon, description: description.trim() || undefined }));
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
          <Field label="Description" hint="Shown in the prefab picker.">
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
          <Field label="Anchor" hint={`The cell a click places – ${at.x}, ${at.y} now; the others keep their places around it.`}>
            <select value={anchor} onChange={(e) => setAnchor(e.currentTarget.value)}>
              <option value="corner">{origin ? "the selected area's top-left corner" : "their top-left corner"}</option>
              {chosen.map((e, i) => (
                <option key={i} value={String(i)}>
                  {e.label} ({e.x}, {e.y})
                </option>
              ))}
            </select>
          </Field>
          {names.length > 0 && (
            <Field label="Names" hint="Per copy: each placed copy gets its own (gate, gate_2 …) – two copies don't affect each other. Shared: every copy uses the same (a flag the whole game knows).">
              <table class="prefab-names">
                <tbody>
                  {names.map((n, i) => (
                    <tr key={`${n.kind}:${n.name}`}>
                      <td class="dim">{n.kind}</td>
                      <td>{n.name}</td>
                      <td>
                        <div class="segmented">
                          {[true, false].map((per) => (
                            <button key={String(per)} type="button" class={n.perCopy === per ? "on" : ""} onClick={() => setNames(names.map((x, j) => (j === i ? { ...x, perCopy: per } : x)))}>
                              {per ? "per copy" : "shared"}
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
