import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import type { Project } from "../project";
import { sheetCanvas } from "../graphics/sheets";
import { blank, clearRect, clone, colorsIn, copyRect, fill, flip, frameRect, fromHex, GAME_PALETTE, get, grow, hex, line, paste, plot, rect, shift, TRANSPARENT, type Pixels, type Rect, type Rgba } from "./pixels";
import { closeImage, contextOf, onImageOpen, openedImage, openImage, type ImageTarget } from "./target";
import { ImagePreview, PreviewPane } from "./previews";
import { Icon } from "../icons";

/**
 * The pixel editor (graphics.md §5): one workspace over the editor, the same from Graphics and
 * from a ✎ where an image is used. Frames on the left, the frame zoomed in the middle, colours and
 * the kind's live preview on the right. Its own undo; Save writes the PNG.
 */

type Tool = "pencil" | "eraser" | "fill" | "line" | "rect" | "rectFill" | "picker" | "select";

/** The tools with their icon (icons.tsx) and tooltip. */
const TOOLS: [Tool, string, string][] = [
  ["pencil", "pencil", "Pencil (B) – right button erases"],
  ["eraser", "eraser", "Eraser (E)"],
  ["fill", "fill", "Fill (G) – an area of one colour"],
  ["line", "line", "Line (L)"],
  ["rect", "rect", "Rectangle (R)"],
  ["rectFill", "rectFill", "Filled rectangle (Shift+R)"],
  ["picker", "eyedropper", "Pick a colour (I) – or Alt+click"],
  ["select", "select", "Select (M) – drag inside to move; Ctrl+C / Ctrl+V / Del"],
];
const KEYS: Record<string, Tool> = { b: "pencil", e: "eraser", g: "fill", l: "line", r: "rect", i: "picker", m: "select" };

/** The editor's host: shows the workspace while an image is open. */
export function PixelEditorHost({ project }: { project: Project }) {
  const [t, setT] = useState<ImageTarget | null>(openedImage());
  useEffect(() => onImageOpen(setT), []);
  return t ? <PixelEditor key={t.key} project={project} target={t} /> : null;
}

/** The sheet as an ImageData-like buffer. */
async function loadPixels(path: string): Promise<Pixels> {
  const c = await sheetCanvas(path);
  return c.getContext("2d")!.getImageData(0, 0, c.width, c.height);
}

export function pixelsCanvas(p: Pixels, into?: HTMLCanvasElement): HTMLCanvasElement {
  const c = into ?? document.createElement("canvas");
  if (c.width !== p.width || c.height !== p.height) {
    c.width = p.width;
    c.height = p.height;
  }
  c.getContext("2d")!.putImageData(new ImageData(new Uint8ClampedArray(p.data), p.width, p.height), 0, 0);
  return c;
}

