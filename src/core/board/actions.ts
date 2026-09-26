import { isAlive, knownAbilities } from "../chars/character";
import { getChar, type Ctx } from "../context";
import type { BoardTargetFilter, BoardUse, EffectDef } from "../data/types";
import { applyEffects, breakOnOffense, isOffensive } from "../effects/effects";
import type { GameEvent } from "../events";
import { itemCount, removeItem } from "../items/inventory";
import type { Character, Piece } from "../state/types";
import type { Pos } from "../util/grid";
import { samePos } from "../util/grid";
import {
  aliveMembers,
  board,
  exitAt,
  grid,
  isAdjacentOrSame,
  isHidden,
  mustPieceOf,
  newPieceId,
  piecesAt,
  reconcile,
} from "./board";
import { patternCells, resolvePatternRef } from "./patterns";
import { defuse, discover, visibleTrapAt } from "./hidden";
import { conductive, freezeCells, placeFieldEffect, setDecor, shockMultiplier, shockNetwork } from "./terrain";

/**
 * Lightning (§5.6): everyone on the struck cell – or, on water, on every connected conductive cell
 * within reach – takes thunder damage, ×1.5 where it struck, less with distance. Hits allies too.
 */
function shock(ctx: Ctx, user: Character, target: Pos, power: number, reach?: number): GameEvent[] {
  const wet = conductive(ctx, target);
  const net = shockNetwork(ctx, target, reach);
  const events: GameEvent[] = [{ type: "shock", cells: net.map((n) => n.pos) }];
  for (const { pos, d } of net) {
    const effect: EffectDef = { type: "damage", kind: "magical", power: power * shockMultiplier(wet, d), element: "thunder" };
    for (const pc of piecesAt(ctx, pos)) {
      if (pc.dormant || pc.fallen) continue;
      for (const c of aliveMembers(ctx, pc)) events.push(...applyEffects({ ctx, user, scope: "board" }, c, [effect]));
    }
  }
  return events;
}
import { abilityUsed, markAbilityUsed } from "./turns";

// ---------- targeting ----------

export interface Targeting {
  /** All cells in range (for the preview). */
  range: Pos[];
  /** Cells that are valid targets. */
  valid: Pos[];
  /** Area cells for a chosen target cell. */
  areaAt: (p: Pos) => Pos[];
}

function cellMatches(ctx: Ctx, user: Character, p: Pos, filter: BoardTargetFilter): boolean {
  const all = piecesAt(ctx, p, { includeFallen: true });
  const standing = all.filter((pc) => !pc.fallen && !pc.dormant && pc.members.length);
  const userPiece = mustPieceOf(ctx, user.id);
  switch (filter) {
    case "self":
      return samePos(p, userPiece);
    case "hero":
      return standing.some((pc) => pc.faction === "hero");
    case "enemy":
      return standing.some((pc) => pc.faction === "enemy" && !isHidden(ctx, pc));
    case "npc":
      return standing.some((pc) => pc.faction === "npc" && pc.members.length > 0);
    case "anyCharacter":
      return standing.some((pc) => pc.faction !== "enemy" || !isHidden(ctx, pc));
    case "fallen":
      return all.some((pc) => pc.fallen);
    case "emptyCell":
      return !all.length && !!grid(ctx).cell(p)?.walkable && !exitAt(ctx, p);
    case "anyCell":
      return !!grid(ctx).cell(p);
    case "trap":
      return visibleTrapAt(ctx, p);
    case "plant": {
      const c = grid(ctx).cell(p);
      return !!(c?.decor && grid(ctx).chipset.decor[c.decor]?.cuttable);
    }
  }
}

export function targeting(ctx: Ctx, user: Character, use: BoardUse): Targeting {
  const piece = mustPieceOf(ctx, user.id);
  const g = grid(ctx);
  const range = patternCells(g, piece, resolvePatternRef(ctx.db, use.range));
  const wildOk = !use.wildOnly || ctx.db.map(board(ctx).mapId).kind === "wild";
  const valid = wildOk ? range.filter((p) => use.targets.some((f) => cellMatches(ctx, user, p, f))) : [];
  const area = use.area ? resolvePatternRef(ctx.db, use.area) : undefined;
  const freeze = use.effects.find((e) => e.type === "freezeArea");
  const shock = use.effects.find((e) => e.type === "shock");
  return {
    range,
    valid,
    areaAt: (p) =>
      freeze?.type === "freezeArea"
        ? freezeCells(ctx, piece, p, freeze.size)
        : shock?.type === "shock"
          ? shockNetwork(ctx, p, shock.reach).map((n) => n.pos)
          : area
            ? patternCells(g, p, { ...area, includeOrigin: true })
            : [p],
  };
}

