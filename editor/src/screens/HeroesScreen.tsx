import type { Document } from "yaml";
import type { RawContent } from "../../../src/core/data/database";
import { STAT_KEYS, type EquipSlot, type Stats } from "../../../src/core/data/types";
import { classUsers, CLASSES_FILE, CONFIG_FILE, header, HEROES_FILE, heroStatTable, newClass, newHero, TABLE_LEVELS, type Hero, type Klass } from "../characters/model";
import { FacePreview, GraphicField, PosePreview, WalkPreview } from "../characters/Graphics";
import { StatInputs, StatTable } from "../characters/StatFields";
import { copyEntryToProject } from "../copyToProject";
import { ContentList, EntryActions } from "../forms/ContentList";
import { optionsOf } from "../forms/EffectList";
import { addEntry, deleteEntry, writeEntry } from "../forms/entries";
import { Check, Field, ListEditor, MultiPick, Num, Select, Text } from "../forms/fields";
import { PatternField } from "../forms/PatternField";
import { Box } from "../forms/Section";
import { SLOTS } from "../items/model";
import { assetUrl as assetUrlOf } from "../map/sprites";
import { usePersistentState } from "../persist";
import type { Project } from "../project";

/**
 * Heroes (editor-design §7.1): a hero and its class on one page – who it is, how it looks, its
 * class's stats (with the values by level), abilities, movement and equipment, and whether it is in
 * the starting party.
 */

const plain = (id: string) => id.replace(/^lib:/, "");

/** The starting party (config.yaml). */
const startParty = (project: Project): string[] => project.data<{ start?: { party?: string[] } }>(CONFIG_FILE)?.start?.party ?? [];

function setInParty(project: Project, id: string, on: boolean) {
  const party = startParty(project).filter((h) => h !== id);
  project.edit(CONFIG_FILE, on ? `${id} joins the starting party` : `${id} leaves the starting party`, (doc: Document) =>
    doc.setIn(["start", "party"], doc.createNode(on ? [...party, id] : party, { flow: true })),
  );
}

/** All seven stats, empty ones as 0 (a class needs every value). */
const filled = (v: Partial<Stats>): Stats => Object.fromEntries(STAT_KEYS.map((k) => [k, v[k] ?? 0])) as Stats;

/** Equipment kinds the content knows: the classes' lists and the items' own. */
function equipKinds(raw: RawContent): [string, string][] {
  const kinds = new Set<string>();
  for (const c of Object.values(raw.classes)) for (const k of c.equip ?? []) kinds.add(k);
  for (const i of Object.values(raw.items)) if (i.equip?.kind) kinds.add(i.equip.kind);
  return [...kinds].sort().map((k) => [k, k]);
}

export function HeroesScreen({ project }: { project: Project }) {
  const [selected, select] = usePersistentState<string | null>("heroes.selected", null);
  const raw = project.content.raw;
  const heroes = raw.heroes as Record<string, Hero>;
  const current = selected && heroes[selected] ? selected : null;
  const dirty = project.dirtyPaths().includes(HEROES_FILE);
  const party = startParty(project);
  return (
    <>
      <main class="main">
        <div class="split">
          <ContentList
            entries={Object.entries(heroes).map(([id, h]) => ({ id, name: h.name, pic: <FaceThumb raw={raw} face={h.face} />, group: party.includes(id) ? "Starting party" : "Others", dirty: dirty && !id.startsWith("lib:") }))}
            groups={["Starting party", "Others"]}
            selected={current}
            onSelect={select}
            searchKey="heroes.filter"
            placeholder="Search heroes…"
            newTitle="A new hero of the project"
            newOptions={[{ label: "New hero", make: () => select(addEntry(project, HEROES_FILE, header("heroes"), newHero(raw), (x) => x in project.content.raw.heroes, "New hero", "hero")) }]}
          />
          <div class="form-scroll">{current ? <HeroForm project={project} id={current} /> : <p class="placeholder">Select a hero, or make one with New.</p>}</div>
        </div>
      </main>
      <aside class="inspector">{current ? <HeroCard project={project} id={current} onSelect={select} /> : <p class="hint">The heroes the player can have in the party (editor-design §7.1).</p>}</aside>
    </>
  );
}

function FaceThumb({ raw, face }: { raw: RawContent; face?: string }) {
  const f = face ? raw.graphics.faces[face] : undefined;
  return f ? <img class="list-face" src={assetUrlOf(f.image)} alt="" /> : <span class="list-face none" />;
}

