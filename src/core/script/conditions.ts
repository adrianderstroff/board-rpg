import type { Ctx } from "../context";
import type { Condition } from "../data/types";
import { heroWeightOn, stateOf } from "../board/entities";

/** §10.1 – state-based conditions shared by quests, events, dialogs and exits. */
export function check(ctx: Ctx, cond: Condition | undefined): boolean {
  if (!cond) return true;
  const s = ctx.state;
  if ("always" in cond) return cond.always;
  if ("flag" in cond) return !!s.flags[cond.flag];
  if ("state" in cond) return stateOf(ctx, cond.state.event) === cond.state.is;
  if ("heroesOn" in cond) {
    if (!s.board) return false;
    const ev = (ctx.db.map(s.board.mapId).events ?? []).find((e) => e.id === cond.heroesOn.event);
    return !!ev && heroWeightOn(ctx, ev) >= (cond.heroesOn.weight ?? 1);
  }
  if ("not" in cond) return !check(ctx, cond.not);
  if ("all" in cond) return cond.all.every((c) => check(ctx, c));
  if ("any" in cond) return cond.any.some((c) => check(ctx, c));
  if ("item" in cond) {
    const { id, count } = typeof cond.item === "string" ? { id: cond.item, count: 1 } : cond.item;
    const equipped = Object.values(s.heroes).filter((h) => Object.values(h.equipment).includes(id)).length;
    return (s.inventory[id] ?? 0) + equipped >= (count ?? 1);
  }
  if ("gold" in cond) return s.gold >= cond.gold;
  if ("var" in cond) {
    const v = s.vars[cond.var.name] ?? 0;
    const w = cond.var.value;
    switch (cond.var.op ?? ">=") {
      case "==": return v === w;
      case "!=": return v !== w;
      case ">": return v > w;
      case "<": return v < w;
      case "<=": return v <= w;
      default: return v >= w;
    }
  }
  if ("talkedTo" in cond) return s.records.talkedTo.includes(cond.talkedTo);
  if ("defeated" in cond) {
    const d = cond.defeated;
    if (d.piece) return Object.values(s.maps).some((m) => m.defeated.includes(d.piece!));
    if (d.enemy) return (s.records.kills[d.enemy] ?? 0) >= (d.count ?? 1);
    return false;
  }
  if ("defeatedAllOn" in cond) {
    const map = ctx.db.map(cond.defeatedAllOn);
    const mem = s.maps[map.id];
    return (map.enemies ?? []).every((e) => mem?.defeated.includes(e.id));
  }
  if ("onMap" in cond) return s.board?.mapId === cond.onMap;
  if ("questActive" in cond) return s.quests.active === cond.questActive;
  if ("questDone" in cond) {
    const { quest, ending } = typeof cond.questDone === "string" ? { quest: cond.questDone, ending: undefined } : cond.questDone;
    const q = s.quests.entries[quest];
    return q?.status === "done" && (!ending || q.ending === ending);
  }
  if ("questStep" in cond) {
    const q = s.quests.entries[cond.questStep.quest];
    if (!q || q.status === "done") return false;
    const def = ctx.db.quest(cond.questStep.quest);
    return def.steps[q.step]?.id === cond.questStep.step;
  }
  if ("questStepsDone" in cond) {
    const q = s.quests.entries[cond.questStepsDone];
    return !!q && (q.status === "done" || q.step >= ctx.db.quest(cond.questStepsDone).steps.length);
  }
  if ("partyHas" in cond) return s.roster.includes(cond.partyHas);
  if ("level" in cond) return Object.values(s.heroes).some((h) => h.level >= cond.level);
  throw new Error(`Unknown condition ${JSON.stringify(cond)}`);
}
