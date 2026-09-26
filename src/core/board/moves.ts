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
  isExploring,
  isHidden,
  mustPieceOf,
  pageOfPiece,
  pieceReach,
  piecesAt,
  reconcile,
} from "./board";
import { hiddenStop, interruptionAt, revealedTraps } from "./hidden";
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
  const knownTraps = mover.faction === "hero" ? revealedTraps(ctx) : [];
  return (p: Pos) => {
    // Heroes walk around ancient traps they know about (§7.5).
    if (knownTraps.some((t) => samePos(t, p))) return "block";
    const exit = exitAt(ctx, p);
    if (exit) {
      if (mover.faction !== "hero" || !exitEnabled(ctx, exit)) return "block";
    }
    const others = piecesAt(ctx, p).filter((pc) => pc.id !== mover.id);
    if (!others.length) return exit ? "stop" : "free";
    if (others.some((o) => o.dormant)) return "block"; // lies there like remains (§7.5)
    if (mover.faction === "npc") return "block";
    // Hostile pieces first: standing next to/with an NPC never protects anyone.
    const hostile = others.filter((o) => o.faction !== mover.faction && o.faction !== "npc");
    if (hostile.length) {
      if (mover.faction === "enemy" && hostile.every((h) => isHidden(ctx, h))) return "block";
      return "stop";
    }
    const npc = others.find((o) => o.faction === "npc");
    // an entity says how its cell can be crossed (§10.3)
    const pass = npc && pageOfPiece(ctx, npc)?.pass;
    if (npc && pass && others.every((o) => o.faction === "npc" || o.faction === mover.faction)) {
      if (pass === "walk") return others.some((o) => o.faction === mover.faction) ? "pass" : "free";
      if (pass === "solid") return "block";
      return mover.faction === "hero" && !others.some((o) => o.faction === mover.faction) ? "stop" : "block";
    }
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
  if (piece.faction === "hero" && isExploring(ctx)) return exploreOptions(ctx, piece);
  const out = new Map<string, MoveOption>();
  if (!opts.ignoreMoved && !canPieceMove(ctx, piece)) return out;
  const reach = pieceReach(ctx, piece);
  const occupancy = occupancyFor(ctx, piece);
  const g = grid(ctx);
  const canEnter = swimAccess(ctx, piece);
  for (const c of aliveMembers(ctx, piece)) {
    const pattern = resolvePatternRef(ctx.db, movePatternOf(ctx.db, c));
    const moves = resolveMoves({ grid: g, origin: piece, pattern, maxReach: reach, occupancy, canEnter });
    for (const [k, r] of moves) {
      const prev = out.get(k);
      if (prev && (prev.mode === "walk" || r.mode === "leap") && prev.path.length <= r.path.length) continue;
      out.set(k, classify(ctx, piece, r));
    }
  }
  return out;
}

/**
 * Free exploration (§8.10): every cell the piece can walk to (orthogonal steps, height rule of its
 * members, allies and villagers passable), regardless of move patterns and of having moved.
 */
function exploreOptions(ctx: Ctx, piece: Piece): Map<string, MoveOption> {
  const out = new Map<string, MoveOption>();
  const members = aliveMembers(ctx, piece);
  if (piece.fallen || !members.length || pieceReach(ctx, piece) <= 0) return out;
  const maxHeightDiff = Math.min(...members.map((c) => resolvePatternRef(ctx.db, movePatternOf(ctx.db, c)).maxHeightDiff));
  const g = grid(ctx);
  const reach = g.width * g.height;
  const pattern = { parts: [{ walk: reach, dirs: "orthogonal" as const }], reach, ignoreHeight: false, ignoreBlocking: false, includeOrigin: false, maxHeightDiff };
  for (const [k, r] of resolveMoves({ grid: g, origin: piece, pattern, occupancy: occupancyFor(ctx, piece) })) out.set(k, classify(ctx, piece, r));
  return out;
}

function classify(ctx: Ctx, piece: Piece, r: Reach): MoveOption {
  const others = piecesAt(ctx, r.pos).filter((p) => p.id !== piece.id);
  const exit = exitAt(ctx, r.pos);
  if (exit && !others.length) return { ...r, kind: "exit", exit };
  // entities one can walk onto (a floor plate, an open gate) are no one to meet (§10.3)
  const standOn = others.filter((o) => !(o.faction === "npc" && pageOfPiece(ctx, o)?.pass === "walk"));
  if (!standOn.length) return { ...r, kind: "move" };
  others.splice(0, others.length, ...standOn);
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
  /** Stopped early by a trap, ice or a rising enemy (§7.4, §7.5): don't continue the flow. */
  interrupted?: boolean;
  /** A dormant enemy that rose within reach and attacks right away (ambush, §7.5). */
  ambush?: string;
}

/**
 * Moves a piece along a path and applies the cell rules (§7.4, §7.5):
 * - every field effect on a cell the piece walks *through* hits it once on the way
 * - walking onto ice ends the walk there: the piece slips on until it leaves the ice or is blocked
 * - hidden traps / rising enemies stop heroes, thief traps stop enemies
 * - landing applies the field effects of the final cell
 * `mover` (the character who moved it) becomes the piece's anchor for start-of-turn effects.
 * Used for normal moves, post-battle capture moves and interaction approaches.
 */
