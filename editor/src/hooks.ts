import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import type { Project } from "./project";

/** Re-renders the component whenever the project changes; returns the project's version. */
export function useProject(project: Project): number {
  const [version, setVersion] = useState(project.version);
  useEffect(() => project.subscribe(() => setVersion(project.version)), [project]);
  return version;
}

/**
 * A dropdown that closes when the pointer goes down anywhere outside it (or on Esc). Returns the
 * ref for the menu's anchor element (the button and the menu inside it).
 */
export function useDismiss<T extends HTMLElement>(open: boolean, close: () => void) {
  const ref = useRef<T>(null);
  // right after the render (not after the next paint): a click straight after opening closes it too
  useLayoutEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => ref.current && !ref.current.contains(e.target as Node) && close();
    const key = (e: KeyboardEvent) => e.key === "Escape" && close();
    addEventListener("pointerdown", down, true);
    addEventListener("keydown", key);
    return () => {
      removeEventListener("pointerdown", down, true);
      removeEventListener("keydown", key);
    };
  }, [open]);
  return ref;
}
