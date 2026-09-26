import type Phaser from "phaser";
import type { Ctx } from "../../core/context";
import type { UiRequest } from "../../core/script/actions";
import type { GameEvent } from "../../core/events";
import { wait } from "../../engine/tween";
import { DialogRunner } from "../../core/script/dialog";
import { parseMarkup } from "../../core/script/markup";
import type { InputRouter } from "../../engine/input";
import type { RichTextToken } from "../../engine/ui/RichText";
import { TextBox, type Speaker } from "../../engine/ui/TextBox";
import { K } from "../keys";
import { getSession } from "../session";
import { sfx } from "../sound";

const blip = () => sfx("dialog_blip", { volume: 0.5, throttleMs: 40 });

/** Resolves a dialog speaker id (npc id, hero id, plain name, "" = narrator) to name + portrait. */
export function speakerFor(ctx: Ctx, id: string | undefined): Speaker {
  if (!id) return {};
  const hero = ctx.db.heroes.get(id);
  if (hero) return { name: hero.name, face: hero.face ? K.face(hero.face) : undefined };
  const npc = ctx.db.npcs.get(id);
  if (npc) return { name: npc.name, face: npc.face ? K.face(npc.face) : undefined };
  return { name: id };
}

/** Typographic characters the ASCII pixel font lacks. */
const ASCII_FALLBACK: Record<string, string> = { "–": "-", "—": "-", "‘": "'", "’": "'", "“": '"', "”": '"', "…": "..." };

export function textTokens(ctx: Ctx, text: string): RichTextToken[] {
  text = text.replace(/[–—‘’“”…]/g, (c) => ASCII_FALLBACK[c]);
  return parseMarkup(text, (name) => {
    if (name === "gold") return String(ctx.state.gold);
    if (name === "hero") return ctx.state.heroes[ctx.state.roster[0]]?.name;
    if (name.startsWith("name:")) return ctx.db.heroes.get(name.slice(5))?.name ?? ctx.db.npcs.get(name.slice(5))?.name;
    if (name.startsWith("var:")) return String(ctx.state.vars[name.slice(4)] ?? 0);
    return undefined;
  });
}

/** Presentation hooks for requests that come out of scripts. */
export interface RequestHandler {
  handle(req: UiRequest): Promise<void>;
  /** Plays what a script's actions did (items gained, pieces changed…). */
  play?(events: GameEvent[]): Promise<void>;
}

/** Plays a dialog graph in a text box; nested UI requests go to `handler`. */
export async function playDialog(
  scene: Phaser.Scene,
  input: InputRouter,
  ctx: () => Ctx,
  dialogId: string,
  defaultSpeaker: string | undefined,
  handler: RequestHandler,
) {
  const runner = new DialogRunner(ctx(), dialogId, defaultSpeaker);
  let box = null as TextBox | null;
  const ensureBox = () => (box ??= new TextBox(scene, input, getSession().settings.textSpeed, blip));
  let choice: number | undefined;
  for (let guard = 0; guard < 500; guard++) {
    const step = runner.next(choice);
    choice = undefined;
    if (step.type === "end") break;
    if (step.type === "say") {
      const sp = speakerFor(ctx(), step.speaker);
      if (step.face) sp.face = K.face(step.face);
      await ensureBox().say(sp, textTokens(ctx(), step.text));
    } else if (step.type === "choice") {
      choice = step.options[await ensureBox().choose(step.options.map((o) => o.text))].index;
    } else if (step.type === "request") {
      box?.destroy();
      box = null;
      await handler.handle(step.request);
    } else if (step.type === "events") await handler.play?.(step.events);
    else if (step.type === "wait") await wait(scene, step.ms);
  }
  box?.destroy();
}

/** Shows a single narrator message. */
export async function showMessage(scene: Phaser.Scene, input: InputRouter, ctx: Ctx, text: string, speaker?: Speaker) {
  const box = new TextBox(scene, input, getSession().settings.textSpeed, blip);
  await box.say(speaker ?? {}, textTokens(ctx, text));
  box.destroy();
}
