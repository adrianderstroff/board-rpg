import type { Condition, EntityHandler, EntityState, EventPageDef, Interaction, MapEventDef, Script } from "../../../src/core/data/types";

/**
 * Turns an RPG-Maker style event (pages: the last whose condition holds is active) into an entity
 * with states and handlers (game-design §10.3) that behaves the same:
 * - each different look becomes a state; when there are several, "becomes true" handlers switch
 *   between them as the pages' conditions change (checked right when the map loads, too);
 * - an interact page becomes an interact handler (its talk dialog and options; else its actions as
 *   the script) – the more recent pages first, since the first handler whose condition holds is used;
 * - a step page becomes an enter handler, an auto page a "becomes true" one (and, if it repeats, a
 *   map-loaded one); run-once handlers keep the key the page used (`onceKey`), so saves stay right.
 */

const LOOK_KEYS = ["npc", "keeper", "decor", "dir", "move", "wanderRadius", "sign"] as const;

function lookOf(p: EventPageDef): EntityState {
  const out: Record<string, unknown> = {};
  for (const k of LOOK_KEYS) if (p[k] !== undefined) out[k] = p[k];
  return out as EntityState;
}

const and = (parts: (Condition | undefined)[]): Condition | undefined => {
  const list = parts.filter((c): c is Condition => !!c);
  return list.length === 0 ? undefined : list.length === 1 ? list[0] : { all: list };
};
const not = (c: Condition): Condition => ("not" in c ? c.not : { not: c });
const noneOf = (cs: Condition[]): Condition | undefined => (cs.length === 0 ? undefined : cs.length === 1 ? not(cs[0]) : { not: { any: cs } });

export function pagesToEntity(ev: MapEventDef): MapEventDef {
  const pages = ev.pages ?? [];
  // page i is active while its condition holds and no later page's does; a later page without
  // a condition shadows every earlier one
  const later = (i: number) => pages.slice(i + 1);
  const reachable = (i: number) => !later(i).some((p) => !p.when);
  const active = (i: number) => and([pages[i].when, noneOf(later(i).map((p) => p.when!))]);

  // states: one per different look, named after what is shown
  const states: Record<string, EntityState> = {};
  const stateOfPage: string[] = [];
  const byLook = new Map<string, string>();
  pages.forEach((p, i) => {
    if (!reachable(i)) return;
    const look = lookOf(p);
    const k = JSON.stringify(look);
    let name = byLook.get(k);
    if (!name) {
      const base = look.decor ?? look.npc ?? (Object.keys(look).length ? "look" : "nothing");
      name = base;
      for (let n = 2; states[name]; n++) name = `${base}_${n}`;
      byLook.set(k, name);
      states[name] = look;
    }
    stateOfPage[i] = name;
  });
  const names = Object.keys(states);
  const single = names.length === 1;
  if (single) {
    const only = names[0];
    delete states[only];
    states.idle = byLook.size ? JSON.parse([...byLook.keys()][0]) : {};
    stateOfPage.forEach((_, i) => (stateOfPage[i] = "idle"));
  }

  const on: EntityHandler[] = [];
  // the look follows the pages' conditions
  if (!single)
    for (const name of Object.keys(states)) {
      const any = pages.map((_, i) => i).filter((i) => stateOfPage[i] === name).map((i) => active(i));
      const cond: Condition | undefined = any.some((c) => !c) ? undefined : any.length === 1 ? any[0] : { any: any as Condition[] };
      on.push({ on: "becomes", ...(cond ? { when: cond } : { when: { always: true } }), do: [{ setState: { event: ev.id, state: name } }] });
    }

  // interact pages, most recent first (the first handler whose condition holds is used); a later
  // page that isn't an interact page still shadows it
  const interact: EntityHandler[] = [];
  pages.forEach((p, i) => {
    if (!reachable(i) || (p.trigger ?? "interact") !== "interact") return;
    const options: Interaction[] = [...(p.interactions ?? [])];
    if (p.dialog && !options.some((o) => o.type === "talk")) options.unshift({ type: "talk", dialog: p.dialog });
    const script: Script | undefined = !options.length && p.actions?.length ? p.actions : undefined;
    if (!options.length && !script) return;
    const shadows = later(i)
      .filter((q) => (q.trigger ?? "interact") !== "interact")
      .map((q) => q.when!);
    const when = and([p.when, noneOf(shadows)]);
    interact.unshift({ on: "interact", ...(when ? { when } : {}), ...(options.length ? { options } : {}), ...(script ? { do: script } : {}) });
  });
  on.push(...interact);

  // step and auto pages
  pages.forEach((p, i) => {
    const t = p.trigger ?? "interact";
    if (!reachable(i) || (t !== "step" && t !== "auto")) return;
    const script: Script = [...(p.dialog ? [{ dialog: p.dialog }] : []), ...(p.actions ?? [])];
    if (!script.length) return;
    const when = active(i);
    const once = p.once ?? true;
    const base = { ...(when ? { when } : {}), do: script, ...(once ? { once: true, onceKey: `${ev.id}#${i}` } : {}) };
    if (t === "step") on.push({ on: "enter", ...base });
    // (a repeating one runs again each time the party arrives while it holds – "becomes" counts from the arrival)
    else on.push({ on: "becomes", ...(when ? {} : { when: { always: true } }), ...base });
  });

  const out: MapEventDef = { id: ev.id, x: ev.x, y: ev.y };
  if (ev.hidden) out.hidden = true;
  out.states = states;
  if (on.length) out.on = on;
  return out;
}
