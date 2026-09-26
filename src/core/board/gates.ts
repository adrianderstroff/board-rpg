import type { Ctx } from "../context";
import type { ExitDef } from "../data/types";
import type { Pos } from "../util/grid";
import { samePos } from "../util/grid";
import { aliveMembers, exitAt, pieces } from "./board";

// ---------- together exits (§5.3) ----------

export interface TogetherTravel {
  to: string;
  /** Every standing hero piece and the spawn of the exit it waits on. */
  groups: { members: string[]; spawn: string }[];
}

/**
 * Are all standing hero pieces waiting on `together` exits to the same map? Then the board
 * changes and each piece arrives at the spawn of the exit it stood on.
 */
export function togetherReady(ctx: Ctx): TogetherTravel | null {
  const heroes = pieces(ctx).filter((p) => p.faction === "hero" && !p.fallen && aliveMembers(ctx, p).length);
  if (!heroes.length) return null;
  const exits = heroes.map((p) => exitAt(ctx, p));
  if (exits.some((e) => !e?.together)) return null;
  const to = exits[0]!.to;
  if (exits.some((e) => e!.to !== to)) return null;
  return { to, groups: heroes.map((p, i) => ({ members: [...p.members], spawn: (exits[i] as ExitDef).spawn })) };
}

/** A together exit a hero piece stands on (it waits there for the others). */
export function waitingOn(ctx: Ctx, p: Pos): ExitDef | undefined {
  const e = exitAt(ctx, p);
  return e?.together && pieces(ctx).some((pc) => pc.faction === "hero" && samePos(pc, p)) ? e : undefined;
}
