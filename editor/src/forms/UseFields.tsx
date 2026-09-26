import type { RawContent } from "../../../src/core/data/database";
import type { BattleUse, BoardUse } from "../../../src/core/data/types";
import { BATTLE_TARGETS, BOARD_TARGETS } from "../items/model";
import type { Project } from "../project";
import { EffectList, optionsOf } from "./EffectList";
import { Check, Field, MultiPick, Num, Percent, Select } from "./fields";
import { PatternField } from "./PatternField";

/**
 * How something is used (editor-design §8, §10): in battle – on whom, with which effects – and on
 * the board – range, area, targets, effects. Items and abilities share these boxes.
 */

type Set<T> = (v: T, label: string, group?: string) => void;

export function BattleUseFields({ use, raw, onChange, enemySkills }: { use: BattleUse; raw: RawContent; onChange: Set<BattleUse>; enemySkills?: boolean }) {
  return (
    <>
      <Field label="Target">
        <Select value={use.target} options={BATTLE_TARGETS} onChange={(v) => onChange({ ...use, target: (v ?? "ally") as BattleUse["target"] }, "battle target")} />
      </Field>
      <Field label="Effects">
        <EffectList value={use.effects ?? []} raw={raw} onChange={(v) => onChange({ ...use, effects: v }, "battle effects", "battle.effects")} />
      </Field>
      {/* enemy skills (§12.7): shown when set or where they make sense */}
      {(enemySkills || use.swallow) && (
        <Field label="Swallow">
          <div class="row">
            <Check value={!!use.swallow} label="swallows the target, taking" onChange={(v) => onChange({ ...use, swallow: v ? { hp: 0.5, mp: 0.3 } : undefined }, "swallow")} />
            {use.swallow && (
              <>
                <Percent value={use.swallow.hp} width={56} onChange={(v) => onChange({ ...use, swallow: { ...use.swallow!, hp: v ?? 0 } }, "swallowed HP", "swallow")} />
                <span class="dim">% HP,</span>
                <Percent value={use.swallow.mp} width={56} onChange={(v) => onChange({ ...use, swallow: { ...use.swallow!, mp: v ?? 0 } }, "swallowed MP", "swallow")} />
                <span class="dim">% MP</span>
              </>
            )}
          </div>
        </Field>
      )}
      {(enemySkills || use.summon) && (
        <Field label="Summon">
          <Check value={!!use.summon} label="raises enemies into its side" onChange={(v) => onChange({ ...use, summon: v ? { enemies: [], cost: 10 } : undefined }, "summon")} />
          {use.summon && (
            <>
              <MultiPick value={use.summon.enemies} options={optionsOf(raw.enemies)} onChange={(v) => onChange({ ...use, summon: { ...use.summon!, enemies: v } }, "summoned enemies")} addLabel="+ enemy" />
              <div class="row">
                <span class="dim">for</span>
                <Num value={use.summon.cost} min={0} width={64} onChange={(v) => onChange({ ...use, summon: { ...use.summon!, cost: v ?? 0 } }, "summon cost", "summon")} />
                <span class="dim">gold of the battle's reward</span>
              </div>
            </>
          )}
        </Field>
      )}
    </>
  );
}

export function BoardUseFields({ use, project, onChange }: { use: BoardUse; project: Project; onChange: Set<BoardUse> }) {
  const targets = use.targets ?? [];
  return (
    <>
      <Field label="Range">
        <PatternField value={use.range} project={project} onChange={(v) => onChange({ ...use, range: v ?? "lib:adjacent" }, "range")} />
      </Field>
      <Field label="Area">
        <PatternField value={use.area} project={project} empty="the target cell" onChange={(v) => onChange({ ...use, area: v }, "area")} />
      </Field>
      <Field label="Targets">
        <div class="row wrap">
          {BOARD_TARGETS.map(([t, label]) => (
            <Check key={t} label={label} value={targets.includes(t)} onChange={(v) => onChange({ ...use, targets: v ? [...targets, t] : targets.filter((x) => x !== t) }, "targets")} />
          ))}
        </div>
        <Check value={use.wildOnly} label="Only on wild boards" onChange={(v) => onChange({ ...use, wildOnly: v }, "wild boards only")} />
      </Field>
      <Field label="Effects">
        <EffectList value={use.effects ?? []} raw={project.content.raw} onChange={(v) => onChange({ ...use, effects: v }, "board effects", "board.effects")} />
      </Field>
    </>
  );
}


