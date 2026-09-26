import { useEffect, useRef, useState } from "preact/hooks";
import type { Database } from "../../../src/core/data/database";
import type { EventPageDef, Interaction, MapDef } from "../../../src/core/data/types";
import type { Dir } from "../../../src/core/util/grid";
import { ActionEditor } from "../forms/ActionEditor";
import { ConditionEditor } from "../forms/ConditionEditor";
import { Check, Field, fileSetter, ListEditor, Num, Select, Text } from "../forms/fields";
import { Icon } from "../icons";
import { useProjectContext } from "../projectContext";
import type { Project } from "../project";
import { entityPath, KIND_INFO, type EntityRef } from "./model";
import { QuickPlayForm } from "../screens/QuickPlayForm";
import { LookPicker, type LookPick } from "./LookPicker";
import { TeleportTarget } from "./TeleportTarget";
import { arrivalRole, arrivalUses, cleanupArrival, ensureArrival, mapFile, renameArrival, retargetExit } from "./teleports";
import { pageLayers, SpriteView } from "./LookPreview";

const DIRS: Dir[] = ["N", "E", "S", "W"];
const SIGNS: [string, string][] = [
  ["sign_weapon", "weapon shop"],
  ["sign_item", "item shop"],
  ["sign_magic", "magic shop"],
  ["sign_inn", "inn"],
];

