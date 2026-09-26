import type { Document } from "yaml";
import type { Script, Step } from "../../../src/core/data/types";
import { SayPreviewContext } from "../dialogs/SayPreview";
import { ContentList } from "../forms/ContentList";
import { ActionEditor } from "../forms/ActionEditor";
import { flowNode, patchIn, tidy } from "../forms/entries";
import { Box } from "../forms/Section";
import { usePersistentState } from "../persist";
import type { Project } from "../project";
import { EntryReferences } from "../forms/References";

import { findUsages, usagePlaces, type UsageTarget } from "../references";
import { stepText } from "../script/words";

/**
 * Dialogs (editor-design §10): the list by file, the dialog's steps with a preview of every line in
 * the game's text box, and the links around it – where it is opened and where it continues.
 */

const DIR = "data/dialogs/";
const fileLabel = (file: string) => file.slice(DIR.length).replace(/\.yaml$/, "");

/** Every dialog of the project: id → its file. */
export function dialogFiles(project: Project): Map<string, string> {
  const out = new Map<string, string>();
  for (const file of project.paths(DIR)) for (const id of Object.keys(project.data<Record<string, unknown>>(file) ?? {})) out.set(id, file);
  return out;
}

/** The dialogs a dialog continues in (continue in, if / else, question options, a dialog step). */
export function continuesIn(steps: Script): string[] {
  const out = new Set<string>();
  const walk = (list: Script | undefined) => {
    for (const s of list ?? []) {
      const r = s as Record<string, unknown>;
      if (typeof r.goto === "string") out.add(r.goto);
      if (typeof r.dialog === "string") out.add(r.dialog);
      for (const k of ["then", "else"]) {
        if (typeof r[k] === "string") out.add(r[k] as string);
        else walk(r[k] as Script);
      }
      if (Array.isArray(r.do)) walk(r.do as Script);
      for (const o of (r.choice as { goto?: string; do?: Script }[] | undefined) ?? []) {
        if (o.goto) out.add(o.goto);
        walk(o.do);
      }
    }
  };
  walk(steps);
  return [...out];
}

/** A script written as the files are: one step per line, each on one line when it is short. */
function scriptNode(doc: Document, steps: Script) {
  return doc.createNode(
    (tidy(steps) as Step[]).map((s) => flowNode(doc, s as object)),
  );
}

export function DialogsScreen({ project, goTo }: { project: Project; goTo: (t: UsageTarget) => void }) {
  const [selected, select] = usePersistentState<string | null>("dialogs.selected", null);
  const files = dialogFiles(project);
  const current = selected && files.has(selected) ? selected : null;
  const dirty = new Set(project.dirtyPaths());
  const raw = project.content.raw;

  const create = (file: string | undefined) => {
    let target = file;
    if (!target) {
      const name = prompt("A new dialog file (e.g. the region's name):", "new_region");
      if (!name) return;
      target = `${DIR}${name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "dialogs"}.yaml`;
    }
    const wanted = prompt("Id of the new dialog (entities and other dialogs refer to it by this):", "new_dialog");
    if (!wanted) return;
    let id = wanted.trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_");
    for (let n = 2; files.has(id); n++) id = `${wanted}_${n}`;
    project.transaction(`New dialog ${id}`, () => {
      if (!project.paths(target!).length) project.create(target!, "# Dialogs (docs/game-design.md §9): each is a script of steps – say, question, if / else, actions.\n");
      project.edit(target!, `New dialog ${id}`, (doc: Document) => doc.setIn([id], scriptNode(doc, [{ say: "…" }])));
    });
    select(id);
  };

  const selectedFile = current ? files.get(current) : [...files.values()][0];
  return (
    <>
      <main class="main">
        <div class="split">
          <ContentList
            entries={[...files].map(([id, file]) => ({ id, name: id, group: fileLabel(file), dirty: dirty.has(file) }))}
            groups={[...new Set(files.values())].map(fileLabel)}
            selected={current}
            onSelect={select}
            searchKey="dialogs.filter"
            placeholder="Search dialogs…"
            newTitle="A new dialog"
            newOptions={[
              ...(selectedFile ? [{ label: `In ${fileLabel(selectedFile)}`, title: `A new dialog in ${selectedFile}`, make: () => create(selectedFile) }] : []),
              { label: "In a new file…", title: "A new dialog file with a first dialog", make: () => create(undefined) },
            ]}
          />
          <div class="form-scroll">
            {current ? (
              <SayPreviewContext.Provider value={raw}>
                <DialogForm project={project} id={current} file={files.get(current)!} />
              </SayPreviewContext.Provider>
            ) : (
              <p class="placeholder">Select a dialog, or make one with New.</p>
            )}
          </div>
        </div>
      </main>
      <aside class="inspector">{current ? <DialogLinks project={project} id={current} file={files.get(current)!} goTo={(t) => (t.screen === "dialogs" && t.id ? select(t.id) : goTo(t))} onDeleted={() => select(null)} onCopied={select} /> : <p class="hint">What the characters say, and the questions they ask (editor-design §10).</p>}</aside>
    </>
  );
}

