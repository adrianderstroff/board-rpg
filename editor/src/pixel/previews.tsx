import { useEffect, useRef, useState } from "preact/hooks";
import fontSpec from "../../../public/assets/system/font.json";
import { SayPreview } from "../dialogs/SayPreview";
import { loadImage } from "../map/sprites";
import type { Project } from "../project";
import { contextOf, type ImageTarget } from "./target";

/**
 * The live previews of the pixel editor (graphics.md §1): each kind of image shown the way the game
 * shows it, drawn from the sheet being edited (`sheet`, redrawn when `version` changes).
 */

interface Layout {
  fw: number;
  fh: number;
  cols: number;
}
interface Props {
  project: Project;
  target: ImageTarget;
  sheet: HTMLCanvasElement;
  version: number;
  frame: number;
  layout: Layout;
}

const FONT = fontSpec as { cellWidth: number; cellHeight: number; first: number; widths: Record<string, number> };

/** A counter that ticks every `ms` (animations). */
function useTick(ms: number): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setN((x) => x + 1), ms);
    return () => clearInterval(t);
  }, [ms]);
  return n;
}

/** Loaded images (other sheets a preview needs: a ground block, the window, the font). */
function useImages(paths: (string | undefined)[]): (HTMLImageElement | null)[] {
  const [imgs, setImgs] = useState<(HTMLImageElement | null)[]>(paths.map(() => null));
  const key = paths.join("|");
  useEffect(() => {
    let live = true;
    void Promise.all(paths.map((p) => (p ? loadImage(p).catch(() => null) : Promise.resolve(null)))).then((r) => live && setImgs(r));
    return () => {
      live = false;
    };
  }, [key]);
  return imgs;
}

/** A canvas redrawn by `draw` whenever its dependencies change; shown `scale` times its size. */
function Draw({ w, h, scale = 2, deps, draw, style }: { w: number; h: number; scale?: number; deps: unknown[]; draw: (g: CanvasRenderingContext2D) => void; style?: Record<string, string> }) {
  const c = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const g = c.current?.getContext("2d");
    if (!g) return;
    g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, w, h);
    draw(g);
  }, deps);
  return <canvas ref={c} width={w} height={h} class="px-preview" style={{ width: `${w * scale}px`, maxWidth: "100%", ...style }} />;
}

const frameAt = (l: Layout, i: number) => [(i % l.cols) * l.fw, Math.floor(i / l.cols) * l.fh] as const;
function blit(g: CanvasRenderingContext2D, src: CanvasImageSource, l: Layout, i: number, x: number, y: number, scale = 1) {
  const [sx, sy] = frameAt(l, i);
  g.drawImage(src, sx, sy, l.fw, l.fh, Math.round(x), Math.round(y), l.fw * scale, l.fh * scale);
}

/** Text in the game's pixel font (a loaded font sheet, or the one being drawn). */
function text(g: CanvasRenderingContext2D, font: CanvasImageSource | null, s: string, x: number, y: number, color = "#ffffff") {
  if (!font) return;
  const tint = document.createElement("canvas");
  tint.width = FONT.cellWidth;
  tint.height = FONT.cellHeight;
  const t = tint.getContext("2d")!;
  const cols = 16;
  for (const ch of s) {
    const i = ch.charCodeAt(0) - FONT.first;
    if (i >= 0 && ch !== " ") {
      t.globalCompositeOperation = "source-over";
      t.clearRect(0, 0, tint.width, tint.height);
      t.drawImage(font, (i % cols) * FONT.cellWidth, Math.floor(i / cols) * FONT.cellHeight, FONT.cellWidth, FONT.cellHeight, 0, 0, FONT.cellWidth, FONT.cellHeight);
      if (color !== "#ffffff") {
        t.globalCompositeOperation = "source-in";
        t.fillStyle = color;
        t.fillRect(0, 0, tint.width, tint.height);
      }
      g.drawImage(tint, x, y);
    }
    x += FONT.widths[ch] ?? FONT.cellWidth;
  }
}

