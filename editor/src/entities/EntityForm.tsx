import { useState } from "preact/hooks";
import { isMap, isScalar } from "yaml";
import type { Database } from "../../../src/core/data/database";
import type { EventPageDef, Interaction, MapDef } from "../../../src/core/data/types";
import type { Dir } from "../../../src/core/util/grid";
import { ActionEditor } from "../forms/ActionEditor";
import { ConditionEditor } from "../forms/ConditionEditor";
import { Check, Field, fileSetter, ListEditor, Num, Select, Text } from "../forms/fields";
import type { Project } from "../project";
import { entityPath, KIND_INFO, type EntityRef } from "./model";

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
  const data = (entity.kind === "spawn" ? map.spawns?.[entity.key as string] : entity.kind === "quickplay" ? map.editor?.quickPlay : (map as unknown as Record<string, unknown[]>)[KIND_INFO[entity.kind].list]?.[entity.key as number]) as Record<string, unknown> | undefined;
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
      case "spawn":
        return (
          <>
            <Field label="Id" hint="Exits and teleports name it; renaming breaks those (the problems badge shows where).">
              <SpawnRename project={project} file={file} id={entity.key as string} onRenamed={(id) => onSelect({ kind: "spawn", key: id })} />
            </Field>
            {position}
            <Field label="Facing">
              <Select value={data.dir as string} options={DIRS} empty="S (default)" onChange={(v) => set("dir", v)} />
            </Field>
          </>
        );
      case "exit": {
        const target = db.maps.get(data.to as string);
        return (
          <>
            {position}
            <Field label="Direction" hint="Which way the arrow points (the side of the map it leads off).">
              <Select value={data.dir as string} options={DIRS} onChange={(v) => set("dir", v ?? "N")} />
            </Field>
            <Field label="To map">
              <Select value={data.to as string} options={ids(db.maps, (m) => m.name)} onChange={(v) => set("to", v)} />
            </Field>
            <Field label="Arrive at">
              <Select value={data.spawn as string} options={Object.keys(target?.spawns ?? {})} onChange={(v) => set("spawn", v)} />
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
      case "quickplay":
        return (
          <>
            {position}
            <p class="hint">Party, levels, items, flags: see the Quick Play tab.</p>
          </>
        );
      case "event":
        return <EventForm project={project} mapId={mapId} index={entity.key as number} db={db} />;
    }
  };

  return (
    <div class="entity-form">
      <h3>{KIND_INFO[entity.kind].label}</h3>
      <p class="hint">{KIND_INFO[entity.kind].hint}</p>
      {body()}
    </div>
  );
}

function SpawnRename({ project, file, id, onRenamed }: { project: Project; file: string; id: string; onRenamed: (id: string) => void }) {
  const [name, setName] = useState(id);
  const taken = Object.keys(project.data<MapDef>(file).spawns ?? {});
  const valid = /^[a-z0-9_]+$/i.test(name) && (name === id || !taken.includes(name));
  return (
    <div class="row">
      <input value={name} class={valid ? "" : "bad"} onInput={(e) => setName(e.currentTarget.value)} />
      <button
        disabled={!valid || name === id}
        onClick={() => {
          project.edit(file, "Rename spawn", (doc) => {
            const spawns = doc.get("spawns", true);
            if (!isMap(spawns)) return;
            const pair = spawns.items.find((p) => (isScalar(p.key) ? p.key.value : p.key) === id);
            if (pair && isScalar(pair.key)) pair.key.value = name;
          });
          onRenamed(name);
        }}
      >
        Rename
      </button>
    </div>
  );
}

// ---------- events: pages ----------

function EventForm({ project, mapId, index, db }: { project: Project; mapId: string; index: number; db: Database }) {
  const file = `data/maps/${mapId}.yaml`;
  const map = project.data<MapDef>(file);
  const ev = map.events?.[index];
  const [pageNo, setPageNo] = useState(0);
  const setIn = fileSetter(project, file);
  if (!ev) return null;
  const pages = ev.pages;
  const p = Math.min(pageNo, pages.length - 1);
  const setPages = (next: EventPageDef[], label: string) => setIn(["events", index, "pages"], next, label);

  return (
    <>
      <Field label="Id">
        <Text value={ev.id} onChange={(v) => setIn(["events", index, "id"], v ?? "", "Event id", `ev${index}.id`)} />
      </Field>
      <Field label="Cell">
        <div class="row">
          x <Num value={ev.x} width={56} onChange={(v) => setIn(["events", index, "x"], v ?? 0, "Move event", `ev${index}.x`)} /> y{" "}
          <Num value={ev.y} width={56} onChange={(v) => setIn(["events", index, "y"], v ?? 0, "Move event", `ev${index}.y`)} />
        </div>
      </Field>
      <Field label="Hidden">
        <Check value={ev.hidden} label="invisible until found with Discover" onChange={(v) => setIn(["events", index, "hidden"], v, "Hidden event")} />
      </Field>
      <div class="pages">
        <div class="row wrap">
          {pages.map((_, i) => (
            <button key={i} class={i === p ? "on" : ""} onClick={() => setPageNo(i)}>
              Page {i + 1}
            </button>
          ))}
          <button title="Add a page (later pages win when their condition holds)" onClick={() => (setPages([...pages, { trigger: "interact" }], "Add page"), setPageNo(pages.length))}>
            +
          </button>
        </div>
        <p class="hint">The last page whose condition holds is the active one.</p>
        <PageForm key={`${index}.${p}`} project={project} mapId={mapId} db={db} path={["events", index, "pages", p]} page={pages[p]} />
        <div class="row">
          <button disabled={p === 0} onClick={() => (setPages(pages.map((x, i) => (i === p - 1 ? pages[p] : i === p ? pages[p - 1] : x)), "Move page"), setPageNo(p - 1))}>
            ← Earlier
          </button>
          <button onClick={() => (setPages([...pages.slice(0, p + 1), structuredClone(pages[p]), ...pages.slice(p + 1)], "Duplicate page"), setPageNo(p + 1))}>Duplicate</button>
          <button disabled={pages.length < 2} onClick={() => (setPages(pages.filter((_, i) => i !== p), "Delete page"), setPageNo(Math.max(0, p - 1)))}>
            Delete page
          </button>
        </div>
      </div>
    </>
  );
}

