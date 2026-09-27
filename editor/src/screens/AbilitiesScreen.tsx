import { useState } from "preact/hooks";
import type { BattleUse, BoardUse } from "../../../src/core/data/types";
import { isOffensive } from "../../../src/core/effects/effects";
import { ABILITIES_FILE, ABILITY_PRESETS, abilityGroups, abilityTypes, abilityUsers, addAbility, EMPTY_ABILITY, type Ability } from "../abilities/model";
import { editEntry, isOverridden, revertToLibrary } from "../overrides";
import { ContentList, EntryActions } from "../forms/ContentList";
import { deleteEntry, writeEntry } from "../forms/entries";
import { Field, Num, Select, Text } from "../forms/fields";
import { IconPicker, ItemIcon } from "../forms/IconPicker";
import { Box, Section } from "../forms/Section";
import { BattleUseFields, BoardUseFields } from "../forms/UseFields";
import { useSummary } from "../items/model";
import { usePersistentState } from "../persist";
import type { Project } from "../project";
import { EntryReferences, usedIn } from "../forms/References";
import type { UsageTarget } from "../references";


/**
 * Abilities (editor-design §10): the list by menu (Magic, Sword Art …), one form with the same
 * battle and board boxes as items, and in the inspector what it does and who has it.
 */

const plain = (id: string) => id.replace(/^lib:/, "");
const SPECIAL: Record<string, string> = { joinParty: "joins a party next to it", leaveParty: "leaves its party" };

export function AbilitiesScreen({ project, goTo }: { project: Project; goTo: (t: UsageTarget) => void }) {
  const [selected, select] = usePersistentState<string | null>("abilities.selected", null);
  const raw = project.content.raw;
  const abilities = raw.abilities as Record<string, Ability>;
  const current = selected && abilities[selected] ? selected : null;
  const dirty = project.dirtyPaths().includes(ABILITIES_FILE);
  const types = abilityTypes(raw);
  return (
    <>
      <main class="main">
        <div class="split">
          <ContentList
            entries={Object.entries(abilities).map(([id, a]) => ({ id, name: a.name, pic: <ItemIcon icon={a.icon} scale={1} />, group: a.type, dirty: dirty && (!id.startsWith("lib:") || isOverridden(project, "abilities", id)), changed: isOverridden(project, "abilities", id) }))}
            groups={types}
            selected={current}
            onSelect={select}
            searchKey="abilities.filter"
            placeholder="Search abilities…"
            newTitle="A new ability of the project: empty, or from a preset"
            newOptions={[
              { label: "Empty", make: () => select(addAbility(project, EMPTY_ABILITY, "New ability")) },
              ...ABILITY_PRESETS.map((p, i) => ({ label: p.label, title: useSummary(p.ability.battle, p.ability.board).join("\n"), divider: i === 0, make: () => select(addAbility(project, p.ability, `New ${p.label.toLowerCase()}`)) })),
            ]}
          />
          <div class="form-scroll">{current ? <AbilityForm project={project} id={current} /> : <p class="placeholder">Select an ability, or make one with New.</p>}</div>
        </div>
      </main>
      <aside class="inspector">{current ? <AbilityCard project={project} id={current} onSelect={select} goTo={goTo} /> : <p class="hint">What heroes learn and enemies use: spells, skills, arts (editor-design §10).</p>}</aside>
    </>
  );
}

function AbilityCard({ project, id, onSelect, goTo }: { project: Project; id: string; onSelect: (id: string | null) => void; goTo: (t: UsageTarget) => void }) {
  const raw = project.content.raw;
  const a = raw.abilities[id] as Ability;
  const users = abilityUsers(raw, id);
  const nameOf = (kind: "class" | "item" | "enemy", x: string) => ({ class: raw.classes, item: raw.items, enemy: raw.enemies })[kind][x]?.name ?? plain(x);
  const offensive = a.offensive ?? isOffensive(a.battle?.effects ?? []);
  return (
    <div class="item-card">
      <div class="item-card-head">
        <ItemIcon icon={a.icon} scale={3} />
        <div>
          <h3>{a.name}</h3>
          <div class="dim">
            {a.type}
            {a.group ? ` · ${a.group}` : ""} · {a.mp} MP{offensive ? " · offensive" : ""}
          </div>
        </div>
      </div>
      {a.description && <p class="item-text">{a.description}</p>}
      <ul class="summary">
        {a.special && <li>Special: {SPECIAL[a.special] ?? a.special}</li>}
        {useSummary(a.battle, a.board).map((l) => (
          <li key={l}>{l}</li>
        ))}
        {!a.battle && !a.board && !a.special && <li>No use yet.</li>}
      </ul>
      <h4 class="card-heading">Who has it</h4>
      {users.length ? (
        <ul class="summary">
          {users.map((u, i) => (
            <li key={i}>
              {nameOf(u.kind, u.id)} <span class="dim">({u.kind}, {u.how})</span>
            </li>
          ))}
        </ul>
      ) : (
        <p class="hint">Nobody yet – a class learns it, an item grants or teaches it, or an enemy uses it.</p>
      )}
      <EntryReferences project={project} collection="abilities" id={id} goTo={goTo} onRenamed={onSelect} list={false} />
      <EntryActions
        id={id}
        used={usedIn(project, "abilities", id)}
        changed={isOverridden(project, "abilities", id)}
        onRevert={() => void revertToLibrary(project, "abilities", id)}
        onDuplicate={() => onSelect(addAbility(project, { ...structuredClone(a), name: `${a.name} copy` }, `Duplicate ${id}`))}
        onDelete={() => {
          if (!confirm(`Delete ${a.name} (${id})?${users.length ? ` ${users.length} place(s) use it and will show problems.` : ""}`)) return;
          deleteEntry(project, ABILITIES_FILE, id);
          onSelect(null);
        }}
      />
    </div>
  );
}

