import { STAT_KEYS, type Stats } from "../../../src/core/data/types";
import { Num } from "../forms/fields";
import { STAT_LABEL } from "./model";

/** The seven stats as number fields (unset ones stay empty – for growth and bonuses). */
export function StatInputs({ value, onChange, step, group }: { value: Partial<Stats> | undefined; onChange: (v: Partial<Stats>, stat: string) => void; step?: number; group?: string }) {
  return (
    <div class="stat-grid" data-group={group}>
      {STAT_KEYS.map((k) => (
        <label key={k}>
          <span>{STAT_LABEL[k]}</span>
          <Num value={value?.[k]} step={step} width={60} onChange={(v) => onChange({ ...value, [k]: v }, STAT_LABEL[k])} />
        </label>
      ))}
    </div>
  );
}

/** Stats at several levels, one row per level. */
export function StatTable({ rows, highlight }: { rows: { level: number; stats: Stats }[]; highlight?: number }) {
  return (
    <table class="stat-table">
      <thead>
        <tr>
          <th>Level</th>
          {STAT_KEYS.map((k) => (
            <th key={k}>{STAT_LABEL[k]}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.level} class={r.level === highlight ? "on" : ""}>
            <td>{r.level}</td>
            {STAT_KEYS.map((k) => (
              <td key={k}>{r.stats[k]}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
