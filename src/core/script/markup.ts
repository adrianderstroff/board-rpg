/**
 * §9 Text markup → styled tokens. Pure; the engine's rich-text renderer draws the tokens.
 *
 *   *word*            highlight color
 *   [c=red]..[/c]     color (name or #rrggbb)
 *   [s=2]..[/s]       glyph scale
 *   ~..~  [wave]..[/wave]     sine wave
 *   ^..^  [shake]..[/shake]   shaking
 *   [rainbow]..[/rainbow]     cycling colors
 *   [spd=0.5]..[/spd]         typing speed factor
 *   |  short pause;  [p=800] pause in ms
 *   {name} variables;  \x escapes a special char
 */

export interface TextStyle {
  color?: string;
  scale: number;
  wave: boolean;
  shake: boolean;
  rainbow: boolean;
  speed: number;
}

export type RichToken =
  | { kind: "char"; ch: string; style: TextStyle }
  | { kind: "pause"; ms: number }
  | { kind: "newline" };

export const HIGHLIGHT_COLOR = "#feae34";

const NAMED_COLORS: Record<string, string> = {
  red: "#e43b44",
  green: "#63c74d",
  blue: "#0099db",
  yellow: "#fee761",
  gold: "#feae34",
  orange: "#f77622",
  purple: "#b55088",
  cyan: "#2ce8f5",
  grey: "#8b9bb4",
  gray: "#8b9bb4",
  white: "#ffffff",
};

export function resolveColor(c: string): string {
  return NAMED_COLORS[c] ?? c;
}

type StyleKey = "color" | "scale" | "wave" | "shake" | "rainbow" | "speed";

export function parseMarkup(src: string, vars: (name: string) => string | undefined = () => undefined): RichToken[] {
  // Variables first (they may not contain markup themselves).
  const text = src.replace(/\{([\w:.-]+)\}/g, (m, name) => vars(name) ?? m);
  const tokens: RichToken[] = [];
  const stack: { key: StyleKey; prev: unknown; tag: string }[] = [];
  const style: TextStyle = { scale: 1, wave: false, shake: false, rainbow: false, speed: 1 };
  const toggles: Record<string, StyleKey> = { "*": "color", "~": "wave", "^": "shake" };

  const push = (key: StyleKey, value: unknown, tag: string) => {
    stack.push({ key, prev: style[key], tag });
    (style as unknown as Record<string, unknown>)[key] = value;
  };
  const pop = (tag: string) => {
    for (let i = stack.length - 1; i >= 0; i--) {
      if (stack[i].tag === tag) {
        const [e] = stack.splice(i, 1);
        (style as unknown as Record<string, unknown>)[e.key] = e.prev;
        return;
      }
    }
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "\\" && i + 1 < text.length) {
      tokens.push({ kind: "char", ch: text[++i], style: { ...style } });
      continue;
    }
    if (ch === "\n") {
      tokens.push({ kind: "newline" });
      continue;
    }
    if (ch === "|") {
      tokens.push({ kind: "pause", ms: 250 });
      continue;
    }
    if (ch in toggles) {
      const open = stack.some((s) => s.tag === ch);
      if (open) pop(ch);
      else push(toggles[ch], ch === "*" ? HIGHLIGHT_COLOR : true, ch);
      continue;
    }
    if (ch === "[") {
      const end = text.indexOf("]", i);
      if (end > i) {
        const tag = text.slice(i + 1, end);
        if (applyTag(tag, push, pop, tokens)) {
          i = end;
          continue;
        }
      }
    }
    tokens.push({ kind: "char", ch, style: { ...style } });
  }
  return tokens;
}

function applyTag(
  tag: string,
  push: (k: StyleKey, v: unknown, t: string) => void,
  pop: (t: string) => void,
  tokens: RichToken[],
): boolean {
  const close = tag.match(/^\/(\w+)$/);
  if (close) {
    pop(close[1]);
    return true;
  }
  const [name, value] = tag.split("=");
  switch (name) {
    case "c":
      push("color", resolveColor(value), "c");
      return true;
    case "s":
      push("scale", Number(value) || 1, "s");
      return true;
    case "wave":
      push("wave", true, "wave");
      return true;
    case "shake":
      push("shake", true, "shake");
      return true;
    case "rainbow":
      push("rainbow", true, "rainbow");
      return true;
    case "spd":
      push("speed", Number(value) || 1, "spd");
      return true;
    case "p":
      tokens.push({ kind: "pause", ms: Number(value) || 250 });
      return true;
    default:
      return false;
  }
}

/** Plain text without markup (for logs, tests, measuring). */
export function plainText(tokens: RichToken[]): string {
  return tokens.map((t) => (t.kind === "char" ? t.ch : t.kind === "newline" ? "\n" : "")).join("");
}
