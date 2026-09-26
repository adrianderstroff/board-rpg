import { useState } from "preact/hooks";
import type { MapDef } from "../../../src/core/data/types";
import type { Pos } from "../../../src/core/util/grid";
import { FloatingWindow } from "../forms/FloatingWindow";
import { Field } from "../forms/fields";
import type { Project } from "../project";
import { listEntities, sameRef, type EntityRef } from "./model";
import { prefabFrom, savePrefab } from "./prefabs";

/**
 * Save as prefab (editor-design §6.5): the chosen entities of a map become a prefab of the project –
 * cells relative to `origin` (default: their top-left), ids as placeholders.
 */
export function SavePrefabWindow({ project, mapId, refs, origin, onClose }: { project: Project; mapId: string; refs: EntityRef[]; origin?: Pos; onClose: () => void }) {
  const map = project.data<MapDef>(`data/maps/${mapId}.yaml`);
  const chosen = listEntities(map).filter((e) => refs.some((r) => sameRef(r, e)));
  const [name, setName] = useState(chosen.length === 1 ? chosen[0].label : "");
  const [category, setCategory] = useState("");
  const [saved, setSaved] = useState<string | null>(null);
  const categories = [...new Set([...(project.content.db?.prefabs.values() ?? [])].map((p) => p.category).filter(Boolean) as string[])].sort();
  const at = origin ?? { x: Math.min(...chosen.map((e) => e.x)), y: Math.min(...chosen.map((e) => e.y)) };
  const save = () => {
    const id = savePrefab(project, name.trim(), category.trim() || undefined, prefabFrom(map, refs, at));
    setSaved(id);
  };
  return (
    <FloatingWindow id="save-prefab" title="Save as prefab" onClose={onClose} size={{ w: 420, h: 300 }}>
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
          class="new-project"
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
