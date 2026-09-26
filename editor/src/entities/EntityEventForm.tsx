import { useEffect, useRef, useState } from "preact/hooks";
import type { Database } from "../../../src/core/data/database";
import type { EntityHandler, EntityState, HandlerTrigger, Interaction, MapDef, MapEventDef, Passability } from "../../../src/core/data/types";
import type { Dir } from "../../../src/core/util/grid";
import { ActionEditor } from "../forms/ActionEditor";
import { ConditionEditor } from "../forms/ConditionEditor";
import { Check, Field, fileSetter, ListEditor, Num, Select, Text } from "../forms/fields";
import { Icon } from "../icons";
import type { Project } from "../project";
import { LookPicker, type LookPick } from "./LookPicker";
import { pageLayers, SpriteView } from "./LookPreview";
import { freeId, KIND_INFO } from "./model";

const DIRS: Dir[] = ["N", "E", "S", "W"];
const SIGNS: [string, string][] = [
  ["sign_weapon", "weapon shop"],
  ["sign_item", "item shop"],
  ["sign_magic", "magic shop"],
  ["sign_inn", "inn"],
];

const TRIGGERS: [HandlerTrigger, string, string][] = [
  ["interact", "Interact", "A hero steps up to it: the close-up offers its options (and this script as one of them)."],
  ["enter", "Enter", "A hero stops on its cell."],
  ["pass", "Pass over", "A hero moves onto or across its cell: the move stops there (not flying pieces)."],
  ["leave", "Leave", "The last hero steps off its cell."],
  ["load", "Map loaded", "The party arrives on this map – set up states that depend on flags here."],
  ["becomes", "Becomes true", "Its condition turns true (checked after every change)."],
];
const triggerLabel = (t: HandlerTrigger) => TRIGGERS.find((x) => x[0] === t)?.[1] ?? t;

const PASS: [Passability, string, string][] = [
  ["solid", "Solid", "Nobody enters its cell (a closed gate, a wall)."],
  ["stop", "Stop", "Heroes stop in front to interact (villagers, chests) – the default for anything drawn."],
  ["walk", "Walk", "Anyone walks through or stands on it (a floor plate, an open gate)."],
];

/**
 * An entity's form (editor-design §6.2, game-design §10.3): **Appearance** – its states as tabs, each
 * with a look (click the preview) and passability – then **Events** – its handlers as tabs, each a
 * trigger, a condition and a script (for interact also close-up options).
 */
