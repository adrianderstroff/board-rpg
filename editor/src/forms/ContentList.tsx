import type { ComponentChildren } from "preact";
import { useState } from "preact/hooks";
import { usePersistentState } from "../persist";

/**
 * The list of a content screen (editor-design §7, §8): search, **New** (one entry or a menu of
 * presets), entries grouped under headings, the project's own before the library's (marked).
 */

export interface ListEntry {
  id: string;
  name: string;
  /** A small picture before the name (an icon, a sprite). */
  pic?: ComponentChildren;
  /** Heading it is listed under. */
  group?: string;
  /** Unsaved changes. */
  dirty?: boolean;
}

export interface NewOption {
  label: string;
  title?: string;
  make: () => void;
  /** A line above this option. */
  divider?: boolean;
}

export function ContentList({ entries, groups, selected, onSelect, searchKey, placeholder, newOptions, newTitle }: { entries: ListEntry[]; groups?: string[]; selected: string | null; onSelect: (id: string) => void; searchKey: string; placeholder: string; newOptions: NewOption[]; newTitle: string }) {
  const [filter, setFilter] = usePersistentState(searchKey, "");
  const [menu, setMenu] = useState(false);
  const shown = entries.filter((e) => `${e.id} ${e.name}`.toLowerCase().includes(filter.toLowerCase()));
  const lib = (id: string) => id.startsWith("lib:");
  const order = (list: ListEntry[]) => [...list].sort((a, b) => Number(lib(a.id)) - Number(lib(b.id)));
  const sections: [string | undefined, ListEntry[]][] = groups ? groups.map((g) => [g, order(shown.filter((e) => e.group === g))]) : [[undefined, order(shown)]];
  return (
    <div class="list">
      <div class="list-head">
        <input class="search" placeholder={placeholder} value={filter} onInput={(e) => setFilter(e.currentTarget.value)} />
        {newOptions.length === 1 ? (
          <button class="primary" title={newTitle} onClick={() => newOptions[0].make()}>
            New
          </button>
        ) : (
          <div class="menu-anchor">
            <button class="primary" aria-haspopup="menu" aria-expanded={menu} title={newTitle} onClick={() => setMenu(!menu)}>
              New ▾
            </button>
            {menu && (
              <div class="menu" role="menu">
                {newOptions.map((o) => (
                  <>
                    {o.divider && <hr />}
                    <button
                      key={o.label}
                      role="menuitem"
                      title={o.title}
                      onClick={() => {
                        setMenu(false);
                        o.make();
                      }}
                    >
                      {o.label}
                    </button>
                  </>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      {sections.map(([g, list]) =>
        list.length ? (
          <div key={g ?? "all"}>
            {g && <h4 class="list-group">{g}</h4>}
            {list.map((e) => (
              <div key={e.id} class={`item ${selected === e.id ? "active" : ""}`} title={e.id} onClick={() => onSelect(e.id)}>
                <span class="item-name">
                  {e.pic}
                  {e.name}
                  {e.dirty && <span class="dirty"> ●</span>}
                </span>
                {lib(e.id) && <small>library</small>}
              </div>
            ))}
          </div>
        ) : null,
      )}
    </div>
  );
}

/** The inspector's buttons for an entry: Copy to project (library), Duplicate, Delete (the project's). */
/** `used`: places that still refer to it – Delete waits until there are none (E9). */
export function EntryActions({ id, onCopy, onDuplicate, onDelete, used = 0 }: { id: string; onCopy: () => void; onDuplicate: () => void; onDelete: () => void; used?: number }) {
  const lib = id.startsWith("lib:");
  return (
    <div class="row wrap">
      {lib && (
        <button class="primary" title="An editable copy in the project; the project's references to it use the copy from then on" onClick={onCopy}>
          Copy to project
        </button>
      )}
      <button title="A copy in the project, with a new id" onClick={onDuplicate}>
        Duplicate
      </button>
      {!lib && (
        <button disabled={used > 0} title={used ? `Still used in ${used} place${used === 1 ? "" : "s"} – change or remove ${used === 1 ? "it" : "them"} first` : "Delete it from the project"} onClick={onDelete}>
          Delete
        </button>
      )}
    </div>
  );
}
