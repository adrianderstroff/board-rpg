import { rotateContinuous } from "../../../src/game/board/mapSource";

type Vec = { x: number; y: number };

/** Screen directions of the grid's x and y axes for a (continuous) view angle in the iso view. */
export function isoAxes(quarters: number, tileRatio: number): { x: Vec; y: Vec } {
  const screen = (gx: number, gy: number) => {
    const r = rotateContinuous(gx, gy, quarters);
    return { x: (r.x - r.y) / Math.SQRT2, y: ((r.x + r.y) * tileRatio) / Math.SQRT2 };
  };
  return { x: screen(1, 0), y: screen(0, 1) };
}

export const TOP_AXES = { x: { x: 1, y: 0 }, y: { x: 0, y: 1 } };

/** Two short lines in the corner of the map view showing where the map's x and y run. */
export function AxisGizmo({ axes }: { axes: { x: Vec; y: Vec } }) {
  const c = 32;
  const len = 22;
  const arm = (d: Vec, color: string, label: string) => {
    const tx = c + d.x * len;
    const ty = c + d.y * len;
    return (
      <g>
        <line x1={c} y1={c} x2={tx} y2={ty} stroke={color} stroke-width="2" stroke-linecap="round" />
        <circle cx={tx} cy={ty} r="2.5" fill={color} />
        <text x={c + d.x * (len + 9)} y={c + d.y * (len + 9)} fill={color} text-anchor="middle" dominant-baseline="central">
          {label}
        </text>
      </g>
    );
  };
  return (
    <svg class="axis-gizmo" width={2 * c} height={2 * c} viewBox={`0 0 ${2 * c} ${2 * c}`} aria-hidden="true">
      {arm(axes.x, "#ff6b6b", "x")}
      {arm(axes.y, "#5cb8ff", "y")}
    </svg>
  );
}