function PixelEditor({ project, target }: { project: Project; target: ImageTarget }) {
  const [pix, setPix] = useState<Pixels | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [frame, setFrame] = useState(target.frame ?? 0);
  const [tool, setTool] = useState<Tool>("pencil");
  const [color, setColor] = useState<Rgba>(GAME_PALETTE[19]);
  const [zoom, setZoom] = useState(0);
  const [showGrid, setShowGrid] = useState(true);
  const [onion, setOnion] = useState(false);
  const [mirror, setMirror] = useState(false);
  const [selection, setSelection] = useState<Rect | null>(null);
  const [clipboard, setClipboard] = useState<Pixels | null>(null);
  const [pasting, setPasting] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const undo = useRef<Pixels[]>([]);
  const redo = useRef<Pixels[]>([]);
  const canvas = useRef<HTMLCanvasElement>(null);
  const area = useRef<HTMLDivElement>(null);
  const sheet = useRef<HTMLCanvasElement>(document.createElement("canvas"));
  // a stroke or drag in progress
  const drag = useRef<{ tool: Tool; button: number; start: [number, number]; last: [number, number]; lifted?: Pixels; origin?: Rect } | null>(null);
  const [hover, setHover] = useState<[number, number] | null>(null);
  const [preview, setPreview] = useState<[number, number] | null>(null);

  useEffect(() => {
    loadPixels(target.image)
      .then((p) => setPix(p))
      .catch((e) => setError((e as Error).message));
  }, [target.image]);

  // the frame layout (0 = the whole image)
  const fw = pix ? target.layout.fw || pix.width : 1;
  const fh = pix ? target.layout.fh || pix.height : 1;
  const cols = pix ? (target.layout.cols ?? Math.max(1, Math.floor(pix.width / fw))) : 1;
  const count = pix ? cols * Math.max(1, Math.floor(pix.height / fh)) : 0;
  const clip = frameRect(Math.min(frame, Math.max(0, count - 1)), fw, fh, cols);

  // a zoom that fits the frame into the canvas area
  useEffect(() => {
    if (!pix || zoom || !area.current) return;
    const r = area.current.getBoundingClientRect();
    setZoom(Math.max(1, Math.min(32, Math.floor(Math.min((r.width - 40) / fw, (r.height - 40) / fh)))));
  }, [pix, fw, fh]);

  const changed = () => {
    setVersion((v) => v + 1);
    setDirty(true);
  };
  const checkpoint = () => {
    if (!pix) return;
    undo.current.push(clone(pix));
    if (undo.current.length > 80) undo.current.shift();
    redo.current = [];
  };
  const restore = (from: Pixels[], to: Pixels[]) => {
    const p = from.pop();
    if (!p || !pix) return;
    to.push(clone(pix));
    setPix(p);
    changed();
  };

  // ---------- drawing ----------

  const at = (e: PointerEvent): [number, number] => {
    const r = canvas.current!.getBoundingClientRect();
    return [clip.x + Math.floor((e.clientX - r.left) / zoom), clip.y + Math.floor((e.clientY - r.top) / zoom)];
  };
  const inSel = (x: number, y: number) => !!selection && x >= selection.x && y >= selection.y && x < selection.x + selection.w && y < selection.y + selection.h;
  const paint = (b: number): Rgba => (b === 2 ? TRANSPARENT : color);

  // panning big images: the middle button, or Space held
  const pan = useRef<{ x: number; y: number } | null>(null);
  const space = useRef(false);
  useEffect(() => {
    const d = (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.target instanceof HTMLInputElement) return;
      space.current = true;
      e.preventDefault();
    };
    const u = (e: KeyboardEvent) => {
      if (e.code === "Space") space.current = false;
    };
    window.addEventListener("keydown", d);
    window.addEventListener("keyup", u);
    return () => {
      window.removeEventListener("keydown", d);
      window.removeEventListener("keyup", u);
    };
  }, []);

  const down = (e: PointerEvent) => {
    if (!pix) return;
    e.preventDefault();
    if (e.button === 1 || space.current) {
      pan.current = { x: e.clientX, y: e.clientY };
      canvas.current!.setPointerCapture(e.pointerId);
      return;
    }
    canvas.current!.setPointerCapture(e.pointerId);
    const [x, y] = at(e);
    const t: Tool = e.altKey ? "picker" : tool;
    if (pasting && clipboard) {
      checkpoint();
      paste(pix, clipboard, x, y, clip, true);
      setPasting(false);
      setSelection({ x, y, w: clipboard.width, h: clipboard.height });
      changed();
      return;
    }
    if (t === "picker") {
      setColor(get(pix, x, y));
      return;
    }
    if (t === "fill") {
      checkpoint();
      if (fill(pix, x, y, paint(e.button), clip)) changed();
      else undo.current.pop();
      return;
    }
    if (t === "select") {
      if (selection && inSel(x, y)) {
        // lift the selected pixels and move them
        checkpoint();
        const lifted = copyRect(pix, selection);
        clearRect(pix, selection);
        drag.current = { tool: t, button: e.button, start: [x, y], last: [x, y], lifted, origin: selection };
      } else {
        drag.current = { tool: t, button: e.button, start: [x, y], last: [x, y] };
        setSelection(null);
      }
      return;
    }
    checkpoint();
    drag.current = { tool: t, button: e.button, start: [x, y], last: [x, y] };
    if (t === "pencil" || t === "eraser") {
      plot(pix, x, y, t === "eraser" ? TRANSPARENT : paint(e.button), clip, mirror);
      changed();
    } else setPreview([x, y]);
  };

  const move = (e: PointerEvent) => {
    if (!pix) return;
    if (pan.current && area.current) {
      area.current.scrollBy(pan.current.x - e.clientX, pan.current.y - e.clientY);
      pan.current = { x: e.clientX, y: e.clientY };
      return;
    }
    const [x, y] = at(e);
    setHover([x, y]);
    const d = drag.current;
    if (!d) return;
    if (d.tool === "pencil" || d.tool === "eraser") {
      line(pix, d.last[0], d.last[1], x, y, d.tool === "eraser" ? TRANSPARENT : paint(d.button), clip, mirror);
      d.last = [x, y];
      changed();
    } else if (d.tool === "select") {
      if (d.lifted && d.origin) setSelection({ ...d.origin, x: d.origin.x + x - d.start[0], y: d.origin.y + y - d.start[1] });
      else setSelection(normal(d.start, [x, y], clip));
      d.last = [x, y];
    } else setPreview([x, y]);
  };

  const up = (e: PointerEvent) => {
    if (pan.current) {
      pan.current = null;
      return;
    }
    const d = drag.current;
    drag.current = null;
    if (!d || !pix) return;
    const [x, y] = at(e);
    if (d.tool === "line") line(pix, d.start[0], d.start[1], x, y, paint(d.button), clip, mirror);
    else if (d.tool === "rect" || d.tool === "rectFill") rect(pix, d.start[0], d.start[1], x, y, paint(d.button), clip, d.tool === "rectFill", mirror);
    else if (d.tool === "select" && d.lifted && d.origin) {
      const nx = d.origin.x + x - d.start[0];
      const ny = d.origin.y + y - d.start[1];
      paste(pix, d.lifted, nx, ny, clip, true);
      setSelection({ ...d.origin, x: nx, y: ny });
    } else if (d.tool === "select") {
      const s = normal(d.start, [x, y], clip);
      setSelection(s.w > 1 || s.h > 1 ? s : null);
      return;
    }
    setPreview(null);
    changed();
  };

  // ---------- commands ----------

  const region = () => selection ?? clip;
  const cmd = {
    flipX: () => (checkpoint(), flip(pix!, region(), "x"), changed()),
    flipY: () => (checkpoint(), flip(pix!, region(), "y"), changed()),
    nudge: (dx: number, dy: number) => (checkpoint(), shift(pix!, region(), dx, dy), changed()),
    copy: () => pix && (setClipboard(copyRect(pix, region())), setMessage(selection ? "Copied the selection" : "Copied the frame")),
    paste: () => clipboard && setPasting(true),
    pasteFrame: () => {
      if (!clipboard || !pix) return;
      checkpoint();
      clearRect(pix, clip);
      paste(pix, clipboard, clip.x, clip.y, clip);
      changed();
    },
    clear: () => (checkpoint(), clearRect(pix!, region()), changed()),
    addFrame: () => {
      if (!pix) return;
      checkpoint();
      const next = count;
      const r = frameRect(next, fw, fh, cols);
      setPix(grow(pix, Math.max(pix.width, cols * fw), r.y + fh));
      setFrame(next);
      changed();
    },
  };

  const save = async () => {
    if (!pix) return;
    setSaving(true);
    setMessage(null);
    try {
      const c = pixelsCanvas(pix);
      const png = await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("Can't write the image"))), "image/png"));
      const next = await target.save(png, pix.width, pix.height);
      setDirty(false);
      setMessage("Saved");
      if (next) openImage({ ...next, frame });
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setSaving(false);
    }
  };
  const close = () => {
    if (dirty && !confirm("Close without saving the image?")) return;
    closeImage();
  };

  // keys: tools, undo / redo, copy / paste, frames – before the editor's own shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement && e.target.type !== "range") return;
      const k = e.key.toLowerCase();
      const mod = e.ctrlKey || e.metaKey;
      let used = true;
      if (mod && k === "z") restore(e.shiftKey ? redo.current : undo.current, e.shiftKey ? undo.current : redo.current);
      else if (mod && k === "y") restore(redo.current, undo.current);
      else if (mod && k === "s") void save();
      else if (mod && k === "c") cmd.copy();
      else if (mod && k === "v") cmd.paste();
      else if (k === "escape") pasting ? setPasting(false) : selection ? setSelection(null) : close();
      else if (k === "delete" || k === "backspace") cmd.clear();
      else if (k === "[") setFrame((f) => Math.max(0, f - 1));
      else if (k === "]") setFrame((f) => Math.min(count - 1, f + 1));
      else if (k.startsWith("arrow")) cmd.nudge(k === "arrowleft" ? -1 : k === "arrowright" ? 1 : 0, k === "arrowup" ? -1 : k === "arrowdown" ? 1 : 0);
      else if (k === "r" && e.shiftKey) setTool("rectFill");
      else if (!mod && KEYS[k]) setTool(KEYS[k]);
      else if (k === "+" || k === "=") setZoom((z) => Math.min(48, z + 1));
      else if (k === "-") setZoom((z) => Math.max(1, z - 1));
      else used = false;
      if (used) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });

  // ---------- drawing the canvas ----------

  useEffect(() => {
    const cv = canvas.current;
    if (!cv || !pix || !zoom) return;
    cv.width = fw * zoom;
    cv.height = fh * zoom;
    const g = cv.getContext("2d")!;
    g.imageSmoothingEnabled = false;
    // a checkerboard shows what's transparent
    const s = Math.max(4, zoom);
    for (let y = 0; y < fh * zoom; y += s) for (let x = 0; x < fw * zoom; x += s) {
      g.fillStyle = ((x + y) / s) % 2 ? "#262b44" : "#1d2030";
      g.fillRect(x, y, s, s);
    }
    if (onion && frame > 0) {
      const p = frameRect(frame - 1, fw, fh, cols);
      g.globalAlpha = 0.3;
      g.drawImage(sheet.current, p.x, p.y, fw, fh, 0, 0, fw * zoom, fh * zoom);
      g.globalAlpha = 1;
    }
    g.drawImage(sheet.current, clip.x, clip.y, fw, fh, 0, 0, fw * zoom, fh * zoom);
    // a line or rectangle being dragged
    const d = drag.current;
    if (d && preview && (d.tool === "line" || d.tool === "rect" || d.tool === "rectFill")) {
      const tmp = blank(pix.width, pix.height);
      const c = paint(d.button)[3] ? paint(d.button) : ([255, 255, 255, 120] as Rgba);
      if (d.tool === "line") line(tmp, d.start[0], d.start[1], preview[0], preview[1], c, clip, mirror);
      else rect(tmp, d.start[0], d.start[1], preview[0], preview[1], c, clip, d.tool === "rectFill", mirror);
      g.drawImage(pixelsCanvas(copyRect(tmp, clip)), 0, 0, fw * zoom, fh * zoom);
    }
    if (pasting && clipboard && hover) {
      g.globalAlpha = 0.7;
      g.drawImage(pixelsCanvas(clipboard), (hover[0] - clip.x) * zoom, (hover[1] - clip.y) * zoom, clipboard.width * zoom, clipboard.height * zoom);
      g.globalAlpha = 1;
    }
    if (showGrid && zoom >= 6) {
      g.strokeStyle = "rgba(255,255,255,0.07)";
      g.lineWidth = 1;
      g.beginPath();
      for (let x = 1; x < fw; x++) (g.moveTo(x * zoom + 0.5, 0), g.lineTo(x * zoom + 0.5, fh * zoom));
      for (let y = 1; y < fh; y++) (g.moveTo(0, y * zoom + 0.5), g.lineTo(fw * zoom, y * zoom + 0.5));
      g.stroke();
    }
    drawGuides(g, target, fw, fh, zoom);
    if (selection) {
      g.setLineDash([4, 3]);
      g.strokeStyle = "#feae34";
      g.strokeRect((selection.x - clip.x) * zoom + 0.5, (selection.y - clip.y) * zoom + 0.5, selection.w * zoom - 1, selection.h * zoom - 1);
      g.setLineDash([]);
    }
    if (hover && !pasting) {
      g.strokeStyle = "rgba(255,255,255,0.6)";
      g.strokeRect((hover[0] - clip.x) * zoom + 0.5, (hover[1] - clip.y) * zoom + 0.5, zoom - 1, zoom - 1);
    }
  }, [pix, version, frame, zoom, showGrid, onion, selection, hover, preview, pasting, clipboard, fw, fh, cols]);

  // the sheet as a canvas, current before the frame strip and the preview draw from it
  useMemo(() => pix && pixelsCanvas(pix, sheet.current), [pix, version]);
  const palette = useMemo(() => (pix ? colorsIn(pix, { x: 0, y: 0, w: pix.width, h: pix.height }, 40) : []), [pix, version >> 3]);

  if (error) return <Shell title={target.title} onClose={closeImage}><p class="bad-text">{error}</p></Shell>;
  if (!pix) return <Shell title={target.title} onClose={closeImage}><p class="hint">Loading…</p></Shell>;
  const hovered = hover ? get(pix, hover[0], hover[1]) : null;

  return (
    <Shell
      title={`${target.title}${dirty ? " ●" : ""}`}
      onClose={close}
      bar={
        <>
          <div class="segmented">
            {TOOLS.map(([t, icon, hint]) => (
              <button key={t} class={`px-tool ${tool === t ? "on" : ""}`} title={hint} aria-label={hint.split(" (")[0]} onClick={() => setTool(t)}>
                <Icon name={icon} size={18} />
              </button>
            ))}
          </div>
          <label class="check" title="Draw mirrored across the frame's middle (symmetric pieces)">
            <input type="checkbox" checked={mirror} onChange={(e) => setMirror(e.currentTarget.checked)} />
            mirror
          </label>
          <span class="sep" />
          <button title="Mirror the frame (or the selection) left–right" onClick={cmd.flipX}>⇋</button>
          <button title="Mirror top–bottom" onClick={cmd.flipY}>⇵</button>
          <button title="Copy the frame (or the selection) – Ctrl+C" onClick={cmd.copy}>Copy</button>
          <button disabled={!clipboard} title="Paste where you click – Ctrl+V" onClick={cmd.paste}>Paste</button>
          <button disabled={!clipboard} title="Replace the whole frame with what was copied" onClick={cmd.pasteFrame}>Paste frame</button>
          <span class="sep" />
          <button disabled={!undo.current.length} title="Undo (Ctrl+Z)" onClick={() => restore(undo.current, redo.current)}>↶</button>
          <button disabled={!redo.current.length} title="Redo (Ctrl+Y)" onClick={() => restore(redo.current, undo.current)}>↷</button>
          <span class="sep" />
          <button title="Zoom out (-)" onClick={() => setZoom(Math.max(1, zoom - 1))}>−</button>
          <span class="dim">{zoom}×</span>
          <button title="Zoom in (+)" onClick={() => setZoom(Math.min(48, zoom + 1))}>+</button>
          <label class="check">
            <input type="checkbox" checked={showGrid} onChange={(e) => setShowGrid(e.currentTarget.checked)} />
            grid
          </label>
          {count > 1 && (
            <label class="check" title="The previous frame faintly under this one">
              <input type="checkbox" checked={onion} onChange={(e) => setOnion(e.currentTarget.checked)} />
              onion skin
            </label>
          )}
          <span class="spacer" />
          {message && <span class="hint">{message}</span>}
          <button class="primary" disabled={saving || !dirty} title="Write the image (Ctrl+S)" onClick={() => void save()}>
            {saving ? "Saving…" : "Save image"}
          </button>
        </>
      }
    >
      <div class={`px-body ${count > 1 ? "" : "single"}`}>
        {count > 1 && (
          <div class="px-frames">
            {Array.from({ length: count }, (_, i) => (
              <button key={i} class={`px-frame ${i === frame ? "on" : ""}`} title={target.frameNames?.[i] ?? `frame ${i}`} onClick={() => (setFrame(i), setSelection(null))}>
                <FrameThumb sheet={sheet.current} version={version} rect={frameRect(i, fw, fh, cols)} />
                <span>{target.frameNames?.[i] ?? i}</span>
              </button>
            ))}
            {target.canAddFrames && (
              <button class="px-frame add" title="A new frame at the end of the sheet" onClick={cmd.addFrame}>
                +
              </button>
            )}
          </div>
        )}
        <div class="px-canvas-area" ref={area}>
          {target.note && <div class="banner">{target.note}</div>}
          <canvas
            ref={canvas}
            class={`px-canvas tool-${tool}`}
            onPointerDown={down}
            onPointerMove={move}
            onPointerUp={up}
            onPointerLeave={() => setHover(null)}
            onContextMenu={(e) => e.preventDefault()}
            onWheel={(e) => {
              if (!e.ctrlKey) return;
              e.preventDefault();
              setZoom((z) => Math.max(1, Math.min(48, z + (e.deltaY < 0 ? 1 : -1))));
            }}
          />
          <div class="px-status">
            {hover ? `${hover[0] - clip.x}, ${hover[1] - clip.y}` : ""} {hovered && hovered[3] ? hex(hovered) : hovered ? "transparent" : ""} · frame {frame}
            {target.frameNames?.[frame] ? ` (${target.frameNames[frame]})` : ""} · {fw}×{fh}
            {target.rename && <FrameName target={target} frame={frame} />}
          </div>
        </div>
        <div class="px-side">
          <div class="px-color">
            <span class="px-current" style={{ background: color[3] ? hex(color) : "transparent" }} title={color[3] ? hex(color) : "transparent"} />
            <input type="color" value={color[3] ? hex(color) : "#000000"} title="Any colour" onInput={(e) => setColor(fromHex(e.currentTarget.value))} />
            <button class={`px-swatch clear ${color[3] ? "" : "on"}`} title="Transparent (the right mouse button always erases)" onClick={() => setColor(TRANSPARENT)} />
          </div>
          <h4 class="card-heading">In the image</h4>
          <div class="px-palette">
            {palette.map((c) => (
              <button key={c.join()} class={`px-swatch ${c.join() === color.join() ? "on" : ""}`} style={{ background: hex(c) }} title={hex(c)} onClick={() => setColor(c)} />
            ))}
          </div>
          <h4 class="card-heading">The game's palette</h4>
          <div class="px-palette">
            {GAME_PALETTE.map((c) => (
              <button key={c.join()} class={`px-swatch ${c.join() === color.join() ? "on" : ""}`} style={{ background: hex(c) }} title={hex(c)} onClick={() => setColor(c)} />
            ))}
          </div>
          <h4 class="card-heading">Preview</h4>
          {target.kind === "blocks" || target.kind === "decor" ? (
            <ImagePreview project={project} target={target} sheet={sheet.current} version={version} frame={frame} layout={{ fw, fh, cols }} />
          ) : (
            <PreviewPane>
              <ImagePreview project={project} target={target} sheet={sheet.current} version={version} frame={frame} layout={{ fw, fh, cols }} />
            </PreviewPane>
          )}
        </div>
      </div>
    </Shell>
  );
}

