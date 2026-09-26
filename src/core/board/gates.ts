import type { Ctx } from "../context";
import type { ExitDef, GateDef, SwitchDef } from "../data/types";
import type { GameEvent } from "../events";
import { check } from "../script/conditions";
import type { Pos } from "../util/grid";
import { samePos } from "../util/grid";
import { aliveMembers, board, exitAt, mapMemory, pieces, piecesAt } from "./board";

/**
 * Switches and gates (§5.8): floor plates held down by standing heroes open gates; latching
 * plates stay down once pressed; a gate can also open by condition and never closes on someone.
 */

function defs(ctx: Ctx): { gates: GateDef[]; switches: SwitchDef[] } {
  const map = ctx.db.map(board(ctx).mapId);
  return { gates: map.gates ?? [], switches: map.switches ?? [] };
}

/** Is the plate held down (enough living heroes on it) or latched? */
export function switchPressed(ctx: Ctx, sw: SwitchDef): boolean {
  if ((mapMemory(ctx, board(ctx).mapId).latched ?? []).includes(sw.id)) return true;
  const weight = piecesAt(ctx, sw)
    .filter((p) => p.faction === "hero")
    .reduce((n, p) => n + aliveMembers(ctx, p).length, 0);
  return weight >= (sw.weight ?? 1);
}

function gateShouldOpen(ctx: Ctx, gate: GateDef, switches: SwitchDef[]): boolean {
  if (gate.openWhen && check(ctx, gate.openWhen)) return true;
  if (switches.some((s) => s.opens.includes(gate.id) && switchPressed(ctx, s))) return true;
  return piecesAt(ctx, gate, { includeFallen: true }).length > 0; // never closes on someone
}

/** Cells of the gates that are closed right now (not walkable). */
export function closedGateCells(ctx: Ctx): Pos[] {
  const open = board(ctx).gates ?? {};
  return defs(ctx).gates.filter((g) => !open[g.id]).map((g) => ({ x: g.x, y: g.y }));
}

/**
 * Re-evaluates switches and gates after pieces moved or enemies fell: latches latching plates,
 * opens/closes gates, and sets a gate's `closeFlag` the first time it closes. Returns a "gates"
 * event when anything changed.
 */
export function updateGates(ctx: Ctx): GameEvent[] {
  const b = board(ctx);
  const { gates, switches } = defs(ctx);
  if (!gates.length && !switches.length) return [];
  const mem = mapMemory(ctx, b.mapId);
  let changed = false;
  const pressed: Record<string, boolean> = { ...(b.switches ?? {}) };
  for (const s of switches) {
    const now = switchPressed(ctx, s);
    if (now && s.latch && !(mem.latched ?? []).includes(s.id)) (mem.latched ??= []).push(s.id);
    if (!!pressed[s.id] !== now) changed = true;
    pressed[s.id] = now;
  }
  const open: Record<string, boolean> = { ...(b.gates ?? {}) };
  for (const g of gates) {
    const now = gateShouldOpen(ctx, g, switches);
    const was = open[g.id];
    if (was !== undefined && was !== now) {
      changed = true;
      if (!now && g.closeFlag && !ctx.state.flags[g.closeFlag]) ctx.state.flags[g.closeFlag] = true;
    }
    if (was === undefined) changed = true;
    open[g.id] = now;
  }
  b.switches = pressed;
  b.gates = open;
  return changed ? [{ type: "gates" }] : [];
}

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
