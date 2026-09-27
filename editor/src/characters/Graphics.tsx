import { useEffect, useState } from "preact/hooks";
import type { GraphicsDb } from "../../../src/core/data/types";
import { DIR_ROW } from "../../../src/game/keys";
import { FloatingWindow } from "../forms/FloatingWindow";
import { assetUrl, frameStyle } from "../map/sprites";
import { Thumb } from "../screens/ResourcesScreen";
import { LibraryMark } from "../icons";
import { useProjectContext } from "../projectContext";
import { openImage } from "../pixel/target";
import { graphicTarget } from "../pixel/targets";

/**
 * A character's graphics (editor-design §7): picked from thumbnails of the Resources, and shown as
 * the game shows them – walking in four facings, the battle poses, the face at its sizes.
 */

export type GraphicKind = "charsets" | "battlers" | "faces";
const KIND_NAME: Record<GraphicKind, string> = { charsets: "Board sprite", battlers: "Battle sprite", faces: "Face" };
const plain = (id: string) => id.replace(/^lib:/, "");

/** A graphic field: its thumbnail and name; a click opens the picker. */
export function GraphicField({ graphics, kind, value, onChange, optional }: { graphics: GraphicsDb; kind: GraphicKind; value: string | undefined; onChange: (id: string | undefined) => void; optional?: boolean }) {
  const [open, setOpen] = useState(false);
  const project = useProjectContext();
  const known = !value || !!graphics[kind][value];
  return (
    <>
      <div class="graphic-row">
        <button class={`graphic-field ${known ? "" : "bad"}`} title={`Pick the ${KIND_NAME[kind].toLowerCase()}`} onClick={() => setOpen(true)}>
          {value && known ? <Thumb graphics={graphics} kind={kind} id={value} /> : <span class="thumb none">{value ? "?" : "–"}</span>}
          <span class="name">{value ? plain(value) + (known ? "" : " (missing!)") : "none"}</span>
        </button>
        {value && known && (
          <button
            class="edit-image"
            title={value.startsWith("lib:") ? "Draw it – a library image is copied into the project when you save, and this uses the copy" : "Draw it in the pixel editor"}
            onClick={() => openImage(graphicTarget(project, kind, value, (copy) => onChange(copy)))}
          >
            ✎
          </button>
        )}
      </div>
      {open && (
        <GraphicPicker
          graphics={graphics}
          kind={kind}
          value={value}
          optional={optional}
          onPick={(id) => {
            onChange(id);
            setOpen(false);
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function GraphicPicker({ graphics, kind, value, optional, onPick, onClose }: { graphics: GraphicsDb; kind: GraphicKind; value?: string; optional?: boolean; onPick: (id: string | undefined) => void; onClose: () => void }) {
  const [filter, setFilter] = useState("");
  // the project's own first, then the library's
  const ids = Object.keys(graphics[kind])
    .filter((id) => id.toLowerCase().includes(filter.toLowerCase()))
    .sort((a, b) => Number(a.startsWith("lib:")) - Number(b.startsWith("lib:")) || a.localeCompare(b));
  return (
    <FloatingWindow
      id={`graphic-picker-${kind}`}
      title={KIND_NAME[kind]}
      onClose={onClose}
      size={{ w: 560, h: 480 }}
      toolbar={<input class="search" placeholder="Search…" value={filter} autoFocus onInput={(e) => setFilter(e.currentTarget.value)} />}
    >
      <div class="cards">
        {optional && (
          <button class={`card ${value ? "" : "on"}`} onClick={() => onPick(undefined)}>
            <span class="thumb none">–</span>
            <span class="name">none</span>
          </button>
        )}
        {ids.map((id) => (
          <button key={id} class={`card ${value === id ? "on" : ""}`} title={id} onClick={() => onPick(id)}>
            <Thumb graphics={graphics} kind={kind} id={id} />
            <span class="name">{plain(id)}</span>
            {id.startsWith("lib:") && <LibraryMark />}
          </button>
        ))}
      </div>
    </FloatingWindow>
  );
}

/** A frame counter for walking animations (0 1 2 1 …). */
function useStep(ms: number): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setN((x) => x + 1), ms);
    return () => clearInterval(t);
  }, [ms]);
  return n;
}

/** The board sprite walking in all four facings. */
export function WalkPreview({ graphics, charset, scale = 2 }: { graphics: GraphicsDb; charset: string | undefined; scale?: number }) {
  const step = useStep(220);
  const s = charset ? graphics.charsets[charset] : undefined;
  if (!s) return null;
  const col = [0, 1, 2, 1][step % 4];
  return (
    <div class="walk-preview">
      {(["S", "W", "E", "N"] as const).map((d) => (
        <span key={d} title={{ S: "south", W: "west", E: "east", N: "north" }[d]} style={frameStyle(s.image, s.frameWidth, s.frameHeight, 3, DIR_ROW[d] * 3 + col, scale)} />
      ))}
    </div>
  );
}

/** The battle sprite's poses, each named. */
export function PosePreview({ graphics, battler }: { graphics: GraphicsDb; battler: string | undefined }) {
  const s = battler ? graphics.battlers[battler] : undefined;
  if (!s) return null;
  const cols = Math.max(...Object.values(s.frames ?? { idle: 0 })) + 1;
  const scale = s.frameWidth > 64 ? 1 : 2;
  return (
    <div class="pose-preview">
      {Object.entries(s.frames ?? { idle: 0 }).map(([pose, f]) => (
        <figure key={pose}>
          <span style={frameStyle(s.image, s.frameWidth, s.frameHeight, cols, f, scale)} />
          <figcaption>{pose}</figcaption>
        </figure>
      ))}
    </div>
  );
}

/** The face as the game shows it: in dialogs (48 px), menus (24) and the turn order (14). */
export function FacePreview({ graphics, face }: { graphics: GraphicsDb; face: string | undefined }) {
  const f = face ? graphics.faces[face] : undefined;
  if (!f) return null;
  return (
    <div class="face-preview">
      {[48, 24, 14].map((px) => (
        <img key={px} src={assetUrl(f.image)} width={px} height={px} alt="" title={`${px} px`} />
      ))}
    </div>
  );
}
