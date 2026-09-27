import { useState } from "preact/hooks";
import type { Document } from "yaml";
import type { GraphicsDb } from "../../../src/core/data/types";
import { Field, Num } from "../forms/fields";
import { frameStyle, assetUrl } from "../map/sprites";
import { usePersistentState } from "../persist";
import { useDismiss } from "../hooks";
import { LibraryMark } from "../icons";
import { putAsset, type Project } from "../project";
import { RESOURCE_KINDS, resourceId, resourcesOf, sheetFor, type ResourceKind } from "../resources";
import { MusicPreview } from "./MapsScreen";
import { ensureGraphic, isOverridden, revertToLibrary } from "../overrides";
import { TilesInspector, TilesMain, useTilesState } from "../graphics/TilesView";
import { SystemInspector, SystemMain, useSystemState } from "../graphics/SystemView";
import { NEW_SHEETS, newSheet } from "../graphics/newSheets";
import { PreviewBox } from "../forms/PreviewBox";
import { openImage } from "../pixel/target";
import { graphicTarget } from "../pixel/targets";

/** The project's own graphics (projects.md §6). */
const GRAPHICS_FILE = "data/graphics.yaml";
const GRAPHICS_HEADER = "# The project's own graphics (docs/projects.md): image paths are relative to its assets/ folder.\n";

type Sheet = { image: string; frameWidth?: number; frameHeight?: number; frames?: Record<string, number>; floor?: number };

/**
 * Resources (projects.md §6): the sprites, faces, battle backgrounds and music the content can
 * use – the library's (read-only) and the project's own. Import brings image or WAV files into the
 * project: copied into its assets/ and registered in its graphics.yaml.
 */