/** Draws a 9-slice window skin (8 px borders) into a box. */
function windowBox(g: CanvasRenderingContext2D, img: CanvasImageSource & { width: number }, x: number, y: number, w: number, h: number) {
  const b = 8;
  const s = img.width;
  const parts: [number, number, number, number, number, number, number, number][] = [
    [0, 0, b, b, 0, 0, b, b], [b, 0, s - 2 * b, b, b, 0, w - 2 * b, b], [s - b, 0, b, b, w - b, 0, b, b],
    [0, b, b, s - 2 * b, 0, b, b, h - 2 * b], [b, b, s - 2 * b, s - 2 * b, b, b, w - 2 * b, h - 2 * b], [s - b, b, b, s - 2 * b, w - b, b, b, h - 2 * b],
    [0, s - b, b, b, 0, h - b, b, b], [b, s - b, s - 2 * b, b, b, h - b, w - 2 * b, b], [s - b, s - b, b, b, w - b, h - b, b, b],
  ];
  for (const [sx, sy, sw, sh, dx, dy, dw, dh] of parts) g.drawImage(img, sx, sy, sw, sh, x + dx, y + dy, dw, dh);
}

/** Isometric screen position of a cell (the top diamond's top corner) at height h. */
const iso = (x: number, y: number, h: number, ox: number, oy: number) => [ox + (x - y) * 16, oy + (x + y) * 8 - h * 8] as const;

/** A cell turned by `r` quarter turns on an n × n board (the view rotating). */
function turn(x: number, y: number, r: number, n: number): [number, number] {
  let [a, b] = [x, y];
  for (let i = 0; i < ((r % 4) + 4) % 4; i++) [a, b] = [n - 1 - b, a];
  return [a, b];
}

// ---------- the previews ----------

export function ImagePreview(p: Props) {
  switch (p.target.kind) {
    case "charset":
      return <CharsetPreview {...p} />;
    case "battler":
      return <BattlerPreview {...p} />;
    case "face":
      return <FacePreviewLive {...p} />;
    case "battleback":
      return <BattlebackPreview {...p} />;
    case "blocks":
      return <BlocksPreview {...p} />;
    case "decor":
      return <DecorPreview {...p} />;
    case "signs":
      return <SignsPreview {...p} />;
    case "fieldEffects":
      return <FieldEffectsPreview {...p} />;
    case "highlight":
    case "boardCursor":
    case "exitArrows":
      return <OnBoardPreview {...p} />;
    case "icons":
      return <IconsPreview {...p} />;
    case "statusIcons":
      return <StatusIconsPreview {...p} />;
    case "title":
      return <TitlePreview {...p} />;
    case "window":
      return <WindowPreview {...p} />;
    case "cursor":
      return <CursorPreview {...p} />;
    case "shadow":
      return <ShadowPreview {...p} />;
    case "font":
      return <FontPreview {...p} />;
  }
}

/** Walking in all four directions (rows SE, SW, NE, NW; columns step, idle, step). */
function CharsetPreview({ sheet, version, layout }: Props) {
  const tick = useTick(220);
  const col = [0, 1, 2, 1][tick % 4];
  const w = layout.fw * 4 + 30;
  return (
    <Draw
      w={w}
      h={layout.fh + 6}
      scale={2}
      deps={[version, tick, layout.fw]}
      draw={(g) => {
        [0, 1, 2, 3].forEach((row, i) => {
          const x = 3 + i * (layout.fw + 8);
          g.fillStyle = "rgba(0,0,0,0.3)";
          g.beginPath();
          g.ellipse(x + layout.fw / 2, layout.fh + 1, 7, 3, 0, 0, Math.PI * 2);
          g.fill();
          blit(g, sheet, layout, row * 3 + col, x, 3);
        });
      }}
    />
  );
}

