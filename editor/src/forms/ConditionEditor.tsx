import type { Database } from "../../../src/core/data/database";
import type { Condition } from "../../../src/core/data/types";
import { Num, Select, Text } from "./fields";

/**
 * Builder for the game's conditions (editor-design §6.2): quests, dialogs, events, exits and gates
 * all use the same condition data. `all` / `any` / `not` nest.
 */

type Kind = "none" | Extract<keyof UnionToIntersection<Condition>, string>;
type UnionToIntersection<U> = (U extends unknown ? (x: U) => void : never) extends (x: infer I) => void ? I : never;

const KINDS: [Kind, string][] = [
  ["none", "(always)"],
  ["flag", "Flag is set"],
  ["not", "NOT …"],
  ["all", "ALL of …"],
  ["any", "ANY of …"],
  ["item", "Party has item"],
  ["gold", "Party has gold (at least)"],
  ["var", "Variable compares"],
  ["talkedTo", "Talked to"],
  ["defeated", "Enemy defeated"],
  ["defeatedAllOn", "All enemies defeated on a map"],
  ["onMap", "Party is on map"],
  ["questActive", "Quest is active"],
  ["questDone", "Quest is done"],
  ["questStep", "Quest is at step"],
  ["questStepsDone", "All steps of a quest done"],
  ["partyHas", "Hero is in the party"],
  ["level", "Party level (at least)"],
];

export const conditionKind = (c: Condition | undefined): Kind => (c ? (Object.keys(c)[0] as Kind) : "none");

function defaultFor(kind: Kind, db: Database): Condition | undefined {
  const first = <T,>(m: Map<string, T>) => [...m.keys()][0];
  switch (kind) {
    case "none":
      return undefined;
    case "flag":
      return { flag: "" };
    case "not":
      return { not: { flag: "" } };
    case "all":
      return { all: [{ flag: "" }] };
    case "any":
      return { any: [{ flag: "" }] };
    case "item":
      return { item: first(db.items) };
    case "gold":
      return { gold: 100 };
    case "var":
      return { var: { name: "", op: ">=", value: 1 } };
    case "talkedTo":
      return { talkedTo: first(db.npcs) };
    case "defeated":
      return { defeated: { enemy: first(db.enemies) } };
    case "defeatedAllOn":
      return { defeatedAllOn: first(db.maps) };
    case "onMap":
      return { onMap: first(db.maps) };
    case "questActive":
      return { questActive: first(db.quests) };
    case "questDone":
      return { questDone: first(db.quests) };
    case "questStep": {
      const q = [...db.quests.values()][0];
      return { questStep: { quest: q.id, step: q.steps[0]?.id ?? "" } };
    }
    case "questStepsDone":
      return { questStepsDone: first(db.quests) };
    case "partyHas":
      return { partyHas: first(db.heroes) };
    case "level":
      return { level: 5 };
    case "always":
      return { always: true };
  }
}

