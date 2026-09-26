import type { EditorPlayMessage } from "../../src/game/editorLink";
import type { Project } from "./project";
import { projectAssetUrls } from "./storage";

/**
 * Play-testing (editor-design §4): opens the game in its own tab with `?editor=1`; when the game
 * says it is ready, it gets the editor's current content and how to start. Re-using the tab
 * reloads it, so every click on Play / Quick Play runs the latest edits.
 */
let game: Window | null = null;
let pending: EditorPlayMessage | null = null;

window.addEventListener("message", (e) => {
  if (e.origin !== location.origin || (e.data as { type?: string })?.type !== "board-rpg:ready") return;
  if (pending && e.source) (e.source as Window).postMessage(pending, location.origin);
});

export function playtest(project: Project, mode: "play" | "quick", map?: string) {
  pending = { type: "board-rpg:play", raw: structuredClone(project.content.raw), mode, map, assets: projectAssetUrls() };
  // the game: the dev server's root while developing; on the site where the build says (VITE_GAME_URL, e.g. ../play/)
  const url = new URL((import.meta.env.VITE_GAME_URL as string | undefined) ?? "../", location.href);
  url.searchParams.set("editor", "1");
  game = window.open(url.href, "board-rpg-playtest");
  game?.focus();
}
