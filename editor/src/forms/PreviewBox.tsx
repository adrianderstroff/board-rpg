import type { ComponentChildren } from "preact";
import { Icon } from "../icons";

/**
 * A preview in the inspector with its ✎ in the top-right corner (graphics.md §3): the same on
 * every panel – name, preview, then the rest.
 */
export function PreviewBox({ onEdit, editTitle = "Draw it in the pixel editor", children }: { onEdit?: () => void; editTitle?: string; children: ComponentChildren }) {
  return (
    <div class="preview-box">
      {children}
      {onEdit && (
        <button class="preview-edit" title={editTitle} aria-label={editTitle} onClick={onEdit}>
          <Icon name="pencil" size={16} />
        </button>
      )}
    </div>
  );
}