// ---------- applying a board use (ability or item) ----------

function applyBoardUse(ctx: Ctx, user: Character, use: BoardUse, target: Pos): GameEvent[] {
  const t = targeting(ctx, user, use);
  if (!t.valid.some((p) => samePos(p, target))) throw new Error(`Invalid target ${target.x},${target.y}`);
  const events: GameEvent[] = [];
  const cells = t.areaAt(target);
  const charEffects = use.effects.filter((e) => !["fieldEffect", "freezeArea", "placeTrap", "discover", "defuse", "shock", "cut"].includes(e.type));
  for (const e of use.effects) {
    if (e.type === "discover") events.push(...discover(ctx, user, e.radius));
    if (e.type === "defuse") events.push(...defuse(ctx, target, e.item));
    if (e.type === "cut") events.push(...setDecor(ctx, target, null, "cut"));
    if (e.type === "shock") events.push(...shock(ctx, user, target, e.power, e.reach));
  }
  const revive = use.effects.some((e) => e.type === "revive");
  const hitsCharacters = use.targets.some((f) => f !== "emptyCell" && f !== "anyCell") || charEffects.length > 0;
  if (use.effects.some((e) => e.type === "reveal")) board(ctx).perceivedRound = board(ctx).turn.round;

  // Self-only uses (Chakra, Hide) affect just the user, not everyone on the cell.
  if (!use.area && use.targets.length === 1 && use.targets[0] === "self") {
    events.push(...applyEffects({ ctx, user, scope: "board" }, user, charEffects));
    events.push(...reconcile(ctx));
    return events;
  }

  for (const cell of cells) {
    events.push(...applyCellEffects(ctx, cell, use.effects));
    if (!hitsCharacters || !charEffects.length) continue;
    for (const pc of piecesAt(ctx, cell, { includeFallen: revive })) {
      if (pc.dormant || (pc.faction === "enemy" && isHidden(ctx, pc))) continue;
      for (const c of pc.members.map((id) => getChar(ctx, id))) {
        if (!revive && !isAlive(c)) continue;
        events.push(...applyEffects({ ctx, user, scope: "board" }, c, charEffects));
      }
    }
  }
  if (isOffensive(use.effects) || use.effects.some((e) => e.type === "applyStatus" && ctx.db.status(e.status).negative)) {
    events.push(...breakOnOffense(ctx, user));
  }
  events.push(...reconcile(ctx));
  return events;
}

function applyCellEffects(ctx: Ctx, cell: Pos, effects: EffectDef[]): GameEvent[] {
  const b = board(ctx);
  const events: GameEvent[] = [];
  if (!grid(ctx).cell(cell)) return events;
  for (const e of effects) {
    if (e.type === "fieldEffect" || e.type === "freezeArea") {
      events.push(...placeFieldEffect(ctx, cell, e.effect, e.rounds));
    } else if (e.type === "placeTrap") {
      b.traps.push({ x: cell.x, y: cell.y, damage: e.damage, status: e.status });
      events.push({ type: "trap", x: cell.x, y: cell.y });
    }
  }
  return events;
}

// ---------- abilities ----------

export function boardAbilities(ctx: Ctx, charId: string): string[] {
  const c = getChar(ctx, charId);
  return knownAbilities(ctx.db, c).filter((id) => {
    const a = ctx.db.ability(id);
    return !!a.board || !!a.special;
  });
}

export function canUseBoardAbility(ctx: Ctx, charId: string, abilityId: string): boolean {
  const c = getChar(ctx, charId);
  const a = ctx.db.ability(abilityId);
  if (abilityUsed(ctx, charId) || c.mp < a.mp || !isAlive(c)) return false;
  if (a.special === "joinParty") return joinTargets(ctx, charId).length > 0;
  if (a.special === "leaveParty") return mustPieceOf(ctx, charId).members.length > 1;
  return !!a.board && targeting(ctx, c, a.board).valid.length > 0;
}

export function abilityTargeting(ctx: Ctx, charId: string, abilityId: string): Targeting | null {
  const a = ctx.db.ability(abilityId);
  const c = getChar(ctx, charId);
  if (a.special === "joinParty") {
    const cells = joinTargets(ctx, charId).map((p) => ({ x: p.x, y: p.y }));
    return { range: cells, valid: cells, areaAt: (p) => [p] };
  }
  return a.board ? targeting(ctx, c, a.board) : null;
}

