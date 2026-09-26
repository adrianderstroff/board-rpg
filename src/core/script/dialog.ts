import type { Ctx } from "../context";
import { ScriptRunner, type RunnerStep } from "./runner";

/** A step of a dialog (§9) – see ScriptRunner: text, questions, UI requests, pauses, effects. */
export type DialogStep = RunnerStep;

/** Walks a dialog (§9): a script whose `goto` / `if` continue in other dialogs. */
export class DialogRunner extends ScriptRunner {
  constructor(ctx: Ctx, dialogId: string, defaultSpeaker?: string) {
    super(ctx, [{ dialog: dialogId }], defaultSpeaker);
  }
}
