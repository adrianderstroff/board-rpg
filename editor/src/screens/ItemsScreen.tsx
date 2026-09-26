import type { ComponentChildren } from "preact";
import { useState } from "preact/hooks";
import type { Document } from "yaml";
import type { RawContent } from "../../../src/core/data/database";
import { ELEMENTS, STAT_KEYS, type BattleUse, type BoardUse, type EquipDef, type ItemCategory, type PatternRef, type StatKey } from "../../../src/core/data/types";
import iconIndex from "../../../public/assets/system/icons.json";
import { copyEntryToProject } from "../copyToProject";
import { EffectList, optionsOf } from "../forms/EffectList";
import { Check, Field, MultiPick, Num, Select, Text } from "../forms/fields";
import { FloatingWindow } from "../forms/FloatingWindow";
import { BATTLE_TARGETS, BOARD_TARGETS, CATEGORIES, EMPTY_ITEM, ITEMS_FILE, PRESETS, SLOTS, addItem, categoryIsAuto, categoryLabel, deleteItem, deriveCategory, itemSummary, withChange, type Item } from "../items/model";
import { patternOffsets } from "../items/patterns";
import { frameStyle } from "../map/sprites";
import { usePersistentState } from "../persist";
import type { Project } from "../project";

/**
 * Items (editor-design §8): the list (grouped by category, the library's marked), one form with a
 * box per section in the middle, the item as the game shows it in the inspector.
 */

const ICONS = iconIndex as Record<string, number>;
const STAT_LABEL: Record<StatKey, string> = { maxHp: "HP", maxMp: "MP", str: "STR", def: "DEF", mag: "MAG", mdef: "MDEF", spd: "SPD" };

/**
 * Drops unset fields and empty objects – but keeps empty lists: a use section always has its
 * effects (and targets), even before the first one is added.
 */
function tidy(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(tidy);
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) {
      const t = tidy(x);
      if (t === undefined || (t && typeof t === "object" && !Array.isArray(t) && !Object.keys(t).length)) continue;
      out[k] = t;
    }
    return out;
  }
  return v;
}

/** A section as the files write it: on one line when short, else one line per field. */
function flowNode(doc: Document, v: object) {
  const node = doc.createNode(v) as unknown as { flow?: boolean; items?: { value?: { flow?: boolean } | null }[] };
  if (JSON.stringify(v).length < 90) node.flow = true;
  else for (const pair of node.items ?? []) if (pair.value && typeof pair.value === "object") pair.value.flow = true;
  return node;
}

/** A 16px icon of the game's icon sheet (system/icons.png), scaled. */
export function ItemIcon({ icon, scale = 2 }: { icon?: string; scale?: number }) {
  const frame = icon === undefined ? undefined : ICONS[icon];
  if (frame === undefined) return <span class="item-icon none" style={{ width: 16 * scale, height: 16 * scale }} />;
  return <span class="item-icon" style={frameStyle("system/icons.png", 16, 16, 16, frame, scale)} />;
}