export function useBoardAbility(ctx: Ctx, charId: string, abilityId: string, target?: Pos): GameEvent[] {
  if (!canUseBoardAbility(ctx, charId, abilityId)) throw new Error(`${charId} cannot use ${abilityId} now`);
  const c = getChar(ctx, charId);
  const a = ctx.db.ability(abilityId);
  const events: GameEvent[] = [{ type: "action", actor: charId, name: a.name, ability: abilityId }];
  if (a.special === "joinParty") {
    const host = joinTargets(ctx, charId).find((p) => target && samePos(p, target));
    if (!host) throw new Error("No party to join there");
    events.push(...joinParty(ctx, charId, host));
  } else if (a.special === "leaveParty") {
    events.push(...leaveParty(ctx, charId));
  } else {
    c.mp -= a.mp;
    if (a.mp) events.push({ type: "mp", target: c.id, amount: -a.mp });
    events.push(...applyBoardUse(ctx, c, a.board!, target!));
  }
  markAbilityUsed(ctx, charId);
  return events;
}

// ---------- items (unlimited per turn, §7.2) ----------

export function boardItems(ctx: Ctx): string[] {
  return Object.keys(ctx.state.inventory).filter((id) => itemCount(ctx, id) > 0 && !!ctx.db.item(id).board);
}

export function itemTargeting(ctx: Ctx, charId: string, itemId: string): Targeting | null {
  const use = ctx.db.item(itemId).board;
  return use ? targeting(ctx, getChar(ctx, charId), use) : null;
}

export function useBoardItem(ctx: Ctx, charId: string, itemId: string, target: Pos): GameEvent[] {
  const item = ctx.db.item(itemId);
  if (!item.board || itemCount(ctx, itemId) < 1) throw new Error(`Cannot use ${itemId}`);
  const c = getChar(ctx, charId);
  const events: GameEvent[] = [{ type: "action", actor: charId, name: item.name, item: itemId }];
  events.push(...applyBoardUse(ctx, c, item.board, target));
  removeItem(ctx, itemId);
  return events;
}

// ---------- parties (§8.1) ----------

/** Allied pieces on the same or an adjacent cell (height rule) with room for one more. */
export function joinTargets(ctx: Ctx, charId: string): Piece[] {
  const own = mustPieceOf(ctx, charId);
  const g = grid(ctx);
  const max = ctx.db.config.maxPartySize;
  return Object.values(board(ctx).pieces).filter(
    (p) =>
      p.id !== own.id &&
      !p.fallen &&
      p.faction === own.faction &&
      !p.dormant &&
      aliveMembers(ctx, p).length > 0 &&
      p.members.length < max &&
      isAdjacentOrSame(p, own) &&
      Math.abs(g.heightAt(p) - g.heightAt(own)) <= 1,
  );
}

export function joinParty(ctx: Ctx, charId: string, host: Piece): GameEvent[] {
  const own = mustPieceOf(ctx, charId);
  const b = board(ctx);
  const events: GameEvent[] = [];
  own.members = own.members.filter((m) => m !== charId);
  if (!own.members.length) delete b.pieces[own.id];
  host.members.push(charId);
  if (!samePos(own, host)) events.push({ type: "join", char: charId, from: { x: own.x, y: own.y }, to: { x: host.x, y: host.y } });
  events.push({ type: "pieces" });
  return events;
}

export function leaveParty(ctx: Ctx, charId: string): GameEvent[] {
  const own = mustPieceOf(ctx, charId);
  if (own.members.length < 2) return [];
  const at = own.members.indexOf(charId);
  own.members = own.members.filter((m) => m !== charId);
  // The anchor for cell effects passes to the next member (§7.4).
  if (own.anchor === charId) own.anchor = own.members[at % own.members.length];
  const id = newPieceId(ctx, own.faction === "hero" ? "h" : "e");
  board(ctx).pieces[id] = { id, faction: own.faction, members: [charId], x: own.x, y: own.y, facing: own.facing, anchor: charId, ...(own.iceOrigin ? { iceOrigin: own.iceOrigin } : {}) };
  // The leaver keeps its own "moved" flag (it can still move if it hasn't).
  return [{ type: "pieces" }];
}

// ---------- stealing from NPCs (§8.8) ----------

/** Whether the actor may pick the "Steal" option on this NPC piece. */
export function canStealFromNpc(ctx: Ctx, actorId: string, npcPieceId: string): boolean {
  const npc = board(ctx).pieces[npcPieceId];
  const npcChar = npc?.members[0] ? getChar(ctx, npc.members[0]) : undefined;
  if (!npcChar || npcChar.looted || !ctx.db.npc(npcChar.def).steal?.length) return false;
  return knownAbilities(ctx.db, getChar(ctx, actorId)).includes("steal") && !abilityUsed(ctx, actorId);
}
