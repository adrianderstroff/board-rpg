import { useState } from "preact/hooks";
import type { Database } from "../../../src/core/data/database";
import type { ChipsetDef } from "../../../src/core/data/types";
import { FloatingWindow } from "../forms/FloatingWindow";
import { characterLayer, decorLayer, SpriteView } from "./LookPreview";

export type LookPick = { kind: "nothing" } | { kind: "character"; id: string } | { kind: "object"; id: string };

/**
 * What an event looks like, picked from sprites – nothing, a character (NPC) or an object (decor) –
 * in a floating window over the editor.
 */
export function LookPicker({ db, chip, current, onPick, onClose }: { db: Database; chip: ChipsetDef | undefined; current: string | undefined; onPick: (p: LookPick) => void; onClose: () => void }) {
  const [filter, setFilter] = useState("");
  const match = (id: string, name: string) => `${id} ${name}`.toLowerCase().includes(filter.toLowerCase());
  const npcs = [...db.npcs.entries()].filter(([id, n]) => match(id, n.name));
  const objects = Object.entries(chip?.decor ?? {}).filter(([id, d]) => match(id, d.name));
  return (
    <FloatingWindow
      id="lookPicker"
      title="Appearance"
      onClose={onClose}
      toolbar={<input class="search" placeholder="Search…" value={filter} autoFocus onInput={(e) => setFilter(e.currentTarget.value)} />}
    >
      <div class="look-grid">
        <button class={`look-tile ${current === undefined ? "on" : ""}`} title="Nothing (invisible)" onClick={() => onPick({ kind: "nothing" })}>
          <span class="none">∅</span>
        </button>
      </div>
      {npcs.length > 0 && <h4 class="look-heading">Characters</h4>}
      <div class="look-grid">
        {npcs.map(([id, n]) => (
          <button key={id} class={`look-tile ${current === `c:${id}` ? "on" : ""}`} title={`${n.name} (${id})`} onClick={() => onPick({ kind: "character", id })}>
            <SpriteView layers={[characterLayer(db, id)].filter((l) => !!l) as never} box={64} />
          </button>
        ))}
      </div>
      {objects.length > 0 && <h4 class="look-heading">Objects</h4>}
      <div class="look-grid">
        {objects.map(([id, d]) => (
          <button key={id} class={`look-tile ${current === `o:${id}` ? "on" : ""}`} title={`${d.name} (${id})`} onClick={() => onPick({ kind: "object", id })}>
            <SpriteView layers={[decorLayer(chip, id)].filter((l) => !!l) as never} box={64} />
          </button>
        ))}
      </div>
    </FloatingWindow>
  );
}
