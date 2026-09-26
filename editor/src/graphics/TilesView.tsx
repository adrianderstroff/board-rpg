import { useEffect, useMemo, useState } from "preact/hooks";
import { Database } from "../../../src/core/data/database";
import type { DecorDef, TerrainDef } from "../../../src/core/data/types";
import { assetsVersion } from "../assetVersions";
import { optionsOf } from "../forms/EffectList";
import { Check, Field, Num, Select, Text } from "../forms/fields";
import { Icon } from "../icons";
import { IsoCanvas } from "../map/IsoCanvas";
import { frameStyle, loadImage } from "../map/sprites";
import { usePersistentState } from "../persist";
import type { Project } from "../project";
import { addPiece, chipsetData, copyChipsetToProject, deletePiece, importChipset, isOwnChipset, pieceUsers, PREVIEW_MAP, previewRaw, setPiece, type PieceKind } from "./chipsets";

/**
 * Tiles (graphics.md §4): a chipset's terrains and decor with their rules, and a little board that
 * shows the selected piece with the game's renderer, turned through the four view rotations.
 */

const plain = (id: string) => id.replace(/^lib:/, "");
type PieceRef = { kind: PieceKind; id: string };

/** The width of an image (for its frame columns), once loaded. */
function useImageWidth(path: string | undefined): number | null {
  const [w, setW] = useState<number | null>(null);
  const v = assetsVersion();
  useEffect(() => {
    let live = true;
    if (path) void loadImage(path).then((img) => live && setW(img.width)).catch(() => live && setW(null));
    return () => {
      live = false;
    };
  }, [path, v]);
  return w;
}

export function useTilesState() {
  const [chip, setChip] = usePersistentState<string>("tiles.chipset", "lib:desert");
  const [piece, setPiece] = usePersistentState<PieceRef | null>("tiles.piece", null);
  return { chip, setChip, piece, setPiece };
}
export type TilesState = ReturnType<typeof useTilesState>;

