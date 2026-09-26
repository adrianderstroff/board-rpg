import type { ComponentChildren } from "preact";
import { useState } from "preact/hooks";
import type { QuestDef, QuestEndingDef, QuestStepDef } from "../../../src/core/data/types";
import { ActionEditor } from "../forms/ActionEditor";
import { ConditionEditor, knownFlags } from "../forms/ConditionEditor";
import { ContentList } from "../forms/ContentList";
import { addEntry, deleteEntry, writeEntry } from "../forms/entries";
import { Check, Field, ListEditor, Select, Text } from "../forms/fields";
import { Box, Section } from "../forms/Section";
import { usePersistentState } from "../persist";
import type { Project } from "../project";
import { findUsages, type Usage, type UsageTarget } from "../references";
import { conditionText, scriptText } from "../script/words";

/**
 * Quests (editor-design §9): main quests and their sub-quests; the quest's fields, one box per step
 * and the endings; in the inspector the flow – the steps as a chain, and every place that starts,
 * advances or checks the quest.
 */

type Quest = Omit<QuestDef, "id">;
const QUESTS_FILE = "data/quests.yaml";
const HEADER = "# Quests (docs/game-design.md §10.4). Exactly one quest is active. Steps complete in order when `done` holds.\n";

/** What a place does with the quest, from the field that names it. */
function roleOf(u: Usage): string {
  const keys = u.path.filter((k): k is string => typeof k === "string");
  const has = (k: string) => keys.includes(k);
  if (has("startQuest")) return "starts it";
  if (has("completeQuest")) return "completes it";
  if (has("setQuestStep")) return "sets its step";
  if (keys[keys.length - 1] === "parent") return "is a sub-quest";
  if (u.label === "Settings") return "the first quest";
  return "checks it";
}

