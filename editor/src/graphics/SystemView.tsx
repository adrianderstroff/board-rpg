import { SYSTEM_IMAGES, type SystemImage } from "../../../src/core/data/types";
import { assetUrl } from "../map/sprites";
import { usePersistentState } from "../persist";
import { openImage } from "../pixel/target";
import { dropSystemCopy, ownsSystem, SYSTEM_META, systemImagePath, systemTarget } from "../pixel/system";
import { signsTarget } from "../pixel/targets";
import type { Project } from "../project";

/**
 * Game images (graphics.md §2): the runtime's own images – icons, the title, the window skin, the
 * cursors, the font … – and the wall signs; each can become the project's own, drawn in the pixel
 * editor, or go back to the game's.
 */

type Pick = SystemImage | "wall_signs";

export function useSystemState() {
  const [sel, setSel] = usePersistentState<Pick | null>("system.selected", null);
  return { sel, setSel };
}
export type SystemState = ReturnType<typeof useSystemState>;

export function SystemMain({ project, state }: { project: Project; state: SystemState }) {
  const raw = project.content.raw;
  const signs = raw.graphics.wallSigns;
  return (
    <div class="tiles">
      <div class="resources-head">
        <p class="hint">The game's own images. Edit one to draw it – on saving it becomes the project's own copy, which the game uses from then on.</p>
      </div>
      <div class="cards system-cards">
        {SYSTEM_IMAGES.map((name) => (
          <button key={name} class={`card ${state.sel === name ? "on" : ""}`} title={SYSTEM_META[name].hint} onClick={() => state.setSel(name)}>
            <img class="thumb system-thumb" src={assetUrl(systemImagePath(name))} alt="" />
            <span class="name">{SYSTEM_META[name].label}</span>
            {ownsSystem(raw, name) && <span class="tag">project's own</span>}
          </button>
        ))}
        {signs && (
          <button class={`card ${state.sel === "wall_signs" ? "on" : ""}`} title="Lettering painted onto wall faces (INN …)" onClick={() => state.setSel("wall_signs")}>
            <img class="thumb system-thumb" src={assetUrl(signs.image)} alt="" />
            <span class="name">Wall signs</span>
            {!signs.image.startsWith("library/") && <span class="tag">project's own</span>}
          </button>
        )}
      </div>
    </div>
  );
}

export function SystemInspector({ project, state }: { project: Project; state: SystemState }) {
  const raw = project.content.raw;
  const sel = state.sel;
  if (!sel) return <p class="hint">Select one of the game's images to draw it.</p>;
  if (sel === "wall_signs") {
    const t = signsTarget(project);
    return (
      <div class="item-card">
        <h3>Wall signs</h3>
        <p class="hint">Lettering the board paints onto wall faces next to doors – 48 × 14 frames.</p>
        {t && (
          <button class="primary" onClick={() => openImage(t)}>
            ✎ Edit image
          </button>
        )}
      </div>
    );
  }
  const m = SYSTEM_META[sel];
  const own = ownsSystem(raw, sel);
  return (
    <div class="item-card">
      <h3>{m.label}</h3>
      <p class="hint">{m.hint}</p>
      <div class="resource-preview">
        <img src={assetUrl(systemImagePath(sel))} alt="" />
      </div>
      <p class="hint">{own ? "The project's own copy – the game uses it instead of its own." : "The game's own image."}</p>
      <div class="row wrap">
        <button class="primary" title={own ? "Draw it" : "Draw it – saving makes the project's own copy"} onClick={() => openImage(systemTarget(project, sel))}>
          ✎ Edit image
        </button>
        {own && (
          <button
            title="Remove the project's copy – the game's own image is used again"
            onClick={() => {
              if (confirm(`Use the game's own ${m.label.toLowerCase()} again? The project's copy is deleted.`)) void dropSystemCopy(project, sel);
            }}
          >
            Use the game's own
          </button>
        )}
      </div>
    </div>
  );
}
