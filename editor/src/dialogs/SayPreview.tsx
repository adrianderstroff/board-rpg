import { createContext } from "preact";
import { useContext, useEffect, useRef, useState } from "preact/hooks";
import fontSpec from "../../../public/assets/system/font.json";
import type { RawContent } from "../../../src/core/data/database";
import { loadImage } from "../map/sprites";
import { BOX, fitsBox, layoutTokens, previewTokens, textX, textY, type FontSpecLike } from "./layout";

/**
 * A line of dialog as the game's text box shows it (editor-design §10): the window, the face and
 * name, the text in the pixel font with its colours and sizes. Shown under each "say" step where a
 * screen switches previews on (the Dialogs screen).
 */

export const SayPreviewContext = createContext<RawContent | null>(null);
export const useSayPreview = () => useContext(SayPreviewContext);

const FONT = fontSpec as FontSpecLike;
const RAINBOW = ["#e43b44", "#f77622", "#fee761", "#63c74d", "#0099db", "#b55088"];

/** A speaker id as the game resolves it (game/ui/dialog.ts speakerFor). */
function speaker(raw: RawContent, id: string | undefined): { name?: string; face?: string } {
  if (!id) return {};
  const who = raw.heroes[id] ?? raw.npcs[id];
  if (who) return { name: who.name, face: who.face ? raw.graphics.faces[who.face]?.image : undefined };
  return { name: id };
}

/** Sample values for the placeholders: the first hero of the starting party, the starting gold. */
function sample(raw: RawContent) {
  return (name: string) => {
    if (name === "hero") return raw.heroes[raw.config.start?.party?.[0] ?? ""]?.name ?? "Hero";
    if (name === "gold") return String(raw.config.start?.gold ?? 0);
    if (name.startsWith("name:")) return (raw.heroes[name.slice(5)] ?? raw.npcs[name.slice(5)])?.name;
    if (name.startsWith("var:")) return "0";
    return undefined;
  };
}

/** Draws the 9-slice window skin (8 px borders) at w × h. */
function drawWindow(g: CanvasRenderingContext2D, img: HTMLImageElement, w: number, h: number) {
  const b = 8;
  const s = img.width;
  const parts: [number, number, number, number, number, number, number, number][] = [
    [0, 0, b, b, 0, 0, b, b],
    [b, 0, s - 2 * b, b, b, 0, w - 2 * b, b],
    [s - b, 0, b, b, w - b, 0, b, b],
    [0, b, b, s - 2 * b, 0, b, b, h - 2 * b],
    [b, b, s - 2 * b, s - 2 * b, b, b, w - 2 * b, h - 2 * b],
    [s - b, b, b, s - 2 * b, w - b, b, b, h - 2 * b],
    [0, s - b, b, b, 0, h - b, b, b],
    [b, s - b, s - 2 * b, b, b, h - b, w - 2 * b, b],
    [s - b, s - b, b, b, w - b, h - b, b, b],
  ];
  for (const [sx, sy, sw, sh, dx, dy, dw, dh] of parts) g.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
}

export function SayPreview({ text, speakerId, raw }: { text: string; speakerId: string | undefined; raw: RawContent }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [fits, setFits] = useState(true);
  const who = speaker(raw, speakerId);
  const key = `${text}|${who.name}|${who.face}`;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [win, font, face] = await Promise.all([loadImage("system/window.png"), loadImage("system/font.png"), who.face ? loadImage(who.face).catch(() => null) : Promise.resolve(null)]);
      const cv = canvas.current;
      if (cancelled || !cv) return;
      const g = cv.getContext("2d")!;
      g.imageSmoothingEnabled = false;
      g.clearRect(0, 0, BOX.w, BOX.h);
      drawWindow(g, win, BOX.w, BOX.h);
      const hasFace = !!face;
      if (face) {
        g.drawImage(face, BOX.faceX, BOX.faceY, BOX.face, BOX.face);
        g.strokeStyle = "#c0cbdc";
        g.strokeRect(9.5, 11.5, 49, 49);
      }
      const x0 = textX(hasFace);
      // a glyph of the font, tinted
      const tint = document.createElement("canvas");
      tint.width = FONT.cellWidth;
      tint.height = FONT.cellHeight;
      const t = tint.getContext("2d")!;
      const cols = Math.floor(font.width / FONT.cellWidth);
      const glyph = (ch: string, x: number, y: number, color: string, scale = 1) => {
        const i = ch.charCodeAt(0) - FONT.first;
        if (i < 0) return;
        t.globalCompositeOperation = "source-over";
        t.clearRect(0, 0, tint.width, tint.height);
        t.drawImage(font, (i % cols) * FONT.cellWidth, Math.floor(i / cols) * FONT.cellHeight, FONT.cellWidth, FONT.cellHeight, 0, 0, FONT.cellWidth, FONT.cellHeight);
        t.globalCompositeOperation = "source-in";
        t.fillStyle = color;
        t.fillRect(0, 0, tint.width, tint.height);
        g.drawImage(tint, Math.round(x), Math.round(y), FONT.cellWidth * scale, FONT.cellHeight * scale);
      };
      if (who.name) {
        let x = x0;
        for (const ch of who.name) {
          glyph(ch, x, 5, "#feae34");
          x += FONT.widths[ch] ?? FONT.cellWidth;
        }
      }
      const y0 = textY(!!who.name);
      const laid = layoutTokens(previewTokens(text, sample(raw)), FONT, BOX.w - x0 - 12);
      laid.glyphs.forEach((gl, n) => {
        const color = gl.style.rainbow ? RAINBOW[n % RAINBOW.length] : (gl.style.color ?? "#ffffff");
        // waves and shakes as a still: a small offset per glyph
        const dy = gl.style.wave ? Math.round(Math.sin(n * 0.7) * 2) : gl.style.shake ? (n % 2 ? 1 : -1) : 0;
        glyph(gl.ch, x0 + gl.x, y0 + gl.y + dy, color, gl.style.scale);
      });
      setFits(fitsBox(laid.height, !!who.name));
    })();
    return () => {
      cancelled = true;
    };
  }, [key]);

  return (
    <div class="say-preview">
      <canvas ref={canvas} width={BOX.w} height={BOX.h} />
      {!fits && <div class="bad-text">Too long for the text box – the game cuts it off. Split it into two lines of dialog.</div>}
    </div>
  );
}