function PageForm({ project, mapId, db, path, page }: { project: Project; mapId: string; db: Database; path: (string | number)[]; page: EventPageDef }) {
  const file = `data/maps/${mapId}.yaml`;
  const setIn = fileSetter(project, file);
  const set = (field: string, value: unknown, group?: string) => setIn([...path, field], value, `Page: ${field}`, group && `${path.join(".")}.${group}`);
  const chip = db.chipsets.get(db.maps.get(mapId)?.chipset ?? "");
  const ids = <T,>(m: Map<string, T>, name?: (t: T) => string) => [...m.entries()].map(([id, t]) => [id, name ? `${name(t)} (${id})` : id] as [string, string]);
  const look = page.npc ? "npc" : page.keeper ? "keeper" : page.decor ? "decor" : "none";
  const trigger = page.trigger ?? "interact";
  const dialogs = [...db.dialogs.keys()].sort();
  return (
    <div class="page-form">
      <Field label="Active when">
        <ConditionEditor value={page.when} onChange={(c) => set("when", c)} db={db} flags={[]} />
      </Field>
      <Field label="Looks like">
        <select
          value={look}
          onChange={(e) => {
            const v = e.currentTarget.value;
            setIn(path, { ...page, npc: v === "npc" ? (page.npc ?? [...db.npcs.keys()][0]) : undefined, keeper: v === "keeper" ? (page.keeper ?? [...db.npcs.keys()][0]) : undefined, decor: v === "decor" || v === "keeper" ? (page.decor ?? "counter") : undefined }, "Page look");
          }}
        >
          <option value="none">nothing (invisible)</option>
          <option value="npc">a character (NPC)</option>
          <option value="decor">an object (decor)</option>
          <option value="keeper">an object with a character behind it (shop counter)</option>
        </select>
      </Field>
      {(look === "npc" || look === "keeper") && (
        <Field label={look === "keeper" ? "Behind it" : "Character"}>
          <Select value={(page.npc ?? page.keeper) as string} options={ids(db.npcs, (n) => n.name)} onChange={(v) => set(look === "keeper" ? "keeper" : "npc", v)} />
        </Field>
      )}
      {(look === "decor" || look === "keeper") && (
        <Field label="Object">
          <Select value={page.decor} options={Object.entries(chip?.decor ?? {}).map(([id, d]) => [id, `${d.name} (${id})`] as [string, string])} onChange={(v) => set("decor", v)} />
        </Field>
      )}
      {look === "npc" && (
        <>
          <Field label="Facing">
            <Select value={page.dir} options={DIRS} empty="S (default)" onChange={(v) => set("dir", v)} />
          </Field>
          <Field label="Moves">
            <div class="row">
              <Select value={page.move} options={[["wander", "wanders around"]]} empty="stands still" onChange={(v) => set("move", v)} />
              {page.move === "wander" && <Num value={page.wanderRadius} placeholder="2" min={1} width={56} onChange={(v) => set("wanderRadius", v)} />}
            </div>
          </Field>
          <Field label="Shop sign">
            <Select value={page.sign} options={SIGNS} empty="(none)" onChange={(v) => set("sign", v)} />
          </Field>
        </>
      )}
      <Field label="Starts when">
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
            const m = db.maps.get(mapId)!;
            set({ ...it, wakeAt: e.currentTarget.checked ? { map: mapId, spawn: Object.keys(m.spawns)[0] ?? "start" } : undefined });
          }}
        />
        wake up somewhere else (e.g. by the beds upstairs)
      </label>
      {wake && (
        <>
          <div class="row">
            <Select value={wake.map} options={[...db.maps.entries()].map(([id, m]) => [id, m.name] as [string, string])} onChange={(v) => set({ ...it, wakeAt: { map: v ?? mapId, spawn: Object.keys(db.maps.get(v ?? mapId)?.spawns ?? {})[0] ?? "" } })} />
            <Select value={wake.spawn} options={Object.keys(target?.spawns ?? {})} onChange={(v) => set({ ...it, wakeAt: { ...wake, spawn: v ?? "" } })} />
          </div>
          <div class="row">
            facing
            <Select value={wake.dir} options={DIRS} empty={`${spawnDir} (the spawn's)`} onChange={(v) => set({ ...it, wakeAt: { ...wake, dir: v as Dir | undefined } })} />
          </div>
        </>
      )}
    </div>
  );
}