export function EntityEventForm({ project, mapId, index, db, interactionForm }: { project: Project; mapId: string; index: number; db: Database; interactionForm: (it: Interaction, set: (v: Interaction) => void) => preact.ComponentChildren }) {
  const file = `data/maps/${mapId}.yaml`;
  const map = project.data<MapDef>(file);
  const ev = map.events?.[index];
  const [stateName, setStateName] = useState<string | null>(null);
  const [handlerNo, setHandlerNo] = useState(0);
  const [picking, setPicking] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const setIn = fileSetter(project, file);
  // another entity: start on its first state and handler
  useEffect(() => (setStateName(null), setHandlerNo(0)), [index, mapId]);
  if (!ev?.states) return null;

  const names = Object.keys(ev.states);
  const current = stateName && ev.states[stateName] ? stateName : (ev.state ?? names[0]);
  const st: EntityState = ev.states[current] ?? {};
  const start = ev.state ?? names[0];
  const chip = db.chipsets.get(map.chipset);
  const handlers = ev.on ?? [];
  const hi = Math.min(handlerNo, Math.max(0, handlers.length - 1));
  const h = handlers[hi];
  const base = ["events", index];
  const setState = (patch: Partial<EntityState>, label: string, group?: string) =>
    project.edit(
      file,
      label,
      (doc) => {
        for (const [k, v] of Object.entries(patch)) (v === undefined ? doc.deleteIn([...base, "states", current, k]) : doc.setIn([...base, "states", current, k], v));
      },
      group && `ent${index}.${current}.${group}`,
    );
  const setHandlers = (next: EntityHandler[], label: string) => setIn([...base, "on"], next, label);
  const setHandler = (patch: Partial<EntityHandler>, label: string, group?: string) =>
    project.edit(
      file,
      label,
      (doc) => {
        for (const [k, v] of Object.entries(patch)) (v === undefined ? doc.deleteIn([...base, "on", hi, k]) : doc.setIn([...base, "on", hi, k], v));
      },
      group && `ent${index}.on${hi}.${group}`,
    );

  const look = st.npc ? "npc" : st.keeper ? "keeper" : st.decor ? "decor" : "none";
  const pick = (choice: LookPick) => {
    setPicking(false);
    const clear = { npc: undefined, keeper: undefined, decor: undefined, dir: undefined, move: undefined, wanderRadius: undefined, sign: undefined };
    if (choice.kind === "nothing") setState(clear, "Appearance");
    else if (choice.kind === "character") setState({ ...(look === "npc" ? {} : clear), npc: choice.id, keeper: undefined, decor: undefined }, "Appearance");
    else setState({ ...clear, decor: choice.id, keeper: look === "keeper" ? st.keeper : undefined }, "Appearance");
  };
  const ids = <T,>(m: Map<string, T>, name?: (t: T) => string) => [...m.entries()].map(([id, t]) => [id, name ? `${name(t)} (${id})` : id] as [string, string]);

  /** Renames the entity – and every handler on this map that names it. */
  const renameEntity = (to: string) =>
    project.edit(
      file,
      "Entity id",
      (doc) => {
        doc.setIn([...base, "id"], to);
        (map.events ?? []).forEach((other, j) => {
          const on = JSON.stringify(other.on ?? []);
          const next = on.split(`"event":"${ev.id}"`).join(`"event":"${to}"`);
          if (next !== on) doc.setIn(["events", j, "on"], doc.createNode(JSON.parse(next)));
        });
      },
      `ent${index}.id`,
    );

  const stateTools = (
    <div class="page-tools">
      <button class="icon-button" title="Start in this state" disabled={current === start} onClick={() => setIn([...base, "state"], current === names[0] ? undefined : current, "Starting state")}>
        ★
      </button>
      <button class="icon-button" title="Rename this state" onClick={() => setRenaming(current)}>
        ✎
      </button>
      <span class="sep" />
      <button
        class="icon-button"
        title="Duplicate this state"
        onClick={() => {
          const name = freeId(current, names);
          setIn([...base, "states", name], structuredClone(st), "Duplicate state");
          setStateName(name);
        }}
      >
        <Icon name="copy" size={18} />
      </button>
      <button
        class="icon-button"
        title="Delete this state"
        disabled={names.length < 2}
        onClick={() => {
          project.edit(file, "Delete state", (doc) => {
            doc.deleteIn([...base, "states", current]);
            if (ev.state === current) doc.deleteIn([...base, "state"]);
          });
          setStateName(null);
        }}
      >
        <Icon name="trash" size={18} />
      </button>
    </div>
  );

  return (
    <>
      <div class="section-head">
        <h3 title={KIND_INFO.event.hint}>Appearance</h3>
      </div>
      <div class="page-tabs">
        <Tabs labels={names.map((n) => (n === start ? `${n} ★` : n))} active={names.indexOf(current)} onPick={(i) => setStateName(names[i])} title="Its states – ★ the one it starts in" />
        <button
          class="icon-button add-page"
          title="Add a state"
          onClick={() => {
            // (an empty state is a value – written directly, the form setter would drop it)
            const name = freeId("state", names);
            project.edit(file, "Add state", (doc) => doc.setIn([...base, "states", name], doc.createNode({}, { flow: true })));
            setStateName(name);
          }}
        >
          +
        </button>
      </div>
      <div class="page-box state-box">
        {stateTools}
        {renaming && (
          <StateRename
            names={names}
            from={renaming}
            onDone={(to) => {
              setRenaming(null);
              if (!to || to === renaming) return;
              project.edit(file, "Rename state", (doc) => {
                const states = Object.fromEntries(names.map((n) => [n === renaming ? to : n, ev.states![n]]));
                doc.setIn([...base, "states"], doc.createNode(states));
                if (ev.state === renaming) doc.setIn([...base, "state"], to);
                // handlers naming the state (of this entity) follow
                const on = JSON.stringify(ev.on ?? []);
                const re = new RegExp(`("event":"${ev.id}","(?:state|is)":)"${renaming}"`, "g");
                const next = on.replace(re, `$1"${to}"`);
                if (next !== on) doc.setIn([...base, "on"], doc.createNode(JSON.parse(next)));
              });
              setStateName(to);
            }}
          />
        )}
        <div class="page-fields">
          <div class="event-head">
            <button class={`look-preview ${picking ? "on" : ""}`} title="What it looks like in this state – click to choose" onClick={() => setPicking(!picking)}>
              <SpriteView layers={pageLayers(db, chip, st)} box={84} />
            </button>
            <div>
              <Field label="Id">
                <Text value={ev.id} onChange={(v) => renameEntity(v ?? "")} />
              </Field>
              <Field label="Cell">
                <div class="row">
                  x <Num value={ev.x} width={48} onChange={(v) => setIn([...base, "x"], v ?? 0, "Move event", `ev${index}.x`)} /> y{" "}
                  <Num value={ev.y} width={48} onChange={(v) => setIn([...base, "y"], v ?? 0, "Move event", `ev${index}.y`)} />
                </div>
              </Field>
              {look === "npc" && (
                <Field label="Facing">
                  <div class="segmented">
                    {DIRS.map((d) => (
                      <button key={d} class={(st.dir ?? "S") === d ? "on" : ""} onClick={() => setState({ dir: d === "S" ? undefined : d }, "Facing")}>
                        {d}
                      </button>
                    ))}
                  </div>
                </Field>
              )}
            </div>
            {picking && <LookPicker db={db} chip={chip} current={st.npc ? `c:${st.npc}` : st.decor ? `o:${st.decor}` : undefined} onPick={pick} onClose={() => setPicking(false)} />}
          </div>
          {look === "npc" && (
            <>
              <Field label="Moves">
                <div class="row">
                  <Select value={st.move} options={[["wander", "wanders around"]]} empty="stands still" onChange={(v) => setState({ move: v as EntityState["move"], wanderRadius: v ? st.wanderRadius : undefined }, "Moves")} />
                  {st.move === "wander" && <Num value={st.wanderRadius} placeholder="2" min={1} width={56} onChange={(v) => setState({ wanderRadius: v }, "Wander radius", "wr")} />}
                </div>
              </Field>
              <Field label="Shop sign">
                <Select value={st.sign} options={SIGNS} empty="(none)" onChange={(v) => setState({ sign: v }, "Shop sign")} />
              </Field>
            </>
          )}
          {(look === "decor" || look === "keeper") && (
            <Field label="Behind it">
              <Select value={st.keeper} options={ids(db.npcs, (n) => n.name)} empty="(nobody)" onChange={(v) => setState({ keeper: v }, "Keeper")} />
            </Field>
          )}
          <Field label="Passability">
            <div class="segmented">
              {PASS.map(([p, label, hint]) => (
                <button key={p} class={(st.pass ?? (look === "none" ? "walk" : "stop")) === p ? "on" : ""} title={hint} onClick={() => setState({ pass: p }, "Passability")}>
                  {label}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Hidden">
            <input type="checkbox" class="box-check" title="Invisible until found with Discover" checked={!!ev.hidden} onChange={(e) => setIn([...base, "hidden"], e.currentTarget.checked || undefined, "Hidden event")} />
          </Field>
        </div>
      </div>

      <h3>Events</h3>
      <div class="pages">
        <div class="page-tabs">
          <Tabs labels={handlers.map((x) => triggerLabel(x.on))} active={hi} onPick={setHandlerNo} title="What it does – each a trigger, a condition and a script" />
          <button
            class="icon-button add-page"
            title="Add a handler"
            onClick={() => {
              setHandlers([...handlers, { on: "interact", do: [] }], "Add handler");
              setHandlerNo(handlers.length);
            }}
          >
            +
          </button>
        </div>
        {h ? (
          <div class="page-box">
            <div class="page-tools">
              <button class="icon-button" disabled={hi === 0} title="Previous" onClick={() => setHandlerNo(hi - 1)}>
                <Icon name="pagePrev" size={18} />
              </button>
              <button class="icon-button" disabled={hi === handlers.length - 1} title="Next" onClick={() => setHandlerNo(hi + 1)}>
                <Icon name="pageNext" size={18} />
              </button>
              <span class="sep" />
              <button
                class="icon-button"
                title="Duplicate this handler"
                onClick={() => {
                  setHandlers([...handlers.slice(0, hi + 1), structuredClone(h), ...handlers.slice(hi + 1)], "Duplicate handler");
                  setHandlerNo(hi + 1);
                }}
              >
                <Icon name="copy" size={18} />
              </button>
              <button
                class="icon-button"
                title="Delete this handler"
                onClick={() => {
                  setHandlers(handlers.filter((_, i) => i !== hi), "Delete handler");
                  setHandlerNo(Math.max(0, hi - 1));
                }}
              >
                <Icon name="trash" size={18} />
              </button>
            </div>
            <div class="page-fields">
              <div class="page-form">
                <Field label="Trigger">
                  <Select value={h.on} options={TRIGGERS.map(([t, l]) => [t, l] as [string, string])} onChange={(v) => setHandler({ on: (v ?? "interact") as HandlerTrigger }, "Trigger")} title={TRIGGERS.find((t) => t[0] === h.on)?.[2]} />
                </Field>
                <Field label="Condition" hint={h.on === "becomes" ? "Runs when this turns true." : undefined}>
                  <ConditionEditor value={h.when} onChange={(c) => setHandler({ when: c }, "Condition")} db={db} flags={[]} />
                </Field>
                {h.on === "interact" ? (
                  <>
                    <Field label="Options" hint="What the close-up offers (talk, shop, inn…); the script below is one more option.">
                      <ListEditor items={h.options ?? []} onChange={(l) => setHandler({ options: l.length ? l : undefined }, "Options")} add={() => ({ type: "talk", dialog: [...db.dialogs.keys()][0] }) as Interaction} addLabel="+ Option" render={(it, s) => interactionForm(it, s)} />
                    </Field>
                    <Field label="Label" hint="The script's option in the close-up.">
                      <Text value={h.label} placeholder="Examine" onChange={(v) => setHandler({ label: v }, "Label", "label")} />
                    </Field>
                  </>
                ) : (
                  <Field label="Once">
                    <Check value={h.once} label="only the first time" onChange={(v) => setHandler({ once: v }, "Once")} />
                  </Field>
                )}
                <Field label="Script">
                  <ActionEditor value={h.do} onChange={(a) => setHandler({ do: a.length ? a : undefined }, "Script")} db={db} mapId={mapId} />
                </Field>
              </div>
            </div>
          </div>
        ) : (
          <p class="hint">No handlers yet – + adds one (interact, enter, leave…).</p>
        )}
      </div>
    </>
  );
}

/** Folder tabs that scroll sideways (no scrollbar); the active one scrolls into view. */
function Tabs({ labels, active, onPick, title }: { labels: string[]; active: number; onPick: (i: number) => void; title?: string }) {
  const tab = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const t = tab.current;
    const strip = t?.parentElement;
    if (!t || !strip) return;
    if (t.offsetLeft < strip.scrollLeft) strip.scrollLeft = t.offsetLeft;
    else if (t.offsetLeft + t.offsetWidth > strip.scrollLeft + strip.clientWidth) strip.scrollLeft = t.offsetLeft + t.offsetWidth - strip.clientWidth;
  }, [active, labels.length]);
  return (
    <div class="page-tabs-scroll" title={title} onWheel={(e) => (e.currentTarget.scrollLeft += e.deltaY)}>
      {labels.map((l, i) => (
        <button key={i} ref={i === active ? tab : undefined} class={i === active ? "on" : ""} onClick={() => onPick(i)}>
          {l}
        </button>
      ))}
    </div>
  );
}

function StateRename({ names, from, onDone }: { names: string[]; from: string; onDone: (to: string | null) => void }) {
  const [name, setName] = useState(from);
  const valid = /^[a-z0-9_]+$/i.test(name) && (name === from || !names.includes(name));
  return (
    <div class="row state-rename">
      <input value={name} class={valid ? "" : "bad"} autoFocus onInput={(e) => setName(e.currentTarget.value)} onKeyDown={(e) => e.key === "Enter" && valid && onDone(name)} />
      <button disabled={!valid} onClick={() => onDone(name)}>
        Rename
      </button>
      <button onClick={() => onDone(null)}>Cancel</button>
    </div>
  );
}

export type { MapEventDef };
