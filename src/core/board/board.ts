import {
  createEnemy,
  enemyRewards,
  createNpc,
  effectiveStats,
  gainExp,
  hasFlagStatus,
  isAlive,
  movePatternOf,
} from "../chars/character";
import { findChar, getChar, type Ctx } from "../context";
import type { EventPageDef, ExitDef, MapEnemyDef, MapEventDef } from "../data/types";
import type { GameEvent } from "../events";
import { check } from "../script/conditions";
import type { BoardState, Character, MapMemory, Piece } from "../state/types";
import type { Dir, Pos } from "../util/grid";
import { ALL_DIRS, add, samePos } from "../util/grid";
import { getGrid, LiveGrid } from "./grid";
import { isEntity, pageFromState, solidCells } from "./entities";
import { resolvePatternRef } from "./patterns";

// ---------- access ----------

export function board(ctx: Ctx): BoardState {
  if (!ctx.state.board) throw new Error("No active board");
  return ctx.state.board;
}

/** The current board's cells, including terrain changes and ice bridges (§5.4). */
export function grid(ctx: Ctx): LiveGrid {
  const b = board(ctx);
  const mem = mapMemory(ctx, b.mapId);
  const bridged = (p: Pos) =>
    b.fieldEffects.some((f) => f.x === p.x && f.y === p.y && ctx.db.fieldEffect(f.effect).bridges);
  // entities in a solid state (a closed gate) are walls (§10.3)
  const closed = new Set(solidCells(ctx).map((p) => `${p.x},${p.y}`));
  return new LiveGrid(getGrid(ctx.db, b.mapId), mem.terrain ?? {}, bridged, mem.decor ?? {}, closed);
}

export function mapMemory(ctx: Ctx, mapId: string): MapMemory {
  return (ctx.state.maps[mapId] ??= { defeated: [], removedEvents: [], triggered: [] });
}

export function pieces(ctx: Ctx): Piece[] {
  return Object.values(board(ctx).pieces);
}

export function piecesAt(ctx: Ctx, p: Pos, opts: { includeFallen?: boolean } = {}): Piece[] {
  return pieces(ctx).filter((pc) => pc.x === p.x && pc.y === p.y && (opts.includeFallen || !pc.fallen));
}

export function pieceOf(ctx: Ctx, charId: string): Piece | undefined {
  return pieces(ctx).find((p) => p.members.includes(charId));
}

export function mustPieceOf(ctx: Ctx, charId: string): Piece {
  const p = pieceOf(ctx, charId);
  if (!p) throw new Error(`Character ${charId} is not on the board`);
  return p;
}

export function membersOf(ctx: Ctx, piece: Piece): Character[] {
  return piece.members.map((id) => getChar(ctx, id));
}

export function aliveMembers(ctx: Ctx, piece: Piece): Character[] {
  return membersOf(ctx, piece).filter(isAlive);
}

/** Every character standing on a cell (fallen included when asked; dormant enemies stay unseen, §7.5). */
export function charsAt(ctx: Ctx, p: Pos, opts: { includeFallen?: boolean } = {}): Character[] {
  return piecesAt(ctx, p, opts)
    .filter((pc) => !pc.dormant)
    .flatMap((pc) => membersOf(ctx, pc));
}

export function isHidden(ctx: Ctx, piece: Piece): boolean {
  const members = aliveMembers(ctx, piece);
  return members.length > 0 && members.every((c) => hasFlagStatus(ctx.db, c, "board", "untargetable"));
}

export function newPieceId(ctx: Ctx, prefix: string): string {
  const b = board(ctx);
  return `${prefix}${b.nextId++}`;
}

export function heroPieces(ctx: Ctx): Piece[] {
  return pieces(ctx).filter((p) => p.faction === "hero" && !p.fallen);
}

// ---------- field effects on cells ----------

/** Field effects active on a cell: temporary ones plus the terrain surface. */
export function fieldEffectsAt(ctx: Ctx, p: Pos): string[] {
  const out = board(ctx)
    .fieldEffects.filter((f) => f.x === p.x && f.y === p.y)
    .map((f) => f.effect);
  const surface = grid(ctx).cell(p)?.surface;
  if (surface && !out.includes(surface)) out.push(surface);
  return out;
}

// ---------- exits ----------

export function exitAt(ctx: Ctx, p: Pos): ExitDef | undefined {
  return (ctx.db.map(board(ctx).mapId).exits ?? []).find((e) => e.x === p.x && e.y === p.y);
}