/** The name of a frame (icons): what content refers to it by. */
function FrameName({ target, frame }: { target: ImageTarget; frame: number }) {
  const [draft, setDraft] = useState(target.frameNames?.[frame] ?? "");
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => (setDraft(target.frameNames?.[frame] ?? ""), setProblem(null)), [frame, target]);
  return (
    <span class="px-name">
      {" · name "}
      <input value={draft} placeholder="unnamed" onInput={(e) => setDraft(e.currentTarget.value.trim())} onKeyDown={(e) => e.key === "Enter" && setProblem(target.rename!(frame, draft))} />
      <button disabled={draft === (target.frameNames?.[frame] ?? "")} onClick={() => setProblem(target.rename!(frame, draft))}>
        Name
      </button>
      {problem && <span class="bad-text"> {problem}</span>}
    </span>
  );
}

function normal(a: [number, number], b: [number, number], clip: Rect): Rect {
  const x0 = Math.max(clip.x, Math.min(a[0], b[0]));
  const y0 = Math.max(clip.y, Math.min(a[1], b[1]));
  const x1 = Math.min(clip.x + clip.w - 1, Math.max(a[0], b[0]));
  const y1 = Math.min(clip.y + clip.h - 1, Math.max(a[1], b[1]));
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

function FrameThumb({ sheet, version, rect: r }: { sheet: HTMLCanvasElement; version: number; rect: Rect }) {
  const c = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!c.current || !sheet.width) return;
    const g = c.current.getContext("2d")!;
    g.clearRect(0, 0, r.w, r.h);
    g.drawImage(sheet, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
  }, [version, sheet.width, r.x, r.y]);
  const scale = Math.max(1, Math.min(3, Math.floor(56 / Math.max(r.w, r.h))));
  return <canvas ref={c} width={r.w} height={r.h} style={{ width: r.w * scale, height: r.h * scale }} />;
}

