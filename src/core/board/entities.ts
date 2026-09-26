import type { Ctx } from "../context";
import type { EntityHandler, EventPageDef, Interaction, MapEventDef } from "../data/types";
import type { GameEvent } from "../events";
import { check } from "../script/conditions";
import { emptyResult, merge, runActions, type ScriptResult } from "../script/actions";
import type { Pos } from "../util/grid";
import { aliveMembers, board, mapMemory, piecesAt } from "./board";

/**
 * Entities with states and handlers (§10.3): an event without pages has named states – a look and
 * how its cell can be crossed – and handlers that run on interact, enter, pass over, leave, map
 * load or when a condition becomes true. The board sees the current state as a page, so pieces,
 * close-ups and occupancy work for both kinds of events.
 */

export function isEntity(ev: MapEventDef): boolean {
  return !!ev.states && !ev.pages;
}

/** The state an entity is in on `mapId`. */
export function currentState(ctx: Ctx, mapId: string, ev: MapEventDef): string | undefined {
  if (!ev.states) return undefined;
  return mapMemory(ctx, mapId).states?.[ev.id] ?? ev.state ?? Object.keys(ev.states)[0];
}

/** An entity's current state as a page: its look and passability, and the first interact handler that applies. */
export function pageFromState(ctx: Ctx, mapId: string, ev: MapEventDef): EventPageDef {
  const st = ev.states?.[currentState(ctx, mapId, ev) ?? ""] ?? {};
  const handler = (ev.on ?? []).find((h) => h.on === "interact" && check(ctx, h.when));
  const options: Interaction[] = [...(handler?.options ?? [])];
  if (handler?.do?.length) options.push({ type: "examine", actions: handler.do, label: handler.label });
  return { ...st, trigger: options.length ? "interact" : "none", interactions: options.length ? options : undefined };
}

function eventsOf(ctx: Ctx): MapEventDef[] {
  return (ctx.db.map(board(ctx).mapId).events ?? []).filter(isEntity);
}

function entity(ctx: Ctx, id: string): MapEventDef {
  const ev = eventsOf(ctx).find((e) => e.id === id);
  if (!ev) throw new Error(`No entity "${id}" on ${board(ctx).mapId}`);
  return ev;
}

/** The state of an entity of the current map. */
export function stateOf(ctx: Ctx, id: string): string | undefined {
  if (!ctx.state.board) return undefined;
  const ev = (ctx.db.map(board(ctx).mapId).events ?? []).find((e) => e.id === id);
  return ev ? currentState(ctx, board(ctx).mapId, ev) : undefined;
}

/** Living heroes standing on a cell. */
export function heroWeightOn(ctx: Ctx, p: Pos): number {
  return piecesAt(ctx, p)
    .filter((pc) => pc.faction === "hero")
    .reduce((n, pc) => n + aliveMembers(ctx, pc).length, 0);
}

const someoneOn = (ctx: Ctx, p: Pos) => piecesAt(ctx, p, { includeFallen: true }).some((pc) => pc.faction !== "npc");

/** Puts an entity into a state; a solid one waits while someone stands on its cell (a gate never closes on anyone). */
export function setEntityState(ctx: Ctx, id: string, state: string): GameEvent[] {
  const ev = entity(ctx, id);
  if (!ev.states?.[state]) throw new Error(`Entity "${id}" has no state "${state}"`);
  const mem = mapMemory(ctx, board(ctx).mapId);
  if (ev.states[state].pass === "solid" && someoneOn(ctx, ev)) {
    (mem.pendingStates ??= {})[id] = state;
    return [];
  }
  if (mem.pendingStates) delete mem.pendingStates[id];
  const was = currentState(ctx, board(ctx).mapId, ev);
  (mem.states ??= {})[id] = state;
  return was === state ? [] : [{ type: "state", event: id, state }, { type: "pieces" }];
}

/** Cells of entities that are solid right now (walls for moves, abilities and AI). */
export function solidCells(ctx: Ctx): Pos[] {
  const mapId = board(ctx).mapId;
  return eventsOf(ctx)
    .filter((ev) => !mapMemory(ctx, mapId).removedEvents.includes(ev.id) && ev.states?.[currentState(ctx, mapId, ev) ?? ""]?.pass === "solid")
    .map((ev) => ({ x: ev.x, y: ev.y }));
}