/** Inspector form of the selected entity (editor-design §6). */
export function EntityForm({ project, mapId, entity, onSelect }: { project: Project; mapId: string; entity: EntityRef; onSelect: (ref: EntityRef | null) => void }) {
  const file = `data/maps/${mapId}.yaml`;
  const map = project.data<MapDef>(file);
  const db = project.content.db;
  const setIn = fileSetter(project, file);
  if (!db) return null;
  const base = entityPath(entity);
  const data = (entity.kind === "spawn" ? map.spawns?.[entity.key as string] : (map as unknown as Record<string, unknown[]>)[KIND_INFO[entity.kind].list]?.[entity.key as number]) as Record<string, unknown> | undefined;
  if (!data) return null;
  const set = (field: string, value: unknown, group?: string) => setIn([...base, field], value, `${KIND_INFO[entity.kind].label}: ${field}`, group && `${entity.kind}${entity.key}.${group}`);
  const ids = <T,>(m: Map<string, T>, name?: (t: T) => string) => [...m.entries()].map(([id, t]) => [id, name ? `${name(t)} (${id})` : id] as [string, string]);
  const cond = (field: string, label: string) => (
    <Field label={label}>
      <ConditionEditor value={data[field] as never} onChange={(c) => set(field, c)} db={db} flags={[]} />
    </Field>
  );
  const position = (
    <Field label="Cell">
      <div class="row">
        x <Num value={data.x as number} width={56} onChange={(v) => set("x", v ?? 0, "x")} /> y <Num value={data.y as number} width={56} onChange={(v) => set("y", v ?? 0, "y")} />
      </div>
    </Field>
  );
  const idField = (label = "Id") => (
    <Field label={label}>
      <Text value={data.id as string} onChange={(v) => set("id", v ?? "", "id")} />
    </Field>
  );

  const body = () => {
    switch (entity.kind) {
      case "spawn": {
        const uses = arrivalUses(project, mapId, entity.key as string);
        return (
          <>
            <Field label="Name" hint="Renaming updates everything that leads here.">
              <SpawnRename project={project} mapId={mapId} id={entity.key as string} onRenamed={(id) => onSelect({ kind: "spawn", key: id })} />
            </Field>
            {position}
            <Field label="Facing">
              <Select value={data.dir as string} options={DIRS} empty="S (default)" onChange={(v) => set("dir", v)} />
            </Field>
            <Field label="Leads here">
              {uses.length ? (
                <ul class="uses">
                  {uses.map((u, i) => (
                    <li key={i}>{u.label}</li>
                  ))}
                </ul>
              ) : (
                <span class="bad-text">nothing – it can be deleted</span>
              )}
            </Field>
            {arrivalRole(project, mapId, entity.key as string) === "quickplay" && (
              <>
                <h3>Quick Play</h3>
                <QuickPlayForm project={project} mapId={mapId} />
              </>
            )}
          </>
        );
      }
      case "exit": {
        const target = db.maps.get(data.to as string);
        return (
          <>
            {position}
            <Field label="Direction" hint="Which way the arrow points (the side of the map it leads off).">
              <Select value={data.dir as string} options={DIRS} onChange={(v) => set("dir", v ?? "N")} />
            </Field>
            <Field label="Leads to">
              <TeleportTarget project={project} value={{ map: data.to as string, spawn: data.spawn as string }} fromMap={mapId} onPick={(d) => retargetExit(project, mapId, entity.key as number, d)} />
            </Field>
            <Field label="Label" hint="Shown when asking to travel.">
              <Text value={data.label as string} placeholder={target?.name} onChange={(v) => set("label", v, "label")} />
            </Field>
            <Field label="Kind">
              <div class="stack">
                <Check value={data.door as boolean} label="door / stairs (no arrow, no question)" onChange={(v) => set("door", v)} />
                <Check value={data.together as boolean} label="together-exit (split floors)" onChange={(v) => set("together", v)} />
              </div>
            </Field>
            {cond("enabled", "Open when")}
          </>
        );
      }
      case "enemy":
        return (
          <>
            {idField()}
            {position}
            <Field label="Enemy">
              <Select value={data.enemy as string} options={ids(db.enemies, (e) => e.name)} onChange={(v) => set("enemy", v)} />
            </Field>
            <Field label="Party" hint="More enemies in the same piece.">
              <ListEditor items={(data.party as string[]) ?? []} onChange={(l) => set("party", l)} add={() => data.enemy as string} addLabel="+ Member" render={(e, s) => <Select value={e} options={ids(db.enemies, (x) => x.name)} onChange={(v) => s(v ?? "")} />} />
            </Field>
            <Field label="Level" hint={`Own level ${db.enemies.get(data.enemy as string)?.level ?? "?"}; stats follow its growth (§12.6).`}>
              <Num value={data.level as number} min={1} onChange={(v) => set("level", v, "level")} />
            </Field>
            <Field label="Facing">
              <Select value={data.dir as string} options={DIRS} empty="S (default)" onChange={(v) => set("dir", v)} />
            </Field>
            {cond("when", "Appears when")}
          </>
        );
      case "gate": {
        const openedBy = (map.switches ?? []).filter((s) => s.opens.includes(data.id as string)).map((s) => s.id);
        return (
          <>
            {idField()}
            {position}
            <Field label="Opened by">{openedBy.length ? openedBy.join(", ") : <span class="dim">no switch – select a switch to link it</span>}</Field>
            {cond("openWhen", "Also open when")}
            <Field label="Flag on first close" hint="E.g. to start a scene when the gate slams shut.">
              <Text value={data.closeFlag as string} list="known-flags" onChange={(v) => set("closeFlag", v, "closeFlag")} />
            </Field>
          </>
        );
      }
      case "switch":
        return (
          <>
            {idField()}
            {position}
            <Field label="Opens gates">
              <div class="stack">
                {(map.gates ?? []).map((g) => (
                  <label class="check" key={g.id}>
                    <input
                      type="checkbox"
                      checked={(data.opens as string[]).includes(g.id)}
                      onChange={(e) => set("opens", e.currentTarget.checked ? [...(data.opens as string[]), g.id] : (data.opens as string[]).filter((x) => x !== g.id))}
                    />
                    {g.id}
                  </label>
                ))}
                {!(map.gates ?? []).length && <span class="dim">No gates on this map yet.</span>}
              </div>
            </Field>
            <Field label="Weight" hint="Heroes needed on the plate.">
              <Num value={data.weight as number} placeholder="1" min={1} onChange={(v) => set("weight", v && v > 1 ? v : undefined)} />
            </Field>
            <Field label="Latch">
              <Check value={data.latch as boolean} label="stays down once pressed" onChange={(v) => set("latch", v)} />
            </Field>
          </>
        );
      case "trap":
        return (
          <>
            {idField()}
            {position}
            <Field label="Damage">
              <Num value={data.damage as number} min={0} onChange={(v) => set("damage", v ?? 0, "damage")} />
            </Field>
            <Field label="Status">
              <Select value={data.status as string} options={ids(db.statuses, (s) => s.name)} empty="(none)" onChange={(v) => set("status", v)} />
            </Field>
          </>
        );
      case "sign":
        return (
          <>
            {position}
            <Field label="Sign">
              <Select value={data.sign as string} options={Object.keys(db.graphics.wallSigns?.frames ?? {})} onChange={(v) => set("sign", v)} />
            </Field>
            <Field label="Wall side" hint="The side of the block it is painted on.">
              <Select value={data.face as string} options={DIRS} onChange={(v) => set("face", v ?? "S")} />
            </Field>
            <Field label="Block level">
              <Num value={data.level as number} placeholder="top" min={0} onChange={(v) => set("level", v)} />
            </Field>
          </>
        );
      case "event":
        return <EventForm project={project} mapId={mapId} index={entity.key as number} db={db} />;
    }
  };

  return (
    <div class={`entity-form ${entity.kind === "event" ? "event" : ""}`}>
      {entity.kind !== "event" && <h3 title={KIND_INFO[entity.kind].hint}>{KIND_INFO[entity.kind].label}</h3>}
      {body()}
    </div>
  );
}

