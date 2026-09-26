import { frameStyle } from "../map/sprites";
import { openImage } from "../pixel/target";
import { iconIndexOf, systemTarget } from "../pixel/system";
import { useProjectContext } from "../projectContext";
import { FloatingWindow } from "./FloatingWindow";

/**
 * The 16 px icons (system/icons.png, ASSETS.md): items, abilities, statuses, signs – the game's, or
 * the project's own sheet with its own names (graphics.md §2).
 */

/** A 16px icon, scaled. */
export function ItemIcon({ icon, scale = 2 }: { icon?: string; scale?: number }) {
  const project = useProjectContext();
  const frame = icon === undefined ? undefined : iconIndexOf(project.content.raw)[icon];
  if (frame === undefined) return <span class="item-icon none" style={{ width: 16 * scale, height: 16 * scale }} />;
  return <span class="item-icon" style={frameStyle("system/icons.png", 16, 16, 16, frame, scale)} />;
}

/** The icons to pick from (status and sign icons last); ✎ draws them. */
export function IconPicker({ value, onPick, onClose }: { value?: string; onPick: (icon: string | undefined) => void; onClose: () => void }) {
  const project = useProjectContext();
  const icons = iconIndexOf(project.content.raw);
  const names = Object.keys(icons).sort((a, b) => Number(/^(status|type|sign)_/.test(a)) - Number(/^(status|type|sign)_/.test(b)) || icons[a] - icons[b]);
  return (
    <FloatingWindow
      id="icon-picker"
      title="Pick an icon"
      onClose={onClose}
      size={{ w: 420, h: 380 }}
      toolbar={
        <div class="row">
          <span class="dim">{names.length} icons</span>
          <span class="spacer" />
          <button title="Draw icons – the sheet becomes the project's own on saving; new icons get names there" onClick={() => (onClose(), openImage(systemTarget(project, "icons", value ? icons[value] : undefined)))}>
            ✎ Draw icons
          </button>
        </div>
      }
    >
      <div class="icon-grid">
        <button class={value ? "" : "on"} title="No icon" onClick={() => onPick(undefined)}>
          <ItemIcon scale={2} />
        </button>
        {names.map((n) => (
          <button key={n} class={value === n ? "on" : ""} title={n} onClick={() => onPick(n)}>
            <ItemIcon icon={n} scale={2} />
          </button>
        ))}
      </div>
    </FloatingWindow>
  );
}
