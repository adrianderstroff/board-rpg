import iconIndex from "../../../public/assets/system/icons.json";
import { frameStyle } from "../map/sprites";
import { FloatingWindow } from "./FloatingWindow";

/** The game's 16 px icons (system/icons.png, ASSETS.md): items, abilities, statuses, signs. */
const ICONS = iconIndex as Record<string, number>;

/** A 16px icon of the game's icon sheet (system/icons.png), scaled. */
export function ItemIcon({ icon, scale = 2 }: { icon?: string; scale?: number }) {
  const frame = icon === undefined ? undefined : ICONS[icon];
  if (frame === undefined) return <span class="item-icon none" style={{ width: 16 * scale, height: 16 * scale }} />;
  return <span class="item-icon" style={frameStyle("system/icons.png", 16, 16, 16, frame, scale)} />;
}

/** The game's icons (system/icons.png) to pick from; status and sign icons last. */
export function IconPicker({ value, onPick, onClose }: { value?: string; onPick: (icon: string | undefined) => void; onClose: () => void }) {
  const names = Object.keys(ICONS).sort((a, b) => Number(/^(status|type|sign)_/.test(a)) - Number(/^(status|type|sign)_/.test(b)) || ICONS[a] - ICONS[b]);
  return (
    <FloatingWindow id="icon-picker" title="Pick an icon" onClose={onClose} size={{ w: 420, h: 380 }}>
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
