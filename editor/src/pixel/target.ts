/**
 * What the pixel editor works on (graphics.md §5): an image, how its frames are laid out, what kind
 * it is (for guides and the preview) and how it is saved – a library or game image is copied into
 * the project on its first save.
 */

export type ImageKind =
  | "charset"
  | "battler"
  | "face"
  | "battleback"
  | "blocks"
  | "decor"
  | "signs"
  | "icons"
  | "statusIcons"
  | "title"
  | "window"
  | "cursor"
  | "boardCursor"
  | "highlight"
  | "exitArrows"
  | "fieldEffects"
  | "shadow"
  | "font";

export interface ImageTarget {
  /** Unique per image (window state, reopening). */
  key: string;
  title: string;
  kind: ImageKind;
  /** The image to load (a content path, or system/<file>.png). */
  image: string;
  /** Frame size; `cols` = frames per row (default: as many as fit the width). */
  layout: { fw: number; fh: number; cols?: number };
  /** The frame to start on. */
  frame?: number;
  /** Names of frames (poses, icons, directions) – shown on the strip. */
  frameNames?: Record<number, string>;
  /** Frames can be added (a new tile, a new icon) – the sheet grows in its layout. */
  canAddFrames?: boolean;
  /** Frames can be named (icons): the name is how content refers to the frame. */
  rename?: (frame: number, name: string) => string | null;
  /** Said above the canvas: "Library image – saving makes a copy in the project". */
  note?: string;
  /** For the preview: what it belongs to (a battle background's floor, a tile's fill block …), per frame. */
  context?: Record<string, unknown> | ((frame: number) => Record<string, unknown>);
  /** Writes the image; resolves to the target to keep editing (a copy after a library image's first save). */
  save(png: Blob, width: number, height: number): Promise<ImageTarget | void>;
}

/** The preview's context for a frame. */
export const contextOf = (t: ImageTarget, frame: number): Record<string, unknown> => (typeof t.context === "function" ? t.context(frame) : (t.context ?? {}));

type Listener = (t: ImageTarget | null) => void;
let open: ImageTarget | null = null;
const listeners = new Set<Listener>();

/** Opens the pixel editor on an image (from Graphics or a ✎ where the image is used). */
export function openImage(t: ImageTarget) {
  open = t;
  for (const l of listeners) l(open);
}

export function closeImage() {
  open = null;
  for (const l of listeners) l(null);
}

export function onImageOpen(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export const openedImage = () => open;