/** Cells where a hero's move stops: entities with a `pass` handler that applies right now. */
export function passCells(ctx: Ctx): Pos[] {
  if (!ctx.state.board) return [];
  return eventsOf(ctx)
    .filter((ev) => (ev.on ?? []).some((h) => h.on === "pass" && check(ctx, h.when)))
    .map((ev) => ({ x: ev.x, y: ev.y }));
}

const key = (ev: MapEventDef, i: number) => `${ev.id}#${i}`;

/** The map itself as a holder of handlers (its "load" and "becomes" ones, §10.3). */
const MAP: MapEventDef = { id: "@map", x: -1, y: -1 };

/** Runs a handler's script (unless it is `once` and has run). */
function run(ctx: Ctx, ev: MapEventDef, i: number, h: EntityHandler, out: ScriptResult): boolean {
  const mem = mapMemory(ctx, board(ctx).mapId);
  const k = h.onceKey ?? key(ev, i);
  if (h.once && ((mem.ranOnce ?? []).includes(k) || mem.triggered.includes(k))) return false;
  if (h.once) (mem.ranOnce ??= []).push(k);
  // its dialogs are spoken by whoever it shows (a villager, a keeper)
  const st = ev.states?.[currentState(ctx, board(ctx).mapId, ev) ?? ""];
  merge(out, runActions(ctx, h.do, st?.npc ?? st?.keeper));
  return true;
}

/** The map's handlers and every entity's, each with who holds it. */
function holders(ctx: Ctx): { ev: MapEventDef; on: EntityHandler[] }[] {
  return [{ ev: MAP, on: ctx.db.map(board(ctx).mapId).on ?? [] }, ...eventsOf(ctx).map((ev) => ({ ev, on: ev.on ?? [] }))];
}

/** `load` handlers – when the party arrives on the map (states that depend on flags are set up here). */
export function loadTriggers(ctx: Ctx): ScriptResult {
  const out = emptyResult();
  const mem = mapMemory(ctx, board(ctx).mapId);
  // saves from before floor plates were entities: a latched plate stays down
  for (const id of mem.latched ?? []) if (eventsOf(ctx).some((e) => e.id === id)) (mem.states ??= {})[id] ??= "down";
  // arriving doesn't count as stepping onto anything
  mem.occupied = eventsOf(ctx)
    .filter((ev) => heroWeightOn(ctx, ev) > 0)
    .map((ev) => ev.id);
  // the map's own first (what used to be its onEnter), then the entities'
  for (const { ev, on } of holders(ctx)) on.forEach((h, i) => h.on === "load" && check(ctx, h.when) && run(ctx, ev, i, h, out));
  // "becomes true" counts from the arrival: what holds as the party arrives fires now
  mem.became = {};
  merge(out, entityTriggers(ctx));
  return out;
}

/**
 * After any change (moves, scripts, battles): solid states whose cell became free, heroes that
 * arrived on or left an entity (enter / pass / leave), and conditions that became true. Repeats
 * while handlers keep changing things (a plate pressed → its gate opens).
 */
export function entityTriggers(ctx: Ctx): ScriptResult {
  const out = emptyResult();
  if (!ctx.state.board) return out;
  const mem = mapMemory(ctx, board(ctx).mapId);
  for (let round = 0; round < 8; round++) {
    let ran = false;
    for (const ev of eventsOf(ctx)) {
      const pending = mem.pendingStates?.[ev.id];
      if (pending && !someoneOn(ctx, ev)) {
        delete mem.pendingStates![ev.id];
        (mem.states ??= {})[ev.id] = pending;
        out.events.push({ type: "state", event: ev.id, state: pending }, { type: "pieces" });
      }
      const here = heroWeightOn(ctx, ev) > 0;
      const was = (mem.occupied ?? []).includes(ev.id);
      if (here !== was) {
        mem.occupied = here ? [...(mem.occupied ?? []), ev.id] : (mem.occupied ?? []).filter((id) => id !== ev.id);
        (ev.on ?? []).forEach((h, i) => {
          const fits = here ? h.on === "enter" || h.on === "pass" : h.on === "leave";
          if (fits && check(ctx, h.when) && run(ctx, ev, i, h, out)) ran = true;
        });
      }
    }
    // conditions that turned true – the map's and the entities'
    for (const { ev, on } of holders(ctx))
      on.forEach((h, i) => {
        if (h.on !== "becomes") return;
        const now = check(ctx, h.when);
        const before = (mem.became ??= {})[key(ev, i)];
        mem.became[key(ev, i)] = now;
        if (now && !before && run(ctx, ev, i, h, out)) ran = true;
      });
    if (!ran) break;
  }
  return out;
}
