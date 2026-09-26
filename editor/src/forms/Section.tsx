import type { ComponentChildren } from "preact";

/** A box of a content form: a heading, and on its right some detail (an id, a note). */
export function Box({ title, aside, children }: { title: string; aside?: ComponentChildren; children: ComponentChildren }) {
  return (
    <section class="form-section on">
      <div class="form-section-head">
        <h3>{title}</h3>
        {aside}
      </div>
      <div class="form-section-body">{children}</div>
    </section>
  );
}

/** An optional part of a content form: a switch in its heading adds or removes it. */
export function Section({ title, on, onToggle, children, hint }: { title: string; on: boolean; onToggle: (on: boolean) => void; children: ComponentChildren; hint?: string }) {
  return (
    <section class={`form-section ${on ? "on" : ""}`}>
      <label class="form-section-head" title={hint}>
        <input type="checkbox" checked={on} onChange={(e) => onToggle(e.currentTarget.checked)} />
        <h3>{title}</h3>
      </label>
      {on && <div class="form-section-body">{children}</div>}
    </section>
  );
}