function SpawnRename({ project, mapId, id, onRenamed }: { project: Project; mapId: string; id: string; onRenamed: (id: string) => void }) {
  const [name, setName] = useState(id);
  useEffect(() => setName(id), [id]);
  const taken = Object.keys(project.data<MapDef>(mapFile(mapId)).spawns ?? {});
  const valid = /^[a-z0-9_]+$/i.test(name) && (name === id || !taken.includes(name));
  return (
    <div class="row">
      <input value={name} class={valid ? "" : "bad"} onInput={(e) => setName(e.currentTarget.value)} />
      <button
        disabled={!valid || name === id}
        onClick={() => {
          renameArrival(project, mapId, id, name);
          onRenamed(name);
        }}
      >
        Rename
      </button>
    </div>
  );
}

// ---------- events: pages ----------

/** Page fields that make up an event's look – edited under "Appearance". */
const LOOK_KEYS = ["npc", "keeper", "decor", "dir", "move", "wanderRadius", "sign"] as const;
type Look = Pick<EventPageDef, (typeof LOOK_KEYS)[number]>;
const NO_LOOK: Look = { npc: undefined, keeper: undefined, decor: undefined, dir: undefined, move: undefined, wanderRadius: undefined, sign: undefined };
const lookOf = (pg: EventPageDef): Look => Object.fromEntries(LOOK_KEYS.map((k) => [k, pg[k]])) as Look;
const sameLook = (a: EventPageDef, b: EventPageDef) => LOOK_KEYS.every((k) => a[k] === b[k]);

/**
 * An event: its appearance (what the selected page shows – a character, an object, a keeper behind
 * a counter, or nothing) with id / cell / hidden, then its pages ("Events": when and what happens).
 * While every page looks the same the appearance is edited on all of them at once.
 */