export function ItemsScreen({ project }: { project: Project }) {
  const [selected, select] = usePersistentState<string | null>("items.selected", null);
  const [filter, setFilter] = usePersistentState("items.filter", "");
  const [newMenu, setNewMenu] = useState(false);
  const raw = project.content.raw;
  const items = raw.items as Record<string, Item>;
  const dirty = project.dirtyPaths().includes(ITEMS_FILE);
  const shown = Object.entries(items).filter(([id, i]) => `${id} ${i.name}`.toLowerCase().includes(filter.toLowerCase()));
  const current = selected && items[selected] ? selected : null;

  const create = (item: Item, label: string) => {
    setNewMenu(false);
    select(addItem(project, item, label));
  };

  return (
    <>
      <main class="main">
        <div class="split">
          <div class="list">
            <div class="list-head">
              <input class="search" placeholder="Search items…" value={filter} onInput={(e) => setFilter(e.currentTarget.value)} />
              <div class="menu-anchor">
                <button class="primary" aria-haspopup="menu" aria-expanded={newMenu} title="A new item of the project: empty, or from a preset" onClick={() => setNewMenu(!newMenu)}>
                  New ▾
                </button>
                {newMenu && (
                  <div class="menu" role="menu">
                    <button role="menuitem" onClick={() => create(EMPTY_ITEM, "New item")}>
                      Empty
                    </button>
                    <hr />
                    {PRESETS.map((p) => (
                      <button key={p.id} role="menuitem" title={itemSummary(p.item).join("\n")} onClick={() => create(p.item, `New ${p.label.toLowerCase()}`)}>
                        {p.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            {CATEGORIES.map(([cat, label]) => {
              // the project's own first, then the library's
              const group = shown.filter(([, i]) => i.category === cat).sort(([a], [b]) => Number(a.startsWith("lib:")) - Number(b.startsWith("lib:")));
              if (!group.length) return null;
              return (
                <div key={cat}>
                  <h4 class="list-group">{label}</h4>
                  {group.map(([id, i]) => (
                    <div key={id} class={`item ${current === id ? "active" : ""}`} title={id} onClick={() => select(id)}>
                      <span class="item-name">
                        <ItemIcon icon={i.icon} scale={1} />
                        {i.name}
                        {!id.startsWith("lib:") && dirty && <span class="dirty"> ●</span>}
                      </span>
                      {id.startsWith("lib:") && <small>library</small>}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
          <div class="form-scroll">{current ? <ItemForm project={project} id={current} /> : <p class="placeholder">Select an item, or make one with New.</p>}</div>
        </div>
      </main>
      <aside class="inspector">
        {current ? (
          <ItemCard project={project} id={current} onSelect={select} />
        ) : (
          <p class="hint">Items the party can carry: potions, equipment, scrolls, quest items (editor-design §8).</p>
        )}
      </aside>
    </>
  );
}

/** The item as the game shows it, what it does in words, and what can be done with it. */
function ItemCard({ project, id, onSelect }: { project: Project; id: string; onSelect: (id: string | null) => void }) {
  const raw = project.content.raw;
  const item = raw.items[id] as Item;
  const lib = id.startsWith("lib:");
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
      <p class="hint">{lib ? `Library content (${project.info.library}) – read-only. Referenced as ${id}.` : `Referenced as ${id}.`}</p>
      <div class="row wrap">
        {lib && (
          <button class="primary" title="An editable copy in the project; the project's references to it use the copy from then on" onClick={() => onSelect(copyEntryToProject(project, "items", id))}>
            Copy to project
          </button>
        )}
        <button title="A copy of this item in the project, with a new id" onClick={() => onSelect(addItem(project, { ...structuredClone(item), name: `${item.name} copy` }, `Duplicate ${id}`))}>
          Duplicate
        </button>
        {!lib && (
          <button
            onClick={() => {
              if (!confirm(`Delete ${item.name} (${id})? Content that uses it will show problems.`)) return;
              deleteItem(project, id);
              onSelect(null);
            }}
          >
            Delete
          </button>
        )}
      </div>
    </div>
  );
}

/** A section of the form: a switch in its heading adds or removes it. */
function Section({ title, on, onToggle, children, hint }: { title: string; on: boolean; onToggle: (on: boolean) => void; children: ComponentChildren; hint?: string }) {
  return (
    <section class={`form-section ${on ? "on" : ""}`}>
      <label class="form-section-head" title={hint}>
        <input type="checkbox" checked={on} onChange={(e) => onToggle(e.currentTarget.checked)} />
        <h3>{title}</h3>
      </label>
      {on && <div class="form-section-body">{children}</div>}
    </section>
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
  const lib = id.startsWith("lib:");

  /** Writes the top-level fields that changed (the rest of the entry keeps its formatting). */
  const write = (next: Item, label: string, group?: string) => {
    if (lib) return;
    const keys = [...new Set([...Object.keys(item), ...Object.keys(next)])] as (keyof Item)[];
    const changed = keys.filter((k) => JSON.stringify(item[k]) !== JSON.stringify(next[k]));
    if (!changed.length) return;
    project.edit(ITEMS_FILE, `${item.name}: ${label}`, (doc: Document) => {
      for (const k of changed) {
        const v = tidy(next[k]);
        if (v === undefined || v === "") doc.deleteIn([id, k]);
        else doc.setIn([id, k], v && typeof v === "object" ? flowNode(doc, v) : v);
      }
    }, group ? `${id}.${group}` : undefined);
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
      {lib && (
        <div class="banner">
          Library item – read-only. <b>Copy to project</b> (on the right) makes an editable copy.
        </div>
      )}
      <fieldset disabled={lib}>
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
                  <Select value={equip.onHit?.status} options={statusOptions} empty="nothing" onChange={(v) => setEquip({ ...equip, onHit: v ? { status: v, chance: equip.onHit?.chance ?? 20 } : undefined }, "on hit")} />
                  {equip.onHit && (
                    <>
                      <Num value={equip.onHit.chance} min={0} max={100} width={56} onChange={(v) => setEquip({ ...equip, onHit: { ...equip.onHit!, chance: v ?? 0 } }, "on-hit chance", "onHit")} /> %
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
          {battle && (
            <>
              <Field label="Target">
                <Select value={battle.target} options={BATTLE_TARGETS} onChange={(v) => setBattle({ ...battle, target: (v ?? "ally") as BattleUse["target"] }, "battle target")} />
              </Field>
              <Field label="Effects">
                <EffectList value={battle.effects ?? []} raw={raw} onChange={(v) => setBattle({ ...battle, effects: v }, "battle effects", "battle.effects")} />
              </Field>
            </>
          )}
        </Section>

        <Section title="Use on the board" on={!!board} hint="Used on the board, on a cell in range" onToggle={(on) => change({ ...item, board: on ? { range: "lib:adjacent", targets: ["hero"], effects: [] } : undefined }, on ? "board use" : "no board use")}>
          {board && (
            <>
              <Field label="Range">
                <PatternField value={board.range} project={project} onChange={(v) => setBoard({ ...board, range: v ?? "lib:adjacent" }, "range")} />
              </Field>
              <Field label="Area">
                <PatternField value={board.area} project={project} empty="the target cell" onChange={(v) => setBoard({ ...board, area: v }, "area")} />
              </Field>
              <Field label="Targets">
                <div class="row wrap">
                  {BOARD_TARGETS.map(([t, label]) => (
                    <Check
                      key={t}
                      label={label}
                      value={(board.targets ?? []).includes(t)}
                      onChange={(v) => setBoard({ ...board, targets: v ? [...(board.targets ?? []), t] : (board.targets ?? []).filter((x) => x !== t) }, "targets")}
                    />
                  ))}
                </div>
                <Check value={board.wildOnly} label="Only on wild boards" onChange={(v) => setBoard({ ...board, wildOnly: v }, "wild boards only")} />
              </Field>
              <Field label="Effects">
                <EffectList value={board.effects ?? []} raw={raw} onChange={(v) => setBoard({ ...board, effects: v }, "board effects", "board.effects")} />
              </Field>
            </>
          )}
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

/** The game's icons (system/icons.png) to pick from; status and sign icons last. */
function IconPicker({ value, onPick, onClose }: { value?: string; onPick: (icon: string | undefined) => void; onClose: () => void }) {
  const names = Object.keys(ICONS).sort((a, b) => Number(/^(status|type|sign)_/.test(a)) - Number(/^(status|type|sign)_/.test(b)) || ICONS[a] - ICONS[b]);
  return (
    <FloatingWindow id="icon-picker" title="Pick an icon" onClose={onClose} size={{ w: 420, h: 380 }}>
      <div class="icon-grid">
        <button class={value ? "" : "on"} title="No icon" onClick={() => onPick(undefined)}>
          <ItemIcon scale={2} />
        </button>
        {names.map((n) => (
          <button key={n} class={value === n ? "on" : ""} title={n} onClick={() => onPick(n)}>
            <ItemIcon icon={n} scale={2} />
          </button>
        ))}
      </div>
    </FloatingWindow>
  );
}

/** A pattern (a range or an area) from the content's patterns, with its cells around the user. */
function PatternField({ value, onChange, project, empty }: { value: PatternRef | undefined; onChange: (v: string | undefined) => void; project: Project; empty?: string }) {
  const raw = project.content.raw;
  const db = project.content.db;
  if (value !== undefined && typeof value !== "string") return <span class="dim">custom (edit in YAML)</span>;
  const cells = db && value ? patternOffsets(db, value, 9) : null;
  const on = new Set(cells?.map((c) => `${c.x},${c.y}`));
  return (
    <div class="pattern-field">
      <Select value={value} options={optionsOf(raw.patterns)} empty={empty} onChange={onChange} />
      {cells && (
        <div class="pattern-preview" title="The cells it reaches from the user (the dot) on open, flat ground">
          {Array.from({ length: 81 }, (_, i) => {
            const x = (i % 9) - 4;
            const y = Math.floor(i / 9) - 4;
            return <span key={i} class={`${on.has(`${x},${y}`) ? "on" : ""} ${x === 0 && y === 0 ? "me" : ""}`} />;
          })}
        </div>
      )}
    </div>
  );
}