export function QuestsScreen({ project, goTo }: { project: Project; goTo: (t: UsageTarget) => void }) {
  const [selected, select] = usePersistentState<string | null>("quests.selected", null);
  const raw = project.content.raw;
  const quests = raw.quests as Record<string, Quest>;
  const current = selected && quests[selected] ? selected : null;
  const dirty = project.dirtyPaths().includes(QUESTS_FILE);
  const add = (q: Quest, label: string) => select(addEntry(project, QUESTS_FILE, HEADER, q, (x) => x in project.content.raw.quests, label, "quest", q.title));
  return (
    <>
      <main class="main">
        <div class="split">
          <ContentList
            entries={Object.entries(quests).map(([id, q]) => ({ id, name: q.parent ? `${q.title}  ‹ ${quests[q.parent]?.title ?? q.parent}` : q.title, group: q.parent ? "Sub-quests" : "Quests", dirty }))}
            groups={["Quests", "Sub-quests"]}
            selected={current}
            onSelect={select}
            searchKey="quests.filter"
            placeholder="Search quests…"
            newTitle="A new quest"
            newOptions={[{ label: "New quest", make: () => add({ title: "New quest", description: "", steps: [{ id: "first", objective: "What to do", done: { flag: "" } }] }, "New quest") }]}
          />
          <div class="form-scroll">{current ? <QuestForm project={project} id={current} /> : <p class="placeholder">Select a quest, or make one with New.</p>}</div>
        </div>
      </main>
      <aside class="inspector">{current ? <QuestFlow project={project} id={current} goTo={(t) => (t.screen === "quests" && t.id ? select(t.id) : goTo(t))} onDeleted={() => select(null)} /> : <p class="hint">The story's goals, step by step (editor-design §9).</p>}</aside>
    </>
  );
}

function QuestForm({ project, id }: { project: Project; id: string }) {
  const raw = project.content.raw;
  const q = raw.quests[id] as Quest;
  const db = project.content.db;
  const flags = knownFlags(raw);
  const write = (next: Quest, label: string, group?: string) => writeEntry(project, QUESTS_FILE, id, q, next, `${q.title}: ${label}`, group);
  const setStep = (i: number, s: QuestStepDef, label: string, group?: string) => write({ ...q, steps: q.steps.map((x, j) => (j === i ? s : x)) }, label, group ? `step${i}.${group}` : undefined);
  if (!db) return <p class="bad-text">Fix the content's problems (the red ! above) to edit quests.</p>;
  return (
    <div class="item-form">
      <Box title="Quest" aside={<span class="dim">{id}</span>}>
        <Field label="Title">
          <Text value={q.title} onChange={(v) => write({ ...q, title: v ?? "" }, "title", "title")} />
        </Field>
        <Field label="Text">
          <textarea rows={2} value={q.description} placeholder="Shown in the quest log" onInput={(e) => write({ ...q, description: e.currentTarget.value }, "text", "description")} />
        </Field>
        <Field label="Part of">
          <Select value={q.parent} options={Object.entries(raw.quests).filter(([qid]) => qid !== id).map(([qid, x]) => [qid, x.title])} empty="(a main quest)" onChange={(v) => write({ ...q, parent: v }, "parent quest")} />
        </Field>
        <Field label="Lock">
          <Check value={q.lockSwitch} label="The player can't switch to another quest while this one is active" onChange={(v) => write({ ...q, lockSwitch: v }, "lock")} />
        </Field>
        <Field label="On start">
          <Collapsible summary={scriptText(q.onStart, raw) || "nothing"}>
            <ActionEditor value={q.onStart} db={db} onChange={(v) => write({ ...q, onStart: v.length ? v : undefined }, "on start", "onStart")} />
          </Collapsible>
        </Field>
      </Box>

      <Box title="Steps" aside={<span class="dim">done in order</span>}>
        <ListEditor
          items={q.steps}
          onChange={(v) => write({ ...q, steps: v }, "steps", "steps")}
          add={() => ({ id: `step_${q.steps.length + 1}`, objective: "", done: { flag: "" } })}
          addLabel="+ Step"
          render={(s, _set, i) => (
            <div class="quest-step">
              <div class="row">
                <span class="step-no">{i + 1}</span>
                <input value={s.objective} placeholder="The objective in the quest log" onInput={(e) => setStep(i, { ...s, objective: e.currentTarget.value }, "objective", "objective")} />
                <input class="step-id" value={s.id} title="The step's id (conditions and actions refer to it)" onInput={(e) => setStep(i, { ...s, id: e.currentTarget.value }, "step id", "id")} />
              </div>
              <Field label="Done when">
                <ConditionEditor value={s.done} db={db} flags={flags} onChange={(c) => setStep(i, { ...s, done: c ?? { always: true } }, "done when")} />
              </Field>
              <Field label="Lock">
                <Check value={s.lock} label="no switching quests during this step" onChange={(v) => setStep(i, { ...s, lock: v }, "lock")} />
              </Field>
              <Field label="On start">
                <Collapsible summary={scriptText(s.onStart, raw) || "nothing"}>
                  <ActionEditor value={s.onStart} db={db} onChange={(v) => setStep(i, { ...s, onStart: v.length ? v : undefined }, "on start", "onStart")} />
                </Collapsible>
              </Field>
              <Field label="On complete">
                <Collapsible summary={scriptText(s.onComplete, raw) || "nothing"}>
                  <ActionEditor value={s.onComplete} db={db} onChange={(v) => setStep(i, { ...s, onComplete: v.length ? v : undefined }, "on complete", "onComplete")} />
                </Collapsible>
              </Field>
            </div>
          )}
        />
      </Box>

      <Section
        title="Endings"
        on={!!q.endings}
        hint="Without endings the quest ends when all steps are done; with them, the first ending whose condition holds"
        onToggle={(on) => write({ ...q, endings: on ? [{ id: "done", when: { questStepsDone: id } }] : undefined }, on ? "endings" : "no endings")}
      >
        <ListEditor
          items={q.endings ?? []}
          onChange={(v) => write({ ...q, endings: v }, "endings", "endings")}
          add={() => ({ id: `ending_${(q.endings?.length ?? 0) + 1}`, when: { questStepsDone: id } })}
          addLabel="+ Ending"
          render={(e: QuestEndingDef, set) => (
            <div class="quest-step">
              <div class="row">
                <input value={e.id} title="The ending's id (questDone conditions can ask for it)" onInput={(ev) => set({ ...e, id: ev.currentTarget.value })} />
                <Check value={e.hidden} label="hidden" onChange={(v) => set({ ...e, hidden: v })} />
              </div>
              <Field label="When">
                <ConditionEditor value={e.when} db={db} flags={flags} onChange={(c) => set({ ...e, when: c ?? { always: true } })} />
              </Field>
              <Field label="Then">
                <Collapsible summary={scriptText(e.onComplete, raw) || "nothing"}>
                  <ActionEditor value={e.onComplete} db={db} onChange={(v) => set({ ...e, onComplete: v.length ? v : undefined })} />
                </Collapsible>
              </Field>
            </div>
          )}
        />
        <p class="hint">The first ending whose condition holds wins; a hidden one never shows in the log.</p>
      </Section>
    </div>
  );
}

/** A script folded to one line of words until opened. */
function Collapsible({ summary, children }: { summary: string; children: ComponentChildren }) {
  const [open, setOpen] = useState(false);
  return (
    <div class="collapsible">
      <button class="collapsible-head" onClick={() => setOpen(!open)} title={open ? "Fold" : "Edit"}>
        <span>{open ? "▾" : "▸"}</span> <span class={summary === "nothing" ? "dim" : ""}>{summary}</span>
      </button>
      {open && children}
    </div>
  );
}

function QuestFlow({ project, id, goTo, onDeleted }: { project: Project; id: string; goTo: (t: UsageTarget) => void; onDeleted: () => void }) {
  const raw = project.content.raw;
  const q = raw.quests[id] as Quest;
  const usages = findUsages(project, "quests", id).filter((u) => !(u.file === QUESTS_FILE && u.path[0] === id));
  const roles = new Map<string, Usage[]>();
  for (const u of usages) {
    const r = roleOf(u);
    const list = roles.get(r) ?? [];
    if (!list.some((x) => x.file === u.file && x.label === u.label)) list.push(u);
    roles.set(r, list);
  }
  const subs = Object.entries(raw.quests).filter(([, x]) => x.parent === id);
  return (
    <div class="item-card">
      <h3>{q.title}</h3>
      {q.parent && (
        <div class="dim">
          part of{" "}
          <button class="link" onClick={() => goTo({ screen: "quests", id: q.parent })}>
            {raw.quests[q.parent]?.title ?? q.parent}
          </button>
        </div>
      )}
      {q.description && <p class="item-text">{q.description}</p>}
      <ol class="quest-flow">
        {q.steps.map((s) => (
          <li key={s.id}>
            <b>{s.objective || s.id}</b>
            {s.lock && <span class="dim"> · locked</span>}
            <div class="dim">done when {conditionText(s.done, raw)}</div>
            {s.onComplete?.length ? <div class="dim">then: {scriptText(s.onComplete, raw)}</div> : null}
          </li>
        ))}
      </ol>
      {q.endings?.length ? (
        <>
          <h4 class="card-heading">Endings</h4>
          <ul class="summary">
            {q.endings.map((e) => (
              <li key={e.id}>
                {e.id}
                {e.hidden ? " (hidden)" : ""}: <span class="dim">{conditionText(e.when, raw)}</span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {subs.length > 0 && (
        <>
          <h4 class="card-heading">Sub-quests</h4>
          <ul class="placements">
            {subs.map(([sid, s]) => (
              <li key={sid}>
                <button class="link" onClick={() => goTo({ screen: "quests", id: sid })}>
                  {s.title}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      {["the first quest", "starts it", "sets its step", "completes it", "checks it"].map((role) =>
        roles.get(role)?.length ? (
          <div key={role}>
            <h4 class="card-heading">{role === "checks it" ? "Checked by" : role === "starts it" ? "Started by" : role === "completes it" ? "Completed by" : role === "sets its step" ? "Steps set by" : "Starts the game"}</h4>
            <ul class="placements">
              {roles.get(role)!.map((u) => (
                <li key={u.file + u.label}>
                  <button class="link" onClick={() => goTo(u.target)}>
                    {u.label}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null,
      )}
      {!roles.get("starts it")?.length && !roles.get("the first quest")?.length && <p class="bad-text">Nothing starts this quest yet.</p>}
      <p class="hint">Referenced as {id}.</p>
      <div class="row wrap">
        <button
          onClick={() => {
            if (!confirm(`Delete the quest ${q.title}?${usages.length ? ` ${usages.length} place(s) refer to it and will show problems.` : ""}`)) return;
            deleteEntry(project, QUESTS_FILE, id);
            onDeleted();
          }}
        >
          Delete
        </button>
      </div>
    </div>
  );
}

