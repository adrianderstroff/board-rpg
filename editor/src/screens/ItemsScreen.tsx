import { useState } from "preact/hooks";
import type { RawContent } from "../../../src/core/data/database";
import { ELEMENTS, STAT_KEYS, type BattleUse, type BoardUse, type EquipDef, type ItemCategory, type StatKey } from "../../../src/core/data/types";
import { editEntry, isOverridden, revertToLibrary } from "../overrides";
import { optionsOf } from "../forms/EffectList";
import { Check, Field, MultiPick, Num, Percent, Select, Text } from "../forms/fields";
import { IconPicker, ItemIcon } from "../forms/IconPicker";
import { BattleUseFields, BoardUseFields } from "../forms/UseFields";
import { writeEntry } from "../forms/entries";
import { ContentList, EntryActions } from "../forms/ContentList";
import { Section } from "../forms/Section";
import { CATEGORIES, EMPTY_ITEM, ITEMS_FILE, PRESETS, SLOTS, addItem, categoryIsAuto, categoryLabel, deleteItem, deriveCategory, itemSummary, withChange, type Item } from "../items/model";
import { usePersistentState } from "../persist";
import type { Project } from "../project";
import { EntryReferences, usedIn } from "../forms/References";
import type { UsageTarget } from "../references";


/**
 * Items (editor-design §8): the list (grouped by category, the library's marked), one form with a
 * box per section in the middle, the item as the game shows it in the inspector.
 */

const STAT_LABEL: Record<StatKey, string> = { maxHp: "HP", maxMp: "MP", str: "STR", def: "DEF", mag: "MAG", mdef: "MDEF", spd: "SPD" };


export function ItemsScreen({ project, goTo }: { project: Project; goTo: (t: UsageTarget) => void }) {
  const [selected, select] = usePersistentState<string | null>("items.selected", null);
  const raw = project.content.raw;
  const items = raw.items as Record<string, Item>;
  const dirty = project.dirtyPaths().includes(ITEMS_FILE);
  const current = selected && items[selected] ? selected : null;
  const create = (item: Item, label: string) => select(addItem(project, item, label));

  return (
    <>
      <main class="main">
        <div class="split">
          <ContentList
            entries={Object.entries(items).map(([id, i]) => ({ id, name: i.name, pic: <ItemIcon icon={i.icon} scale={1} />, group: categoryLabel(i.category), dirty: dirty && (!id.startsWith("lib:") || isOverridden(project, "items", id)), changed: isOverridden(project, "items", id) }))}
            groups={CATEGORIES.map(([, label]) => label)}
            selected={current}
            onSelect={select}
            searchKey="items.filter"
            placeholder="Search items…"
            newTitle="A new item of the project: empty, or from a preset"
            newOptions={[
              { label: "Empty", make: () => create(EMPTY_ITEM, "New item") },
              ...PRESETS.map((p, i) => ({ label: p.label, title: itemSummary(p.item).join("\n"), divider: i === 0, make: () => create(p.item, `New ${p.label.toLowerCase()}`) })),
            ]}
          />
          <div class="form-scroll">{current ? <ItemForm project={project} id={current} /> : <p class="placeholder">Select an item, or make one with New.</p>}</div>
        </div>
      </main>
      <aside class="inspector">
        {current ? (
          <ItemCard project={project} id={current} onSelect={select} goTo={goTo} />
        ) : (
          <p class="hint">Items the party can carry: potions, equipment, scrolls, quest items (editor-design §8).</p>
        )}
      </aside>
    </>
  );
}

