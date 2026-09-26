import type { PatternRef } from "../../../src/core/data/types";
import { patternOffsets } from "../items/patterns";
import type { Project } from "../project";
import { optionsOf } from "./EffectList";
import { Select } from "./fields";

/** A pattern (a range or an area) from the content's patterns, with its cells around the user. */
export function PatternField({ value, onChange, project, empty }: { value: PatternRef | undefined; onChange: (v: string | undefined) => void; project: Project; empty?: string }) {
  const raw = project.content.raw;
  const db = project.content.db;
  if (value !== undefined && typeof value !== "string") return <span class="dim">custom (edit in YAML)</span>;
  const cells = db && value ? patternOffsets(db, value, 9) : null;
  const on = new Set(cells?.map((c) => `${c.x},${c.y}`));
  return (
    <div class="pattern-field">
      <Select value={value} options={optionsOf(raw.patterns)} empty={empty} onChange={onChange} />
      {cells && (
        <div class="pattern-preview" title="The cells it reaches from the user (the dot) on open, flat ground">
          {Array.from({ length: 81 }, (_, i) => {
            const x = (i % 9) - 4;
            const y = Math.floor(i / 9) - 4;
            return <span key={i} class={`${on.has(`${x},${y}`) ? "on" : ""} ${x === 0 && y === 0 ? "me" : ""}`} />;
          })}
        </div>
      )}
    </div>
  );
}