function EventForm({ project, mapId, index, db }: { project: Project; mapId: string; index: number; db: Database }) {
  const file = `data/maps/${mapId}.yaml`;
  const map = project.data<MapDef>(file);
  const ev = map.events?.[index];
  const [pageNo, setPageNo] = useState(0);
  const [perPage, setPerPage] = useState(false);
  const [picking, setPicking] = useState(false);
  const activeTab = useRef<HTMLButtonElement>(null);
  // dragging a page tab onto another moves the page there
  const dragFrom = useRef<number | null>(null);
  const [dropAt, setDropAt] = useState<number | null>(null);
  // the selected page's tab scrolls into view – in its strip only (scrollIntoView would move the form too)
  useEffect(() => {
    const tab = activeTab.current;
    const strip = tab?.parentElement;
    if (!tab || !strip) return;
    if (tab.offsetLeft < strip.scrollLeft) strip.scrollLeft = tab.offsetLeft;
    else if (tab.offsetLeft + tab.offsetWidth > strip.scrollLeft + strip.clientWidth) strip.scrollLeft = tab.offsetLeft + tab.offsetWidth - strip.clientWidth;
  }, [pageNo, ev?.pages.length]);
  const setIn = fileSetter(project, file);
  if (!ev) return null;
  const pages = ev.pages;
  const p = Math.min(pageNo, pages.length - 1);
  const page = pages[p];
  const chip = db.chipsets.get(map.chipset);
  const setPages = (next: EventPageDef[], label: string) => setIn(["events", index, "pages"], next, label);
  const movePage = (from: number, to: number) => {
    if (from === to) return;
    const next = pages.filter((_, i) => i !== from);
    next.splice(to, 0, pages[from]);
    setPages(next, "Move page");
    setPageNo(to);
  };
  const shared = pages.every((pg) => sameLook(pg, pages[0]));
  const linked = shared && !perPage;
  /** Sets look fields on the given pages – one undo step. */
  const writeLook = (targets: number[], patch: Partial<Look>, label: string) => {
    const group = `look${index}.${Date.now()}`;
    for (const i of targets)
      for (const [k, v] of Object.entries(patch)) if (pages[i][k as keyof Look] !== v) setIn(["events", index, "pages", i, k], v, label, group);
  };
  const setLook = (patch: Partial<Look>, label: string) => writeLook(linked ? pages.map((_, i) => i) : [p], patch, label);
  const look = page.npc ? "npc" : page.keeper ? "keeper" : page.decor ? "decor" : "none";
  const current = page.npc ? `c:${page.npc}` : page.decor ? `o:${page.decor}` : undefined;
  const pick = (choice: LookPick) => {
    setPicking(false);
    if (choice.kind === "nothing") setLook(NO_LOOK, "Appearance");
    // a character keeps its facing / moves / sign; an object keeps the keeper behind it
    else if (choice.kind === "character") setLook({ ...(look === "npc" ? {} : NO_LOOK), npc: choice.id, keeper: undefined, decor: undefined }, "Appearance");
    else setLook({ ...NO_LOOK, decor: choice.id, keeper: look === "keeper" ? page.keeper : undefined }, "Appearance");
  };
  const ids = <T,>(m: Map<string, T>, name?: (t: T) => string) => [...m.entries()].map(([id, t]) => [id, name ? `${name(t)} (${id})` : id] as [string, string]);

  return (
    <>
      <div class="section-head">
        <h3 title={KIND_INFO.event.hint}>Appearance</h3>
        {pages.length > 1 && !linked && <span class="dim">page {p + 1}</span>}
        {pages.length > 1 && (
          <label class="check" title="Every page looks the same (unticked: the appearance of the selected page only)">
            <input
              type="checkbox"
              checked={linked}
              onChange={(e) => {
                if (!e.currentTarget.checked) return setPerPage(true);
                // the selected page's look for all
                setPerPage(false);
                writeLook(pages.map((_, i) => i).filter((i) => i !== p), lookOf(page), "Same appearance on every page");
              }}
            />
            every page
          </label>
        )}
      </div>
      <div class="event-head">
        <button class={`look-preview ${picking ? "on" : ""}`} title="What it looks like – click to choose" onClick={() => setPicking(!picking)}>
          <SpriteView layers={pageLayers(db, chip, page)} box={84} />
        </button>
        <div>
          <Field label="Id">
            <Text value={ev.id} onChange={(v) => setIn(["events", index, "id"], v ?? "", "Event id", `ev${index}.id`)} />
          </Field>
          <Field label="Cell">
            <div class="row">
              x <Num value={ev.x} width={48} onChange={(v) => setIn(["events", index, "x"], v ?? 0, "Move event", `ev${index}.x`)} /> y{" "}
              <Num value={ev.y} width={48} onChange={(v) => setIn(["events", index, "y"], v ?? 0, "Move event", `ev${index}.y`)} />
            </div>
          </Field>
          {look === "npc" && (
            <Field label="Facing">
              <div class="segmented">
                {DIRS.map((d) => (
                  <button key={d} class={(page.dir ?? "S") === d ? "on" : ""} onClick={() => setLook({ dir: d === "S" ? undefined : d }, "Facing")}>
                    {d}
                  </button>
                ))}
              </div>
            </Field>
          )}
        </div>
        {picking && <LookPicker db={db} chip={chip} current={current} onPick={pick} onClose={() => setPicking(false)} />}
      </div>
      {look === "npc" && (
        <>
          <Field label="Moves">
            <div class="row">
              <Select value={page.move} options={[["wander", "wanders around"]]} empty="stands still" onChange={(v) => setLook({ move: v as Look["move"], wanderRadius: v ? page.wanderRadius : undefined }, "Moves")} />
              {page.move === "wander" && <Num value={page.wanderRadius} placeholder="2" min={1} width={56} onChange={(v) => setLook({ wanderRadius: v }, "Wander radius")} />}
            </div>
          </Field>
          <Field label="Shop sign">
            <Select value={page.sign} options={SIGNS} empty="(none)" onChange={(v) => setLook({ sign: v }, "Shop sign")} />
          </Field>
        </>
      )}
      {(look === "decor" || look === "keeper") && (
        <Field label="Behind it">
          <Select value={page.keeper} options={ids(db.npcs, (n) => n.name)} empty="(nobody)" onChange={(v) => setLook({ keeper: v }, "Keeper")} />
        </Field>
      )}
      <Field label="Hidden">
        <input
          type="checkbox"
          class="box-check"
          title="Invisible until found with Discover"
          checked={!!ev.hidden}
          onChange={(e) => setIn(["events", index, "hidden"], e.currentTarget.checked || undefined, "Hidden event")}
        />
      </Field>

      <h3>Events</h3>
      <div class="pages">
        <div class="page-tabs">
          <div class="page-tabs-scroll" title="The last page whose condition holds is the active one. Drag a tab to move its page." onWheel={(e) => (e.currentTarget.scrollLeft += e.deltaY)}>
            {pages.map((_, i) => (
              <button
                key={i}
                ref={i === p ? activeTab : undefined}
                class={`${i === p ? "on" : ""} ${dropAt === i ? "drop" : ""}`}
                draggable
                onClick={() => setPageNo(i)}
                onDragStart={(e) => {
                  dragFrom.current = i;
                  e.dataTransfer?.setData("text/plain", String(i));
                }}
                onDragOver={(e) => {
                  if (dragFrom.current === null) return;
                  e.preventDefault();
                  setDropAt(i);
                }}
                onDragLeave={() => setDropAt(null)}
                onDragEnd={() => ((dragFrom.current = null), setDropAt(null))}
                onDrop={(e) => {
                  e.preventDefault();
                  const from = dragFrom.current;
                  dragFrom.current = null;
                  setDropAt(null);
                  if (from !== null) movePage(from, i);
                }}
              >
                Page {i + 1}
              </button>
            ))}
          </div>
          <button
            class="icon-button add-page"
            title="Add a page (later pages win when their condition holds)"
            onClick={() => (setPages([...pages, { trigger: "interact", ...Object.fromEntries(Object.entries(lookOf(page)).filter(([, v]) => v !== undefined)) }], "Add page"), setPageNo(pages.length))}
          >
            +
          </button>
        </div>
        <div class="page-box">
          <div class="page-tools">
            <button class="icon-button" disabled={p === 0} title="First page" onClick={() => setPageNo(0)}>
              <Icon name="pageFirst" size={18} />
            </button>
            <button class="icon-button" disabled={p === 0} title="Previous page" onClick={() => setPageNo(p - 1)}>
              <Icon name="pagePrev" size={18} />
            </button>
            <button class="icon-button" disabled={p === pages.length - 1} title="Next page" onClick={() => setPageNo(p + 1)}>
              <Icon name="pageNext" size={18} />
            </button>
            <button class="icon-button" disabled={p === pages.length - 1} title="Last page" onClick={() => setPageNo(pages.length - 1)}>
              <Icon name="pageLast" size={18} />
            </button>
            <span class="sep" />
            <button class="icon-button" title="Duplicate the page" onClick={() => (setPages([...pages.slice(0, p + 1), structuredClone(pages[p]), ...pages.slice(p + 1)], "Duplicate page"), setPageNo(p + 1))}>
              <Icon name="copy" size={18} />
            </button>
            <button class="icon-button" disabled={pages.length < 2} title="Delete the page" onClick={() => (setPages(pages.filter((_, i) => i !== p), "Delete page"), setPageNo(Math.max(0, p - 1)))}>
              <Icon name="trash" size={18} />
            </button>
          </div>
          <div class="page-fields">
            <PageForm key={`${index}.${p}`} project={project} mapId={mapId} db={db} path={["events", index, "pages", p]} page={pages[p]} />
          </div>
        </div>
      </div>
    </>
  );
}