/** The poses in a battle: standing on a battle background's floor; a pose plays when clicked. */
function BattlerPreview({ project, target, sheet, version, layout }: Props) {
  const raw = project.content.raw;
  const bb = Object.values(raw.graphics.battlebacks)[0] as { image: string; floor?: number } | undefined;
  const [bg] = useImages([bb?.image]);
  const tick = useTick(450);
  const names = target.frameNames ?? {};
  const byName = Object.fromEntries(Object.entries(names).map(([i, n]) => [n, Number(i)]));
  const [pose, setPose] = useState<string | null>(null);
  useEffect(() => {
    if (!pose) return;
    const t = setTimeout(() => setPose(null), 900);
    return () => clearTimeout(t);
  }, [pose]);
  const idle = byName.idle2 !== undefined && tick % 2 ? byName.idle2 : (byName.idle ?? 0);
  const shown = pose ? byName[pose] : idle;
  const W = 240;
  const H = 110;
  return (
    <div>
      <Draw
        w={W}
        h={H}
        scale={1.3}
        deps={[version, tick, shown, bg]}
        draw={(g) => {
          if (bg) g.drawImage(bg, 0, 0, bg.width, bg.height, 0, 0, W, (bg.height * W) / bg.width);
          const floor = bb?.floor ? (bb.floor * W) / 480 : H * 0.6;
          blit(g, sheet, layout, shown ?? 0, W / 2 - layout.fw / 2, floor + 10 - layout.fh);
        }}
      />
      <div class="row wrap px-poses">
        {Object.entries(names).map(([, n]) => (
          <button key={n} class={pose === n ? "on" : ""} onClick={() => setPose(n)}>
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}

/** A face at 48, 24 and 14 px, and in the text box. */
function FacePreviewLive({ project, sheet, version }: Props) {
  const sizes = [48, 24, 14];
  return (
    <div>
      <div class="row px-faces">
        {sizes.map((s) => (
          <Draw key={s} w={s} h={s} scale={1} deps={[version]} draw={(g) => ((g.imageSmoothingEnabled = s !== 48), g.drawImage(sheet, 0, 0, sheet.width, sheet.height, 0, 0, s, s))} />
        ))}
      </div>
      <SayPreview text="How does this look? *Not bad* at all." speakerId={undefined} name="Someone" raw={project.content.raw} face={sheet} version={version} />
    </div>
  );
}

/** The battle scene: the background, its floor, a hero and an enemy standing on it. */
function BattlebackPreview({ project, target, sheet, version }: Props) {
  const raw = project.content.raw;
  const hero = raw.graphics.battlers["lib:hero_knight"] ?? Object.values(raw.graphics.battlers)[0];
  const enemy = raw.graphics.battlers["lib:enemy_scorpion"] ?? Object.values(raw.graphics.battlers)[1];
  const [h, e] = useImages([hero?.image, enemy?.image]);
  const floor = (contextOf(target, 0).floor as number | undefined) ?? Math.round(sheet.height * 0.58);
  return (
    <Draw
      w={sheet.width || 480}
      h={sheet.height || 190}
      scale={0.66}
      deps={[version, h, e, floor]}
      draw={(g) => {
        g.drawImage(sheet, 0, 0);
        g.setLineDash([6, 4]);
        g.strokeStyle = "rgba(44, 232, 245, 0.6)";
        g.beginPath();
        g.moveTo(0, floor + 0.5);
        g.lineTo(sheet.width, floor + 0.5);
        g.stroke();
        if (h && hero) g.drawImage(h, 0, 0, hero.frameWidth, hero.frameHeight, sheet.width * 0.72, floor + 16 - hero.frameHeight, hero.frameWidth, hero.frameHeight);
        if (e && enemy) g.drawImage(e, 0, 0, enemy.frameWidth, enemy.frameHeight, sheet.width * 0.2, floor + 16 - enemy.frameHeight, enemy.frameWidth, enemy.frameHeight);
      }}
    />
  );
}

/** A little board of blocks: the tile flat and stacked on its ground, in the four view rotations. */
function BlocksPreview({ target, sheet, version, frame, layout }: Props) {
  const [rot, setRot] = useState(0);
  const tick = useTick(500);
  const ctx = contextOf(target, frame);
  const ground = (ctx.ground as number | undefined) ?? 0;
  const fill = (ctx.fill as number | undefined) ?? frame;
  const anim = (ctx.frames as number[] | undefined) ?? [];
  const top = anim.length > 1 && anim.includes(frame) ? anim[tick % anim.length] : frame;
  // the tile as a 2×2 patch and a two-high step on ground
  const map = ["ggggg", "gttgg", "gttgg", "gggtt", "gggtt"];
  const heights = ["00000", "00000", "00000", "00012", "00012"];
  return (
    <div>
      <Draw
        w={200}
        h={130}
        scale={1.6}
        deps={[version, rot, top, frame, ground, fill]}
        draw={(g) => {
          const cells: { x: number; y: number; t: boolean; h: number }[] = [];
          for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) {
            const [sx, sy] = turn(x, y, rot, 5);
            cells.push({ x: sx, y: sy, t: map[y][x] === "t", h: Number(heights[y][x]) });
          }
          cells.sort((a, b) => a.x + a.y - (b.x + b.y));
          for (const c of cells)
            for (let l = 0; l <= c.h; l++) {
              const [px, py] = iso(c.x, c.y, l, 100, 40);
              blit(g, sheet, layout, c.t ? (l === c.h ? top : fill) : l === c.h ? ground : ground, px - 16, py);
            }
        }}
      />
      <div class="row px-turn">
        <button onClick={() => setRot(rot - 1)}>⟲</button>
        <span class="dim">view {(((rot % 4) + 4) % 4) * 90}°</span>
        <button onClick={() => setRot(rot + 1)}>⟳</button>
      </div>
    </div>
  );
}

/** A decor object standing on a cell of ground; its rotation frames as the view turns. */
function DecorPreview({ target, sheet, version, frame, layout }: Props) {
  const [rot, setRot] = useState(0);
  const ctx = contextOf(target, frame);
  const [blocks] = useImages([ctx.blocksImage as string | undefined]);
  const views = (ctx.views as number | undefined) ?? 1;
  const base = (ctx.baseFrame as number | undefined) ?? frame;
  const shown = views > 1 ? base + (((rot % views) + views) % views) : frame;
  return (
    <div>
      <Draw
        w={160}
        h={110}
        scale={1.8}
        deps={[version, rot, blocks, shown]}
        draw={(g) => {
          if (blocks) {
            const bl: Layout = { fw: 32, fh: 24, cols: Math.floor(blocks.width / 32) };
            for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) {
              const [px, py] = iso(x, y, 0, 80, 50);
              blit(g, blocks, bl, (ctx.ground as number | undefined) ?? 0, px - 16, py);
            }
          }
          const [cx, cy] = iso(1, 1, 0, 80, 50);
          blit(g, sheet, layout, shown, cx - 16, cy + 8 - 40);
        }}
      />
      <div class="row px-turn">
        <button onClick={() => setRot(rot - 1)}>⟲</button>
        <span class="dim">{views > 1 ? `view ${(((rot % 4) + 4) % 4) * 90}° – frame ${shown}` : "one frame for every view"}</span>
        <button onClick={() => setRot(rot + 1)}>⟳</button>
      </div>
    </div>
  );
}

/** A wall sign painted onto a wall's side face. */
function SignsPreview({ sheet, version, frame, layout }: Props) {
  return (
    <Draw
      w={140}
      h={90}
      scale={2}
      deps={[version, frame]}
      draw={(g) => {
        // a wall block's right face: a parallelogram sloping down to the right
        g.save();
        g.setTransform(1, 0.5, 0, 1, 30, 10);
        g.fillStyle = "#b86f50";
        g.fillRect(0, 0, 80, 50);
        g.fillStyle = "#733e39";
        g.fillRect(0, 0, 80, 3);
        const [sx, sy] = frameAt(layout, frame);
        g.drawImage(sheet, sx, sy, layout.fw, layout.fh, 16, 14, layout.fw, layout.fh);
        g.restore();
      }}
    />
  );
}

/** A field effect animated on a cell (its row's four frames). */
function FieldEffectsPreview({ project, sheet, version, frame, layout }: Props) {
  const tick = useTick(180);
  const chip = Object.values(project.content.raw.chipsets)[0];
  const [blocks] = useImages([chip?.image]);
  const row = Math.floor(frame / layout.cols);
  const shown = row * layout.cols + (tick % 4);
  return (
    <Draw
      w={140}
      h={90}
      scale={2}
      deps={[version, tick, blocks, row]}
      draw={(g) => {
        if (blocks) {
          const bl: Layout = { fw: 32, fh: 24, cols: Math.floor(blocks.width / 32) };
          for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) {
            const [px, py] = iso(x, y, 0, 70, 30);
            blit(g, blocks, bl, 0, px - 16, py);
          }
        }
        const [cx, cy] = iso(1, 1, 0, 70, 30);
        blit(g, sheet, layout, shown, cx - 16, cy - 8);
      }}
    />
  );
}

/** Board markers on a little board: highlights, the board cursor (blinking), exit arrows. */
function OnBoardPreview({ project, target, sheet, version, frame, layout }: Props) {
  const tick = useTick(400);
  const chip = Object.values(project.content.raw.chipsets)[0];
  const [blocks] = useImages([chip?.image]);
  const shown = target.kind === "boardCursor" ? tick % 2 : frame;
  return (
    <Draw
      w={140}
      h={90}
      scale={2}
      deps={[version, tick, blocks, shown]}
      draw={(g) => {
        if (blocks) {
          const bl: Layout = { fw: 32, fh: 24, cols: Math.floor(blocks.width / 32) };
          for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) {
            const [px, py] = iso(x, y, 0, 70, 30);
            blit(g, blocks, bl, 0, px - 16, py);
          }
        }
        const cells = target.kind === "highlight" ? [[1, 0], [0, 1], [1, 1], [2, 1], [1, 2]] : [[1, 1]];
        for (const [x, y] of cells) {
          const [px, py] = iso(x, y, 0, 70, 30);
          blit(g, sheet, layout, shown, px - 16, py);
        }
      }}
    />
  );
}

