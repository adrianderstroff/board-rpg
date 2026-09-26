import { computeStats, isAlive } from "../chars/character";
import type { Ctx } from "../context";
import type { Action, Emote, Script } from "../data/types";
import type { GameEvent } from "../events";
import { addItem, removeItem } from "../items/inventory";
import { aliveMembers, board, grid, mapMemory, pieceOf, piecesAt, reconcile, spawnMapEnemy } from "../board/board";
import { dirFromStep } from "../util/grid";
import type { Piece } from "../state/types";
import { dealDamage, heal } from "../effects/effects";
import { addStatus, createHero } from "../chars/character";
import type { Pos } from "../util/grid";
import { completeQuest, setQuestStep, startQuest } from "./quests";
import { ScriptRunner } from "./runner";
import { setEntityState } from "../board/entities";

import type { Dir } from "../util/grid";

/** Things only the presentation layer can do; returned to it in order. */
export type UiRequest =
  | { type: "dialog"; id: string; speaker?: string }
  | { type: "say"; text: string; speaker?: string; face?: string }
  | { type: "wait"; ms: number }
  /** A question in a script: the script goes on with `resume(the chosen option)`. */
  | { type: "choice"; options: { text: string; icon?: string; index: number }[]; resume: (index: number) => ScriptResult }
  | { type: "shop"; id: string }
  | { type: "inn"; price: number; wakeAt?: { map: string; spawn: string; dir?: Dir } }
  | { type: "message"; text: string }
  | { type: "teleport"; map: string; spawn: string }
  /** The camera to a cell (or back to the party). */
  | { type: "camera"; x?: number; y?: number }
  | { type: "sound"; id: string }
  | { type: "music"; id: string }
  | { type: "screen"; effect: "fadeOut" | "fadeIn" | "flash" | "shake" }
  | { type: "emote"; x: number; y: number; icon: Emote };

export interface ScriptResult {
  events: GameEvent[];
  requests: UiRequest[];
}

export const emptyResult = (): ScriptResult => ({ events: [], requests: [] });

export function merge(into: ScriptResult, from: ScriptResult): ScriptResult {
  into.events.push(...from.events);
  into.requests.push(...from.requests);
  return into;
}

const idCount = (v: string | { id: string; count?: number }) => (typeof v === "string" ? { id: v, count: 1 } : { id: v.id, count: v.count ?? 1 });

/**
 * §10.2 – runs a script as far as it can go without the player: state changes happen at once, what
 * the presentation shows (text, dialogs, shops…) comes back as requests in order. A question stops
 * it; its request resumes the script with the answer.
 */
export function runActions(ctx: Ctx, script: Script | undefined, speaker?: string, here?: Pos): ScriptResult {
  return drive(new ScriptRunner(ctx, script ?? [], speaker, true, here));
}

function drive(runner: ScriptRunner, choice?: number): ScriptResult {
  const out = emptyResult();
  for (let c = choice; ; c = undefined) {
    const s = runner.next(c);
    if (s.type === "end") break;
    if (s.type === "events") out.events.push(...s.events);
    else if (s.type === "request") out.requests.push(s.request);
    else if (s.type === "say") out.requests.push({ type: "say", text: s.text, speaker: s.speaker, face: s.face });
    else if (s.type === "wait") out.requests.push({ type: "wait", ms: s.ms });
    else {
      out.requests.push({ type: "choice", options: s.options, resume: (index) => drive(runner, index) });
      break;
    }
  }
  return out;
}