function PageForm({ project, mapId, db, path, page }: { project: Project; mapId: string; db: Database; path: (string | number)[]; page: EventPageDef }) {
  const file = `data/maps/${mapId}.yaml`;
  const setIn = fileSetter(project, file);
  const set = (field: string, value: unknown, group?: string) => setIn([...path, field], value, `Page: ${field}`, group && `${path.join(".")}.${group}`);
  const trigger = page.trigger ?? "interact";
  const dialogs = [...db.dialogs.keys()].sort();
  return (
    <div class="page-form">
      <Field label="Condition">
        <ConditionEditor value={page.when} onChange={(c) => set("when", c)} db={db} flags={[]} />
      </Field>
      <Field label="Trigger">
        <div class="row">
          <Select
            value={trigger}
            options={[
              ["interact", "a hero moves onto it (talk / examine)"],
              ["step", "a hero stops on it"],
              ["auto", "automatically (map entry / any change)"],
              ["none", "never (placeholder page)"],
            ]}
            onChange={(v) => set("trigger", v === "interact" ? undefined : v)}
          />
          {(trigger === "step" || trigger === "auto") && <Check value={page.once === false} label="every time" onChange={(v) => set("once", v ? false : undefined)} />}
        </div>
      </Field>
      <Field label="Dialog" hint={trigger === "interact" ? "The Talk option of the close-up." : "Played when it starts."}>
        <Select value={page.dialog} options={dialogs} empty="(none)" onChange={(v) => set("dialog", v)} />
      </Field>
      {trigger === "interact" && (
        <Field label="Options" hint="What the close-up offers besides Talk.">
          <ListEditor
            items={page.interactions ?? []}
            onChange={(l) => set("interactions", l)}
            add={() => ({ type: "examine", label: "Search", dialog: dialogs[0] }) as Interaction}
            addLabel="+ Option"
            render={(it, s) => <InteractionForm it={it} set={s} db={db} mapId={mapId} />}
          />
        </Field>
      )}
      {trigger !== "interact" && (
        <Field label="Actions" hint="Run when it starts (before the dialog).">
          <ActionEditor value={page.actions} onChange={(a) => set("actions", a)} db={db} mapId={mapId} />
        </Field>
      )}
    </div>
  );
}

