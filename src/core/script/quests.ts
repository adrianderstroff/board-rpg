import type { Ctx } from "../context";
import type { QuestDef, QuestEndingDef } from "../data/types";
import { emptyResult, merge, runActions, type ScriptResult } from "./actions";
import { check } from "./conditions";

/** §10.4 Quest engine: one active quest, sequential steps, (hidden) endings, hierarchy. */

function endingsOf(def: QuestDef): QuestEndingDef[] {
  return def.endings ?? [{ id: "done", when: { questStepsDone: def.id } }];
}

export function startQuest(ctx: Ctx, id: string, activate = true): ScriptResult {
  const def = ctx.db.quest(id);
  const q = ctx.state.quests;
  const out = emptyResult();
  if (q.entries[id]) {
    if (activate && q.entries[id].status !== "done") q.active = id;
    return out;
  }
  q.entries[id] = { status: "started", step: 0 };
  if (activate || !q.active) q.active = id;
  out.requests.push({ type: "message", text: `New quest: ${def.title}` });
  merge(out, runActions(ctx, def.onStart));
  if (def.steps[0]) merge(out, runActions(ctx, def.steps[0].onStart));
  return out;
}

export function setQuestStep(ctx: Ctx, id: string, stepId: string): ScriptResult {
  const def = ctx.db.quest(id);
  const entry = ctx.state.quests.entries[id];
  const idx = def.steps.findIndex((s) => s.id === stepId);
  if (!entry || idx < 0) return emptyResult();
  entry.step = idx;
  return runActions(ctx, def.steps[idx].onStart);
}

export function completeQuest(ctx: Ctx, id: string, endingId: string): ScriptResult {
  const def = ctx.db.quest(id);
  const q = ctx.state.quests;
  const entry = (q.entries[id] ??= { status: "started", step: 0 });
  const out = emptyResult();
  if (entry.status === "done") return out;
  entry.status = "done";
  entry.ending = endingId;
  entry.step = def.steps.length;
  const ending = endingsOf(def).find((e) => e.id === endingId);
  if (!ending?.hidden) out.requests.push({ type: "message", text: `Quest complete: ${def.title}` });
  if (q.active === id) {
    const parent = def.parent && q.entries[def.parent]?.status === "started" ? def.parent : undefined;
    q.active = parent ?? Object.keys(q.entries).find((k) => q.entries[k].status === "started") ?? null;
  }
  merge(out, runActions(ctx, ending?.onComplete));
  return out;
}

/** Progresses the active quest as far as its (state-based) conditions allow. */
export function evaluateQuests(ctx: Ctx): ScriptResult {
  const out = emptyResult();
  for (let guard = 0; guard < 32; guard++) {
    const id = ctx.state.quests.active;
    if (!id) break;
    const def = ctx.db.quest(id);
    const entry = ctx.state.quests.entries[id];
    if (!entry || entry.status === "done") break;
    let progressed = false;
    while (entry.step < def.steps.length && check(ctx, def.steps[entry.step].done)) {
      const step = def.steps[entry.step];
      entry.step++;
      merge(out, runActions(ctx, step.onComplete));
      if (entry.step < def.steps.length) merge(out, runActions(ctx, def.steps[entry.step].onStart));
      progressed = true;
    }
    const ending = endingsOf(def).find((e) => check(ctx, e.when));
    if (ending) {
      merge(out, completeQuest(ctx, id, ending.id));
      continue; // the parent may progress now
    }
    if (!progressed) break;
  }
  return out;
}

export function canSwitchQuest(ctx: Ctx): boolean {
  const id = ctx.state.quests.active;
  if (!id) return true;
  const def = ctx.db.quest(id);
  const entry = ctx.state.quests.entries[id];
  return !def.lockSwitch && !def.steps[entry?.step ?? 0]?.lock;
}

export function switchQuest(ctx: Ctx, id: string): ScriptResult {
  const entry = ctx.state.quests.entries[id];
  if (!entry || entry.status === "done" || !canSwitchQuest(ctx)) return emptyResult();
  ctx.state.quests.active = id;
  return evaluateQuests(ctx);
}

export interface QuestView {
  id: string;
  title: string;
  description: string;
  active: boolean;
  done: boolean;
  steps: { objective: string; done: boolean; current: boolean }[];
}

export function questLog(ctx: Ctx): QuestView[] {
  return Object.entries(ctx.state.quests.entries).map(([id, e]) => {
    const def = ctx.db.quest(id);
    return {
      id,
      title: def.title,
      description: def.description,
      active: ctx.state.quests.active === id,
      done: e.status === "done",
      steps: def.steps
        .slice(0, Math.min(def.steps.length, e.step + 1))
        .map((s, i) => ({ objective: s.objective, done: i < e.step || e.status === "done", current: i === e.step && e.status !== "done" })),
    };
  });
}

export function currentObjective(ctx: Ctx): string | null {
  const id = ctx.state.quests.active;
  if (!id) return null;
  const def = ctx.db.quest(id);
  const entry = ctx.state.quests.entries[id];
  return def.steps[entry.step]?.objective ?? def.title;
}