export function exitEnabled(ctx: Ctx, exit: ExitDef): boolean {
  return check(ctx, exit.enabled);
}

// ---------- events → pieces (§10.3) ----------

export function activePage(ctx: Ctx, mapId: string, ev: MapEventDef): EventPageDef | undefined {
  if (mapMemory(ctx, mapId).removedEvents.includes(ev.id)) return undefined;
  // an entity (§10.3): its current state, seen as a page
  if (isEntity(ev)) return pageFromState(ctx, mapId, ev);
  let page: EventPageDef | undefined;
  for (const p of ev.pages ?? []) if (check(ctx, p.when)) page = p;
  return page;
}

export function eventDef(ctx: Ctx, eventId: string): MapEventDef | undefined {
  return (ctx.db.map(board(ctx).mapId).events ?? []).find((e) => e.id === eventId);
}

export function pageOfPiece(ctx: Ctx, piece: Piece): EventPageDef | undefined {
  if (piece.faction !== "npc" || !piece.sourceId) return undefined;
  const ev = eventDef(ctx, piece.sourceId);
  return ev ? activePage(ctx, board(ctx).mapId, ev) : undefined;
}

/** Re-evaluates event pages and adds/removes/updates NPC & object pieces accordingly. */
export function syncEvents(ctx: Ctx): GameEvent[] {
  const b = board(ctx);
  const map = ctx.db.map(b.mapId);
  let changed = false;
  for (const ev of map.events ?? []) {
    const pid = `n:${ev.id}`;
    const page = activePage(ctx, b.mapId, ev);
    const uncovered = !ev.hidden || (mapMemory(ctx, b.mapId).discovered ?? []).includes(ev.id);
    const visible = !!page && uncovered && (!!page.npc || !!page.decor);
    const existing = b.pieces[pid];
    if (!visible) {
      if (existing) {
        for (const m of existing.members) delete b.chars[m];
        delete b.pieces[pid];
        changed = true;
      }
      continue;
    }
    const charId = `c:${ev.id}`;
    const members: string[] = [];
    if (page!.npc) {
      const c = b.chars[charId];
      if (!c || c.def !== page!.npc) b.chars[charId] = createNpc(ctx.db, charId, page!.npc);
      members.push(charId);
    } else if (b.chars[charId]) delete b.chars[charId];
    if (!existing) {
      b.pieces[pid] = {
        id: pid,
        faction: "npc",
        members,
        x: ev.x,
        y: ev.y,
        facing: page!.dir ?? "S",
        sourceId: ev.id,
        home: { x: ev.x, y: ev.y },
      };
      changed = true;
    } else if (existing.members.join() !== members.join()) {
      existing.members = members;
      changed = true;
    }
  }
  return changed ? [{ type: "pieces" }] : [];
}

// ---------- entering a map ----------

export function enterMap(ctx: Ctx, mapId: string, spawnId: string, groups?: { members: string[]; spawn: string }[], facing?: Dir): GameEvent[] {
  const map = ctx.db.map(mapId);
  const spawn = map.spawns[spawnId];
  if (!spawn) throw new Error(`Map ${mapId} has no spawn "${spawnId}"`);
  const mem = mapMemory(ctx, mapId);
  const b: BoardState = {
    mapId,
    pieces: {},
    chars: {},
    fieldEffects: [],
    traps: [],
    turn: { round: 1, acted: [], current: null, moved: [], abilityUsed: [] },
    nextId: 1,
  };
  ctx.state.board = b;

  // Heroes: alive ones as parties of max size on the spawn cell, fallen ones lying there –
  // or, after split floors (§5.3), each group at its own spawn.
  const alive = ctx.state.roster.filter((id) => isAlive(ctx.state.heroes[id]));
  const size = ctx.db.config.maxPartySize;
  if (groups?.length) {
    for (const g of groups) {
      const at = map.spawns[g.spawn] ?? spawn;
      const members = g.members.filter((m) => alive.includes(m));
      if (!members.length) continue;
      const id = newPieceId(ctx, "h");
      b.pieces[id] = { id, faction: "hero", members, x: at.x, y: at.y, facing: at.dir ?? "S" };
    }
  } else {
    for (let i = 0; i < alive.length; i += size) {
      const id = newPieceId(ctx, "h");
      b.pieces[id] = { id, faction: "hero", members: alive.slice(i, i + size), x: spawn.x, y: spawn.y, facing: facing ?? spawn.dir ?? "S" };
    }
  }
  for (const heroId of ctx.state.roster.filter((id) => !isAlive(ctx.state.heroes[id]))) {
    b.pieces[`f:${heroId}`] = { id: `f:${heroId}`, faction: "hero", members: [heroId], x: spawn.x, y: spawn.y, facing: "S", fallen: true };
  }

  // Enemies not yet defeated whose condition holds.
  for (const e of map.enemies ?? []) {
    if (mem.defeated.includes(e.id) || !check(ctx, e.when)) continue;
    const ids = [e.enemy, ...(e.party ?? [])].map((enemyId, i) => {
      const cid = `${e.id}#${i}`;
      b.chars[cid] = createEnemy(ctx.db, cid, enemyId, placedLevel(ctx, e, enemyId));
      return cid;
    });
    b.pieces[`e:${e.id}`] = { id: `e:${e.id}`, faction: "enemy", members: ids, x: e.x, y: e.y, facing: e.dir ?? "S", sourceId: e.id, home: { x: e.x, y: e.y }, ...dormancy(ctx, e.enemy) };
  }

  syncEvents(ctx);
  return [{ type: "pieces" }];
}