/** An icon where the game shows it: a menu with the items and abilities that use it. */
function IconsPreview({ project, target, sheet, version, frame, layout }: Props) {
  const raw = project.content.raw;
  const [win, font] = useImages(["system/window.png", "system/font.png"]);
  const name = target.frameNames?.[frame];
  const users = name
    ? [...Object.values(raw.items), ...Object.values(raw.abilities)].filter((x) => (x as { icon?: string }).icon === name).map((x) => (x as { name: string }).name)
    : [];
  const rows = (users.length ? users : [name ? `(nothing uses "${name}")` : "(an unnamed icon)"]).slice(0, 4);
  return (
    <Draw
      w={170}
      h={24 + rows.length * 18}
      scale={2}
      deps={[version, frame, win, font, rows.join()]}
      draw={(g) => {
        if (win) windowBox(g, win, 0, 0, 170, 24 + rows.length * 18);
        rows.forEach((r, i) => {
          blit(g, sheet, layout, frame, 12, 12 + i * 18);
          text(g, font, r, 34, 14 + i * 18);
        });
      }}
    />
  );
}

/** Status markers side by side above a character. */
function StatusIconsPreview({ project, sheet, version, frame, layout }: Props) {
  const c = project.content.raw.graphics.charsets["lib:hero_knight"] ?? Object.values(project.content.raw.graphics.charsets)[0];
  const [img] = useImages([c?.image]);
  return (
    <Draw
      w={80}
      h={56}
      scale={3}
      deps={[version, frame, img]}
      draw={(g) => {
        if (img && c) g.drawImage(img, c.frameWidth, c.frameHeight, c.frameWidth, c.frameHeight, 40 - c.frameWidth / 2, 56 - c.frameHeight - 2, c.frameWidth, c.frameHeight);
        const shown = [frame, (frame + 1) % (layout.cols || 1)];
        shown.forEach((f, i) => blit(g, sheet, layout, f, 40 - 11 + i * 12, 56 - 32 - 14));
      }}
    />
  );
}