export function ResourcesScreen({ project }: { project: Project }) {
  const [storedKind, setKind] = usePersistentState<ResourceKind | "tiles" | "system">("resources.kind", "charsets");
  const tiles = useTilesState();
  const system = useSystemState();
  const [selected, setSelected] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; bad?: boolean } | null>(null);
  const [dragging, setDragging] = useState(false);
  const db = project.content.db;
  const kind: ResourceKind = storedKind === "tiles" || storedKind === "system" ? "charsets" : storedKind;
  const list = db ? resourcesOf(db, project.music, kind) : [];
  const info = RESOURCE_KINDS.find((k) => k.id === kind)!;
  // the kinds in the list: Tiles sits before Music
  const kinds: { id: ResourceKind | "tiles" | "system"; label: string; count: number | string }[] = [
    ...RESOURCE_KINDS.filter((k) => k.id !== "music").map((k) => ({ id: k.id, label: k.label, count: db ? resourcesOf(db, project.music, k.id).length : "" })),
    { id: "tiles", label: "Tiles", count: Object.keys(project.content.raw.chipsets).length },
    { id: "system", label: "Game images", count: "" },
    { id: "music", label: "Music", count: db ? resourcesOf(db, project.music, "music").length : "" },
  ];

  /** Copies the files into the project and registers them; one message for all of them. */
  const importFiles = async (files: File[]) => {
    if (!db) return;
    const done: string[] = [];
    const problems: string[] = [];
    for (const file of files) {
      try {
        if (kind === "music") {
          if (!/\.wav$/i.test(file.name)) throw new Error("music is a WAV file");
          const id = resourceId(file.name, (x) => project.music.includes(x));
          await putAsset(project.info.id, `audio/music/${id}.wav`, file);
          project.setMusic(id, true);
          done.push(id);
          continue;
        }
        if (!/\.png$/i.test(file.name)) throw new Error("images are PNG files");
        const bitmap = await createImageBitmap(file);
        const id = resourceId(file.name, (x) => !!db.graphics[kind][x]);
        const sheet = sheetFor(kind, `${kind}/${id}.png`, bitmap.width, bitmap.height);
        if ("error" in sheet) throw new Error(sheet.error);
        await putAsset(project.info.id, `${kind}/${id}.png`, file);
        project.transaction(`Import ${id}`, () => {
          if (!project.paths(GRAPHICS_FILE).length) project.create(GRAPHICS_FILE, GRAPHICS_HEADER);
          project.edit(GRAPHICS_FILE, `Import ${id}`, (doc: Document) => doc.setIn([kind, id], doc.createNode(sheet.entry)));
        });
        done.push(sheet.warning ? `${id} (${sheet.warning})` : id);
        setSelected(id);
      } catch (e) {
        problems.push(`${file.name}: ${(e as Error).message}`);
      }
    }
    setMessage({
      text: [done.length ? `Imported ${done.join(", ")}${kind === "music" ? "" : " – Save to keep the registration"}` : "", ...problems].filter(Boolean).join(" · "),
      bad: problems.length > 0,
    });
  };

  return (
    <>
      <main class="main">
        <div class="split">
          <div class="list">
            {kinds.map((k) => (
              <div
                key={k.id}
                class={`item ${storedKind === k.id ? "active" : ""}`}
                onClick={() => {
                  setKind(k.id);
                  setSelected(null);
                  setMessage(null);
                }}
              >
                <span>{k.label}</span>
                <small>{k.count}</small>
              </div>
            ))}
          </div>
          {storedKind === "tiles" ? <TilesMain project={project} state={tiles} /> : storedKind === "system" ? <SystemMain project={project} state={system} /> : <div
            class={`resources ${dragging ? "drop" : ""}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              void importFiles([...(e.dataTransfer?.files ?? [])]);
            }}
          >
            <div class="resources-head">
              <span class="spacer" />
              {kind !== "music" && <NewSheetMenu project={project} kind={kind} onMade={setSelected} />}
              <label class="button primary" title={`Add ${info.label.toLowerCase()} to the project (or drop files here)${info.hint ? ` – ${info.hint}` : ""}`}>
                Import…
                <input type="file" multiple accept={kind === "music" ? ".wav" : ".png"} onChange={(e) => void importFiles([...(e.currentTarget.files ?? [])])} />
              </label>
            </div>
            {message && <p class={message.bad ? "bad-text" : "hint"}>{message.text}</p>}
            <div class="cards">
              {db &&
                list.map((r) => (
                  <button key={r.id} class={`card ${selected === r.id ? "on" : ""}`} title={r.id} onClick={() => setSelected(r.id)}>
                    <Thumb graphics={db.graphics} kind={kind} id={r.id} />
                    <span class="name">{r.lib ? r.id.slice(4) : r.id}</span>
                    {r.lib && <LibraryMark changed={kind !== "music" && isOverridden(project, kind, r.id)} />}
                  </button>
                ))}
            </div>
          </div>}
        </div>
      </main>
      <aside class="inspector">
        {storedKind === "tiles" ? <TilesInspector project={project} state={tiles} /> : storedKind === "system" ? <SystemInspector project={project} state={system} /> : db && selected && list.some((r) => r.id === selected) ? (
          <ResourceForm project={project} kind={kind} id={selected} onDeleted={() => setSelected(null)} onCopied={(id) => setSelected(id)} />
        ) : (
          <p class="hint">Select one to see it and draw it.</p>
        )}
      </aside>
    </>
  );
}

/** New ▾ – a blank sheet of the kind, drawn right away in the pixel editor (graphics.md G7). */
function NewSheetMenu({ project, kind, onMade }: { project: Project; kind: ResourceKind; onMade: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const anchor = useDismiss<HTMLDivElement>(open, () => setOpen(false));
  const options = NEW_SHEETS.filter((s) => s.kind === kind);
  const make = async (s: (typeof NEW_SHEETS)[number]) => {
    setOpen(false);
    const name = prompt(`A name for the new ${s.label.split(" (")[0].toLowerCase()}:`, "new");
    if (!name) return;
    try {
      const g = project.content.raw.graphics[s.kind];
      const id = await newSheet(project, s, name, (x) => x in g);
      onMade(id);
      openImage(graphicTarget(project, s.kind, id));
    } catch (e) {
      alert((e as Error).message);
    }
  };
  return (
    <div class="menu-anchor" ref={anchor}>
      <button title="A blank sheet in the kind's layout, to draw in the pixel editor" onClick={() => (options.length === 1 ? void make(options[0]) : setOpen(!open))}>
        New{options.length > 1 ? " ▾" : ""}
      </button>
      {open && (
        <div class="menu" role="menu">
          {options.map((s) => (
            <button key={s.label} role="menuitem" onClick={() => void make(s)}>
              {s.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** A resource's thumbnail: a charset's idle frame, a battler's first frame, the image, or a play button. */
export function Thumb({ graphics, kind, id }: { graphics: GraphicsDb; kind: ResourceKind; id: string }) {
  if (kind === "music") return <span class="thumb music">♪</span>;
  const s = graphics[kind][id] as Sheet;
  if (kind === "charsets") return <span class="thumb" style={frameStyle(s.image, s.frameWidth!, s.frameHeight!, 3, 1, 2)} />;
  if (kind === "battlers") {
    const cols = Math.max(...Object.values(s.frames ?? { idle: 0 })) + 1;
    const scale = s.frameWidth! > 64 ? 1 : 2;
    return <span class="thumb" style={frameStyle(s.image, s.frameWidth!, s.frameHeight!, cols, 0, scale)} />;
  }
  return <img class={`thumb ${kind}`} src={assetUrl(s.image)} alt="" />;
}

/** A resource's settings: the project's own can be adjusted or deleted, the library's are read-only. */
function ResourceForm({ project, kind, id, onDeleted }: { project: Project; kind: ResourceKind; id: string; onDeleted: () => void; onCopied: (id: string) => void }) {
  const db = project.content.db!;
  const lib = id.startsWith("lib:");
  const changed = kind !== "music" && isOverridden(project, kind, id);
  const sheet = kind === "music" ? null : (db.graphics[kind][id] as Sheet);
  const [height, setHeight] = useState(0);
  /** A setting: a library graphic's first change makes the project's version (its image too). */
  const set = async (field: string, v: unknown) => {
    if (lib && kind !== "music") await ensureGraphic(project, kind, id);
    project.edit(GRAPHICS_FILE, `${id}: ${field}`, (doc) => doc.setIn([kind, id, field], v), `${kind}.${id}.${field}`);
  };
  const remove = async () => {
    if (!confirm(`Delete ${id} from the project? Content that uses it will show problems.`)) return;
    try {
      if (kind === "music") {
        await putAsset(project.info.id, `audio/music/${id}.wav`, null);
        project.setMusic(id, false);
      } else {
        await putAsset(project.info.id, `${kind}/${id}.png`, null);
        project.edit(GRAPHICS_FILE, `Delete ${id}`, (doc) => doc.deleteIn([kind, id]));
      }
      onDeleted();
    } catch (e) {
      alert((e as Error).message);
    }
  };
  return (
    <div class="resource-form">
      <h3>
        {lib ? id.slice(4) : id}
        {lib && <LibraryMark changed={changed} />}
      </h3>
      {kind === "music" ? (
        <Field label="Listen">
          <MusicPreview src={assetUrl(db.musicPath(id))} />
        </Field>
      ) : (
        <>
          <PreviewBox onEdit={() => openImage(graphicTarget(project, kind, id))}>
            <div class="resource-preview">
              <div class="preview-image">
                <img src={assetUrl(sheet!.image)} alt="" onLoad={(e) => setHeight(e.currentTarget.naturalHeight)} />
                {/* a background's floor: where characters stand in close-ups */}
                {kind === "battlebacks" && sheet!.floor !== undefined && height ? <span class="floor-line" style={{ top: `${(sheet!.floor / height) * 100}%` }} title={`Floor: row ${sheet!.floor}`} /> : null}
              </div>
            </div>
          </PreviewBox>
          {(kind === "charsets" || kind === "battlers") && (
            <Field label="Frame">
              <div class="row">
                <Num value={sheet!.frameWidth} min={1} width={56} onChange={(v) => void set("frameWidth", v ?? 1)} /> ×
                <Num value={sheet!.frameHeight} min={1} width={56} onChange={(v) => void set("frameHeight", v ?? 1)} />
              </div>
            </Field>
          )}
          {kind === "battlers" && (
            <Field label="Frames">
              <span class="dim">{Object.entries(sheet!.frames ?? {}).map(([n, i]) => `${i} ${n}`).join(" · ")}</span>
            </Field>
          )}
          {kind === "battlebacks" && (
            <Field label="Floor" hint="Used to place characters in close-ups.">
              <Num value={sheet!.floor} min={0} width={70} onChange={(v) => void set("floor", v)} />
            </Field>
          )}
        </>
      )}
      <div class="row end">
        {!lib && <button onClick={remove}>Delete from the project</button>}
        {changed && (
          <button title="Throw away the project's changes – the library's version is used again" onClick={() => confirm("Revert to the library's version? The project's changes to it are lost.") && void revertToLibrary(project, kind, id)}>
            Revert to library
          </button>
        )}
      </div>
    </div>
  );
}
