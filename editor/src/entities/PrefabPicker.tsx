import { useState } from "preact/hooks";
import type { Database } from "../../../src/core/data/database";
import { FloatingWindow } from "../forms/FloatingWindow";
import { ENTITY_ICONS } from "./icons";

/** A prefab's icon (an entity icon by name, a star if it names none it knows). */
export function PrefabIcon({ icon, size = 22 }: { icon?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width={1.8} stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d={ENTITY_ICONS[icon ?? ""] ?? ENTITY_ICONS.event} />
    </svg>
  );
}

/**
 * The prefab picker (editor-design §6.5): search, the prefabs by category – the project's own first,
 * the library's marked. Picking one starts placing it.
 */
export function PrefabPicker({ db, onPick, onClose }: { db: Database; onPick: (id: string) => void; onClose: () => void }) {
  const [filter, setFilter] = useState("");
  const shown = [...db.prefabs.values()]
    .filter((p) => `${p.id} ${p.name} ${p.category ?? ""} ${p.description ?? ""}`.toLowerCase().includes(filter.toLowerCase()))
    .sort((a, b) => Number(a.id.startsWith("lib:")) - Number(b.id.startsWith("lib:")) || a.name.localeCompare(b.name));
  const categories = [...new Set(shown.map((p) => p.category ?? "other"))].sort();
  return (
    <FloatingWindow id="prefab-picker" title="Place a prefab" onClose={onClose} size={{ w: 460, h: 480 }}>
      <div class="prefab-picker">
        <input class="search" autoFocus placeholder="Search prefabs…" value={filter} onInput={(e) => setFilter(e.currentTarget.value)} />
        {categories.map((cat) => (
          <section key={cat}>
            <h4>{cat}</h4>
            {shown
              .filter((p) => (p.category ?? "other") === cat)
              .map((p) => {
                const size = [...(p.events ?? []), ...(p.enemies ?? []), ...(p.exits ?? [])].length;
                return (
                  <button key={p.id} class="prefab-item" title={p.id} onClick={() => onPick(p.id)}>
                    <PrefabIcon icon={p.icon} />
                    <span class="text">
                      <span class="name">
                        {p.name}
                        {size > 1 && <span class="dim"> · {size} entities</span>}
                        {p.id.startsWith("lib:") && <span class="badge-lib"> library</span>}
                      </span>
                      {p.description && <span class="desc">{p.description}</span>}
                    </span>
                  </button>
                );
              })}
          </section>
        ))}
        {!shown.length && <p class="hint">No prefab matches.</p>}
      </div>
    </FloatingWindow>
  );
}
