import type { Ctx } from "../context";
import type { DialogNode } from "../data/types";
import { runActions, type UiRequest } from "./actions";
import { check } from "./conditions";

export type DialogStep =
  | { type: "say"; text: string; speaker?: string; face?: string }
  | { type: "choice"; options: { text: string; index: number }[] }
  | { type: "request"; request: UiRequest }
  | { type: "end" };

/**
 * Walks a dialog graph (§9): say / choice / do / if / goto / end.
 * Actions run immediately; UI requests (shops, messages…) are handed out as steps.
 */
export class DialogRunner {
  private dialogId: string;
  private index = 0;
  private pendingChoice: { text: string; goto?: string; do?: import("../data/types").Action[] }[] | null = null;
  private queued: UiRequest[] = [];

  constructor(
    private readonly ctx: Ctx,
    dialogId: string,
    private readonly defaultSpeaker?: string,
  ) {
    this.dialogId = dialogId;
    ctx.db.dialog(dialogId);
  }

  /** Advances; pass the chosen option index after a "choice" step. */
  next(choice?: number): DialogStep {
    if (this.pendingChoice) {
      const opt = this.pendingChoice[choice ?? 0];
      this.pendingChoice = null;
      if (opt?.do) this.queue(runActions(this.ctx, opt.do).requests);
      if (opt?.goto) this.jump(opt.goto);
    }
    for (let guard = 0; guard < 1000; guard++) {
      const q = this.queued.shift();
      if (q) return { type: "request", request: q };
      const node = this.ctx.db.dialog(this.dialogId)[this.index++];
      if (!node) return { type: "end" };
      const step = this.exec(node);
      if (step) return step;
    }
    throw new Error(`Dialog ${this.dialogId} loops`);
  }

  private queue(reqs: UiRequest[]) {
    for (const r of reqs) {
      if (r.type === "dialog") this.jump(r.id);
      else this.queued.push(r);
    }
  }

  private jump(id: string) {
    this.ctx.db.dialog(id);
    this.dialogId = id;
    this.index = 0;
  }

  private exec(node: DialogNode): DialogStep | null {
    if ("say" in node) return { type: "say", text: node.say, speaker: node.speaker ?? this.defaultSpeaker, face: node.face };
    if ("choice" in node) {
      const visible = node.choice.filter((c) => check(this.ctx, c.when));
      this.pendingChoice = visible;
      return { type: "choice", options: visible.map((c, index) => ({ text: c.text, index })) };
    }
    if ("do" in node) {
      this.queue(runActions(this.ctx, node.do).requests);
      return null;
    }
    if ("if" in node) {
      const target = check(this.ctx, node.if) ? node.then : node.else;
      if (target) this.jump(target);
      return null;
    }
    if ("goto" in node) {
      this.jump(node.goto);
      return null;
    }
    if ("end" in node) {
      this.index = Infinity;
      return null;
    }
    return null;
  }
}
