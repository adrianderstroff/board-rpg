import type { Ctx } from "../context";
import type { ChoiceOption, Step } from "../data/types";
import type { GameEvent } from "../events";
import { runAction, type UiRequest } from "./actions";
import { check } from "./conditions";
import { syncEvents } from "../board/board";
import { evaluateQuests } from "./quests";

/**
 * Runs a script (§10.2): its steps one after another – actions, text, questions, branches, pauses.
 * State changes happen as each action is reached; what only the presentation can do comes out as
 * steps, in order. Dialogs are scripts too: `goto` / `if … then: <dialog>` jump to another dialog,
 * `end` ends the current one, `{ dialog: id }` calls one and comes back.
 */

export type RunnerStep =
  | { type: "say"; text: string; speaker?: string; face?: string }
  | { type: "choice"; options: { text: string; icon?: string; index: number }[] }
  | { type: "request"; request: UiRequest }
  | { type: "wait"; ms: number }
  | { type: "events"; events: GameEvent[] }
  | { type: "end" };

interface Frame {
  steps: Step[];
  i: number;
  /** Set on the frame of a dialog (the target of jumps and `end`). */
  dialog?: string;
}

export class ScriptRunner {
  private frames: Frame[] = [];
  private pendingChoice: ChoiceOption[] | null = null;
  private queued: RunnerStep[] = [];

  constructor(
    private readonly ctx: Ctx,
    steps: Step[],
    private readonly defaultSpeaker?: string,
    /** `{ dialog }` hands the whole dialog to the presentation (a request) instead of running its lines here. */
    private readonly dialogsAsRequests = false,
  ) {
    if (steps.length) this.frames.push({ steps, i: 0 });
  }

  /** A runner for one dialog (§9). */
  static dialog(ctx: Ctx, id: string, speaker?: string): ScriptRunner {
    const r = new ScriptRunner(ctx, [], speaker);
    r.call(id);
    return r;
  }

  /** Advances; pass the chosen option's index after a "choice" step. */
  next(choice?: number): RunnerStep {
    if (this.pendingChoice) {
      const opt = this.pendingChoice[choice ?? 0];
      this.pendingChoice = null;
      // the option's own steps first, then on where it leads
      if (opt?.goto) this.jump(opt.goto);
      if (opt?.do?.length) this.frames.push({ steps: opt.do, i: 0 });
    }
    for (let guard = 0; guard < 5000; guard++) {
      const q = this.queued.shift();
      if (q) return q;
      const f = this.frames[this.frames.length - 1];
      if (!f) return { type: "end" };
      if (f.i >= f.steps.length) {
        this.frames.pop();
        continue;
      }
      const out = this.exec(f.steps[f.i++]);
      if (out) return out;
    }
    throw new Error("A script loops");
  }

  private call(id: string) {
    this.frames.push({ steps: this.ctx.db.dialog(id), i: 0, dialog: id });
  }

  /** Continues in another dialog instead of the current one. */
  private jump(id: string) {
    const k = this.frames.map((f) => !!f.dialog).lastIndexOf(true);
    if (k >= 0) this.frames.length = k;
    this.call(id);
  }

  private exec(step: Step): RunnerStep | null {
    if ("say" in step) return { type: "say", text: step.say, speaker: step.speaker ?? this.defaultSpeaker, face: step.face };
    if ("choice" in step) {
      const visible = step.choice.filter((c) => check(this.ctx, c.when));
      this.pendingChoice = visible;
      return { type: "choice", options: visible.map((c, index) => ({ text: c.text, icon: c.icon, index })) };
    }
    if ("if" in step) {
      const branch = check(this.ctx, step.if) ? step.then : step.else;
      if (typeof branch === "string") this.jump(branch);
      else if (branch?.length) this.frames.push({ steps: branch, i: 0 });
      return null;
    }
    if ("do" in step) {
      if (step.do.length) this.frames.push({ steps: step.do, i: 0 });
      return null;
    }
    if ("goto" in step) {
      this.jump(step.goto);
      return null;
    }
    if ("end" in step) {
      const k = this.frames.map((f) => !!f.dialog).lastIndexOf(true);
      this.frames.length = Math.max(0, k);
      return null;
    }
    if ("stop" in step) {
      this.frames = [];
      return null;
    }
    if ("wait" in step) return { type: "wait", ms: step.wait };
    if ("dialog" in step && !this.dialogsAsRequests) {
      this.call(step.dialog);
      return null;
    }
    // an action: its effects now, what it shows in order
    const r = runAction(this.ctx, step);
    const events = [...r.events];
    if (this.ctx.state.board) events.push(...syncEvents(this.ctx));
    const quests = evaluateQuests(this.ctx);
    events.push(...quests.events);
    if (events.length) this.queued.push({ type: "events", events });
    for (const req of [...r.requests, ...quests.requests]) this.queued.push({ type: "request", request: req });
    return null;
  }
}