/** The title screen: the image with its menu. */
function TitlePreview({ project, sheet, version }: Props) {
  const [win, font, cursor] = useImages(["system/window.png", "system/font.png", "system/cursor.png"]);
  const title = project.content.raw.config.title ?? "";
  return (
    <Draw
      w={480}
      h={270}
      scale={0.66}
      deps={[version, win, font, cursor, title]}
      draw={(g) => {
        g.drawImage(sheet, 0, 0);
        text(g, font, title, 240 - title.length * 3, 60, "#feae34");
        if (win) windowBox(g, win, 190, 170, 100, 64);
        ["New Game", "Continue", "Settings"].forEach((s, i) => text(g, font, s, 216, 180 + i * 16));
        if (cursor) g.drawImage(cursor, 0, 0, 16, 16, 196, 178, 16, 16);
      }}
    />
  );
}

/** The window skin stretched: a text box and a small menu. */
function WindowPreview({ sheet, version }: Props) {
  const [font] = useImages(["system/font.png"]);
  return (
    <Draw
      w={240}
      h={130}
      scale={1.3}
      deps={[version, font]}
      draw={(g) => {
        windowBox(g, sheet, 0, 60, 240, 70);
        text(g, font, "A text box, stretched from", 12, 72);
        text(g, font, "the 48 x 48 window skin.", 12, 86);
        windowBox(g, sheet, 0, 0, 96, 56);
        ["Items", "Magic", "Equip"].forEach((s, i) => text(g, font, s, 14, 8 + i * 14));
      }}
    />
  );
}

