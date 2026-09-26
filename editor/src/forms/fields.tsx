import type { ComponentChildren } from "preact";
import type { Document } from "yaml";
import type { Project } from "../project";

/** Small form widgets shared by all editors. */

export function Field({ label, children, hint }: { label: string; children: ComponentChildren; hint?: string }) {
  return (
    <div class="field">
      <label>{label}</label>
      <div class="field-body">
        {children}
        {hint && <div class="hint">{hint}</div>}
      </div>
    </div>
  );
}

export function Select({ value, options, onChange, empty, title }: { value: string | undefined; options: (string | [string, string])[]; onChange: (v: string | undefined) => void; empty?: string; title?: string }) {
  const opts = options.map((o) => (Array.isArray(o) ? o : ([o, o] as [string, string])));
  const known = value === undefined || opts.some(([id]) => id === value);
  return (
    <select value={value ?? ""} title={title} onChange={(e) => onChange(e.currentTarget.value || undefined)} class={known ? "" : "bad"}>
      {empty !== undefined && <option value="">{empty}</option>}
      {!known && <option value={value}>{value} (missing!)</option>}
      {opts.map(([id, name]) => (
        <option key={id} value={id}>
          {name}
        </option>
      ))}
    </select>
  );
}

export function Text({ value, onChange, placeholder, list }: { value: string | undefined; onChange: (v: string | undefined) => void; placeholder?: string; list?: string }) {
  return <input value={value ?? ""} placeholder={placeholder} list={list} onInput={(e) => onChange(e.currentTarget.value || undefined)} />;
}

export function Num({ value, onChange, placeholder, min, max, step, width = 70 }: { value: number | undefined; onChange: (v: number | undefined) => void; placeholder?: string; min?: number; max?: number; step?: number; width?: number }) {
  return (
    <input
      type="number"
      style={{ width }}
      value={value ?? ""}
      placeholder={placeholder}
      min={min}
      max={max}
      step={step}
      onInput={(e) => {
        const v = e.currentTarget.value;
        onChange(v === "" ? undefined : Number(v));
      }}
    />
  );
}

export function Check({ value, onChange, label }: { value: boolean | undefined; onChange: (v: boolean | undefined) => void; label: string }) {
  return (
    <label class="check">
      <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.currentTarget.checked || undefined)} />
      {label}
    </label>
  );
}

/** Rows with add / remove / reorder. */
export function ListEditor<T>({ items, onChange, render, add, addLabel = "+ Add" }: { items: T[]; onChange: (items: T[]) => void; render: (item: T, set: (v: T) => void, i: number) => ComponentChildren; add: () => T; addLabel?: string }) {
  return (
    <div class="list-editor">
      {items.map((item, i) => (
        <div class="list-row" key={i}>
          <div class="list-body">{render(item, (v) => onChange(items.map((x, j) => (j === i ? v : x))), i)}</div>
          <div class="list-tools">
            <button disabled={i === 0} title="Up" onClick={() => onChange(items.map((x, j) => (j === i - 1 ? items[i] : j === i ? items[i - 1] : x)))}>
              ↑
            </button>
            <button title="Remove" onClick={() => onChange(items.filter((_, j) => j !== i))}>
              ✕
            </button>
          </div>
        </div>
      ))}
      <button onClick={() => onChange([...items, add()])}>{addLabel}</button>
    </div>
  );
}

/** Drops undefined fields (and empty arrays / objects) so files only hold what was set. */
export function clean<T>(v: T): T {
  if (Array.isArray(v)) return v.map(clean) as T;
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) {
      if (x === undefined) continue; // (an empty string is a value being typed – keep it)
      const c = clean(x);
      if (Array.isArray(c) && !c.length) continue;
      if (c && typeof c === "object" && !Array.isArray(c) && !Object.keys(c).length) continue;
      out[k] = c;
    }
    return out as T;
  }
  return v;
}

/** Sets (or removes, when empty) a value at a YAML path; small objects are written in flow style. */
export function setAt(doc: Document, path: (string | number)[], value: unknown) {
  const v = clean(value);
  const empty = v === undefined || v === "" || (Array.isArray(v) && !v.length) || (v && typeof v === "object" && !Array.isArray(v) && !Object.keys(v).length);
  if (empty) {
    if (doc.hasIn(path)) doc.deleteIn(path);
    return;
  }
  doc.setIn(path, v && typeof v === "object" ? doc.createNode(v, { flow: JSON.stringify(v).length < 90 }) : v);
}

/** Editing helper bound to one file: `set(path, value, label, group)`. */
export function fileSetter(project: Project, file: string) {
  return (path: (string | number)[], value: unknown, label: string, group?: string) => project.edit(file, label, (doc) => setAt(doc, path, value), group);
}
