import type { ComponentChildren } from "preact";
import { createPortal } from "preact/compat";
import { useEffect, useRef, useState } from "preact/hooks";
import { readStored, writeStored } from "../persist";

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const MIN_W = 280;
const MIN_H = 220;

/** Keeps a window inside the browser window (at least its title bar reachable). */
function clamp(r: Rect): Rect {
  const w = Math.max(MIN_W, Math.min(r.w, innerWidth - 16));
  const h = Math.max(MIN_H, Math.min(r.h, innerHeight - 16));
  return { w, h, x: Math.max(8, Math.min(r.x, innerWidth - w - 8)), y: Math.max(8, Math.min(r.y, innerHeight - h - 8)) };
}

/**
 * A window floating over the editor: opens in the middle, dragged by its title bar, resized at its
 * lower right corner (the size is remembered per `id`); Escape or × closes it. Lives outside the
 * layout, so no panel cuts it off.
 */
export function FloatingWindow({ id, title, onClose, toolbar, children, size = { w: 560, h: 520 } }: { id: string; title: string; onClose: () => void; toolbar?: ComponentChildren; children: ComponentChildren; size?: { w: number; h: number } }) {
  const [rect, setRect] = useState<Rect>(() => {
    const { w, h } = readStored(`window.${id}`, size);
    return clamp({ w, h, x: (innerWidth - w) / 2, y: (innerHeight - h) / 2 });
  });
  const latest = useRef(rect);
  latest.current = rect;

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);

  /** Follows the pointer until it is released: moving the window or resizing it. */
  const track = (e: PointerEvent, change: (start: Rect, dx: number, dy: number) => Rect) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const start = latest.current;
    const sx = e.clientX;
    const sy = e.clientY;
    const move = (m: PointerEvent) => setRect(clamp(change(start, m.clientX - sx, m.clientY - sy)));
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      writeStored(`window.${id}`, { w: latest.current.w, h: latest.current.h });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  return createPortal(
    <div class="float-window" role="dialog" aria-label={title} style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}>
      <div class="float-title" onPointerDown={(e) => track(e as unknown as PointerEvent, (s, dx, dy) => ({ ...s, x: s.x + dx, y: s.y + dy }))}>
        <span>{title}</span>
        <button class="icon-button close" title="Close (Esc)" aria-label="Close" onPointerDown={(e) => e.stopPropagation()} onClick={onClose}>
          ×
        </button>
      </div>
      {toolbar && <div class="float-toolbar">{toolbar}</div>}
      <div class="float-body">{children}</div>
      <div class="float-resize" title="Drag to resize" onPointerDown={(e) => track(e as unknown as PointerEvent, (s, dx, dy) => ({ ...s, w: Math.max(MIN_W, s.w + dx), h: Math.max(MIN_H, s.h + dy) }))} />
    </div>,
    document.body,
  );
}