/** The item as the game shows it, what it does in words, and what can be done with it. */
function ItemCard({ project, id, onSelect, goTo }: { project: Project; id: string; onSelect: (id: string | null) => void; goTo: (t: UsageTarget) => void }) {
  const raw = project.content.raw;
  const item = raw.items[id] as Item;
  const nameOf = (c: "abilities" | "classes" | "statuses", x: string) => (raw[c] as Record<string, { name?: string }>)[x]?.name ?? x.replace(/^lib:/, "");
  return (
    <div class="item-card">
      <div class="item-card-head">
        <ItemIcon icon={item.icon} scale={3} />
        <div>
          <h3>{item.name}</h3>
          <div class="dim">
            {categoryLabel(item.category)} · {item.category === "key" ? "can't be sold" : `${item.price} G`}
          </div>
        </div>
      </div>
      {item.description && <p class="item-text">{item.description}</p>}
      <ul class="summary">
        {itemSummary(item, nameOf).map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <EntryReferences project={project} collection="items" id={id} goTo={goTo} onRenamed={onSelect} />
      <EntryActions
        id={id}
        used={usedIn(project, "items", id)}
        changed={isOverridden(project, "items", id)}
        onRevert={() => void revertToLibrary(project, "items", id)}
        onDuplicate={() => onSelect(addItem(project, { ...structuredClone(item), name: `${item.name} copy` }, `Duplicate ${id}`))}
        onDelete={() => {
          if (!confirm(`Delete ${item.name} (${id})?`)) return;
          deleteItem(project, id);
          onSelect(null);
        }}
      />
    </div>
  );
}

/** Equipment kinds the content knows: the classes' lists and the items' own. */
function equipKinds(raw: RawContent): string[] {
  const kinds = new Set<string>();
  for (const c of Object.values(raw.classes)) for (const k of c.equip ?? []) kinds.add(k);
  for (const i of Object.values(raw.items)) if (i.equip?.kind) kinds.add(i.equip.kind);
  return [...kinds].sort();
}

function ItemForm({ project, id }: { project: Project; id: string }) {
  const [iconPicker, setIconPicker] = useState(false);
  const raw = project.content.raw;
  const item = raw.items[id] as Item;

  /** Writes the top-level fields that changed (the rest of the entry keeps its formatting). */
  const write = (next: Item, label: string, group?: string) => {
    editEntry(project, "items", id, `${item.name}: ${label}`, () => writeEntry(project, ITEMS_FILE, id, item, next, `${item.name}: ${label}`, group));
  };
  /** A change to the sections: the category follows while it is the derived one. */
  const change = (next: Item, label: string, group?: string) => write(withChange(item, next), label, group);
  const auto = categoryIsAuto(item);

  const equip = item.equip;
  const setEquip = (e: EquipDef, label: string, group?: string) => change({ ...item, equip: e }, label, group);
  const battle = item.battle;
  const setBattle = (b: BattleUse, label: string, group?: string) => change({ ...item, battle: b }, label, group);
  const board = item.board;
  const setBoard = (b: BoardUse, label: string, group?: string) => change({ ...item, board: b }, label, group);
  const statusOptions = optionsOf(raw.statuses);

  return (
    <div class="item-form">
      <fieldset>
        <section class="form-section on">
          <div class="form-section-head">
            <h3>Basics</h3>
            <span class="dim">{id}</span>
          </div>
          <div class="form-section-body">
            <div class="basics">
              <button class="icon-pick" title="Pick the icon" onClick={() => setIconPicker(true)}>
                <ItemIcon icon={item.icon} scale={3} />
              </button>
              <div>
                <Field label="Name">
                  <Text value={item.name} onChange={(v) => write({ ...item, name: v ?? "" }, "name", "name")} />
                </Field>
                <Field label="Text">
                  <textarea rows={2} value={item.description ?? ""} placeholder="What the game shows about it" onInput={(e) => write({ ...item, description: e.currentTarget.value || undefined }, "text", "description")} />
                </Field>
                <Field label="Price">
                  <div class="row">
                    <Num value={item.price} min={0} width={80} onChange={(v) => write({ ...item, price: v ?? 0 }, "price", "price")} /> G
                    <span class="spacer" />
                    <Check
                      value={item.category === "key"}
                      label="Quest item"
                      onChange={(v) => write({ ...item, category: v ? "key" : deriveCategory(item) }, v ? "quest item" : "not a quest item")}
                    />
                  </div>
                </Field>
                <Field label="Category">
                  <div class="row">
                    <Select value={item.category} options={CATEGORIES} onChange={(v) => write({ ...item, category: (v ?? "consumable") as ItemCategory }, "category")} title="Which inventory tab and shop sign it gets" />
                    {item.category === "key" ? (
                      <span class="dim">can't be sold</span>
                    ) : auto ? (
                      <span class="dim" title="Follows the sections below">automatic</span>
                    ) : (
                      <button title={`The sections make it a ${categoryLabel(deriveCategory(item)).toLowerCase()}`} onClick={() => write({ ...item, category: deriveCategory(item) }, "automatic category")}>
                        Automatic
                      </button>
                    )}
                  </div>
                </Field>
              </div>
            </div>
          </div>
        </section>

        <Section title="Equipment" on={!!equip} hint="Worn by a hero: weapon, armor or accessory" onToggle={(on) => change({ ...item, equip: on ? { slot: "weapon", kind: equipKinds(raw)[0] ?? "sword" } : undefined }, on ? "equipment" : "no equipment")}>
          {equip && (
            <>
              <Field label="Slot">
                <div class="row">
                  <Select value={equip.slot} options={SLOTS} onChange={(v) => setEquip({ ...equip, slot: (v ?? "weapon") as EquipDef["slot"] }, "slot")} />
                  <span class="dim">kind</span>
                  <input list="equip-kinds" value={equip.kind} title="Which classes can wear it (their equipment kinds)" onInput={(e) => setEquip({ ...equip, kind: e.currentTarget.value }, "kind", "kind")} />
                  <datalist id="equip-kinds">
                    {equipKinds(raw).map((k) => (
                      <option key={k} value={k} />
                    ))}
                  </datalist>
                </div>
              </Field>
              <Field label="Stats">
                <div class="stat-grid">
                  {STAT_KEYS.map((k) => (
                    <label key={k}>
                      <span>{STAT_LABEL[k]}</span>
                      <Num value={equip.stats?.[k]} width={56} onChange={(v) => setEquip({ ...equip, stats: { ...equip.stats, [k]: v } }, STAT_LABEL[k], `stat.${k}`)} />
                    </label>
                  ))}
                </div>
              </Field>
              {equip.slot === "weapon" && (
                <Field label="Element">
                  <Select value={equip.element} options={ELEMENTS.map((e) => [e, e])} empty="none" onChange={(v) => setEquip({ ...equip, element: v as EquipDef["element"] }, "element")} />
                </Field>
              )}
              <Field label="Grants">
                <MultiPick value={equip.grants} options={optionsOf(raw.abilities)} onChange={(v) => setEquip({ ...equip, grants: v }, "granted abilities")} addLabel="+ ability while equipped" />
              </Field>
              <Field label="On hit">
                <div class="row">
                  <Select value={equip.onHit?.status} options={statusOptions} empty="nothing" onChange={(v) => setEquip({ ...equip, onHit: v ? { status: v, chance: equip.onHit?.chance ?? 0.2 } : undefined }, "on hit")} />
                  {equip.onHit && (
                    <>
                      <Percent value={equip.onHit.chance} width={56} onChange={(v) => setEquip({ ...equip, onHit: { ...equip.onHit!, chance: v ?? 0 } }, "on-hit chance", "onHit")} /> %
                    </>
                  )}
                </div>
              </Field>
              <Field label="Immune to">
                <MultiPick value={equip.immune} options={statusOptions} onChange={(v) => setEquip({ ...equip, immune: v }, "immunities")} addLabel="+ status" />
              </Field>
            </>
          )}
        </Section>

        <Section title="Use in battle" on={!!battle} hint="Used from the Item menu in battle" onToggle={(on) => change({ ...item, battle: on ? { target: "ally", effects: [] } : undefined }, on ? "battle use" : "no battle use")}>
          {battle && <BattleUseFields use={battle} raw={raw} onChange={setBattle} />}
        </Section>

        <Section title="Use on the board" on={!!board} hint="Used on the board, on a cell in range" onToggle={(on) => change({ ...item, board: on ? { range: "lib:adjacent", targets: ["hero"], effects: [] } : undefined }, on ? "board use" : "no board use")}>
          {board && <BoardUseFields use={board} project={project} onChange={setBoard} />}
        </Section>

        <Section title="Teaches an ability" on={!!item.learn} hint="A scroll: using it teaches an ability" onToggle={(on) => change({ ...item, learn: on ? { ability: "", classes: [] } : undefined }, on ? "teaches" : "teaches nothing")}>
          {item.learn && (
            <>
              <Field label="Ability">
                <Select value={item.learn.ability || undefined} options={optionsOf(raw.abilities)} empty="(pick an ability)" onChange={(v) => change({ ...item, learn: { ...item.learn!, ability: v ?? "" } }, "taught ability")} />
              </Field>
              <Field label="Classes" hint="Who can learn it from the scroll">
                <MultiPick value={item.learn.classes} options={optionsOf(raw.classes)} onChange={(v) => change({ ...item, learn: { ...item.learn!, classes: v } }, "classes")} addLabel="+ class" />
              </Field>
            </>
          )}
        </Section>
      </fieldset>
      {iconPicker && (
        <IconPicker
          value={item.icon}
          onPick={(icon) => {
            write({ ...item, icon }, "icon");
            setIconPicker(false);
          }}
          onClose={() => setIconPicker(false)}
        />
      )}
    </div>
  );
}


