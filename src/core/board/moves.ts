import { addStatus, computeStats, isAlive, movePatternOf } from "../chars/character";
import { getChar, type Ctx } from "../context";
import type { ExitDef } from "../data/types";
import { dealDamage } from "../effects/effects";
import type { GameEvent } from "../events";
import type { Piece } from "../state/types";
import type { Pos } from "../util/grid";
import { add, DIR_VEC, dirFromStep, key, samePos } from "../util/grid";
import {
  aliveMembers,
  board,
  exitAt,
  exitEnabled,
  fieldEffectsAt,
  grid,
  isHidden,
  mustPieceOf,
  pageOfPiece,
  pieceReach,
  piecesAt,
  reconcile,
} from "./board";
import { resolveMoves, resolvePatternRef, type Occupancy, type Reach } from "./patterns";

export type MoveKind = "move" | "engage" | "interact" | "exit";

export interface MoveOption extends Reach {
  kind: MoveKind;
  /** Engage: defending pieces; interact: the NPC/object piece. */
  targets?: string[];
  exit?: ExitDef;
  /** Interact: where the mover stops (in front of the NPC). */
  approach?: Pos;
}

// ---------- turn flags ----------

export function hasMoved(ctx: Ctx, charId: string) {
  return board(ctx).turn.moved.includes(charId);
}

/** A piece can move if no living member has moved this round and it has reach (§8.2). */
export function canPieceMove(ctx: Ctx, piece: Piece): boolean {
  if (piece.fallen) return false;
  const members = aliveMembers(ctx, piece);
  if (!members.length || members.some((c) => hasMoved(ctx, c.id))) return false;
  return pieceReach(ctx, piece) > 0;
}

export function markMoved(ctx: Ctx, piece: Piece) {
  const t = board(ctx).turn;
  for (const id of piece.members) if (!t.moved.includes(id)) t.moved.push(id);
}

// ---------- occupancy (§8.3) ----------

export function isTargetableNpc(ctx: Ctx, npc: Piece): boolean {
  const c = npc.members[0] ? getChar(ctx, npc.members[0]) : undefined;
  return !!c && c.kind === "npc" && !!ctx.db.npc(c.def).targetable && c.hp > 0;
}

function interactable(ctx: Ctx, npc: Piece): boolean {
  const page = pageOfPiece(ctx, npc);
  if (!page) return false;
  return (page.trigger ?? "interact") === "interact" && !!(page.dialog || page.interactions?.length || page.actions?.length || page.npc);
}

export function occupancyFor(ctx: Ctx, mover: Piece): (p: Pos) => Occupancy {
  return (p: Pos) => {
    const exit = exitAt(ctx, p);
    if (exit) {
      if (mover.faction !== "hero" || !exitEnabled(ctx, exit)) return "block";
    }
    const others = piecesAt(ctx, p).filter((pc) => pc.id !== mover.id);
    if (!others.length) return exit ? "stop" : "free";
    if (mover.faction === "npc") return "block";
    // Hostile pieces first: standing next to/with an NPC never protects anyone.
    const hostile = others.filter((o) => o.faction !== mover.faction && o.faction !== "npc");
    if (hostile.length) {
      if (mover.faction === "enemy" && hostile.every((h) => isHidden(ctx, h))) return "block";
      return "stop";
    }
    const npc = others.find((o) => o.faction === "npc");
    if (npc) {
      const allies = others.some((o) => o.faction === mover.faction);
      // Objects (chests, signs) stay solid; villagers can be walked through.
      if (!npc.members.length) return mover.faction === "hero" && interactable(ctx, npc) && !allies ? "stop" : "block";
      if (mover.faction === "hero") return interactable(ctx, npc) && !allies ? "free" : "pass";
      // Enemies may attack targetable NPCs (§8.9), otherwise they pass them.
      return isTargetableNpc(ctx, npc) && !allies ? "stop" : "pass";
    }
    return "pass"; // allies
  };
}

// ---------- options ----------