/** The middle: which chipset, its pieces as thumbnails. */
export function TilesMain({ project, state }: { project: Project; state: TilesState }) {
  const raw = project.content.raw;
  const ids = Object.keys(raw.chipsets).sort((a, b) => Number(a.startsWith("lib:")) - Number(b.startsWith("lib:")));
  const chipId = raw.chipsets[state.chip] ? state.chip : ids[0];
  const chip = chipId ? raw.chipsets[chipId] : undefined;
  const own = chipId ? isOwnChipset(chipId) : false;
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const blocksW = useImageWidth(chip?.image);
  const decorW = useImageWidth(chip?.decorImage);
  const run = async (what: string, fn: () => Promise<void>) => {
    setBusy(what);
    try {
      await fn();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  if (!chip || !chipId) return <p class="placeholder">No chipsets.</p>;
  const f = filter.toLowerCase();
  const match = (id: string, name: string) => !f || `${id} ${name}`.toLowerCase().includes(f);
  const sel = state.piece;
  return (
    <div class="tiles">
      <div class="resources-head">
        <select value={chipId} onChange={(e) => (state.setChip(e.currentTarget.value), state.setPiece(null))} title="The chipset (maps choose theirs in their properties)">
          {ids.map((id) => (
            <option key={id} value={id}>
              {plain(id)}
              {id.startsWith("lib:") ? " (library)" : ""}
            </option>
          ))}
        </select>
        <input class="search" placeholder="Search tiles…" value={filter} onInput={(e) => setFilter(e.currentTarget.value)} />
        <span class="spacer" />
        {!own && (
          <button disabled={!!busy} title="An editable copy of both sheets and the rules; the project's maps use the copy from then on" onClick={() => run("copy", async () => state.setChip(await copyChipsetToProject(project, chipId)))}>
            {busy === "copy" ? "Copying…" : "Copy to project"}
          </button>
        )}
        <label class="button" title="A PNG of 32×24 blocks becomes a new chipset of the project (a terrain per drawn block)">
          Import tile sheet…
          <input type="file" accept=".png" onChange={(e) => {
            const file = e.currentTarget.files?.[0];
            if (file) void run("import", async () => state.setChip(await importChipset(project, file)));
          }} />
        </label>
      </div>
      {!own && <p class="hint">Library chipset – read-only. Copy it to the project to change its rules or add tiles.</p>}
      <h4 class="list-group">Terrain – blocks</h4>
      <div class="cards tile-cards">
        {blocksW &&
          Object.entries(chip.terrains)
            .filter(([id, t]) => match(id, t.name))
            .map(([id, t]) => (
              <button key={id} class={`card ${sel?.kind === "terrain" && sel.id === id ? "on" : ""}`} title={`${t.name} (${id})${t.walkable ? "" : " – can't be walked on"}`} onClick={() => state.setPiece({ kind: "terrain", id })}>
                <span class="thumb" style={frameStyle(chip.image, chip.frameWidth, chip.frameHeight, Math.floor(blocksW / chip.frameWidth), t.frame, 2)} />
                <span class="name">{t.name}</span>
                <span class="tile-tags">
                  {!t.walkable && <span class="tag bad">blocks</span>}
                  {t.water && <span class="tag">{t.water} water</span>}
                  {t.surface && <span class="tag">{plain(t.surface)}</span>}
                </span>
              </button>
            ))}
        {own && (
          <button class="card add-card" disabled={!!busy} title="A new block: a copy of the selected terrain (or blank) in a new frame of the sheet" onClick={() => run("terrain", async () => state.setPiece({ kind: "terrain", id: await addPiece(project, chipId, "terrain", sel?.kind === "terrain" ? sel.id : undefined) }))}>
            <span class="plus">+</span>
            <span class="name">{sel?.kind === "terrain" ? "Copy of the selected" : "New terrain"}</span>
          </button>
        )}
      </div>
      <h4 class="list-group">Decor – objects</h4>
      <div class="cards tile-cards">
        {decorW &&
          Object.entries(chip.decor)
            .filter(([id, d]) => match(id, d.name))
            .map(([id, d]) => (
              <button key={id} class={`card ${sel?.kind === "decor" && sel.id === id ? "on" : ""}`} title={`${d.name} (${id})${d.blocks ? " – blocks the way" : ""}`} onClick={() => state.setPiece({ kind: "decor", id })}>
                <span class="thumb" style={frameStyle(chip.decorImage, chip.decorFrameWidth, chip.decorFrameHeight, Math.floor(decorW / chip.decorFrameWidth), d.frame, 1.5)} />
                <span class="name">{d.name}</span>
                <span class="tile-tags">{d.blocks && <span class="tag bad">blocks</span>}</span>
              </button>
            ))}
        {own && (
          <button class="card add-card" disabled={!!busy} title="A new object: a copy of the selected decor (or blank) in a new frame of the sheet" onClick={() => run("decor", async () => state.setPiece({ kind: "decor", id: await addPiece(project, chipId, "decor", sel?.kind === "decor" ? sel.id : undefined) }))}>
            <span class="plus">+</span>
            <span class="name">{sel?.kind === "decor" ? "Copy of the selected" : "New decor"}</span>
          </button>
        )}
      </div>
    </div>
  );
}

/** The inspector: the piece on a little board, turnable, and its rules. */
export function TilesInspector({ project, state }: { project: Project; state: TilesState }) {
  const raw = project.content.raw;
  const chipId = raw.chipsets[state.chip] ? state.chip : Object.keys(raw.chipsets)[0];
  const chip = raw.chipsets[chipId];
  const sel = state.piece;
  const piece = sel && chip ? (sel.kind === "terrain" ? chip.terrains[sel.id] : chip.decor[sel.id]) : undefined;
  if (!sel || !piece) return <p class="hint">Select a terrain block or a decor object to see it on a board and set what it does – whether it can be walked on, water, fire, ice.</p>;
  return (
    <div class="tile-inspector">
      <TilePreview project={project} chipId={chipId} piece={sel} />
      {sel.kind === "terrain" ? <TerrainForm project={project} chipId={chipId} id={sel.id} /> : <DecorForm project={project} chipId={chipId} id={sel.id} />}
      <PieceActions project={project} chipId={chipId} piece={sel} onDeleted={() => state.setPiece(null)} />
    </div>
  );
}

function TilePreview({ project, chipId, piece }: { project: Project; chipId: string; piece: PieceRef }) {
  const [rotation, setRotation] = useState(0);
  const version = project.version;
  const db = useMemo(() => {
    try {
      return new Database(structuredClone(previewRaw(project.content.raw, chipId, piece.kind, piece.id)));
    } catch {
      return null;
    }
  }, [version, chipId, piece.kind, piece.id]);
  if (!db) return null;
  const none = () => undefined;
  return (
    <div class="tile-preview">
      <div class="tile-canvas">
        <IsoCanvas
          key={`${chipId}:${assetsVersion()}`}
          db={db}
          mapId={PREVIEW_MAP}
          rotation={rotation}
          hideDecor={false}
          focus="all"
          markers={[]}
          entities={[]}
          ghost={null}
          showGrid={false}
          handlers={{ down: none, move: none, up: none }}
        />
      </div>
      <div class="row">
        <button class="icon-button" title="Turn the view left" onClick={() => setRotation(rotation - 1)}>
          <Icon name="turnLeft" />
        </button>
        <span class="dim">view {(((rotation % 4) + 4) % 4) * 90}°</span>
        <button class="icon-button" title="Turn the view right" onClick={() => setRotation(rotation + 1)}>
          <Icon name="turnRight" />
        </button>
      </div>
    </div>
  );
}

function TerrainForm({ project, chipId, id }: { project: Project; chipId: string; id: string }) {
  const raw = project.content.raw;
  const t = chipsetData(project, chipId).terrains[id];
  const own = isOwnChipset(chipId);
  const set = (next: TerrainDef, label: string, group?: string) => own && setPiece(project, chipId, "terrain", id, t, next, `${t.name}: ${label}`, group);
  const terrains: [string, string][] = Object.entries(chipsetData(project, chipId).terrains)
    .filter(([tid]) => tid !== id)
    .map(([tid, x]) => [tid, `${x.name} (${tid})`]);
  const [ship, setShip] = useState(!!(t.flare || t.underlay || t.bulwark));
  return (
    <fieldset disabled={!own} class="tile-form">
      <h3>
        {t.name} <span class="dim">{id}</span>
      </h3>
      <Field label="Name">
        <Text value={t.name} onChange={(v) => set({ ...t, name: v ?? "" }, "name", "name")} />
      </Field>
      <Field label="Walking">
        <Check value={t.walkable} label="Can be walked on (off: a wall, the sea)" onChange={(v) => set({ ...t, walkable: !!v }, v ? "walkable" : "blocks")} />
      </Field>
      <Field label="Water">
        <Select
          value={t.water}
          options={[
            ["shallow", "shallow – walked through"],
            ["deep", "deep – only swimmers (or frozen)"],
          ]}
          empty="no water"
          onChange={(v) => set({ ...t, water: v as TerrainDef["water"] }, "water")}
        />
      </Field>
      <Field label="Surface">
        <Select value={t.surface} options={optionsOf(raw.fieldEffects)} empty="nothing" title="A field effect that is always there (quicksand is sticky, ice is frozen)" onChange={(v) => set({ ...t, surface: v }, "surface")} />
      </Field>
      <Field label="Ice">
        <Check value={t.freezable} label="Freezes to ice (a bridge over water)" onChange={(v) => set({ ...t, freezable: v }, "freezable")} />
      </Field>
      <Field label="Fire">
        <div class="row">
          <Check value={t.flammable} label="Burns, into" onChange={(v) => set({ ...t, flammable: v, burnsTo: v ? t.burnsTo : undefined }, "flammable")} />
          {t.flammable && <Select value={t.burnsTo} options={terrains} empty="(stays)" onChange={(v) => set({ ...t, burnsTo: v }, "burns to")} />}
        </div>
      </Field>
      <Field label="Frames">
        <div class="row wrap">
          <span class="dim">block</span>
          <Num value={t.frame} min={0} width={56} onChange={(v) => set({ ...t, frame: v ?? 0 }, "frame", "frame")} />
          <span class="dim">below</span>
          <Num value={t.fill} min={0} width={56} placeholder="same" onChange={(v) => set({ ...t, fill: v }, "fill frame", "fill")} />
          <span class="dim">animation</span>
          <input
            class="frames-input"
            value={(t.frames ?? []).join(", ")}
            placeholder="e.g. 6, 7"
            title="Frames it cycles through (water ripples); empty = still"
            onInput={(e) => {
              const list = e.currentTarget.value
                .split(/[ ,]+/)
                .filter(Boolean)
                .map(Number)
                .filter((n) => Number.isInteger(n) && n >= 0);
              set({ ...t, frames: list.length > 1 ? list : undefined }, "animation", "frames");
            }}
          />
        </div>
      </Field>
      <Field label="Sunk">
        <div class="row">
          <Num value={t.sink} min={0} max={8} width={56} placeholder="0" onChange={(v) => set({ ...t, sink: v || undefined }, "sink", "sink")} />
          <span class="dim">px lower (water)</span>
        </div>
      </Field>
      <details class="ship" open={ship} onToggle={(e) => setShip((e.currentTarget as HTMLDetailsElement).open)}>
        <summary>Ship hull</summary>
        <Field label="Flare">
          <Num value={t.flare} min={0} max={1} step={0.1} width={56} placeholder="0" onChange={(v) => set({ ...t, flare: v || undefined }, "flare", "flare")} />
        </Field>
        <Field label="Underlay">
          <Select value={t.underlay} options={terrains} empty="none" title="Drawn flat under the hull (the sea around a ship)" onChange={(v) => set({ ...t, underlay: v }, "underlay")} />
        </Field>
        <Field label="Bulwark">
          <Num value={t.bulwark} min={0} max={2} step={0.1} width={56} placeholder="0" onChange={(v) => set({ ...t, bulwark: v || undefined }, "bulwark", "bulwark")} />
        </Field>
      </details>
    </fieldset>
  );
}

function DecorForm({ project, chipId, id }: { project: Project; chipId: string; id: string }) {
  const d = chipsetData(project, chipId).decor[id];
  const own = isOwnChipset(chipId);
  const set = (next: DecorDef, label: string, group?: string) => own && setPiece(project, chipId, "decor", id, d, next, `${d.name}: ${label}`, group);
  return (
    <fieldset disabled={!own} class="tile-form">
      <h3>
        {d.name} <span class="dim">{id}</span>
      </h3>
      <Field label="Name">
        <Text value={d.name} onChange={(v) => set({ ...d, name: v ?? "" }, "name", "name")} />
      </Field>
      <Field label="Walking">
        <Check value={d.blocks} label="Blocks the way (off: walked over – stones, flowers)" onChange={(v) => set({ ...d, blocks: !!v }, v ? "blocks" : "walkable")} />
      </Field>
      <Field label="Fire">
        <Check value={d.flammable} label="Burns away (and passes the fire on)" onChange={(v) => set({ ...d, flammable: v }, "flammable")} />
      </Field>
      <Field label="Cut">
        <Check value={d.cuttable} label="Can be cut down (the Cut ability)" onChange={(v) => set({ ...d, cuttable: v }, "cuttable")} />
      </Field>
      <Field label="Frames">
        <div class="row wrap">
          <span class="dim">frame</span>
          <Num value={d.frame} min={0} width={56} onChange={(v) => set({ ...d, frame: v ?? 0 }, "frame", "frame")} />
          <Select
            value={d.views ? String(d.views) : ""}
            options={[["4", "4 frames – one per quarter turn"]]}
            empty="one frame for every view"
            title="Directional objects (a ship's wheel) have a frame per quarter turn of the board, from this frame on"
            onChange={(v) => set({ ...d, views: v ? Number(v) : undefined }, "rotations")}
          />
        </div>
      </Field>
    </fieldset>
  );
}

function PieceActions({ project, chipId, piece, onDeleted }: { project: Project; chipId: string; piece: PieceRef; onDeleted: () => void }) {
  if (!isOwnChipset(chipId)) return null;
  const users = pieceUsers(project.content.raw, chipId, piece.kind, piece.id);
  return (
    <div class="entry-refs">
      <h4 class="card-heading">Used in{users.length ? ` (${users.length})` : ""}</h4>
      {users.length ? <p class="hint">{users.join(", ")}</p> : <p class="hint">No map uses it yet.</p>}
      <div class="row">
        <button
          disabled={users.length > 0}
          title={users.length ? "Still used – maps would lose their tiles" : "Remove its rules (its frame stays in the sheet)"}
          onClick={() => {
            if (!confirm(`Delete ${piece.id}?`)) return;
            deletePiece(project, chipId, piece.kind, piece.id);
            onDeleted();
          }}
        >
          Delete
        </button>
      </div>
    </div>
  );
}
