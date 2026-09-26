import { computeStats, isAlive } from "../chars/character";
import type { Ctx } from "../context";
import type { Action, Script } from "../data/types";
import type { GameEvent } from "../events";
import { addItem, removeItem } from "../items/inventory";
import { aliveMembers, board, mapMemory, piecesAt, reconcile, spawnMapEnemy } from "../board/board";
import { dealDamage, heal } from "../effects/effects";
import { addStatus } from "../chars/character";
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
  | { type: "teleport"; map: string; spawn: string };

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
