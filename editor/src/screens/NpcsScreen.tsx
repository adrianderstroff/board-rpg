import { STAT_KEYS, type Stats } from "../../../src/core/data/types";
import { header, newNpc, npcPlacements, NPCS_FILE, type Npc } from "../characters/model";
import { FacePreview, GraphicField, PosePreview, WalkPreview } from "../characters/Graphics";
import { StatInputs } from "../characters/StatFields";
import { ContentList, EntryActions } from "../forms/ContentList";
import { optionsOf } from "../forms/EffectList";
import { addEntry, deleteEntry, writeEntry } from "../forms/entries";
import { Check, Field, Num, Text } from "../forms/fields";
import { PatternField } from "../forms/PatternField";
import { Box, Section } from "../forms/Section";
import { usePersistentState } from "../persist";
import type { Project } from "../project";
import { EntryReferences, usedIn } from "../forms/References";
import type { UsageTarget } from "../references";

import type { EntityRef } from "../entities/model";
import { ChanceList, CharsetThumb } from "./EnemiesScreen";

/**
 * NPCs (editor-design §7.3): the people on the maps – name, graphics, optionally stats (to be
 * fought, stolen from or attacked by enemies), and where each one stands, with links to the maps.
 */

const DEFAULT_STATS: Stats = { maxHp: 20, maxMp: 0, str: 5, def: 5, mag: 5, mdef: 5, spd: 5 };
const filled = (v: Partial<Stats>): Stats => Object.fromEntries(STAT_KEYS.map((k) => [k, v[k] ?? 0])) as Stats;

export function NpcsScreen({ project, openMap, goTo }: { project: Project; openMap: (map: string, entity: EntityRef) => void; goTo: (t: UsageTarget) => void }) {
  const [selected, select] = usePersistentState<string | null>("npcs.selected", null);
  const raw = project.content.raw;
  const npcs = raw.npcs as Record<string, Npc>;
  const current = selected && npcs[selected] ? selected : null;
  const dirty = project.dirtyPaths().includes(NPCS_FILE);
  return (
    <>
      <main class="main">
        <div class="split">
          <ContentList
            entries={Object.entries(npcs).map(([id, n]) => ({ id, name: n.name, pic: <CharsetThumb raw={raw} charset={n.charset} />, dirty: dirty && !id.startsWith("lib:") }))}
            selected={current}
            onSelect={select}
            searchKey="npcs.filter"
            placeholder="Search NPCs…"
            newTitle="A new NPC of the project"
            newOptions={[{ label: "New NPC", make: () => select(addEntry(project, NPCS_FILE, header("NPCs"), newNpc(raw), (x) => x in project.content.raw.npcs, "New NPC", "npc")) }]}
          />
          <div class="form-scroll">{current ? <NpcForm project={project} id={current} openMap={openMap} /> : <p class="placeholder">Select an NPC, or make one with New.</p>}</div>
        </div>
      </main>
      <aside class="inspector">{current ? <NpcCard project={project} id={current} onSelect={select} goTo={goTo} /> : <p class="hint">The people on the maps: villagers, shopkeepers, guides (editor-design §7.3).</p>}</aside>
    </>
  );
}

function NpcCard({ project, id, onSelect, goTo }: { project: Project; id: string; onSelect: (id: string | null) => void; goTo: (t: UsageTarget) => void }) {
  const raw = project.content.raw;
  const n = raw.npcs[id] as Npc;
  return (
    <div class="item-card">
      <div class="item-card-head">
        <FacePreview graphics={raw.graphics} face={n.face} />
      </div>
      <h3>{n.name}</h3>
      {n.level !== undefined && <div class="dim">Level {n.level}</div>}
      {n.description && <p class="item-text">{n.description}</p>}
      <WalkPreview graphics={raw.graphics} charset={n.charset} />
      <PosePreview graphics={raw.graphics} battler={n.battler} />
      <EntryReferences project={project} collection="npcs" id={id} goTo={goTo} onRenamed={onSelect} list={false} />
      <EntryActions
        id={id}
        used={usedIn(project, "npcs", id)}
        onDuplicate={() => onSelect(addEntry(project, NPCS_FILE, header("NPCs"), { ...structuredClone(n), name: `${n.name} copy` }, (x) => x in project.content.raw.npcs, `Duplicate ${id}`, "npc"))}
        onDelete={() => {
          const at = npcPlacements(raw, id);
          if (!confirm(`Delete ${n.name} (${id})?${at.length ? ` It stands on ${at.length} map entit${at.length === 1 ? "y" : "ies"}, which will show problems.` : ""}`)) return;
          deleteEntry(project, NPCS_FILE, id);
          onSelect(null);
        }}
      />
    </div>
  );
}

