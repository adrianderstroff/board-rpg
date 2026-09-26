import type { RawContent } from "../../../src/core/data/database";
import { ELEMENTS, type EffectDef, type Element } from "../../../src/core/data/types";
import { EFFECT_TYPES } from "../items/model";
import { Check, ListEditor, MultiPick, Num, Percent, Select } from "./fields";

/**
 * The effect list (editor-design §8): one editor for items, abilities and enemy skills. Each row is
 * one of the game's effect types with its own fields.
 */

type Options = [string, string][];

/** Picker entries of a collection: id → "Name (id)". */
export function optionsOf(collection: Record<string, unknown> | undefined): Options {
  return Object.entries(collection ?? {}).map(([id, v]) => {
    const name = (v as { name?: string })?.name;
    return [id, name ? `${name} (${id.replace(/^lib:/, "")})` : id.replace(/^lib:/, "")];
  });
}

const ELEMENT_OPTIONS: Options = ELEMENTS.map((e) => [e, e]);

/** A duration in turns: one number, or a range (min–max). */
function Turns({ value, onChange }: { value: number | [number, number] | undefined; onChange: (v: number | [number, number] | undefined) => void }) {
  const [a, b] = Array.isArray(value) ? value : [value, value];
  const write = (x: number | undefined, y: number | undefined) => onChange(x === undefined ? undefined : y === undefined || y === x ? x : [x, y]);
  return (
    <span class="row" title="Turns: one number, or a range (the game picks one)">
      <Num value={a} min={1} width={48} placeholder="turns" onChange={(x) => write(x, b)} />–
      <Num value={Array.isArray(value) ? b : undefined} min={1} width={48} placeholder="max" onChange={(y) => write(a, y)} />
    </span>
  );
}

function EffectFields({ e, set, raw }: { e: EffectDef; set: (e: EffectDef) => void; raw: RawContent }) {
  const lbl = (text: string) => <span class="dim">{text}</span>;
  switch (e.type) {
    case "damage":
      return (
        <div class="row wrap">
          <Select value={e.kind} options={[["physical", "physical"], ["magical", "magical"]]} onChange={(k) => set({ ...e, kind: (k ?? "physical") as "physical" })} />
          {lbl("power ×")}
          <Num value={e.power} step={0.1} width={56} onChange={(v) => set({ ...e, power: v })} />
          {lbl("+")}
          <Num value={e.base} width={56} placeholder="base" onChange={(v) => set({ ...e, base: v })} />
          <Select value={e.element} options={ELEMENT_OPTIONS} empty="no element" onChange={(v) => set({ ...e, element: v as Element | undefined })} />
          {lbl("ignore DEF")}
          <Num value={e.ignoreDef} min={0} max={1} step={0.1} width={56} onChange={(v) => set({ ...e, ignoreDef: v })} />
        </div>
      );
    case "fixedDamage":
      return (
        <div class="row">
          <Num value={e.amount} min={0} width={64} onChange={(v) => set({ ...e, amount: v ?? 0 })} />
          <Select value={e.element} options={ELEMENT_OPTIONS} empty="no element" onChange={(v) => set({ ...e, element: v as Element | undefined })} />
        </div>
      );
    case "heal":
      return (
        <div class="row">
          <Num value={e.base} min={0} width={64} onChange={(v) => set({ ...e, base: v })} />
          {lbl("HP + MAG ×")}
          <Num value={e.scale} min={0} step={0.1} width={56} onChange={(v) => set({ ...e, scale: v })} />
        </div>
      );
    case "healPercent":
    case "revive":
      return (
        <div class="row">
          <Num value={e.percent} min={1} max={100} width={64} onChange={(v) => set({ ...e, percent: v ?? 0 })} /> {lbl("% HP")}
        </div>
      );
    case "restoreMp":
      return (
        <div class="row">
          <Num value={e.amount} min={0} width={64} onChange={(v) => set({ ...e, amount: v ?? 0 })} /> {lbl("MP")}
        </div>
      );
    case "applyStatus":
      return (
        <div class="row wrap">
          <Select value={e.status} options={optionsOf(raw.statuses)} onChange={(v) => set({ ...e, status: v ?? "" })} />
          <Percent value={e.chance} width={56} placeholder="100" onChange={(v) => set({ ...e, chance: v })} /> {lbl("%")}
          <Turns value={e.turns} onChange={(t) => set({ ...e, turns: t })} />
        </div>
      );
    case "cureStatus":
      return (
        <div class="block">
          <Check value={e.allNegative} label="all negative statuses" onChange={(v) => set({ ...e, allNegative: v, statuses: v ? undefined : e.statuses })} />
          {!e.allNegative && <MultiPick value={e.statuses} options={optionsOf(raw.statuses)} onChange={(v) => set({ ...e, statuses: v })} addLabel="+ status" />}
        </div>
      );
    case "fieldEffect":
      return (
        <div class="row">
          <Select value={e.effect} options={optionsOf(raw.fieldEffects)} onChange={(v) => set({ ...e, effect: v ?? "" })} />
          <Num value={e.rounds} min={1} width={48} onChange={(v) => set({ ...e, rounds: v ?? 1 })} /> {lbl("rounds")}
        </div>
      );
    case "freezeArea":
      return (
        <div class="row wrap">
          <Select value={e.effect} options={optionsOf(raw.fieldEffects)} onChange={(v) => set({ ...e, effect: v ?? "" })} />
          <Num value={e.rounds} min={1} width={48} onChange={(v) => set({ ...e, rounds: v ?? 1 })} /> {lbl("rounds, size")}
          <Num value={e.size} min={1} width={48} onChange={(v) => set({ ...e, size: v ?? 1 })} />
        </div>
      );
    case "shock":
      return (
        <div class="row">
          {lbl("power")}
          <Num value={e.power} min={0} width={56} onChange={(v) => set({ ...e, power: v ?? 0 })} />
          {lbl("reach")}
          <Num value={e.reach} min={0} width={48} onChange={(v) => set({ ...e, reach: v })} />
        </div>
      );
    case "placePrefab":
      return <Select value={e.prefab} options={optionsOf(raw.prefabs)} onChange={(v) => set({ ...e, prefab: v ?? "" })} />;
    case "discover":
      return (
        <div class="row">
          {lbl("radius")}
          <Num value={e.radius} min={1} width={48} onChange={(v) => set({ ...e, radius: v ?? 1 })} />
        </div>
      );
    case "defuse":
      return (
        <div class="row">
          {lbl("gives")}
          <Select value={e.item} options={optionsOf(raw.items)} onChange={(v) => set({ ...e, item: v ?? "" })} />
        </div>
      );
    case "learnAbility":
      return <Select value={e.ability} options={optionsOf(raw.abilities)} empty="(pick an ability)" onChange={(v) => set({ ...e, ability: v ?? "" })} />;
    default:
      return null;
  }
}

export function EffectList({ value, onChange, raw }: { value: EffectDef[]; onChange: (v: EffectDef[]) => void; raw: RawContent }) {
  return (
    <ListEditor
      items={value}
      onChange={onChange}
      add={() => EFFECT_TYPES[0].make()}
      addLabel="+ Effect"
      render={(e, set) => (
        <div class="effect-row">
          <select
            value={e.type}
            onChange={(ev) => {
              const t = EFFECT_TYPES.find((x) => x.type === ev.currentTarget.value);
              if (t) set(t.make());
            }}
          >
            {EFFECT_TYPES.map((t) => (
              <option key={t.type} value={t.type}>
                {t.label}
              </option>
            ))}
          </select>
          <EffectFields e={e} set={set} raw={raw} />
        </div>
      )}
    />
  );
}