function HeroCard({ project, id, onSelect }: { project: Project; id: string; onSelect: (id: string | null) => void }) {
  const raw = project.content.raw;
  const hero = raw.heroes[id] as Hero;
  const cls = raw.classes[hero.classId] as Klass | undefined;
  const db = project.content.db;
  const stats = db ? heroStatTable(db, id, [hero.level])[0]?.stats : undefined;
  return (
    <div class="item-card">
      <div class="item-card-head">
        <FacePreview graphics={raw.graphics} face={hero.face} />
      </div>
      <h3>{hero.name}</h3>
      <div class="dim">
        {cls?.name ?? plain(hero.classId)} · level {hero.level}
      </div>
      {hero.description && <p class="item-text">{hero.description}</p>}
      <WalkPreview graphics={raw.graphics} charset={hero.charset} />
      <PosePreview graphics={raw.graphics} battler={hero.battler} />
      {stats && <StatTable rows={[{ level: hero.level, stats }]} />}
      <p class="hint">{id.startsWith("lib:") ? `Library content (${project.info.library}) – read-only. Referenced as ${id}.` : `Referenced as ${id}.`}</p>
      <EntryActions
        id={id}
        onCopy={() => onSelect(copyEntryToProject(project, "heroes", id))}
        onDuplicate={() => onSelect(addEntry(project, HEROES_FILE, header("heroes"), { ...structuredClone(hero), name: `${hero.name} copy` }, (x) => x in project.content.raw.heroes, `Duplicate ${id}`, "hero"))}
        onDelete={() => {
          if (!confirm(`Delete ${hero.name} (${id})? Content that uses it will show problems.`)) return;
          project.transaction(`Delete ${id}`, () => {
            if (startParty(project).includes(id)) setInParty(project, id, false);
            deleteEntry(project, HEROES_FILE, id);
          });
          onSelect(null);
        }}
      />
    </div>
  );
}

function HeroForm({ project, id }: { project: Project; id: string }) {
  const raw = project.content.raw;
  const hero = raw.heroes[id] as Hero;
  const lib = id.startsWith("lib:");
  const write = (next: Hero, label: string, group?: string) => !lib && writeEntry(project, HEROES_FILE, id, hero, next, `${hero.name}: ${label}`, group);
  const cls = raw.classes[hero.classId] as Klass | undefined;
  const inParty = startParty(project).includes(id);

  /** Items that fit a slot and the class's equipment kinds. */
  const equipOptions = (slot: EquipSlot): [string, string][] =>
    Object.entries(raw.items)
      .filter(([, i]) => i.equip?.slot === slot && (!cls || cls.equip.includes(i.equip.kind)))
      .map(([iid, i]) => [iid, `${i.name} (${plain(iid)})`]);

  return (
    <div class="item-form">
      {lib && (
        <div class="banner">
          Library hero – read-only. <b>Copy to project</b> (on the right) makes an editable copy.
        </div>
      )}
      <Box title="Hero" aside={<span class="dim">{id}</span>}>
        {/* the starting party is the project's (config.yaml): also for the library's heroes */}
        <Field label="Party">
          <Check value={inParty} label="In the starting party" onChange={(v) => setInParty(project, id, !!v)} />
        </Field>
        <fieldset disabled={lib}>
          <Field label="Name">
            <Text value={hero.name} onChange={(v) => write({ ...hero, name: v ?? "" }, "name", "name")} />
          </Field>
          <Field label="Text">
            <textarea rows={2} value={hero.description ?? ""} onInput={(e) => write({ ...hero, description: e.currentTarget.value || undefined }, "text", "description")} />
          </Field>
          <Field label="Class">
            <div class="row">
              <Select value={hero.classId} options={optionsOf(raw.classes)} onChange={(v) => v && write({ ...hero, classId: v }, "class")} />
              <button
                title="A new class of the project for this hero, starting from the current one"
                onClick={() => {
                  const base = cls ? { ...structuredClone(cls), name: `${hero.name}'s class` } : newClass(`${hero.name}'s class`);
                  project.transaction(`New class for ${hero.name}`, () => {
                    const cid = addEntry(project, CLASSES_FILE, header("classes"), base, (x) => x in project.content.raw.classes, "New class", "class");
                    writeEntry(project, HEROES_FILE, id, hero, { ...hero, classId: cid }, `${hero.name}: class`);
                  });
                }}
              >
                New class
              </button>
            </div>
          </Field>
          <Field label="Start level">
            <Num value={hero.level} min={1} max={99} onChange={(v) => write({ ...hero, level: v ?? 1 }, "start level", "level")} />
          </Field>
        </fieldset>
      </Box>

      <fieldset disabled={lib}>
        <Box title="Graphics">
          <div class="graphics-row">
            <Field label="Board">
              <GraphicField graphics={raw.graphics} kind="charsets" value={hero.charset} onChange={(v) => v && write({ ...hero, charset: v }, "board sprite")} />
            </Field>
            <Field label="Battle">
              <GraphicField graphics={raw.graphics} kind="battlers" value={hero.battler} optional onChange={(v) => write({ ...hero, battler: v }, "battle sprite")} />
            </Field>
            <Field label="Face">
              <GraphicField graphics={raw.graphics} kind="faces" value={hero.face} optional onChange={(v) => write({ ...hero, face: v }, "face")} />
            </Field>
          </div>
        </Box>

        <Box title="Start equipment">
          {SLOTS.map(([slot, label]) => (
            <Field key={slot} label={label}>
              <Select value={hero.equipment?.[slot]} options={equipOptions(slot)} empty="nothing" onChange={(v) => write({ ...hero, equipment: { ...hero.equipment, [slot]: v } }, `${slot}`)} />
            </Field>
          ))}
          <p class="hint">Only what the class can wear is offered ({cls ? cls.equip.join(", ") : "no class"}).</p>
        </Box>
      </fieldset>

      {cls && <ClassBox project={project} classId={hero.classId} heroId={id} />}
    </div>
  );
}