/** One action (§10.2); the runner calls it as the script reaches it. */
export function runAction(ctx: Ctx, a: Action, here?: Pos): ScriptResult {
  const s = ctx.state;
  const out = emptyResult();
  if ("setFlag" in a) s.flags[a.setFlag] = true;
  else if ("clearFlag" in a) delete s.flags[a.clearFlag];
  else if ("setVar" in a) s.vars[a.setVar.name] = a.setVar.value;
  else if ("addVar" in a) s.vars[a.addVar.name] = (s.vars[a.addVar.name] ?? 0) + a.addVar.value;
  else if ("giveItem" in a) {
    const { id, count } = idCount(a.giveItem);
    out.events.push(...addItem(ctx, id, count));
  } else if ("takeItem" in a) {
    const { id, count } = idCount(a.takeItem);
    removeItem(ctx, id, Math.min(count, s.inventory[id] ?? 0));
  } else if ("giveGold" in a) {
    s.gold += a.giveGold;
    out.events.push({ type: "gold", amount: a.giveGold });
  } else if ("takeGold" in a) s.gold = Math.max(0, s.gold - a.takeGold);
  else if ("startQuest" in a) {
    const { id, activate } = typeof a.startQuest === "string" ? { id: a.startQuest, activate: true } : a.startQuest;
    merge(out, startQuest(ctx, id, activate ?? true));
  } else if ("completeQuest" in a) {
    const { id, ending } = typeof a.completeQuest === "string" ? { id: a.completeQuest, ending: undefined } : a.completeQuest;
    merge(out, completeQuest(ctx, id, ending ?? "done"));
  } else if ("setQuestStep" in a) merge(out, setQuestStep(ctx, a.setQuestStep.quest, a.setQuestStep.step));
  else if ("dialog" in a) out.requests.push({ type: "dialog", id: a.dialog });
  else if ("say" in a || "choice" in a || "if" in a) throw new Error("Script blocks run in a ScriptRunner");
  else if ("shop" in a) out.requests.push({ type: "shop", id: a.shop });
  else if ("inn" in a) out.requests.push({ type: "inn", price: a.inn });
  else if ("message" in a) out.requests.push({ type: "message", text: a.message });
  else if ("teleport" in a) out.requests.push({ type: "teleport", ...a.teleport });
  else if ("healParty" in a) out.events.push(...restParty(ctx));
  else if ("removeEvent" in a) {
    if (s.board) {
      const mem = mapMemory(ctx, board(ctx).mapId);
      if (!mem.removedEvents.includes(a.removeEvent)) mem.removedEvents.push(a.removeEvent);
    }
  } else if ("spawnEnemy" in a) {
    if (s.board) out.events.push(...spawnMapEnemy(ctx, (a as { spawnEnemy: string }).spawnEnemy));
  } else if ("damage" in a || "heal" in a) {
    // the heroes standing on the script's cell, or the whole party (on the board: they keep 1 HP)
    const o = "damage" in a ? a.damage : a.heal;
    const whom = (o.target ?? "here") === "party" || !here || !s.board ? s.roster.map((id) => s.heroes[id]) : piecesAt(ctx, here).filter((p) => p.faction === "hero").flatMap((p) => aliveMembers(ctx, p));
    if ("damage" in a && a.damage.cue === "trap" && here) out.events.push({ type: "trap", x: here.x, y: here.y });
    for (const c of whom) {
      if (!isAlive(c)) continue;
      if ("damage" in a) {
        out.events.push(...dealDamage(ctx, c, a.damage.amount, { nonLethal: !!s.board }));
        if (a.damage.status && isAlive(c) && addStatus(ctx, c, a.damage.status)) out.events.push({ type: "status", target: c.id, status: a.damage.status, added: true });
      } else out.events.push(...heal(ctx, c, a.heal.amount));
    }
  } else if ("move" in a || "face" in a || "emote" in a || ("camera" in a && a.camera.who)) {
    // someone on the board: an entity (its piece), a hero (their piece) or the party
    if (!s.board) return out;
    const who = "move" in a ? a.move.who : "face" in a ? a.face.who : "emote" in a ? a.emote.who : a.camera.who!;
    const piece = pieceFor(ctx, who);
    if (!piece) return out;
    if ("move" in a) {
      const path = walkPath(ctx, piece, a.move.to);
      // a scripted walk (no traps or field effects on the way); no way there: a warp
      const steps = path.length ? path : [a.move.to];
      if (path.length) piece.facing = dirFromStep(path.length > 1 ? path[path.length - 2] : { x: piece.x, y: piece.y }, path[path.length - 1]);
      piece.x = a.move.to.x;
      piece.y = a.move.to.y;
      out.events.push({ type: "move", piece: piece.id, path: steps, mode: path.length ? "walk" : "warp" });
      if (piece.faction === "npc" && piece.sourceId) (mapMemory(ctx, board(ctx).mapId).positions ??= {})[piece.sourceId] = { x: piece.x, y: piece.y };
    } else if ("face" in a) {
      piece.facing = a.face.dir;
      out.events.push({ type: "face", piece: piece.id, dir: a.face.dir });
    } else if ("emote" in a) out.requests.push({ type: "emote", x: piece.x, y: piece.y, icon: a.emote.icon });
    else out.requests.push({ type: "camera", x: piece.x, y: piece.y });
  } else if ("camera" in a) out.requests.push({ type: "camera", ...(a.camera.to ?? {}) });
  else if ("hide" in a || "show" in a) {
    if (s.board) {
      const mem = mapMemory(ctx, board(ctx).mapId);
      const id = "hide" in a ? a.hide : a.show;
      mem.removedEvents = mem.removedEvents.filter((e) => e !== id);
      if ("hide" in a) mem.removedEvents.push(id);
    }
  } else if ("sound" in a) out.requests.push({ type: "sound", id: a.sound });
  else if ("music" in a) out.requests.push({ type: "music", id: a.music });
  else if ("screen" in a) out.requests.push({ type: "screen", effect: a.screen });
  else if ("addMember" in a) out.events.push(...addMember(ctx, a.addMember));
  else if ("removeMember" in a) out.events.push(...removeMember(ctx, a.removeMember));
  else if ("setExit" in a) {
    if (s.board) (mapMemory(ctx, board(ctx).mapId).exits ??= {})[`${a.setExit.x},${a.setExit.y}`] = a.setExit.open;
  } else if ("setState" in a) {
    if (s.board) out.events.push(...setEntityState(ctx, a.setState.event, a.setState.state));
  } else if ("reveal" in a) {
    if (!s.records.revealed.includes(a.reveal)) s.records.revealed.push(a.reveal);
  } else throw new Error(`Unknown action ${JSON.stringify(a)}`);
  return out;
}