/** Adds an enemy piece at runtime (spawnEnemy action). */
export function spawnMapEnemy(ctx: Ctx, entryId: string): GameEvent[] {
  const b = board(ctx);
  const e = (ctx.db.map(b.mapId).enemies ?? []).find((x) => x.id === entryId);
  if (!e || b.pieces[`e:${e.id}`] || mapMemory(ctx, b.mapId).defeated.includes(e.id)) return [];
  const ids = [e.enemy, ...(e.party ?? [])].map((enemyId, i) => {
    const cid = `${e.id}#${i}`;
    b.chars[cid] = createEnemy(ctx.db, cid, enemyId, placedLevel(ctx, e, enemyId));
    return cid;
  });
  b.pieces[`e:${e.id}`] = { id: `e:${e.id}`, faction: "enemy", members: ids, x: e.x, y: e.y, facing: e.dir ?? "S", sourceId: e.id, home: { x: e.x, y: e.y }, ...dormancy(ctx, e.enemy) };
  return [{ type: "pieces" }];
}

/** Level of an enemy in a map entry: the entry's `level` for its leader, party members shifted alike (§12.6). */
function placedLevel(ctx: Ctx, e: MapEnemyDef, enemyId: string): number | undefined {
  if (e.level === undefined) return undefined;
  return ctx.db.enemy(enemyId).level + (e.level - ctx.db.enemy(e.enemy).level);
}

/** Enemies with `boardAi.dormant` start lying still (§7.5). */
function dormancy(ctx: Ctx, enemyId: string): { dormant?: true } {
  return ctx.db.enemy(enemyId).boardAi.dormant ? { dormant: true } : {};
}

// ---------- reconciliation after HP changes ----------

/**
 * Brings pieces in line with character HP:
 * - KO heroes leave their party and lie fallen on their cell
 * - revived fallen heroes stand up (joining an allied piece on the cell if room)
 * - KO enemies/NPCs are removed; enemies grant shared EXP/gold (board kills)
 */