function AbilityForm({ project, id }: { project: Project; id: string }) {
  const [iconPicker, setIconPicker] = useState(false);
  const raw = project.content.raw;
  const a = raw.abilities[id] as Ability;
  const write = (next: Ability, label: string, group?: string) => editEntry(project, "abilities", id, `${a.name}: ${label}`, () => writeEntry(project, ABILITIES_FILE, id, a, next, `${a.name}: ${label}`, group));
  const setBattle = (b: BattleUse, label: string, group?: string) => write({ ...a, battle: b }, label, group);
  const setBoard = (b: BoardUse, label: string, group?: string) => write({ ...a, board: b }, label, group);
  const auto = isOffensive(a.battle?.effects ?? []);
  // enemy skills (swallow, summon) are offered for abilities only enemies use
  const users = abilityUsers(raw, id);
  const enemySkill = users.length > 0 && users.every((u) => u.kind === "enemy");
  return (
    <div class="item-form">
      <fieldset>
        <Box title="Ability" aside={<span class="dim">{id}</span>}>
          <div class="basics">
            <button class="icon-pick" title="Pick the icon" onClick={() => setIconPicker(true)}>
              <ItemIcon icon={a.icon} scale={3} />
            </button>
            <div>
              <Field label="Name">
                <Text value={a.name} onChange={(v) => write({ ...a, name: v ?? "" }, "name", "name")} />
              </Field>
              <Field label="Text">
                <textarea rows={2} value={a.description ?? ""} onInput={(e) => write({ ...a, description: e.currentTarget.value || undefined }, "text", "description")} />
              </Field>
              <Field label="Menu">
                <div class="row">
                  <input list="ability-types" value={a.type} title="The menu it is listed under in battle (the class's ability type)" onInput={(e) => write({ ...a, type: e.currentTarget.value }, "type", "type")} />
                  <span class="dim">group</span>
                  <input list="ability-groups" value={a.group ?? ""} placeholder="(none)" title="A sub-list of the menu (Attack, Support …)" onInput={(e) => write({ ...a, group: e.currentTarget.value || undefined }, "group", "group")} />
                  <datalist id="ability-types">
                    {abilityTypes(raw).map((t) => (
                      <option key={t} value={t} />
                    ))}
                  </datalist>
                  <datalist id="ability-groups">
                    {abilityGroups(raw).map((t) => (
                      <option key={t} value={t} />
                    ))}
                  </datalist>
                </div>
              </Field>
              <Field label="MP">
                <div class="row">
                  <Num value={a.mp} min={0} width={70} onChange={(v) => write({ ...a, mp: v ?? 0 }, "MP", "mp")} />
                  <span class="spacer" />
                  <span class="dim">offensive</span>
                  <Select
                    value={a.offensive === undefined ? "" : a.offensive ? "yes" : "no"}
                    options={[
                      ["", `automatic (${auto ? "yes" : "no"})`],
                      ["yes", "yes – breaks Hidden"],
                      ["no", "no"],
                    ]}
                    title="Offensive actions break Hidden; automatic = it deals damage or steals"
                    onChange={(v) => write({ ...a, offensive: v === "yes" ? true : v === "no" ? false : undefined }, "offensive")}
                  />
                </div>
              </Field>
              {a.special && (
                <Field label="Special">
                  <span class="dim">{SPECIAL[a.special] ?? a.special} (a rule of the game, not editable)</span>
                </Field>
              )}
            </div>
          </div>
        </Box>
        <Section title="Use in battle" on={!!a.battle} hint="Chosen from the ability menu in battle" onToggle={(on) => write({ ...a, battle: on ? { target: "enemy", effects: [] } : undefined }, on ? "battle use" : "no battle use")}>
          {a.battle && <BattleUseFields use={a.battle} raw={raw} onChange={setBattle} enemySkills={enemySkill} />}
        </Section>
        <Section title="Use on the board" on={!!a.board} hint="Used on the board, on a cell in range" onToggle={(on) => write({ ...a, board: on ? { range: "lib:adjacent", targets: ["enemy"], effects: [] } : undefined }, on ? "board use" : "no board use")}>
          {a.board && <BoardUseFields use={a.board} project={project} onChange={setBoard} />}
        </Section>
      </fieldset>
      {iconPicker && (
        <IconPicker
          value={a.icon}
          onPick={(icon) => {
            write({ ...a, icon }, "icon");
            setIconPicker(false);
          }}
          onClose={() => setIconPicker(false)}
        />
      )}
    </div>
  );
}
