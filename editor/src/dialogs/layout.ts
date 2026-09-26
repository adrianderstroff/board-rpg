import { parseMarkup, type RichToken, type TextStyle } from "../../../src/core/script/markup";

/**
 * A line of dialog laid out like the game's text box (engine/ui/TextBox + RichText): the same
 * font widths, word wrapping and box size – for the editor's preview (editor-design §10).
 */

export interface FontSpecLike {
  cellWidth: number;
  cellHeight: number;
  lineHeight: number;
  first: number;
  widths: Record<string, number>;
}

export interface PlacedGlyph {
  ch: string;
  x: number;
  y: number;
  style: TextStyle;
}

/** The text box: 480 − 16 wide, 70 high; the face (48 px) left, the text beside it. */
export const BOX = { w: 464, h: 70, faceX: 10, faceY: 12, face: 48 };

export const textX = (hasFace: boolean) => (hasFace ? 66 : 10);
export const textY = (hasName: boolean) => (hasName ? 18 : 11);

/** Typographic characters the ASCII pixel font lacks (game/ui/dialog.ts). */
const ASCII_FALLBACK: Record<string, string> = { "–": "-", "—": "-", "‘": "'", "’": "'", "“": '"', "”": '"', "…": "..." };

/** The markup as the game reads it, with sample values for the placeholders. */
export function previewTokens(text: string, vars: (name: string) => string | undefined): RichToken[] {
  return parseMarkup(
    text.replace(/[–—‘’“”…]/g, (c) => ASCII_FALLBACK[c]),
    vars,
  );
}

/** Word-wraps tokens into glyph positions (relative to the text's origin), as RichText does. */
export function layoutTokens(tokens: RichToken[], font: FontSpecLike, maxWidth: number): { glyphs: PlacedGlyph[]; lines: number; height: number } {
  type W = { chars: { ch: string; style: TextStyle }[]; width: number; space: boolean };
  const words: (W | "nl")[] = [];
  let cur: W | null = null;
  for (const t of tokens) {
    if (t.kind === "pause") continue;
    if (t.kind === "newline") {
      cur = null;
      words.push("nl");
      continue;
    }
    const space = t.ch === " ";
    if (!cur || cur.space !== space) {
      cur = { chars: [], width: 0, space };
      words.push(cur);
    }
    cur.chars.push({ ch: t.ch, style: t.style });
    cur.width += (font.widths[t.ch] ?? font.cellWidth) * t.style.scale;
  }
  const glyphs: PlacedGlyph[] = [];
  let x = 0;
  let y = 0;
  for (const w of words) {
    if (w === "nl") {
      x = 0;
      y += font.lineHeight;
      continue;
    }
    if (!w.space && x > 0 && x + w.width > maxWidth) {
      x = 0;
      y += font.lineHeight;
    }
    if (w.space && x === 0) continue;
    for (const c of w.chars) {
      if (c.ch !== " ") glyphs.push({ ch: c.ch, x, y: y + font.cellHeight * (1 - c.style.scale), style: c.style });
      x += (font.widths[c.ch] ?? font.cellWidth) * c.style.scale;
    }
  }
  const height = y + font.cellHeight;
  return { glyphs, lines: Math.round(y / font.lineHeight) + 1, height };
}

/** Whether a line fits the box (text below the frame is cut off in the game). */
export function fitsBox(height: number, hasName: boolean): boolean {
  return textY(hasName) + height <= BOX.h - 4;
}