export function movePiece(ctx: Ctx, piece: Piece, path: Pos[], mode: "walk" | "leap", mover?: string): MoveResult {
  const events: GameEvent[] = [];
  if (!path.length) return { events, final: { x: piece.x, y: piece.y } };
  if (mover && piece.members.includes(mover)) piece.anchor = mover;
  const start: Pos = { x: piece.x, y: piece.y };
  const flying = isFlyingPiece(ctx, piece);
  const cut = interruptionAt(ctx, piece, path, mode, flying);
  if (cut >= 0) path = path.slice(0, cut + 1);
  // Stepping onto ice ends the walk: the piece slips from there (§5.4).
  const iceAt = flying || mode !== "walk" ? -1 : path.findIndex((p) => isFrozen(ctx, p));
  const iceCut = iceAt >= 0 && iceAt < path.length - 1;
  if (iceAt >= 0) path = path.slice(0, iceAt + 1);

  // Walk, stopping on every crossed cell with a field effect to apply it (§7.4).
  let seg: Pos[] = [];
  const advance = () => {
    if (!seg.length) return;
    const prev = seg.length > 1 ? seg[seg.length - 2] : { x: piece.x, y: piece.y };
    const last = seg[seg.length - 1];
    piece.facing = dirFromStep(prev, last);
    piece.x = last.x;
    piece.y = last.y;
    events.push({ type: "move", piece: piece.id, path: seg, mode });
    seg = [];
  };
  for (let i = 0; i < path.length; i++) {
    seg.push(path[i]);
    const crossing = i < path.length - 1 && mode === "walk" && !flying;
    if (!crossing || !fieldEffectsAt(ctx, path[i]).length) continue;
    advance();
    events.push(...cellEffects(ctx, piece), ...reconcile(ctx));
    if (!board(ctx).pieces[piece.id] || !aliveMembers(ctx, piece).length) {
      return { events, final: { x: piece.x, y: piece.y }, interrupted: true };
    }
  }
  advance();

  // Ice: remember the shore it came from (fallback if the ice melts under it), then slip.
  if (iceAt >= 0 && !isFrozen(ctx, start)) piece.iceOrigin = iceAt > 0 ? path[iceAt - 1] : start;
  let slide = cut >= 0 ? [] : slidePath(ctx, piece);
  const slideCut = interruptionAt(ctx, piece, slide, "walk", flying);
  if (slideCut >= 0) slide = slide.slice(0, slideCut + 1);
  if (slide.length) {
    const end = slide[slide.length - 1];
    piece.x = end.x;
    piece.y = end.y;
    events.push({ type: "move", piece: piece.id, path: slide, mode: "slide" });
  }
  if (!isFrozen(ctx, piece)) delete piece.iceOrigin;
  events.push(...applyLanding(ctx, piece)); // (its reconcile also updates plates and gates)
  // The piece didn't end where it was sent: callers skip close-ups / travel.
  const interrupted = cut >= 0 || slideCut >= 0 || iceCut || slide.length > 0;
  let ambush: string | undefined;
  if (cut >= 0 || slideCut >= 0) {
    const stop = hiddenStop(ctx, piece, flying);
    events.push(...stop.events);
    ambush = stop.ambush;
  }
  return { events, final: { x: piece.x, y: piece.y }, interrupted, ambush };
}

export function isFrozen(ctx: Ctx, p: Pos) {
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
    if (samePos(option.approach!, option.pos)) return { ...movePiece(ctx, piece, option.path, option.mode, charId), option };
    const path = option.mode === "walk" ? option.path.slice(0, option.path.findIndex((p) => samePos(p, option.approach!)) + 1) : [];
    const res = movePiece(ctx, piece, path, "walk", charId);
    if (npc && !samePos(piece, npc) && !res.interrupted) piece.facing = dirFromStep(piece, npc);
    return { ...res, option };
  }
  return { ...movePiece(ctx, piece, option.path, option.mode, charId), option };
}

/** Swimmers (§5.5): which cells an enemy piece may enter; undefined = only walkable ones. */
export function swimAccess(ctx: Ctx, piece: Piece): ((cell: import("./grid").Cell) => boolean) | undefined {
  if (piece.faction !== "enemy") return undefined;
  const leader = aliveMembers(ctx, piece)[0];
  const swims = leader ? ctx.db.enemy(leader.def).swims : undefined;
  if (!swims) return undefined;
  const water = (cell: import("./grid").Cell) => !!grid(ctx).chipset.terrains[cell.terrain].water;
  return swims === "water" ? water : (cell) => cell.walkable || water(cell);
}

/** The member whose turn start triggers the piece's cell effects (§7.4). */
export function anchorOf(ctx: Ctx, piece: Piece): string | undefined {
  const alive = aliveMembers(ctx, piece).map((c) => c.id);
  return piece.anchor && alive.includes(piece.anchor) ? piece.anchor : alive[0];
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

