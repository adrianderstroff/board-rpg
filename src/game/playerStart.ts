import { readBrpg, type BrpgGame } from "../content/brpg";

/**
 * The player (distribution.md §2): a game build without a game of its own starts from a `.brpg` –
 * the one the desktop app was started with (a double-click, a `game.brpg` beside it), else one the
 * player drops onto the window or opens.
 */

type TauriInternals = { invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> };
const tauri = () => (window as unknown as { __TAURI_INTERNALS__?: TauriInternals }).__TAURI_INTERNALS__;

/** The game the desktop app was started with, if any. */
async function startedWith(): Promise<Uint8Array | null> {
  const t = tauri();
  if (!t) return null;
  try {
    // raw bytes (an ArrayBuffer); empty: the app was started without a game
    const got = await t.invoke<ArrayBuffer | number[] | null>("initial_game");
    const bytes = got instanceof ArrayBuffer ? new Uint8Array(got) : Array.isArray(got) ? new Uint8Array(got) : null;
    return bytes?.length ? bytes : null;
  } catch {
    return null;
  }
}

/** A start screen: drop a .brpg here, or open one. */
function askForGame(error?: string): Promise<Uint8Array> {
  return new Promise((resolve) => {
    const box = document.createElement("div");
    box.className = "player-start";
    box.innerHTML = `
      <h1>Board RPG</h1>
      <p>Drop a game (<b>.brpg</b>) here, or</p>
      <label class="open">Open a game…<input type="file" accept=".brpg,.zip" hidden /></label>
      <p class="error"></p>`;
    (box.querySelector(".error") as HTMLElement).textContent = error ?? "";
    const style = document.createElement("style");
    style.textContent = `
      .player-start { position: fixed; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px;
        background: #181425; color: #e4e6f0; font: 16px system-ui, sans-serif; z-index: 10; }
      .player-start.drag { outline: 3px dashed #feae34; outline-offset: -16px; }
      .player-start h1 { color: #feae34; margin: 0 0 8px; }
      .player-start .open { padding: 8px 18px; border: 1px solid #3e8948; background: #265c42; border-radius: 6px; cursor: pointer; }
      .player-start .error { color: #ff7b85; min-height: 1.2em; }`;
    document.body.append(style, box);
    const take = async (file: File | undefined) => {
      if (!file) return;
      box.remove();
      style.remove();
      resolve(new Uint8Array(await file.arrayBuffer()));
    };
    (box.querySelector("input") as HTMLInputElement).onchange = (e) => void take((e.target as HTMLInputElement).files?.[0]);
    box.ondragover = (e) => {
      e.preventDefault();
      box.classList.add("drag");
    };
    box.ondragleave = () => box.classList.remove("drag");
    box.ondrop = (e) => {
      e.preventDefault();
      void take(e.dataTransfer?.files?.[0]);
    };
  });
}

/** The game to play: the one the app was started with, else the one the player picks (asking again after a bad file). */
export async function playerGame(): Promise<BrpgGame> {
  let bytes = await startedWith();
  let error: string | undefined;
  for (;;) {
    if (!bytes) bytes = await askForGame(error);
    try {
      return readBrpg(bytes);
    } catch (e) {
      error = (e as Error).message;
      bytes = null;
    }
  }
}
