import { useState } from "preact/hooks";
import type { RawContent } from "../../../src/core/data/database";
import { ELEMENTS, STAT_KEYS, type AiRule, type BoardAiDef, type Element, type EquipSlot, type Stats } from "../../../src/core/data/types";
import { aiRuleText, elementWord, ENEMIES_FILE, enemyStatsAt, header, newEnemy, type Enemy } from "../characters/model";
import { FacePreview, GraphicField, PosePreview, WalkPreview } from "../characters/Graphics";
import { StatInputs, StatTable } from "../characters/StatFields";
import { copyEntryToProject } from "../copyToProject";
import { ContentList, EntryActions } from "../forms/ContentList";
import { optionsOf } from "../forms/EffectList";
import { addEntry, deleteEntry, writeEntry } from "../forms/entries";
import { Check, Field, ListEditor, MultiPick, Num, Percent, Select, Text } from "../forms/fields";
import { PatternField } from "../forms/PatternField";
import { Box } from "../forms/Section";
import { SLOTS } from "../items/model";
import { frameStyle } from "../map/sprites";
import { usePersistentState } from "../persist";
import type { Project } from "../project";

/**
 * Enemies (editor-design §7.2): identity, graphics, stats (with growth and a preview at another
 * level), resistances, equipment, movement, the battle AI in plain words, the board AI, its own
 * items (used in battle, stolen, dropped) and the rewards.
 */

const plain = (id: string) => id.replace(/^lib:/, "");
const pct = (v: number | undefined) => (v === undefined ? undefined : Math.round(v * 1000) / 10);
const frac = (v: number | undefined) => (v === undefined ? undefined : v / 100);
const filled = (v: Partial<Stats>): Stats => Object.fromEntries(STAT_KEYS.map((k) => [k, v[k] ?? 0])) as Stats;

const MULTIPLIERS: [string, string][] = [
  ["", "normal"],
  ["2", "very weak ×2"],
  ["1.5", "weak ×1.5"],
  ["0.5", "resists ×0.5"],
  ["0", "immune"],
  ["-1", "absorbs"],
];
const BEHAVIORS: [BoardAiDef["behavior"], string][] = [
  ["aggressive", "aggressive – goes for the heroes"],
  ["guard", "guard – waits until a hero comes near"],
  ["wander", "wander – roams around its place"],
  ["static", "static – never moves"],
];
const TARGETS: [NonNullable<AiRule["target"]>, string][] = [
  ["random", "anyone"],
  ["lowestHp", "the weakest"],
  ["highestHp", "the healthiest"],
  ["boss", "its boss"],
];

/** Decor ids of every chipset (a dormant enemy looks like one). */
const decorIds = (raw: RawContent) => [...new Set(Object.values(raw.chipsets).flatMap((c) => Object.keys(c.decor ?? {})))].sort();

export function EnemiesScreen({ project }: { project: Project }) {
  const [selected, select] = usePersistentState<string | null>("enemies.selected", null);
  const raw = project.content.raw;
  const enemies = raw.enemies as Record<string, Enemy>;
  const current = selected && enemies[selected] ? selected : null;
  const dirty = project.dirtyPaths().includes(ENEMIES_FILE);
  return (
    <>
      <main class="main">
        <div class="split">
          <ContentList
            entries={Object.entries(enemies).map(([id, e]) => ({ id, name: e.name, pic: <CharsetThumb raw={raw} charset={e.charset} />, group: e.boss ? "Bosses" : "Enemies", dirty: dirty && !id.startsWith("lib:") }))}
            groups={["Enemies", "Bosses"]}
            selected={current}
            onSelect={select}
            searchKey="enemies.filter"
            placeholder="Search enemies…"
            newTitle="A new enemy of the project"
            newOptions={[{ label: "New enemy", make: () => select(addEntry(project, ENEMIES_FILE, header("enemies"), newEnemy(raw), (x) => x in project.content.raw.enemies, "New enemy", "enemy")) }]}
          />
          <div class="form-scroll">{current ? <EnemyForm project={project} id={current} /> : <p class="placeholder">Select an enemy, or make one with New.</p>}</div>
        </div>
      </main>
      <aside class="inspector">{current ? <EnemyCard project={project} id={current} onSelect={select} /> : <p class="hint">The monsters on the boards and in battles (editor-design §7.2).</p>}</aside>
    </>
  );
}

