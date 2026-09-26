import type { MapDef, QuickPlayDef } from "../../../src/core/data/types";
import { centreCell } from "../../../src/core/state/quickPlay";
import type { Project } from "../project";

/**
 * The map's Quick Play entity (editor-design §6.3): where and with whom ▶ Quick Play starts.
 * Everything is optional; stored under `editor.quickPlay` in the map file (ignored by the game).
 */
export function QuickPlayForm({ project, mapId }: { project: Project; mapId: string }) {
  const path = `data/maps/${mapId}.yaml`;
  const map = project.data<MapDef>(path);
  const db = project.content.db;
  const qp: QuickPlayDef = map?.editor?.quickPlay ?? {};
  if (!map || !db) return null;

  const write = (next: QuickPlayDef, label: string, group?: string) => {
    const clean = prune(next);
    project.edit(
      path,
      label,
      (d) => {
        if (Object.keys(clean).length) d.setIn(["editor", "quickPlay"], d.createNode(clean, { flow: false }));
        else {
          d.deleteIn(["editor", "quickPlay"]);
          const ed = d.get("editor") as { items?: unknown[] } | undefined;
          if (ed && !ed.items?.length) d.delete("editor");
        }
      },
      group,
    );
  };

  const heroes = [...db.heroes.keys()];
  const items = [...db.items.values()].sort((a, b) => a.name.localeCompare(b.name));
  const abilities = [...db.abilities.values()].filter((a) => a.type !== "Enemy").sort((a, b) => a.name.localeCompare(b.name));
  const party = qp.party ?? [];
  const centre = centreCell(db, mapId);
  const num = (v: string) => (v === "" ? undefined : Number(v));

  return (
    <>
      <h3>▶ Quick Play on this map</h3>
      <p class="hint">Starts right here for testing. Empty fields use the defaults. The real game start is under Settings.</p>

      <div class="form" style={{ gridTemplateColumns: "70px 1fr" }}>
        <label>Start at</label>
        <div class="row">
          x <input type="number" style={{ width: 56 }} value={qp.x ?? ""} placeholder={String(centre.x)} onInput={(e) => write({ ...qp, x: num(e.currentTarget.value) }, "Quick Play position", "qp-pos")} />
          y <input type="number" style={{ width: 56 }} value={qp.y ?? ""} placeholder={String(centre.y)} onInput={(e) => write({ ...qp, y: num(e.currentTarget.value) }, "Quick Play position", "qp-pos")} />
        </div>

        <label>Gold</label>
        <input type="number" value={qp.gold ?? ""} placeholder={String(db.config.start.gold)} onInput={(e) => write({ ...qp, gold: num(e.currentTarget.value) }, "Quick Play gold", "qp-gold")} />
      </div>

      <h3 style={{ marginTop: 14 }}>Party</h3>
      {!party.length && <p class="hint">The real start party: {db.config.start.party.join(", ")}.</p>}
      {party.map((m, i) => (
        <div class="row" key={i} style={{ marginBottom: 4 }}>
          <select value={m.hero} onChange={(e) => write({ ...qp, party: party.map((p, j) => (j === i ? { ...p, hero: e.currentTarget.value } : p)) }, "Quick Play party")}>
            {heroes.map((h) => (
              <option key={h} value={h}>
                {db.hero(h).name}
              </option>
            ))}
          </select>
          Lv
          <input
            type="number"
            min={1}
            max={db.config.maxLevel}
            style={{ width: 56 }}
            value={m.level ?? ""}
            placeholder={String(db.hero(m.hero).level)}
            onInput={(e) => write({ ...qp, party: party.map((p, j) => (j === i ? { ...p, level: num(e.currentTarget.value) } : p)) }, "Quick Play level", `qp-lv${i}`)}
          />
          <button onClick={() => write({ ...qp, party: party.filter((_, j) => j !== i) }, "Quick Play party")} title="Remove">
            ✕
          </button>
        </div>
      ))}
      <button
        disabled={party.length >= db.config.maxPartySize}
        onClick={() => write({ ...qp, party: [...party, { hero: heroes.find((h) => !party.some((p) => p.hero === h)) ?? heroes[0] }] }, "Quick Play party")}
      >
        + Hero
      </button>

      <h3 style={{ marginTop: 14 }}>Extra items</h3>
      <PairList
        entries={Object.entries(qp.items ?? {})}
        options={items.map((it) => [it.id, it.name])}
        valueLabel="×"
        onChange={(entries) => write({ ...qp, items: Object.fromEntries(entries.map(([k, v]) => [k, Math.max(1, Number(v) || 1)])) }, "Quick Play items", "qp-items")}
        newEntry={() => [items[0].id, 1]}
        numeric
      />

      <h3 style={{ marginTop: 14 }}>Extra abilities</h3>
      <PairList
        entries={Object.entries(qp.abilities ?? {}).flatMap(([hero, list]) => list.map((a) => [hero, a] as [string, string | number]))}
        options={(party.length ? party.map((p) => p.hero) : db.config.start.party).map((h) => [h, db.hero(h).name])}
        valueOptions={abilities.map((a) => [a.id, `${a.name} (${a.type})`])}
        valueLabel="learns"
        onChange={(entries) => {
          const out: Record<string, string[]> = {};
          for (const [h, a] of entries) (out[h] ??= []).push(String(a));
          write({ ...qp, abilities: out }, "Quick Play abilities");
        }}
        newEntry={() => [(party[0]?.hero ?? db.config.start.party[0]), abilities[0].id]}
      />

      <h3 style={{ marginTop: 14 }}>Flags set</h3>
      <input
        style={{ width: "100%" }}
        placeholder="e.g. monks_trial, orb_claimed"
        value={(qp.flags ?? []).join(", ")}
        onInput={(e) => write({ ...qp, flags: e.currentTarget.value.split(",").map((f) => f.trim()).filter(Boolean) }, "Quick Play flags", "qp-flags")}
      />
      <p class="hint">Story flags to test a later state of the game.</p>
    </>
  );
}

