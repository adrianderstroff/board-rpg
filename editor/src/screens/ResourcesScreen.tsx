import { useState } from "preact/hooks";
import type { Document } from "yaml";
import type { GraphicsDb } from "../../../src/core/data/types";
import { Field, Num } from "../forms/fields";
import { frameStyle, assetUrl } from "../map/sprites";
import { usePersistentState } from "../persist";
import { putAsset, type Project } from "../project";
import { RESOURCE_KINDS, resourceId, resourcesOf, sheetFor, type ResourceKind } from "../resources";
import { MusicPreview } from "./MapsScreen";

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
  const [kind, setKind] = usePersistentState<ResourceKind>("resources.kind", "charsets");
  const [selected, setSelected] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; bad?: boolean } | null>(null);
  const [dragging, setDragging] = useState(false);
  const db = project.content.db;
  const list = db ? resourcesOf(db, project.music, kind) : [];
  const info = RESOURCE_KINDS.find((k) => k.id === kind)!;

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
            {RESOURCE_KINDS.map((k) => (
              <div
                key={k.id}
                class={`item ${kind === k.id ? "active" : ""}`}
                onClick={() => {
                  setKind(k.id);
                  setSelected(null);
                  setMessage(null);
                }}
              >
                <span>{k.label}</span>
                <small>{db ? resourcesOf(db, project.music, k.id).length : ""}</small>
              </div>
            ))}
          </div>
          <div
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
              <p class="hint">{info.hint} Drop files here to add them to the project.</p>
              <label class="button primary" title={`Add ${info.label.toLowerCase()} to the project`}>
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
                    {r.lib && <span class="badge-lib">library</span>}
                  </button>
                ))}
            </div>
          </div>
        </div>
      </main>
      <aside class="inspector">
        {db && selected && list.some((r) => r.id === selected) ? (
          <ResourceForm project={project} kind={kind} id={selected} onDeleted={() => setSelected(null)} />
        ) : (
          <p class="hint">Select a resource, or import files: {info.hint}</p>
        )}
      </aside>
    </>
  );
}

/** A resource's thumbnail: a charset's idle frame, a battler's first frame, the image, or a play button. */
function Thumb({ graphics, kind, id }: { graphics: GraphicsDb; kind: ResourceKind; id: string }) {
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
function ResourceForm({ project, kind, id, onDeleted }: { project: Project; kind: ResourceKind; id: string; onDeleted: () => void }) {
  const db = project.content.db!;
  const lib = id.startsWith("lib:");
  const sheet = kind === "music" ? null : (db.graphics[kind][id] as Sheet);
  const set = (field: string, v: unknown) => project.edit(GRAPHICS_FILE, `${id}: ${field}`, (doc) => doc.setIn([kind, id, field], v), `${kind}.${id}.${field}`);
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
      <h3>{lib ? id.slice(4) : id}</h3>
      {lib && <p class="hint">Library content ({project.info.library}) – read-only. Referenced as {id}.</p>}
      {kind === "music" ? (
        <Field label="Listen">
          <MusicPreview src={assetUrl(db.musicPath(id))} />
        </Field>
      ) : (
        <>
          <div class="resource-preview">
            <img src={assetUrl(sheet!.image)} alt="" />
          </div>
          <Field label="Image">
            <span class="dim">{sheet!.image.replace(lib ? project.roots.library : project.roots.project, "")}</span>
          </Field>
          {(kind === "charsets" || kind === "battlers") && (
            <Field label="Frame">
              <div class="row">
                {lib ? (
                  <span>
                    {sheet!.frameWidth} × {sheet!.frameHeight}
                  </span>
                ) : (
                  <>
                    <Num value={sheet!.frameWidth} min={1} width={56} onChange={(v) => set("frameWidth", v ?? 1)} /> ×
                    <Num value={sheet!.frameHeight} min={1} width={56} onChange={(v) => set("frameHeight", v ?? 1)} />
                  </>
                )}
              </div>
            </Field>
          )}
          {kind === "battlers" && (
            <Field label="Frames">
              <span class="dim">{Object.entries(sheet!.frames ?? {}).map(([n, i]) => `${i} ${n}`).join(" · ")}</span>
            </Field>
          )}
          {kind === "battlebacks" && (
            <Field label="Floor" hint="The image row where the ground starts (the close-up stands villagers on it).">
              {lib ? <span>{sheet!.floor ?? "–"}</span> : <Num value={sheet!.floor} min={0} width={70} onChange={(v) => set("floor", v)} />}
            </Field>
          )}
        </>
      )}
      {!lib && (
        <div class="row end">
          <button onClick={remove}>Delete from the project</button>
        </div>
      )}
    </div>
  );
}