function NpcForm({ project, id, openMap }: { project: Project; id: string; openMap: (map: string, entity: EntityRef) => void }) {
  const raw = project.content.raw;
  const n = raw.npcs[id] as Npc;
  const write = (next: Npc, label: string, group?: string) => writeEntry(project, NPCS_FILE, id, n, next, `${n.name}: ${label}`, group);
  const placements = npcPlacements(raw, id);
  const fights = !!n.stats;
  return (
    <div class="item-form">
      <Box title="NPC" aside={<span class="dim">{id}</span>}>
        <Field label="Name">
          <Text value={n.name} onChange={(v) => write({ ...n, name: v ?? "" }, "name", "name")} />
        </Field>
        <Field label="Text">
          <textarea rows={2} value={n.description ?? ""} onInput={(e) => write({ ...n, description: e.currentTarget.value || undefined }, "text", "description")} />
        </Field>
      </Box>

      <Box title="Graphics">
        <div class="graphics-row">
          <Field label="Board">
            <GraphicField graphics={raw.graphics} kind="charsets" value={n.charset} onChange={(v) => v && write({ ...n, charset: v }, "board sprite")} />
          </Field>
          <Field label="Face">
            <GraphicField graphics={raw.graphics} kind="faces" value={n.face} optional onChange={(v) => write({ ...n, face: v }, "face")} />
          </Field>
          <Field label="Battle">
            <GraphicField graphics={raw.graphics} kind="battlers" value={n.battler} optional onChange={(v) => write({ ...n, battler: v }, "battle sprite")} />
          </Field>
        </div>
      </Box>

      <Section
        title="Stats"
        on={fights}
        hint="For fights, steals and enemies attacking the NPC – without, the game uses weak defaults"
        onToggle={(on) => write({ ...n, stats: on ? DEFAULT_STATS : undefined, level: on ? (n.level ?? 1) : undefined }, on ? "stats" : "no stats")}
      >
        <Field label="Level">
          <Num value={n.level} min={1} max={99} onChange={(v) => write({ ...n, level: v }, "level", "level")} />
        </Field>
        <Field label="Stats">
          <StatInputs value={n.stats} onChange={(v, s) => write({ ...n, stats: filled(v) }, s, `stats.${s}`)} />
        </Field>
      </Section>

      <Box title="On the board">
        <Field label="Movement">
          <PatternField value={n.move} project={project} empty="a single step (the default)" onChange={(v) => write({ ...n, move: v }, "movement")} />
        </Field>
        <Field label="Enemies">
          <Check value={n.targetable} label="Enemies attack it (a battle the party can join)" onChange={(v) => write({ ...n, targetable: v }, "targetable")} />
        </Field>
        <Field label="Stolen">
          <ChanceList value={n.steal} items={optionsOf(raw.items)} onChange={(v) => write({ ...n, steal: v }, "steal list", "steal")} />
        </Field>
      </Box>

      <Box title="Placed on">
        {placements.length ? (
          <ul class="placements">
            {placements.map((p) => (
              <li key={`${p.map}/${p.entity}`}>
                <button class="link" title="Open the map with this entity selected" onClick={() => openMap(p.map, { kind: "event", key: p.index })}>
                  {raw.maps[p.map]?.name ?? p.map}
                </button>{" "}
                <span class="dim">entity {p.entity}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p class="hint">Not on any map yet – place it as an entity's look on the Maps screen.</p>
        )}
      </Box>
    </div>
  );
}