export function ConditionEditor({ value, onChange, db, flags }: { value: Condition | undefined; onChange: (c: Condition | undefined) => void; db: Database; flags: string[] }) {
  const kind = conditionKind(value);
  const c = value as Record<string, unknown> | undefined;
  const ids = <T,>(m: Map<string, T>, name?: (t: T) => string) => [...m.entries()].map(([id, t]) => [id, name ? `${name(t)} (${id})` : id] as [string, string]);
  const maps = ids(db.maps, (m) => m.name);
  const quests = ids(db.quests, (q) => q.title);

  const body = () => {
    switch (kind) {
      case "flag":
        return <Text value={c!.flag as string} list="known-flags" placeholder="flag name" onChange={(v) => onChange({ flag: v ?? "" })} />;
      case "not":
        return <ConditionEditor value={c!.not as Condition} onChange={(v) => onChange(v ? { not: v } : undefined)} db={db} flags={flags} />;
      case "all":
      case "any": {
        const list = c![kind] as Condition[];
        const set = (l: Condition[]) => onChange((kind === "all" ? { all: l } : { any: l }) as Condition);
        return (
          <div class="nested">
            {list.map((sub, i) => (
              <div class="row top" key={i}>
                <ConditionEditor value={sub} onChange={(v) => set(v ? list.map((x, j) => (j === i ? v : x)) : list.filter((_, j) => j !== i))} db={db} flags={flags} />
              </div>
            ))}
            <button onClick={() => set([...list, { flag: "" }])}>+ Condition</button>
          </div>
        );
      }
      case "item": {
        const it = c!.item as string | { id: string; count?: number };
        const id = typeof it === "string" ? it : it.id;
        const count = typeof it === "string" ? undefined : it.count;
        return (
          <div class="row">
            <Select value={id} options={ids(db.items, (i) => i.name)} onChange={(v) => onChange({ item: count ? { id: v ?? "", count } : (v ?? "") })} />×
            <Num value={count} placeholder="1" min={1} width={56} onChange={(n) => onChange({ item: n && n > 1 ? { id, count: n } : id })} />
          </div>
        );
      }
      case "gold":
        return <Num value={c!.gold as number} onChange={(n) => onChange({ gold: n ?? 0 })} />;
      case "level":
        return <Num value={c!.level as number} min={1} onChange={(n) => onChange({ level: n ?? 1 })} />;
      case "var": {
        const v = c!.var as { name: string; op?: string; value: number };
        return (
          <div class="row">
            <Text value={v.name} placeholder="variable" onChange={(n) => onChange({ var: { ...v, name: n ?? "" } } as Condition)} />
            <Select value={v.op ?? "=="} options={["==", "!=", ">=", "<=", ">", "<"]} onChange={(op) => onChange({ var: { ...v, op } } as Condition)} />
            <Num value={v.value} width={56} onChange={(n) => onChange({ var: { ...v, value: n ?? 0 } } as Condition)} />
          </div>
        );
      }
      case "talkedTo":
        return <Select value={c!.talkedTo as string} options={ids(db.npcs, (n) => n.name)} onChange={(v) => onChange({ talkedTo: v ?? "" })} />;
      case "defeated": {
        const d = c!.defeated as { enemy?: string; piece?: string; count?: number };
        return (
          <div class="row">
            <Select value={d.enemy} options={ids(db.enemies, (e) => e.name)} empty="(any enemy)" onChange={(v) => onChange({ defeated: { ...d, enemy: v } })} />×
            <Num value={d.count} placeholder="1" min={1} width={56} onChange={(n) => onChange({ defeated: { ...d, count: n } })} />
          </div>
        );
      }
      case "defeatedAllOn":
      case "onMap":
        return <Select value={c![kind] as string} options={maps} onChange={(v) => onChange({ [kind]: v ?? "" } as Condition)} />;
      case "questActive":
      case "questStepsDone":
        return <Select value={c![kind] as string} options={quests} onChange={(v) => onChange({ [kind]: v ?? "" } as Condition)} />;
      case "questDone": {
        const q = c!.questDone as string | { quest: string; ending?: string };
        const id = typeof q === "string" ? q : q.quest;
        const ending = typeof q === "string" ? undefined : q.ending;
        const endings = (db.quests.get(id)?.endings ?? []).map((e) => e.id);
        return (
          <div class="row">
            <Select value={id} options={quests} onChange={(v) => onChange({ questDone: ending ? { quest: v ?? "", ending } : (v ?? "") })} />
            {endings.length > 0 && <Select value={ending} options={endings} empty="(any ending)" onChange={(e) => onChange({ questDone: e ? { quest: id, ending: e } : id })} />}
          </div>
        );
      }
      case "questStep": {
        const q = c!.questStep as { quest: string; step: string };
        const steps = (db.quests.get(q.quest)?.steps ?? []).map((s) => [s.id, `${s.id}: ${s.objective}`] as [string, string]);
        return (
          <div class="row">
            <Select value={q.quest} options={quests} onChange={(v) => onChange({ questStep: { quest: v ?? "", step: db.quests.get(v ?? "")?.steps[0]?.id ?? "" } })} />
            <Select value={q.step} options={steps} onChange={(v) => onChange({ questStep: { ...q, step: v ?? "" } })} />
          </div>
        );
      }
      case "partyHas":
        return <Select value={c!.partyHas as string} options={ids(db.heroes, (h) => h.name)} onChange={(v) => onChange({ partyHas: v ?? "" })} />;
      default:
        return null;
    }
  };

  return (
    <div class="condition">
      <select value={kind} onChange={(e) => onChange(defaultFor(e.currentTarget.value as Kind, db))}>
        {KINDS.map(([k, label]) => (
          <option key={k} value={k}>
            {label}
          </option>
        ))}
        {kind === "always" && <option value="always">always</option>}
      </select>
      {body()}
    </div>
  );
}

/** Every flag name used anywhere in the content (for suggestions). */
export function knownFlags(raw: unknown): string[] {
  const out = new Set<string>();
  const walk = (v: unknown) => {
    if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") {
      for (const [k, x] of Object.entries(v)) {
        if ((k === "flag" || k === "setFlag" || k === "clearFlag" || k === "closeFlag") && typeof x === "string" && x) out.add(x);
        else if (k === "flags" && Array.isArray(x)) x.forEach((f) => typeof f === "string" && out.add(f));
        walk(x);
      }
    }
  };
  walk(raw);
  return [...out].sort();
}