function DialogForm({ project, id, file }: { project: Project; id: string; file: string }) {
  const steps = (project.data<Record<string, Script>>(file)?.[id] ?? []) as Script;
  const db = project.content.db;
  return (
    <div class="item-form dialog-form">
      <Box title={`Dialog ${id}`} aside={<span class="dim">{file.slice("data/".length)}</span>}>
        {db ? (
          <ActionEditor value={steps} db={db} onChange={(v) => project.edit(file, `Dialog ${id}`, (doc: Document) => patchIn(doc, [id], steps, v), `dialog.${id}`)} />
        ) : (
          <p class="bad-text">Fix the content's problems (the red ! above) to edit dialogs.</p>
        )}
      </Box>
    </div>
  );
}

function DialogLinks({ project, id, file, goTo, onDeleted, onCopied }: { project: Project; id: string; file: string; goTo: (t: UsageTarget) => void; onDeleted: () => void; onCopied: (id: string) => void }) {
  const raw = project.content.raw;
  const steps = (project.data<Record<string, Script>>(file)?.[id] ?? []) as Script;
  const opened = usagePlaces(findUsages(project, "dialogs", id)).filter((u) => !(u.file === file && u.label === `dialog ${id}`));
  const next = continuesIn(steps);
  const files = dialogFiles(project);
  return (
    <div class="item-card">
      <h3>{id}</h3>
      <div class="dim">
        {steps.length} step{steps.length === 1 ? "" : "s"} · {file.slice("data/".length)}
      </div>
      <ul class="summary">
        {steps.slice(0, 4).map((s, i) => (
          <li key={i}>{stepText(s, raw)}</li>
        ))}
        {steps.length > 4 && <li class="dim">…</li>}
      </ul>
      <h4 class="card-heading">Opened by</h4>
      {opened.length ? (
        <ul class="placements">
          {opened.map((u) => (
            <li key={u.file + u.label}>
              <button class="link" onClick={() => goTo(u.target)}>
                {u.label}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p class="hint">Nothing opens it yet – an entity's Talk option, a "Show dialog" step, or another dialog.</p>
      )}
      <h4 class="card-heading">Continues in</h4>
      {next.length ? (
        <ul class="placements">
          {next.map((d) => (
            <li key={d}>
              {files.has(d) ? (
                <button class="link" onClick={() => goTo({ screen: "dialogs", id: d })}>
                  {d}
                </button>
              ) : (
                <span class="bad-text">{d} (missing!)</span>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p class="hint">It ends on its own.</p>
      )}
      <EntryReferences project={project} collection="dialogs" id={id} goTo={goTo} onRenamed={onCopied} list={false} />
      <div class="row wrap">
        <button
          onClick={() => {
            let copy = `${id}_2`;
            for (let n = 3; files.has(copy); n++) copy = `${id}_${n}`;
            project.edit(file, `Duplicate ${id}`, (doc: Document) => doc.setIn([copy], scriptNode(doc, structuredClone(steps))));
            onCopied(copy);
          }}
        >
          Duplicate
        </button>
        <button
          disabled={opened.length > 0}
          title={opened.length ? "Still opened somewhere – change or remove those places first (listed above)" : "Delete it from the project"}
          onClick={() => {
            if (!confirm(`Delete the dialog ${id}?`)) return;
            project.edit(file, `Delete ${id}`, (doc: Document) => doc.deleteIn([id]));
            onDeleted();
          }}
        >
          Delete
        </button>
      </div>
    </div>
  );
}
