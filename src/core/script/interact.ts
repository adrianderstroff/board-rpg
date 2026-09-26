import { getChar, type Ctx } from "../context";
import type { EventPageDef, Interaction } from "../data/types";
import { steal } from "../effects/effects";
import { activePage, board, isExploring, mapEvents, mapMemory, pageOfPiece, pieceOf, syncEvents } from "../board/board";
import { isAlive } from "../chars/character";
import { canStealFromNpc } from "../board/actions";
import { markAbilityUsed } from "../board/turns";
import { innPrice } from "../items/inventory";
import type { Pos } from "../util/grid";
import { emptyResult, merge, runActions, type ScriptResult } from "./actions";

export interface InteractionOption {
  label: string;
  interaction: Interaction | { type: "steal" };
  /** Party member who performs it, when not the actor (stealing while exploring, §8.10). */
  by?: string;
}

function pageInteractions(page: EventPageDef): Interaction[] {
  const list = [...(page.interactions ?? [])];
  if (page.dialog && !list.some((i) => i.type === "talk")) list.unshift({ type: "talk", dialog: page.dialog });
  if (!list.length && page.actions?.length) list.push({ type: "examine", actions: page.actions });
  return list;
}

const LABELS: Record<string, string> = { talk: "Talk", shop: "Shop", inn: "Rest", examine: "Examine", steal: "Steal" };

/** Options shown when a hero interacts with an NPC/object piece (§8.8). */
export function interactionsFor(ctx: Ctx, actorId: string, npcPieceId: string): InteractionOption[] {
  const piece = board(ctx).pieces[npcPieceId];
  const page = piece && pageOfPiece(ctx, piece);
  if (!page) return [];
  const opts: InteractionOption[] = pageInteractions(page).map((i) => ({ label: i.label ?? LABELS[i.type], interaction: i }));
  if (canStealFromNpc(ctx, actorId, npcPieceId)) opts.push({ label: LABELS.steal, interaction: { type: "steal" } });
  else if (isExploring(ctx)) {
    // No turns while exploring: whoever in the party can steal does it.
    const own = pieceOf(ctx, actorId);
    const thief = own?.members.find((m) => m !== actorId && isAlive(getChar(ctx, m)) && canStealFromNpc(ctx, m, npcPieceId));
    if (thief) opts.push({ label: `${LABELS.steal} (${getChar(ctx, thief).name})`, interaction: { type: "steal" }, by: thief });
  }
  return opts;
}

export type InteractionOutcome = ScriptResult & { dialog?: { id: string; speaker?: string } };

export function performInteraction(ctx: Ctx, actorId: string, npcPieceId: string, option: InteractionOption): InteractionOutcome {
  const piece = board(ctx).pieces[npcPieceId];
  const out: InteractionOutcome = emptyResult();
  const npcChar = piece?.members[0] ? getChar(ctx, piece.members[0]) : undefined;
  const speaker = npcChar?.def ?? (piece ? pageOfPiece(ctx, piece)?.keeper : undefined);
  const i = option.interaction;
  switch (i.type) {
    case "talk": {
      const talked = ctx.state.records.talkedTo;
      for (const id of [piece?.sourceId, npcChar?.def]) if (id && !talked.includes(id)) talked.push(id);
      out.dialog = { id: i.dialog, speaker };
      break;
    }
    case "shop":
      out.requests.push({ type: "shop", id: i.shop });
      break;
    case "inn":
      out.requests.push({ type: "inn", price: innPrice(ctx, i.price), ...(i.wakeAt ? { wakeAt: i.wakeAt } : {}) });
      break;
    case "examine":
      if (i.dialog) out.dialog = { id: i.dialog, speaker };
      merge(out, runActions(ctx, i.actions));
      break;
    case "steal":
      if (npcChar) {
        const thief = option.by ?? actorId;
        out.events.push(...steal(ctx, getChar(ctx, thief), npcChar));
        markAbilityUsed(ctx, thief);
      }
      break;
  }
  out.events.push(...syncEvents(ctx));
  return out;
}

/** Events with a `step` trigger on the cell a hero landed on. */
export function stepTriggers(ctx: Ctx, at: Pos): InteractionOutcome[] {
  return triggered(ctx, "step", (ev) => ev.x === at.x && ev.y === at.y);
}

/** Events with an `auto` trigger (run when entering a map / after state changes). */
export function autoTriggers(ctx: Ctx): InteractionOutcome[] {
  return triggered(ctx, "auto", () => true);
}

function triggered(ctx: Ctx, trigger: "step" | "auto", where: (ev: { x: number; y: number }) => boolean): InteractionOutcome[] {
  const b = board(ctx);
  const mem = mapMemory(ctx, b.mapId);
  const results: InteractionOutcome[] = [];
  for (const ev of mapEvents(ctx, b.mapId)) {
    if (!where(ev)) continue;
    const page = activePage(ctx, b.mapId, ev);
    if (!page || page.trigger !== trigger) continue;
    const pageIndex = (ev.pages ?? []).indexOf(page);
    const tag = `${ev.id}#${pageIndex}`;
    if ((page.once ?? true) && mem.triggered.includes(tag)) continue;
    mem.triggered.push(tag);
    const out: InteractionOutcome = runActions(ctx, page.actions);
    if (page.dialog) out.dialog = { id: page.dialog, speaker: page.npc };
    results.push(out);
  }
  return results;
}