export function reconcile(ctx: Ctx, opts: { rewardKills?: boolean; fallenAt?: Record<string, Pos> } = {}): GameEvent[] {
  const b = board(ctx);
  const events: GameEvent[] = [];
  let changed = false;
  let expPool = 0;
  let goldPool = 0;

  for (const piece of Object.values(b.pieces)) {
    if (piece.fallen) {
      const hero = getChar(ctx, piece.members[0]);
      if (isAlive(hero)) {
        delete b.pieces[piece.id];
        const host = piecesAt(ctx, piece).find((p) => p.faction === "hero" && p.members.length < ctx.db.config.maxPartySize);
        if (host) host.members.push(hero.id);
        else {
          const id = newPieceId(ctx, "h");
          b.pieces[id] = { id, faction: "hero", members: [hero.id], x: piece.x, y: piece.y, facing: piece.facing };
        }
        // A revived hero has spent this round.
        if (!b.turn.moved.includes(hero.id)) b.turn.moved.push(hero.id);
        if (!b.turn.acted.includes(hero.id)) b.turn.acted.push(hero.id);
        changed = true;
      }
      continue;
    }
    const dead = piece.members.filter((id) => {
      const c = findChar(ctx, id);
      return c && !isAlive(c);
    });
    if (!dead.length) continue;
    changed = true;
    piece.members = piece.members.filter((id) => !dead.includes(id));
    for (const id of dead) {
      const c = getChar(ctx, id);
      if (c.kind === "hero") {
        const at = opts.fallenAt?.[id] ?? piece;
        b.pieces[`f:${id}`] = { id: `f:${id}`, faction: "hero", members: [id], x: at.x, y: at.y, facing: piece.facing, fallen: true };
      } else if (c.kind === "enemy") {
        ctx.state.records.kills[c.def] = (ctx.state.records.kills[c.def] ?? 0) + 1;
        const r = enemyRewards(ctx.db, c);
        expPool += r.exp;
        goldPool += r.gold;
        delete b.chars[id];
        // Map entries are remembered as defeated once all their characters are gone
        // (works even when enemy parties split up or merge).
        const entry = id.split("#")[0];
        const mem = mapMemory(ctx, b.mapId);
        if (!Object.keys(b.chars).some((cid) => cid.startsWith(entry + "#")) && !mem.defeated.includes(entry)) mem.defeated.push(entry);
      } else {
        delete b.chars[id];
      }
    }
    if (piece.members.length === 0) {
      if (piece.faction === "npc" && piece.sourceId) mapMemory(ctx, b.mapId).removedEvents.push(piece.sourceId);
      delete b.pieces[piece.id];
    }
  }

  if (opts.rewardKills !== false && (expPool > 0 || goldPool > 0)) events.push(...shareRewards(ctx, expPool, goldPool));
  if (changed) events.push({ type: "pieces" });
  return events;
}

/** Splits EXP evenly (rounded up) between the given heroes (default: all living heroes) and adds gold. */
export function shareRewards(ctx: Ctx, exp: number, gold: number, heroIds?: string[]): GameEvent[] {
  const events: GameEvent[] = [];
  const receivers = (heroIds ?? ctx.state.roster).map((id) => ctx.state.heroes[id]).filter(isAlive);
  if (exp > 0 && receivers.length) {
    const each = Math.ceil(exp / receivers.length);
    for (const h of receivers) {
      events.push({ type: "exp", target: h.id, amount: each });
      for (const lv of gainExp(ctx.db, h, each)) events.push({ type: "levelUp", target: h.id, ...lv });
    }
  }
  if (gold > 0) {
    ctx.state.gold += gold;
    events.push({ type: "gold", amount: gold });
  }
  return events;
}

/**
 * Free exploration (§8.10): no living enemy on the board. There are no rounds then – heroes walk
 * anywhere they can reach and act as often as they like.
 */
export function isExploring(ctx: Ctx): boolean {
  if (!ctx.state.board) return false;
  return !pieces(ctx).some((p) => p.faction === "enemy" && !p.fallen && !p.dormant && aliveMembers(ctx, p).length > 0);
}

export function isGameOver(ctx: Ctx): boolean {
  return ctx.state.roster.every((id) => !isAlive(ctx.state.heroes[id]));
}

// ---------- reach (§8.2) ----------

/** Effective reach of one character: pattern reach + status modifiers (e.g. Stuck −1). */
export function memberReach(ctx: Ctx, c: Character): number {
  const base = resolvePatternRef(ctx.db, movePatternOf(ctx.db, c)).reach;
  let mod = 0;
  for (const st of c.statuses) {
    const d = ctx.db.status(st.id);
    if (d.scope.includes("board")) mod += d.reachModifier ?? 0;
  }
  return Math.max(0, base + mod);
}

/** Party reach = smallest member reach. */
export function pieceReach(ctx: Ctx, piece: Piece): number {
  const members = aliveMembers(ctx, piece);
  return members.length ? Math.min(...members.map((c) => memberReach(ctx, c))) : 0;
}

/** Slot speed of a piece = slowest living member (board scope). */
export function pieceSpeed(ctx: Ctx, piece: Piece): number {
  const members = aliveMembers(ctx, piece);
  return members.length ? Math.min(...members.map((c) => effectiveStats(ctx.db, c, "board").spd)) : 0;
}

export function neighbors8(p: Pos): Pos[] {
  return ALL_DIRS.map((d) => add(p, d));
}

export function isAdjacentOrSame(a: Pos, b: Pos): boolean {
  return samePos(a, b) || (Math.abs(a.x - b.x) <= 1 && Math.abs(a.y - b.y) <= 1);
}