/** The workspace's frame: a title bar with the tools, the body, closed with ✕ or Esc. */
function Shell({ title, onClose, bar, children }: { title: string; onClose: () => void; bar?: preact.ComponentChildren; children: preact.ComponentChildren }) {
  return (
    <div class="px-editor" role="dialog" aria-label={title}>
      <div class="px-title">
        <b>{title}</b>
        {bar}
        <button class="close" title="Close (Esc)" onClick={onClose}>
          ✕
        </button>
      </div>
      {children}
    </div>
  );
}

/** Guides for the kind (graphics.md §5): the block's diamond and faces, decor's anchor, a sprite's ground … */
function drawGuides(g: CanvasRenderingContext2D, t: ImageTarget, fw: number, fh: number, z: number) {
  g.save();
  g.strokeStyle = "rgba(44, 232, 245, 0.55)";
  g.lineWidth = 1;
  const poly = (pts: [number, number][], close = true) => {
    g.beginPath();
    pts.forEach(([x, y], i) => (i ? g.lineTo(x * z + 0.5, y * z + 0.5) : g.moveTo(x * z + 0.5, y * z + 0.5)));
    if (close) g.closePath();
    g.stroke();
  };
  const hline = (y: number) => poly([[0, y], [fw, y]], false);
  const diamond = (y0: number) => poly([[fw / 2, y0], [fw, y0 + 8], [fw / 2, y0 + 16], [0, y0 + 8]]);
  switch (t.kind) {
    case "blocks":
      diamond(0);
      poly([[0, 8], [0, 16], [16, 24], [32, 16], [32, 8]], false);
      poly([[16, 16], [16, 24]], false);
      break;
    case "decor":
      poly([[16, 32], [32, 40], [16, 48], [0, 40]]);
      g.fillStyle = "rgba(254, 174, 52, 0.9)";
      g.fillRect(16 * z - 2, 40 * z - 2, 4, 4);
      break;
    case "fieldEffects":
      diamond(8);
      break;
    case "highlight":
    case "exitArrows":
    case "boardCursor":
      diamond(0);
      break;
    case "charset":
    case "battler":
      g.setLineDash([3, 3]);
      hline(fh - 1);
      poly([[fw / 2, 0], [fw / 2, fh]], false);
      break;
    case "battleback":
      if (typeof contextOf(t, 0).floor === "number") {
        g.setLineDash([6, 4]);
        hline(contextOf(t, 0).floor as number);
      }
      break;
    case "window":
      g.setLineDash([2, 2]);
      poly([[8, 0], [8, fh]], false);
      poly([[fw - 8, 0], [fw - 8, fh]], false);
      hline(8);
      hline(fh - 8);
      break;
    case "font":
      g.setLineDash([2, 2]);
      hline(3);
      hline(9);
      break;
  }
  g.restore();
}
