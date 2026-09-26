/**
 * Line icons (24×24 SVG paths) for marker tiles and the top view: one per entity kind, plus the
 * teleport ends and starts, which must be told apart at a glance (editor-design §6.4).
 */
export const ENTITY_ICONS: Record<string, string> = {
  event: "M12 3l2.2 6.8L21 12l-6.8 2.2L12 21l-2.2-6.8L3 12l6.8-2.2z",
  exit: "M4 12h12 M12 7l5 5-5 5 M20 4v16",
  door: "M6 21V4h12v17 M3 21h18 M14.5 12.5v.5",
  arrival: "M12 3v11 M7.5 9.5L12 14l4.5-4.5 M5 18.5h14",
  spawn: "M12 3v11 M7.5 9.5L12 14l4.5-4.5 M5 18.5h14",
  start: "M6 21V4 M6 4h11l-2.5 4L17 12H6",
  enemy: "M12 3c-5 0-8 3-8 7 0 3 2 5 3 5v3h10v-3c1 0 3-2 3-5 0-4-3-7-8-7z M9 11h.01 M15 11h.01 M10 18v3 M14 18v3",
  gate: "M4 5h16 M4 19h16 M7 5v14 M12 5v14 M17 5v14",
  switch: "M3 17h18 M6 17v-3h12v3 M12 14V8 M9 8h6",
  trap: "M3 19h18 M5 19l2-7 2 7 M10 19l2-9 2 9 M15 19l2-7 2 7",
  sign: "M4 5h16v9H4z M12 14v6 M8 20h8",
  quickplay: "M8 5v14l11-7z",
  chest: "M4 10h16v9H4z M4 10l2-4h12l2 4 M11 10v3h2v-3",
  /** A prefab: stacked blocks. */
  prefab: "M4 9l8-4 8 4-8 4z M4 13l8 4 8-4 M4 17l8 4 8-4",
};

/** Texture key of an icon's marker tile on the iso canvas. */
export const markerKey = (icon: string) => `editor-marker-${icon}`;
export const isMarker = (texture: string | undefined) => !!texture?.startsWith("editor-marker-");
export const markerIcon = (texture: string) => texture.slice("editor-marker-".length);

/** Draws an icon centred at (cx, cy), `size` px tall. */
export function drawEntityIcon(g: CanvasRenderingContext2D, icon: string, cx: number, cy: number, size: number, color: string, lineWidth = 2) {
  g.save();
  g.translate(cx - size / 2, cy - size / 2);
  g.scale(size / 24, size / 24);
  g.strokeStyle = color;
  g.lineWidth = lineWidth;
  g.lineCap = "round";
  g.lineJoin = "round";
  g.stroke(new Path2D(ENTITY_ICONS[icon] ?? ENTITY_ICONS.event));
  g.restore();
}

/**
 * The marker tile of an entity without a look of its own (an empty event, a spawn point…): a flat
 * iso tile with the kind's icon, drawn `res` times the tile size (shown scaled down, smooth).
 */
export function markerCanvas(icon: string, tileWidth: number, tileHeight: number, res: number): HTMLCanvasElement {
  const cv = document.createElement("canvas");
  const w = tileWidth * res;
  const h = tileHeight * res;
  cv.width = w;
  cv.height = h;
  const g = cv.getContext("2d")!;
  g.beginPath();
  g.moveTo(w / 2, res);
  g.lineTo(w - 2 * res, h / 2);
  g.lineTo(w / 2, h - res);
  g.lineTo(2 * res, h / 2);
  g.closePath();
  g.fillStyle = "rgba(24, 20, 37, 0.6)";
  g.fill();
  g.lineWidth = res;
  g.strokeStyle = "#2ce8f5";
  g.stroke();
  drawEntityIcon(g, icon, w / 2, h / 2, h * 0.62, "#ffffff");
  return cv;
}