/** A charset's front-facing idle frame, small (lists). */
export function CharsetThumb({ raw, charset }: { raw: RawContent; charset?: string }) {
  const s = charset ? raw.graphics.charsets[charset] : undefined;
  if (!s) return <span class="list-face none" />;
  return <span class="list-sprite" style={frameStyle(s.image, s.frameWidth, s.frameHeight, 3, 4, 20 / s.frameHeight)} />;
}

function EnemyCard({ project, id, onSelect }: { project: Project; id: string; onSelect: (id: string | null) => void }) {
  const raw = project.content.raw;
  const e = raw.enemies[id] as Enemy;
  const db = project.content.db;
  const name = (k: "abilities" | "items" | "statuses", x: string) => (raw[k] as Record<string, { name?: string }>)[x]?.name ?? plain(x);
  return (
    <div class="item-card">
      <div class="item-card-head">
        <FacePreview graphics={raw.graphics} face={e.face} />
      </div>
      <h3>{e.name}</h3>
      <div class="dim">
        Level {e.level}
        {e.boss ? " · boss" : ""} · {e.exp} EXP · {e.gold} G
      </div>
      {e.description && <p class="item-text">{e.description}</p>}
      <WalkPreview graphics={raw.graphics} charset={e.charset} />
      <PosePreview graphics={raw.graphics} battler={e.battler} />
      {db && db.enemies.has(id) && <StatTable rows={[{ level: e.level, stats: enemyStatsAt(db, id) }]} />}
      <ul class="summary">
        {(e.ai ?? []).map((r, i) => (
          <li key={i}>{aiRuleText(r, name)}</li>
        ))}
      </ul>
      <p class="hint">{id.startsWith("lib:") ? `Library content (${project.info.library}) – read-only. Referenced as ${id}.` : `Referenced as ${id}.`}</p>
      <EntryActions
        id={id}
        onCopy={() => onSelect(copyEntryToProject(project, "enemies", id))}
        onDuplicate={() => onSelect(addEntry(project, ENEMIES_FILE, header("enemies"), { ...structuredClone(e), name: `${e.name} copy` }, (x) => x in project.content.raw.enemies, `Duplicate ${id}`, "enemy"))}
        onDelete={() => {
          if (!confirm(`Delete ${e.name} (${id})? Maps that place it will show problems.`)) return;
          deleteEntry(project, ENEMIES_FILE, id);
          onSelect(null);
        }}
      />
    </div>
  );
}