/** Destinations for the piece of `charId`: union of member patterns cut at the party reach (§8.2). */
export function moveOptions(ctx: Ctx, charId: string, opts: { ignoreMoved?: boolean } = {}): Map<string, MoveOption> {
  const piece = mustPieceOf(ctx, charId);
  const out = new Map<string, MoveOption>();
  if (!opts.ignoreMoved && !canPieceMove(ctx, piece)) return out;
  const reach = pieceReach(ctx, piece);
  const occupancy = occupancyFor(ctx, piece);
  const g = grid(ctx);
  for (const c of aliveMembers(ctx, piece)) {
    const pattern = resolvePatternRef(ctx.db, movePatternOf(ctx.db, c));
    const moves = resolveMoves({ grid: g, origin: piece, pattern, maxReach: reach, occupancy });
    for (const [k, r] of moves) {
      const prev = out.get(k);
      if (prev && (prev.mode === "walk" || r.mode === "leap") && prev.path.length <= r.path.length) continue;
      out.set(k, classify(ctx, piece, r));
    }
  }
  return out;
}

function classify(ctx: Ctx, piece: Piece, r: Reach): MoveOption {
  const others = piecesAt(ctx, r.pos).filter((p) => p.id !== piece.id);
  const exit = exitAt(ctx, r.pos);
  if (exit && !others.length) return { ...r, kind: "exit", exit };
  if (!others.length) return { ...r, kind: "move" };
  const hostile = others.filter((o) => o.faction !== piece.faction && o.faction !== "npc");
  if (hostile.length) return { ...r, kind: "engage", targets: hostile.map((h) => h.id) };
  const npc = others.find((o) => o.faction === "npc");
  if (npc && piece.faction === "hero") {
    if (npc.members.length) return { ...r, kind: "interact", targets: [npc.id], approach: r.pos }; // step onto the villager's cell (§8.8)
    // Objects: stop in front – last free cell of the path, else stay.
    const before = r.mode === "walk" ? r.path.slice(0, -1) : [];
    let approach: Pos = { x: piece.x, y: piece.y };
    for (let i = before.length - 1; i >= 0; i--) {
      if (!piecesAt(ctx, before[i]).some((p) => p.id !== piece.id)) {
        approach = before[i];
        break;
      }
    }
    return { ...r, kind: "interact", targets: [npc.id], approach };
  }
  // Enemies attacking a (targetable) NPC.
  return { ...r, kind: "engage", targets: others.filter((o) => o.faction !== piece.faction).map((h) => h.id) };
}

// ---------- executing moves ----------

export interface MoveResult {
  events: GameEvent[];
  /** Cell where the piece finally stands. */
  final: Pos;
}

/**
 * Moves a piece along a path and applies landing rules: frozen sliding, field effects, traps.
 * Used for normal moves, post-battle capture moves and interaction approaches.
 */
export function movePiece(ctx: Ctx, piece: Piece, path: Pos[], mode: "walk" | "leap"): MoveResult {
  const events: GameEvent[] = [];
  if (!path.length) return { events, final: { x: piece.x, y: piece.y } };
  const prev = path.length > 1 ? path[path.length - 2] : { x: piece.x, y: piece.y };
  const last = path[path.length - 1];
  piece.facing = dirFromStep(prev, last);
  piece.x = last.x;
  piece.y = last.y;
  events.push({ type: "move", piece: piece.id, path, mode });

  // Frozen: slide in facing direction (§7.4).
  const slide = slidePath(ctx, piece);
  if (slide.length) {
    const end = slide[slide.length - 1];
    piece.x = end.x;
    piece.y = end.y;
    events.push({ type: "move", piece: piece.id, path: slide, mode: "slide" });
  }
  events.push(...applyLanding(ctx, piece));
  return { events, final: { x: piece.x, y: piece.y } };
}

function isFrozen(ctx: Ctx, p: Pos) {
  return fieldEffectsAt(ctx, p).some((e) => ctx.db.fieldEffect(e).slide);
}

