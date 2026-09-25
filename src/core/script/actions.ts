import { computeStats, isAlive } from "../chars/character";
import type { Ctx } from "../context";
import type { Action } from "../data/types";
import type { GameEvent } from "../events";
import { addItem, removeItem } from "../items/inventory";
import { board, mapMemory, reconcile, spawnMapEnemy, syncEvents } from "../board/board";
import { completeQuest, evaluateQuests, setQuestStep, startQuest } from "./quests";

/** Things only the presentation layer can do; returned to it in order. */
export type UiRequest =
  | { type: "dialog"; id: string }
  | { type: "shop"; id: string }
  | { type: "inn"; price: number }
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

/** §10.2 – executes actions; state changes happen immediately, UI work is returned as requests. */
export function runActions(ctx: Ctx, actions: Action[] | undefined): ScriptResult {
  const out = emptyResult();
  for (const a of actions ?? []) merge(out, runAction(ctx, a));
  if (actions?.length && ctx.state.board) {
    out.events.push(...syncEvents(ctx));
    merge(out, evaluateQuests(ctx));
  }
  return out;
}

function runAction(ctx: Ctx, a: Action): ScriptResult {
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
