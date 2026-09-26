import { useState } from "preact/hooks";
import type { MapDef, PrefabDef } from "../../../src/core/data/types";
import { FloatingWindow } from "../forms/FloatingWindow";
import { Field } from "../forms/fields";
import type { Project } from "../project";

/**
 * Placing a prefab with inputs (editor-design §6.5): after the click this asks for them, the
 * defaults filled in – Enter places it. An entity input is chosen from the map's entities.
 */
export function PlaceInputsWindow({ project, mapId, prefab, onPlace, onClose }: { project: Project; mapId: string; prefab: PrefabDef; onPlace: (inputs: Record<string, string>) => void; onClose: () => void }) {
  const inputs = Object.entries(prefab.inputs ?? {});
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(inputs.map(([k, i]) => [k, i.default ?? ""])));
  const db = project.content.db;
  const map = project.data<MapDef>(`data/maps/${mapId}.yaml`);
  const options = (type: string): [string, string][] => {
    if (!db) return [];
    const named = <T extends { name?: string }>(m: Map<string, T>) => [...m.entries()].map(([id, t]) => [id, t.name ? `${t.name} (${id})` : id] as [string, string]);
    switch (type) {
      case "entity":
        return [...(map.events ?? []), ...(map.enemies ?? [])].map((e) => [e.id, e.id]);
      case "item":
        return named(db.items);
      case "shop":
        return named(db.shops);
      case "enemy":
        return named(db.enemies);
      case "dialog":
        return [...db.dialogs.keys()].sort().map((d) => [d, d]);
      case "music":
        return project.music.map((m) => [m, m]);
      default:
        return [];
    }
  };
  return (
    <FloatingWindow id="place-inputs" title={`Place ${prefab.name}`} onClose={onClose} size={{ w: 420, h: 120 + inputs.length * 48 }}>
      <form
        class="new-project"
        onSubmit={(e) => {
          e.preventDefault();
          onPlace(values);
        }}
      >
        {inputs.map(([key, input], i) => {
          const opts = options(input.type);
          const set = (v: string) => setValues({ ...values, [key]: v });
          return (
            <Field key={key} label={input.label}>
              {input.type === "flag" || input.type === "variable" ? (
                <input autoFocus={i === 0} value={values[key]} placeholder={input.type} onInput={(e) => set(e.currentTarget.value)} />
              ) : (
                <select autoFocus={i === 0} value={values[key]} onChange={(e) => set(e.currentTarget.value)}>
                  {!opts.some(([id]) => id === values[key]) && <option value={values[key]}>{values[key] || "(none)"}</option>}
                  {opts.map(([id, label]) => (
                    <option key={id} value={id}>
                      {label}
                    </option>
                  ))}
                </select>
              )}
            </Field>
          );
        })}
        <div class="row end">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" class="primary">
            Place
          </button>
        </div>
      </form>
    </FloatingWindow>
  );
}