export function slidePath(ctx: Ctx, piece: Piece): Pos[] {
  const g = grid(ctx);
  const out: Pos[] = [];
  if (isFlyingPiece(ctx, piece)) return out;
  let cur: Pos = { x: piece.x, y: piece.y };
  const d = DIR_VEC[piece.facing];
  for (let guard = 0; guard < 64 && isFrozen(ctx, cur); guard++) {
    const n = add(cur, d);
    const cell = g.cell(n);
    if (!cell || !cell.walkable || Math.abs(cell.height - g.heightAt(cur)) > 1) break;
    if (piecesAt(ctx, n).some((p) => p.id !== piece.id) || exitAt(ctx, n)) break;
    out.push(n);
    cur = n;
  }
  return out;
}

/** Landing on a cell: field effects apply to every member, traps trigger for enemies. */
export function applyLanding(ctx: Ctx, piece: Piece): GameEvent[] {
  if (isFlyingPiece(ctx, piece)) return []; // hovers over fire, mud, ice and traps
  const events: GameEvent[] = [];
  const b = board(ctx);
  const members = aliveMembers(ctx, piece);
  events.push(...cellEffects(ctx, piece));
  if (piece.faction === "enemy") {
    const trap = b.traps.find((t) => t.x === piece.x && t.y === piece.y);
    if (trap) {
      b.traps = b.traps.filter((t) => t !== trap);
      events.push({ type: "trap", x: trap.x, y: trap.y, triggeredBy: piece.id });
      for (const c of members) {
        events.push(...dealDamage(ctx, c, trap.damage));
        if (trap.status && isAlive(c) && addStatus(ctx, c, trap.status)) {
          events.push({ type: "status", target: c.id, status: trap.status, added: true });
        }
      }
    }
  }
  events.push(...reconcile(ctx));
  return events;
}

/** Performs a plain move (kind "move" or "exit") for the active character. */
export function executeMove(ctx: Ctx, charId: string, dest: Pos): MoveResult & { option: MoveOption } {
  const piece = mustPieceOf(ctx, charId);
  const option = moveOptions(ctx, charId).get(key(dest));
  if (!option) throw new Error(`Illegal move for ${charId} to ${dest.x},${dest.y}`);
  if (option.kind === "engage") throw new Error("Use engagement for hostile targets");
  markMoved(ctx, piece);
  if (option.kind === "interact") {
    const npc = board(ctx).pieces[option.targets![0]];
    if (samePos(option.approach!, option.pos)) return { ...movePiece(ctx, piece, option.path, option.mode), option };
    const path = option.mode === "walk" ? option.path.slice(0, option.path.findIndex((p) => samePos(p, option.approach!)) + 1) : [];
    const res = movePiece(ctx, piece, path, "walk");
    if (npc && !samePos(piece, npc)) piece.facing = dirFromStep(piece, npc);
    return { ...res, option };
  }
  return { ...movePiece(ctx, piece, option.path, option.mode), option };
}

// ---------- per-turn cell effects ----------

/** A piece flies when every living member has a field-immune status (§4.2 Flying). */
export function isFlyingPiece(ctx: Ctx, piece: Piece): boolean {
  const members = aliveMembers(ctx, piece);
  return members.length > 0 && members.every((c) => c.statuses.some((s) => ctx.db.status(s.id).fieldImmune));
}

/**
 * The field effects of the piece's cell hit every member once (damage + status, no sliding).
 * Used when a piece lands on a cell and at the start of its turn (§7.4).
 */
export function cellEffects(ctx: Ctx, piece: Piece): GameEvent[] {
  const events: GameEvent[] = [];
  if (isFlyingPiece(ctx, piece)) return events;
  const members = aliveMembers(ctx, piece);
  for (const effectId of fieldEffectsAt(ctx, piece)) {
    const fx = ctx.db.fieldEffect(effectId);
    for (const c of members) {
      if (fx.damagePercent && isAlive(c)) {
        const dmg = Math.max(1, Math.round((computeStats(ctx.db, c).maxHp * fx.damagePercent) / 100));
        events.push(...dealDamage(ctx, c, dmg, { element: fx.element, nonLethal: c.kind === "hero" }));
      }
      if (fx.status && isAlive(c) && addStatus(ctx, c, fx.status, fx.statusTurns)) {
        events.push({ type: "status", target: c.id, status: fx.status, added: true });
      }
    }
  }
  return events;
}

