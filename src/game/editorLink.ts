import type { RawContent } from "../core/data/database";

/**
 * Play-testing from the editor (editor-design §4): a game opened with `?editor=1` asks the window
 * that opened it (or its parent frame) for the content to run and how to start.
 */
export interface EditorPlayMessage {
  type: "board-rpg:play";
  /** The editor's current content (saved or not). */
  raw: RawContent;
  /** `play`: title and New Game as usual; `quick`: straight onto `map` (its Quick Play entity). */
  mode: "play" | "quick";
  map?: string;
}

export const READY_MESSAGE = "board-rpg:ready";

export function isEditorPlaytest(): boolean {
  return new URLSearchParams(location.search).has("editor");
}

/** Announces the game to the editor and waits for the content to play. */
export function receiveFromEditor(): Promise<EditorPlayMessage> {
  return new Promise((resolve) => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== location.origin || (e.data as { type?: string })?.type !== "board-rpg:play") return;
      window.removeEventListener("message", onMessage);
      resolve(e.data as EditorPlayMessage);
    };
    window.addEventListener("message", onMessage);
    const editor = (window.opener as Window | null) ?? (window.parent !== window ? window.parent : null);
    editor?.postMessage({ type: READY_MESSAGE }, location.origin);
  });
}