/** Rows of (key picker, value) with add / remove. */
function PairList(props: {
  entries: [string, string | number][];
  options: [string, string][];
  valueOptions?: [string, string][];
  valueLabel: string;
  numeric?: boolean;
  onChange: (entries: [string, string | number][]) => void;
  newEntry: () => [string, string | number];
}) {
  const { entries, onChange } = props;
  const update = (i: number, k: string, v: string | number) => onChange(entries.map((e, j) => (j === i ? [k, v] : e)));
  return (
    <>
      {entries.map(([k, v], i) => (
        <div class="row" key={i} style={{ marginBottom: 4 }}>
          <select value={k} onChange={(e) => update(i, e.currentTarget.value, v)}>
            {props.options.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
          {props.valueLabel}
          {props.valueOptions ? (
            <select value={String(v)} onChange={(e) => update(i, k, e.currentTarget.value)}>
              {props.valueOptions.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          ) : (
            <input type={props.numeric ? "number" : "text"} min={1} style={{ width: 56 }} value={v} onInput={(e) => update(i, k, e.currentTarget.value)} />
          )}
          <button onClick={() => onChange(entries.filter((_, j) => j !== i))} title="Remove">
            ✕
          </button>
        </div>
      ))}
      <button onClick={() => onChange([...entries, props.newEntry()])}>+ Add</button>
    </>
  );
}

/** Drops empty fields so the map file only holds what was set. */
function prune(qp: QuickPlayDef): QuickPlayDef {
  const out: QuickPlayDef = {};
  if (qp.x !== undefined && !Number.isNaN(qp.x)) out.x = qp.x;
  if (qp.y !== undefined && !Number.isNaN(qp.y)) out.y = qp.y;
  if (qp.party?.length) out.party = qp.party.map((p) => (p.level ? { hero: p.hero, level: p.level } : { hero: p.hero }));
  if (qp.items && Object.keys(qp.items).length) out.items = qp.items;
  if (qp.abilities && Object.keys(qp.abilities).length) out.abilities = qp.abilities;
  if (qp.flags?.length) out.flags = qp.flags;
  if (qp.gold !== undefined && !Number.isNaN(qp.gold)) out.gold = qp.gold;
  return out;
}