function EnemyForm({ project, id }: { project: Project; id: string }) {
  const raw = project.content.raw;
  const e = raw.enemies[id] as Enemy;
  const lib = id.startsWith("lib:");
  const [previewLevel, setPreviewLevel] = useState<number | undefined>(undefined);
  const write = (next: Enemy, label: string, group?: string) => !lib && writeEntry(project, ENEMIES_FILE, id, e, next, `${e.name}: ${label}`, group);
  const db = project.content.db;
  const statuses = optionsOf(raw.statuses);
  const items = optionsOf(raw.items);
  const battleItems = Object.entries(raw.items)
    .filter(([, i]) => !!i.battle)
    .map(([iid, i]) => [iid, `${i.name} (${plain(iid)})`] as [string, string]);
  const boardAbilities = Object.entries(raw.abilities)
    .filter(([, a]) => !!a.board)
    .map(([aid, a]) => [aid, `${a.name} (${plain(aid)})`] as [string, string]);
  const ai = e.ai ?? [];
  const boardAi = e.boardAi ?? { behavior: "aggressive" };
  const setBoardAi = (b: BoardAiDef, label: string, group?: string) => write({ ...e, boardAi: b }, label, group);
  const name = (k: "abilities" | "items" | "statuses", x: string) => (raw[k] as Record<string, { name?: string }>)[x]?.name ?? plain(x);
  const at = previewLevel && db?.enemies.has(id) ? enemyStatsAt(db, id, previewLevel) : null;

  return (
    <div class="item-form">
      {lib && (
        <div class="banner">
          Library enemy – read-only. <b>Copy to project</b> (on the right) makes an editable copy.
        </div>
      )}
      <fieldset disabled={lib}>
        <Box title="Enemy" aside={<span class="dim">{id}</span>}>
          <Field label="Name">
            <Text value={e.name} onChange={(v) => write({ ...e, name: v ?? "" }, "name", "name")} />
          </Field>
          <Field label="Text">
            <textarea rows={2} value={e.description ?? ""} onInput={(ev) => write({ ...e, description: ev.currentTarget.value || undefined }, "text", "description")} />
          </Field>
          <Field label="Level">
            <div class="row">
              <Num value={e.level} min={1} max={99} onChange={(v) => write({ ...e, level: v ?? 1 }, "level", "level")} />
              <span class="spacer" />
              <Check value={e.boss} label="Boss" onChange={(v) => write({ ...e, boss: v, music: v ? e.music : undefined }, v ? "boss" : "not a boss")} />
            </div>
          </Field>
          {e.boss && (
            <Field label="Music">
              <Select value={e.music} options={project.music.map((m) => [m, plain(m)])} empty="the usual boss music" onChange={(v) => write({ ...e, music: v }, "battle music")} />
            </Field>
          )}
          <Field label="Rewards">
            <div class="row">
              <Num value={e.exp} min={0} onChange={(v) => write({ ...e, exp: v ?? 0 }, "EXP", "exp")} /> <span class="dim">EXP</span>
              <Num value={e.gold} min={0} onChange={(v) => write({ ...e, gold: v ?? 0 }, "gold", "gold")} /> <span class="dim">G</span>
            </div>
          </Field>
        </Box>

        <Box title="Graphics">
          <div class="graphics-row">
            <Field label="Board">
              <GraphicField graphics={raw.graphics} kind="charsets" value={e.charset} onChange={(v) => v && write({ ...e, charset: v }, "board sprite")} />
            </Field>
            <Field label="Battle">
              <GraphicField graphics={raw.graphics} kind="battlers" value={e.battler} optional onChange={(v) => write({ ...e, battler: v }, "battle sprite")} />
            </Field>
            <Field label="Face">
              <GraphicField graphics={raw.graphics} kind="faces" value={e.face} optional onChange={(v) => write({ ...e, face: v }, "face")} />
            </Field>
          </div>
        </Box>

        <Box title="Stats">
          <Field label={`Level ${e.level}`}>
            <StatInputs value={e.stats} onChange={(v, s) => write({ ...e, stats: filled(v) }, `${s}`, `stats.${s}`)} />
          </Field>
          <Field label="Per level">
            <StatInputs value={e.growth} step={0.1} onChange={(v, s) => write({ ...e, growth: v }, `growth ${s}`, `growth.${s}`)} />
            <p class="hint">Optional: a map can place it at another level; without growth only the rewards change.</p>
          </Field>
          <Field label="Preview">
            <div class="row">
              <span class="dim">at level</span>
              <Num value={previewLevel} min={1} max={99} placeholder={String(e.level)} onChange={setPreviewLevel} />
            </div>
            {at && <StatTable rows={[{ level: previewLevel!, stats: at }]} />}
          </Field>
        </Box>

        <Box title="Resistances">
          <div class="element-grid">
            {ELEMENTS.map((el) => {
              const m = e.elements?.[el];
              const known = MULTIPLIERS.some(([v]) => v === (m === undefined ? "" : String(m)));
              return (
                <label key={el}>
                  <span>{el}</span>
                  <select
                    value={m === undefined ? "" : String(m)}
                    title={elementWord(m)}
                    onChange={(ev) => {
                      const v = ev.currentTarget.value;
                      write({ ...e, elements: { ...e.elements, [el]: v === "" ? undefined : Number(v) } }, `${el} resistance`);
                    }}
                  >
                    {!known && <option value={String(m)}>×{m}</option>}
                    {MULTIPLIERS.map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </select>
                </label>
              );
            })}
          </div>
          <Field label="Immune to">
            <MultiPick value={e.immune} options={statuses} onChange={(v) => write({ ...e, immune: v }, "immunities")} addLabel="+ status" />
          </Field>
          <Field label="Always has">
            <MultiPick value={e.statuses} options={statuses} onChange={(v) => write({ ...e, statuses: v }, "permanent statuses")} addLabel="+ status" />
          </Field>
          <Field label="Attacks as">
            <Select value={e.element} options={ELEMENTS.map((x) => [x, x])} empty="no element" onChange={(v) => write({ ...e, element: v as Element | undefined }, "element")} />
          </Field>
          <Field label="On hit">
            <div class="row">
              <Select value={e.onHit?.status} options={statuses} empty="nothing" onChange={(v) => write({ ...e, onHit: v ? { status: v, chance: e.onHit?.chance ?? 0.2 } : undefined }, "on hit")} />
              {e.onHit && (
                <>
                  <Percent value={e.onHit.chance} width={56} onChange={(v) => write({ ...e, onHit: { ...e.onHit!, chance: v ?? 0 } }, "on-hit chance", "onHit")} /> %
                </>
              )}
            </div>
          </Field>
        </Box>

        <Box title="Equipment">
          {SLOTS.map(([slot, label]) => (
            <Field key={slot} label={label}>
              <Select
                value={e.equipment?.[slot]}
                options={Object.entries(raw.items)
                  .filter(([, i]) => i.equip?.slot === slot)
                  .map(([iid, i]) => [iid, `${i.name} (${plain(iid)})`])}
                empty="nothing"
                onChange={(v) => write({ ...e, equipment: { ...e.equipment, [slot as EquipSlot]: v } }, slot)}
              />
            </Field>
          ))}
          <p class="hint">Optional – creatures wear nothing. Works like a hero's: stats, the weapon's element and on-hit status, immunities.</p>
        </Box>

        <Box title="Movement">
          <Field label="Pattern">
            <PatternField value={e.move} project={project} onChange={(v) => v && write({ ...e, move: v }, "movement")} />
          </Field>
          <Field label="Water">
            <Select
              value={e.swims}
              options={[
                ["water", "swims – only through water"],
                ["amphibious", "amphibious – land and water"],
              ]}
              empty="stays on land"
              onChange={(v) => write({ ...e, swims: v as Enemy["swims"] }, "swimming")}
            />
          </Field>
        </Box>

        <Box title="Battle AI">
          <ListEditor
            items={ai}
            onChange={(v) => write({ ...e, ai: v }, "battle AI", "ai")}
            add={() => ({ action: "attack", weight: 1 })}
            addLabel="+ Rule"
            render={(r, set) => <AiRuleRow rule={r} set={set} raw={raw} carried={(e.items ?? []).map((i) => i.item)} statuses={statuses} words={aiRuleText(r, name)} />}
          />
          <p class="hint">Each turn it picks among the rules that apply, by weight; "first" rules are taken before the others whenever they apply.</p>
        </Box>

        <Box title="Board AI">
          <Field label="Behaviour">
            <Select value={boardAi.behavior} options={BEHAVIORS} onChange={(v) => setBoardAi({ ...boardAi, behavior: (v ?? "aggressive") as BoardAiDef["behavior"] }, "behaviour")} />
          </Field>
          <Field label="Reach">
            <div class="row">
              <span class="dim">notices heroes within</span>
              <Num value={boardAi.aggroRange} min={0} width={56} onChange={(v) => setBoardAi({ ...boardAi, aggroRange: v }, "aggro range", "aggroRange")} />
              <span class="dim">cells, wanders</span>
              <Num value={boardAi.wanderRadius} min={0} width={56} onChange={(v) => setBoardAi({ ...boardAi, wanderRadius: v }, "wander radius", "wanderRadius")} />
            </div>
          </Field>
          <Field label="Pack">
            <Check value={boardAi.pack} label="Joins allies next to it when heroes are near" onChange={(v) => setBoardAi({ ...boardAi, pack: v }, "pack")} />
          </Field>
          <Field label="Abilities">
            <ListEditor
              items={boardAi.abilities ?? []}
              onChange={(v) => setBoardAi({ ...boardAi, abilities: v }, "board abilities", "boardAbilities")}
              add={() => ({ ability: boardAbilities[0]?.[0] ?? "", chance: 0.3 })}
              addLabel="+ Board ability"
              render={(a, set) => (
                <div class="row">
                  <Select value={a.ability} options={boardAbilities} onChange={(v) => set({ ...a, ability: v ?? "" })} />
                  <Num value={pct(a.chance)} min={0} max={100} width={56} placeholder="100" onChange={(v) => set({ ...a, chance: frac(v) })} />
                  <span class="dim">% per turn</span>
                </div>
              )}
            />
          </Field>
          <Field label="Dormant">
            <input list="decor-ids" value={boardAi.dormant?.decor ?? ""} placeholder="lies as this decor until a hero comes near" onInput={(ev) => setBoardAi({ ...boardAi, dormant: ev.currentTarget.value ? { decor: ev.currentTarget.value } : undefined }, "dormant", "dormant")} />
            <datalist id="decor-ids">
              {decorIds(raw).map((d) => (
                <option key={d} value={d} />
              ))}
            </datalist>
          </Field>
        </Box>

        <Box title="Items">
          <Field label="Uses">
            <ListEditor
              items={e.items ?? []}
              onChange={(v) => write({ ...e, items: v }, "items it uses", "items")}
              add={() => ({ item: battleItems[0]?.[0] ?? "", count: 1 })}
              addLabel="+ Item"
              render={(it, set) => (
                <div class="row">
                  <Select value={it.item} options={battleItems} onChange={(v) => set({ ...it, item: v ?? "" })} />
                  <span class="dim">×</span>
                  <Num value={it.count} min={1} width={56} onChange={(v) => set({ ...it, count: v ?? 1 })} />
                </div>
              )}
            />
            <p class="hint">Carried into every battle; a "use item" rule in the battle AI decides when.</p>
          </Field>
          <Field label="Stolen">
            <ChanceList value={e.steal} items={items} onChange={(v) => write({ ...e, steal: v }, "steal list", "steal")} />
          </Field>
          <Field label="Drops">
            <ChanceList value={e.drops} items={items} onChange={(v) => write({ ...e, drops: v }, "drops", "drops")} />
          </Field>
        </Box>
      </fieldset>
    </div>
  );
}

/** Items with a chance each (steal, drops). */
export function ChanceList({ value, items, onChange }: { value: { item: string; chance: number }[] | undefined; items: [string, string][]; onChange: (v: { item: string; chance: number }[]) => void }) {
  return (
    <ListEditor
      items={value ?? []}
      onChange={onChange}
      add={() => ({ item: items[0]?.[0] ?? "", chance: 0.25 })}
      addLabel="+ Item"
      render={(d, set) => (
        <div class="row">
          <Select value={d.item} options={items} onChange={(v) => set({ ...d, item: v ?? "" })} />
          <Num value={pct(d.chance)} min={0} max={100} width={60} onChange={(v) => set({ ...d, chance: frac(v) ?? 0 })} />
          <span class="dim">%</span>
        </div>
      )}
    />
  );
}

/** One battle AI rule: what, how likely, on whom, when – and the rule in words above. */
function AiRuleRow({ rule, set, raw, carried, statuses, words }: { rule: AiRule; set: (r: AiRule) => void; raw: RawContent; carried: string[]; statuses: [string, string][]; words: string }) {
  const w = rule.when ?? {};
  const setWhen = (next: AiRule["when"]) => set({ ...rule, when: next });
  const actions: [string, string][] = [["attack", "Attack"], ["item", "Use an item"], ...optionsOf(raw.abilities)];
  return (
    <div class="ai-rule">
      <div class="ai-words">{words}</div>
      <div class="row wrap">
        <Select value={rule.action} options={actions} onChange={(v) => set({ ...rule, action: v ?? "attack", item: v === "item" ? (rule.item ?? carried[0]) : undefined })} />
        {rule.action === "item" && <Select value={rule.item} options={carried.map((i) => [i, (raw.items[i]?.name ?? plain(i)) as string])} empty="(an item it carries)" onChange={(v) => set({ ...rule, item: v })} />}
        <span class="dim">on</span>
        <Select value={rule.target} options={TARGETS} empty="anyone" onChange={(v) => set({ ...rule, target: v as AiRule["target"] })} />
        <span class="dim">weight</span>
        <Num value={rule.weight} min={0} width={52} onChange={(v) => set({ ...rule, weight: v ?? 1 })} />
        <Check value={rule.priority} label="first" onChange={(v) => set({ ...rule, priority: v })} />
      </div>
      <div class="row wrap ai-when">
        <span class="dim">when HP below</span>
        <Num value={pct(w.hpBelow)} min={0} max={100} width={52} placeholder="–" onChange={(v) => setWhen({ ...w, hpBelow: frac(v) })} />
        <span class="dim">%, chance</span>
        <Num value={pct(w.chance)} min={0} max={100} width={52} placeholder="–" onChange={(v) => setWhen({ ...w, chance: frac(v) })} />
        <span class="dim">%, every</span>
        <Num value={w.round} min={1} width={48} placeholder="–" onChange={(v) => setWhen({ ...w, round: v })} />
        <span class="dim">rounds, cooldown</span>
        <Num value={w.cooldown} min={1} width={48} placeholder="–" onChange={(v) => setWhen({ ...w, cooldown: v })} />
        <Check value={w.alone} label="alone" onChange={(v) => setWhen({ ...w, alone: v })} />
        <span class="dim">target without</span>
        <Select value={w.targetLacksStatus} options={statuses} empty="–" onChange={(v) => setWhen({ ...w, targetLacksStatus: v })} />
      </div>
    </div>
  );
}

