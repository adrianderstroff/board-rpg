import { useEffect, useState } from "preact/hooks";

/**
 * Editor state kept in the browser (localStorage), so a reload – a hot reload while working on the
 * editor, or reopening the tab – comes back to the same place. Only per-browser conveniences live
 * here; the content itself is the data files (unsaved edits: Project's session).
 */

const PREFIX = "board-rpg-editor:";

/** The browser's localStorage, or null where there is none (tests) or it is blocked. */
export function browserStorage(): Pick<Storage, "getItem" | "setItem" | "removeItem"> | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

export function readStored<T>(key: string, fallback: T): T {
  try {
    const s = browserStorage()?.getItem(PREFIX + key);
    return s == null ? fallback : (JSON.parse(s) as T);
  } catch {
    return fallback;
  }
}

export function writeStored(key: string, value: unknown) {
  try {
    browserStorage()?.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // full or blocked: the editor works the same, it just won't remember this
  }
}

/**
 * useState that survives reloads. `fix` repairs a stored value (e.g. fills fields added since it
 * was stored).
 */
export function usePersistentState<T>(key: string, initial: T | (() => T), fix?: (stored: T) => T) {
  const [value, setValue] = useState<T>(() => {
    const init = typeof initial === "function" ? (initial as () => T)() : initial;
    const stored = readStored<T | undefined>(key, undefined);
    return stored === undefined ? init : fix ? fix(stored) : stored;
  });
  useEffect(() => writeStored(key, value), [key, value]);
  return [value, setValue] as const;
}

export const SESSION_KEY = `${PREFIX}session`;
