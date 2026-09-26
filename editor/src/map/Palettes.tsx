import { useState } from "preact/hooks";
import type { ChipsetDef, Corner } from "../../../src/core/data/types";
import type { Dir } from "../../../src/core/util/grid";
import { MAX_HEIGHT } from "./layers";
import type { Brush } from "./MapEditor";
import { frameStyle } from "./sprites";

/** The Edit tab's brushes for Board and Decor mode (editor-design §5.2). */

const PIECES: { label: string; cut: Corner[]; hint: string }[] = [
  { label: "Full block", cut: [], hint: "An ordinary cube" },
  { label: "Half", cut: ["NW"], hint: "Cut along a diagonal – A/D turns it" },
  { label: "Point", cut: ["NW", "NE"], hint: "Two corners cut – a ship's bow; A/D turns it" },
];

function ShapeIcon({ cut, size = 18 }: { cut: Corner[]; size?: number }) {
  const corners: [Corner, number, number][] = [
    ["NW", 0, 0],
    ["NE", 16, 0],
    ["SE", 16, 16],
    ["SW", 0, 16],
  ];
  const pts = corners.filter(([k]) => !cut.includes(k)).map(([, x, y]) => [x, y]);
  if (cut.length === 2) pts.push([8, 8]);
  pts.sort((a, b) => Math.atan2(a[1] - 8, a[0] - 8) - Math.atan2(b[1] - 8, b[0] - 8));
  return (
    <svg width={size} height={size} viewBox="-1 -1 18 18" class="swatch">
      <rect x="0" y="0" width="16" height="16" fill="none" stroke="#3a4466" stroke-dasharray="2 2" />
      <polygon points={pts.map((p) => p.join(",")).join(" ")} fill="#feae34" />
    </svg>
  );
}

export function KeyHints({ items }: { items: [string, string][] }) {
  return (
    <div class="keys">
      {items.map(([k, v]) => (
        <div key={k}>
          <kbd>{k}</kbd> {v}
        </div>
      ))}
    </div>
  );
}

export function BoardPalette({ chip, brush, setBrush }: { chip: ChipsetDef; brush: Brush; setBrush: (b: Brush) => void }) {
  const [filter, setFilter] = useState("");
  const f = filter.toLowerCase();
  const terrains = Object.entries(chip.terrains).filter(([id, t]) => !f || id.includes(f) || t.name.toLowerCase().includes(f));
  const pieceKind = brush.piece.length === 0 ? 0 : brush.piece.length === 1 ? 1 : 2;
  const lintel = brush.board === "lintel";
  return (
    <>
      {/* the piece every painted cell gets – A/D turns it */}
      <div class="segmented wide">
        {PIECES.map((p, i) => (
          <button key={p.label} class={!lintel && pieceKind === i ? "on" : ""} title={p.hint} onClick={() => setBrush({ ...brush, board: "terrain", piece: pieceKind === i ? brush.piece : p.cut })}>
            <ShapeIcon cut={pieceKind === i ? brush.piece : p.cut} size={14} />
            {p.label}
          </button>
        ))}
      </div>
      <div class="row brush-height">
        <span class="dim">Height</span>
        <b>{brush.height === null ? "keep the cell's" : brush.height}</b>
        <span class="dim">(W / S)</span>
        {brush.height !== null && (
          <button onClick={() => setBrush({ ...brush, height: null })} title="Paint without changing heights">
            keep
          </button>
        )}
      </div>
      <input class="search" placeholder="Search terrain…" value={filter} onInput={(e) => setFilter(e.currentTarget.value)} />
      <div class="palette">
        {terrains.map(([id, t]) => (
          <button key={id} class={!lintel && brush.terrain === id ? "on" : ""} onClick={() => setBrush({ ...brush, board: "terrain", terrain: id })} title={`${t.name} (${id})${t.walkable ? "" : " – blocks"}`}>
            <span class="swatch" style={frameStyle(chip.image, chip.frameWidth, chip.frameHeight, 8, t.frame, 1, chip.frameHeight)} />
            {id}
          </button>
        ))}
      </div>
      <details class="lintel" open={lintel}>
        <summary>Door lintels</summary>
        <div class="stack">
          <button class={lintel ? "on" : ""} onClick={() => setBrush({ ...brush, board: lintel ? "terrain" : "lintel" })}>
            {lintel ? "Painting lintels – back to terrain" : "Paint lintels"}
          </button>
          <label>Lintel block</label>
          <select value={brush.lintel} onChange={(e) => setBrush({ ...brush, board: "lintel", lintel: e.currentTarget.value })}>
            {Object.entries(chip.terrains).map(([id, t]) => (
              <option key={id} value={id}>
                {t.name} ({id})
              </option>
            ))}
          </select>
          <label>Top at level</label>
          <input type="number" min={0} max={MAX_HEIGHT} value={brush.lintelTop} onInput={(e) => setBrush({ ...brush, board: "lintel", lintelTop: Number(e.currentTarget.value) })} />
          <p class="hint">The wall continues over a doorway: the block starts 4 levels above the doorway's floor (a character's height) and ends at this level – usually the wall's own height.</p>
        </div>
      </details>
      <KeyHints
        items={
          lintel
            ? [
                ["Left", "add a lintel"],
                ["Right", "remove the lintel"],
              ]
            : [
                ["Left", "paint terrain (and the piece)"],
                ["Right", "holes (no cell)"],
                ["W / S", "the height the next click paints (select tool: the cells)"],
                ["A / D", "turn the piece (select tool: the pieces on the map)"],
                ["B R G I M", "pencil, rectangle, fill, pick, select"],
              ]
        }
      />
    </>
  );
}

export function DecorPalette({ chip, brush, setBrush }: { chip: ChipsetDef; brush: Brush; setBrush: (b: Brush) => void }) {
  const [filter, setFilter] = useState("");
  const f = filter.toLowerCase();
  const list = Object.entries(chip.decor).filter(([id, d]) => !f || id.includes(f) || d.name.toLowerCase().includes(f));
  const directional = !!chip.decor[brush.decor]?.views;
  return (
    <>
      <input class="search" placeholder="Search decor…" value={filter} onInput={(e) => setFilter(e.currentTarget.value)} />
      <div class="palette">
        {list.map(([id, d]) => (
          <button key={id} class={brush.decor === id ? "on" : ""} onClick={() => setBrush({ ...brush, decor: id })} title={`${d.name} (${id})${d.blocks ? " – blocks" : ""}${d.views ? " – can face 4 ways" : ""}`}>
            <span class="swatch tall" style={frameStyle(chip.decorImage, chip.decorFrameWidth, chip.decorFrameHeight, 8, d.frame, 1, chip.decorAnchorY + 4)} />
            {id}
          </button>
        ))}
      </div>
      {directional && (
        <div class="row" style={{ marginTop: 8 }}>
          facing
          {(["N", "E", "S", "W"] as Dir[]).map((d) => (
            <button key={d} class={brush.decorFacing === d ? "on" : ""} onClick={() => setBrush({ ...brush, decorFacing: d })}>
              {d}
            </button>
          ))}
        </div>
      )}
      <KeyHints
        items={[
          ["Left", "place"],
          ["Right", "remove"],
          ["A / D", "turn the decor under the cursor (or the brush)"],
          ["W / S", "raise / lower the cell"],
          ["B R G I M", "pencil, rectangle, fill, pick, select"],
        ]}
      />
    </>
  );
}

