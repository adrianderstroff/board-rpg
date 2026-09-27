import { useEffect, useRef, useState } from "preact/hooks";
import type { RefCollection } from "../../../src/content/refs";
import type { Project } from "../project";
import { LibraryMark } from "../icons";
import { isOverridden } from "../overrides";
import { entryFile, outsideUsages, renameEntry, renameProblem, usagePlaces, type UsageTarget } from "../references";

/**
 * An entry's id and where it is used (editor-design §3, E9): **Rename id** repoints every reference
 * in the project; the places that use it are listed with links; while any are left, Delete waits.
 */
export function EntryReferences({ project, collection, id, goTo, onRenamed, list = true }: { project: Project; collection: RefCollection; id: string; goTo: (t: UsageTarget) => void; onRenamed: (id: string) => void; list?: boolean }) {
  const [draft, setDraft] = useState(id);
  const [message, setMessage] = useState<string | null>(null);
  // the id it was just renamed to: its message stays when the selection follows
  const renamedTo = useRef<string | null>(null);
  useEffect(() => {
    setDraft(id);
    if (renamedTo.current !== id) setMessage(null);
    renamedTo.current = null;
  }, [id]);
  const own = !!entryFile(project, collection, id);
  const problem = draft === id ? null : renameProblem(project, collection, id, draft);
  const places = usagePlaces(outsideUsages(project, collection, id));
  const rename = () => {
    try {
      const moved = renameEntry(project, collection, id, draft);
      renamedTo.current = draft;
      setMessage(`Renamed – ${moved} reference${moved === 1 ? "" : "s"} repointed.`);
      onRenamed(draft);
    } catch (e) {
      setMessage((e as Error).message);
    }
  };
  return (
    <div class="entry-refs">
      <h4 class="card-heading">Id</h4>
      {own ? (
        <div class="row">
          <input
            value={draft}
            class={problem ? "bad" : ""}
            title="Content refers to it by this id"
            onInput={(e) => setDraft(e.currentTarget.value.trim())}
            onKeyDown={(e) => e.key === "Enter" && !problem && draft !== id && rename()}
          />
          <button disabled={!!problem || draft === id} title={problem ?? "Rename it and every reference to it in the project (one undo step)"} onClick={rename}>
            Rename
          </button>
        </div>
      ) : (
        <p class="entry-id" title="The library's ids stay as they are">
          {id}
          <LibraryMark changed={isOverridden(project, collection as never, id)} />
        </p>
      )}
      {problem && draft !== id && <p class="bad-text">{problem}</p>}
      {message && <p class="hint">{message}</p>}
      {list && (
        <>
          <h4 class="card-heading">Used in{places.length ? ` (${places.length})` : ""}</h4>
          {places.length ? (
            <ul class="placements">
              {places.map((u) => (
                <li key={u.file + u.label}>
                  <button class="link" title={u.lib ? "In the library (read-only)" : u.file} onClick={() => goTo(u.target)}>
                    {u.label}
                  </button>
                  {u.lib && <LibraryMark />}
                </li>
              ))}
            </ul>
          ) : (
            <p class="hint">Nothing uses it.</p>
          )}
        </>
      )}
    </div>
  );
}

/** How many places outside the entry still use it (Delete waits until none do). */
export const usedIn = (project: Project, collection: RefCollection, id: string) => usagePlaces(outsideUsages(project, collection, id)).length;