/** The hero's class: shared by every hero of it (a banner says so), the library's read-only. */
function ClassBox({ project, classId, heroId }: { project: Project; classId: string; heroId: string }) {
  const raw = project.content.raw;
  const cls = raw.classes[classId] as Klass;
  const lib = classId.startsWith("lib:");
  const write = (next: Klass, label: string, group?: string) => !lib && writeEntry(project, CLASSES_FILE, classId, cls, next, `${cls.name}: ${label}`, group);
  const others = classUsers(raw, classId).filter((h) => h !== heroId);
  const db = project.content.db;
  const hero = raw.heroes[heroId] as Hero;
  const table = db ? heroStatTable(db, heroId, [...new Set([...TABLE_LEVELS, hero.level])].sort((a, b) => a - b)) : [];
  const abilities = [...cls.abilities].sort((a, b) => a.level - b.level);
  return (
    <Box title={`Class: ${cls.name}`} aside={<span class="dim">{classId}</span>}>
      {lib && (
        <div class="banner">
          Library class – read-only.{" "}
          <button disabled={heroId.startsWith("lib:")} title={heroId.startsWith("lib:") ? "Copy the hero to the project first" : "An editable copy; the project's heroes of this class use the copy"} onClick={() => copyEntryToProject(project, "classes", classId)}>
            Copy class to project
          </button>
        </div>
      )}
      {others.length > 0 && <div class="banner">Shared: editing the {cls.name} class changes {others.map((h) => (raw.heroes[h] as Hero).name).join(", ")} too.</div>}
      <fieldset disabled={lib}>
        <Field label="Name">
          <Text value={cls.name} onChange={(v) => write({ ...cls, name: v ?? "" }, "name", "name")} />
        </Field>
        <Field label="Text">
          <textarea rows={2} value={cls.description ?? ""} onInput={(e) => write({ ...cls, description: e.currentTarget.value || undefined }, "text", "description")} />
        </Field>
        <Field label="Abilities">
          <div class="row">
            <span class="dim">called</span>
            <Text value={cls.abilityType} placeholder="Magic, Sword Art, Skill…" onChange={(v) => write({ ...cls, abilityType: v ?? "" }, "ability type", "abilityType")} />
          </div>
        </Field>
        <Field label="Learns">
          <ListEditor
            items={abilities}
            onChange={(v) => write({ ...cls, abilities: [...v].sort((a, b) => a.level - b.level) }, "abilities by level", "abilities")}
            add={() => ({ level: Math.max(1, ...abilities.map((a) => a.level)), ability: Object.keys(raw.abilities)[0] ?? "" })}
            addLabel="+ Ability"
            render={(a, set) => (
              <div class="row">
                <span class="dim">level</span>
                <Num value={a.level} min={1} max={99} width={56} onChange={(v) => set({ ...a, level: v ?? 1 })} />
                <Select value={a.ability} options={optionsOf(raw.abilities)} onChange={(v) => set({ ...a, ability: v ?? "" })} />
              </div>
            )}
          />
        </Field>
        <Field label="Movement">
          <PatternField value={cls.move} project={project} onChange={(v) => v && write({ ...cls, move: v }, "movement")} />
        </Field>
        <Field label="Wears">
          <MultiPick value={cls.equip} options={equipKinds(raw)} onChange={(v) => write({ ...cls, equip: v }, "equipment kinds")} addLabel="+ kind" />
        </Field>
        <Field label="Critical">
          <div class="row">
            <Num value={cls.critBonus !== undefined ? Math.round(cls.critBonus * 100) : undefined} min={0} max={100} width={60} placeholder="0" onChange={(v) => write({ ...cls, critBonus: v ? v / 100 : undefined }, "critical bonus")} />
            <span class="dim">% extra chance</span>
          </div>
        </Field>
        <Field label="Level 1">
          <StatInputs value={cls.base} onChange={(v, s) => write({ ...cls, base: filled(v) }, `base ${s}`, `base.${s}`)} />
        </Field>
        <Field label="Per level">
          <StatInputs value={cls.growth} step={0.1} onChange={(v, s) => write({ ...cls, growth: filled(v) }, `growth ${s}`, `growth.${s}`)} />
        </Field>
      </fieldset>
      {table.length > 0 && (
        <Field label="By level">
          <StatTable rows={table} highlight={hero.level} />
          <p class="hint">With {hero.name}'s start equipment; the start level is marked.</p>
        </Field>
      )}
    </Box>
  );
}