/** Inn / full heal: restores HP & MP, revives fallen, cures statuses (§15). */
export function restParty(ctx: Ctx): GameEvent[] {
  const events: GameEvent[] = [];
  for (const id of ctx.state.roster) {
    const h = ctx.state.heroes[id];
    const s = computeStats(ctx.db, h);
    const wasDead = !isAlive(h);
    h.hp = s.maxHp;
    h.mp = s.maxMp;
    h.statuses = [];
    events.push(wasDead ? { type: "revive", target: id, hp: h.hp } : { type: "heal", target: id, amount: 0 });
  }
  if (ctx.state.board) events.push(...reconcile(ctx));
  return events;
}

/** The piece of an entity (event id), a hero, or "party" (the first hero's). */
function pieceFor(ctx: Ctx, who: string): Piece | undefined {
  const hero = who === "party" ? ctx.state.roster.find((id) => pieceOf(ctx, id)) : ctx.state.heroes[who] ? who : undefined;
  if (hero) return pieceOf(ctx, hero);
  return board(ctx).pieces[`n:${who}`];
}

/** A walk to `to` over walkable cells that nobody else stands on (none: []). */
function walkPath(ctx: Ctx, piece: Piece, to: Pos): Pos[] {
  const g = grid(ctx);
  const start = { x: piece.x, y: piece.y };
  const came = new Map<string, Pos | null>([[`${start.x},${start.y}`, null]]);
  const queue: Pos[] = [start];
  while (queue.length) {
    const p = queue.shift()!;
    if (p.x === to.x && p.y === to.y) {
      const path: Pos[] = [];
      for (let c: Pos | null = p; c && !(c.x === start.x && c.y === start.y); c = came.get(`${c.x},${c.y}`) ?? null) path.unshift(c);
      return path;
    }
    for (const d of [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }]) {
      const n = { x: p.x + d.x, y: p.y + d.y };
      const k = `${n.x},${n.y}`;
      if (came.has(k) || !g.cell(n)?.walkable) continue;
      if (Math.abs((g.cell(n)?.height ?? 0) - (g.cell(p)?.height ?? 0)) > 1) continue;
      if (piecesAt(ctx, n).some((o) => o.id !== piece.id) && !(n.x === to.x && n.y === to.y)) continue;
      came.set(k, p);
      queue.push(n);
    }
  }
  return [];
}

/** A hero joins the party (created if new; on the board with the party). */
function addMember(ctx: Ctx, heroId: string): GameEvent[] {
  const s = ctx.state;
  s.heroes[heroId] ??= createHero(ctx.db, heroId);
  if (s.roster.includes(heroId)) return [];
  s.roster.push(heroId);
  if (!s.board) return [];
  const host = s.roster.map((id) => pieceOf(ctx, id)).find((p) => p && p.faction === "hero" && !p.fallen);
  if (host) host.members.push(heroId);
  return [{ type: "pieces" }];
}

/** A hero leaves the party (kept in the save, off the board). */
function removeMember(ctx: Ctx, heroId: string): GameEvent[] {
  const s = ctx.state;
  if (!s.roster.includes(heroId) || s.roster.length < 2) return [];
  s.roster = s.roster.filter((id) => id !== heroId);
  if (!s.board) return [];
  const piece = pieceOf(ctx, heroId);
  if (piece) {
    piece.members = piece.members.filter((m) => m !== heroId);
    if (piece.anchor === heroId) piece.anchor = piece.members[0];
    if (!piece.members.length) delete board(ctx).pieces[piece.id];
  }
  return [{ type: "pieces" }];
}