function InteractionForm({ it, set, db, mapId }: { it: Interaction; set: (v: Interaction) => void; db: Database; mapId: string }) {
  const dialogs = [...db.dialogs.keys()].sort();
  return (
    <div class="stack">
      <div class="row">
        <Select
          value={it.type}
          options={[
            ["talk", "Talk"],
            ["examine", "Examine"],
            ["shop", "Shop"],
            ["inn", "Inn"],
          ]}
          onChange={(v) => set((v === "shop" ? { type: "shop", shop: [...db.shops.keys()][0] } : v === "inn" ? { type: "inn", price: 40 } : { type: v, dialog: dialogs[0] }) as Interaction)}
        />
        <Text value={it.label} placeholder="label" onChange={(v) => set({ ...it, label: v } as Interaction)} />
      </div>
      {(it.type === "talk" || it.type === "examine") && <Select value={it.dialog} options={dialogs} empty="(no dialog)" onChange={(v) => set({ ...it, dialog: v } as Interaction)} />}
      {it.type === "shop" && <Select value={it.shop} options={[...db.shops.entries()].map(([id, s]) => [id, s.name] as [string, string])} onChange={(v) => set({ ...it, shop: v ?? "" })} />}
      {it.type === "inn" && (
        <>
          <div class="row">
            price <Num value={it.price} placeholder={`${db.config.innPricePerHero} per hero`} onChange={(v) => set({ ...it, price: v })} />
          </div>
          <WakeUpForm it={it} set={set} db={db} mapId={mapId} />
        </>
      )}
      {it.type === "examine" && <ActionEditor value={it.actions} onChange={(a) => set({ ...it, actions: a.length ? a : undefined })} db={db} mapId={mapId} />}
    </div>
  );
}

/** Where the party wakes up after resting at the inn, and which way it faces (default: here, as it stood). */
function WakeUpForm({ it, set, db, mapId }: { it: Extract<Interaction, { type: "inn" }>; set: (v: Interaction) => void; db: Database; mapId: string }) {
  const project = useProjectContext();
  const wake = it.wakeAt;
  const target = wake ? db.maps.get(wake.map) : undefined;
  const spawnDir = wake ? (target?.spawns[wake.spawn]?.dir ?? "S") : undefined;
  return (
    <div class="stack">
      <label class="check">
        <input
          type="checkbox"
          checked={!!wake}
          onChange={(e) => {
            set({ ...it, wakeAt: e.currentTarget.checked ? { map: mapId, spawn: "" } : undefined });
            if (!e.currentTarget.checked && wake) cleanupArrival(project, wake.map, wake.spawn);
          }}
        />
        wake up somewhere else (e.g. by the beds upstairs)
      </label>
      {wake && (
        <>
          <TeleportTarget
            project={project}
            value={wake}
            fromMap={mapId}
            onPick={(d) =>
              project.transaction("Inn wake-up", () => {
                const spawn = ensureArrival(project, d, mapId);
                set({ ...it, wakeAt: { ...wake, map: d.map, spawn } });
                cleanupArrival(project, wake.map, wake.spawn);
              })
            }
          />
          <div class="row">
            facing
            <Select value={wake.dir} options={DIRS} empty={`${spawnDir} (the spawn's)`} onChange={(v) => set({ ...it, wakeAt: { ...wake, dir: v as Dir | undefined } })} />
          </div>
        </>
      )}
    </div>
  );
}