/** The menu cursor pointing at a line, both frames in turn. */
function CursorPreview({ sheet, version, layout }: Props) {
  const tick = useTick(300);
  const [win, font] = useImages(["system/window.png", "system/font.png"]);
  return (
    <Draw
      w={110}
      h={50}
      scale={2}
      deps={[version, tick, win, font]}
      draw={(g) => {
        if (win) windowBox(g, win, 0, 0, 110, 50);
        text(g, font, "New Game", 30, 10);
        text(g, font, "Continue", 30, 26);
        blit(g, sheet, layout, tick % 2, 10, 8);
      }}
    />
  );
}

/** The shadow under a character. */
function ShadowPreview({ project, sheet, version }: Props) {
  const c = project.content.raw.graphics.charsets["lib:hero_knight"] ?? Object.values(project.content.raw.graphics.charsets)[0];
  const [img] = useImages([c?.image]);
  return (
    <Draw
      w={60}
      h={44}
      scale={3}
      deps={[version, img]}
      draw={(g) => {
        g.drawImage(sheet, 30 - sheet.width / 2, 40 - sheet.height / 2);
        if (img && c) g.drawImage(img, c.frameWidth, c.frameHeight, c.frameWidth, c.frameHeight, 30 - c.frameWidth / 2, 40 - c.frameHeight, c.frameWidth, c.frameHeight);
      }}
    />
  );
}

/** Sample text in the font being drawn. */
function FontPreview({ sheet, version }: Props) {
  const [win] = useImages(["system/window.png"]);
  const lines = ["The quick brown fox jumps", "over the lazy dog. 0123456789", "ABCDEFGHIJKLMNOPQRSTUVWXYZ", "!?.,:;'\"()[]{}+-*/=<>#%&@~^|"];
  return (
    <Draw
      w={220}
      h={24 + lines.length * 12}
      scale={1.5}
      deps={[version, win]}
      draw={(g) => {
        if (win) windowBox(g, win, 0, 0, 220, 24 + lines.length * 12);
        lines.forEach((l, i) => text(g, sheet, l, 10, 10 + i * 12));
      }}
    />
  );
}
