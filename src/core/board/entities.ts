import type { Ctx } from "../context";
import type { EntityHandler, EventPageDef, Interaction, MapEventDef } from "../data/types";
import type { GameEvent } from "../events";
import { check } from "../script/conditions";
import { emptyResult, merge, runActions, type ScriptResult } from "../script/actions";
import type { Pos } from "../util/grid";
import { aliveMembers, board, mapEvents, mapMemory, piecesAt, syncEvents } from "./board";
import { placeholders, rewire } from "../data/prefab";

/**
 * Entities with states and handlers (§10.3): an event without pages has named states – a look and
 * how its cell can be crossed – and handlers that run on interact, enter, pass over, leave, map
 * load or when a condition becomes true. The board sees the current state as a page, so pieces,
 * close-ups and occupancy work for both kinds of events.
 */

export function isEntity(ev: MapEventDef): boolean {
  return !!ev.states && !ev.pages;
}

/** Where an entity stands – where a script moved it, else its own cell. */
export function entityPos(ctx: Ctx, ev: MapEventDef): Pos {
  return (ctx.state.board && mapMemory(ctx, board(ctx).mapId).positions?.[ev.id]) || { x: ev.x, y: ev.y };
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
  return mapEvents(ctx).filter(isEntity);
}

/**
 * Places a prefab's entities on `at` during play (§10.5: the Thief's traps …): kept in the map's
 * memory, with ids of their own (`trap~3`), and from then on entities like the map's.
 */
export function spawnPrefab(ctx: Ctx, prefabId: string, at: Pos): GameEvent[] {
  const prefab = ctx.db.prefabs.get(prefabId);
  if (!prefab) throw new Error(`Unknown prefab "${prefabId}"`);
  const mem = mapMemory(ctx, board(ctx).mapId);
  const n = (mem.spawnNo = (mem.spawnNo ?? 0) + 1);
  // made during play: numbered ids of their own, so they never meet the map's
  const ids = Object.fromEntries(placeholders(prefab).map((name) => [name, `${name}~${n}`]));
  const spawned = rewire(prefab.events ?? [], ids).map((ev) => ({ ...ev, x: ev.x + at.x, y: ev.y + at.y }));
  (mem.spawned ??= []).push(...spawned);
  return [...spawned.map((ev) => ({ type: "state" as const, event: ev.id, state: currentState(ctx, board(ctx).mapId, ev) ?? "" })), ...syncEvents(ctx), { type: "pieces" as const }];
}

function entity(ctx: Ctx, id: string): MapEventDef {
  const ev = eventsOf(ctx).find((e) => e.id === id);
  if (!ev) throw new Error(`No entity "${id}" on ${board(ctx).mapId}`);
  return ev;
}

/** The state of an entity of the current map. */
export function stateOf(ctx: Ctx, id: string): string | undefined {
  if (!ctx.state.board) return undefined;
  const ev = mapEvents(ctx).find((e) => e.id === id);
  return ev ? currentState(ctx, board(ctx).mapId, ev) : undefined;
}

/** Living heroes standing on a cell. */
export function heroWeightOn(ctx: Ctx, p: Pos): number {
  return piecesAt(ctx, p)
    .filter((pc) => pc.faction === "hero")
    .reduce((n, pc) => n + aliveMembers(ctx, pc).length, 0);
}

/** Living enemies standing on a cell. */
export function enemyWeightOn(ctx: Ctx, p: Pos): number {
  return piecesAt(ctx, p)
    .filter((pc) => pc.faction === "enemy")
    .reduce((n, pc) => n + aliveMembers(ctx, pc).length, 0);
}

type Side = "heroes" | "enemies";

/** Whose pieces set off an enter / leave / pass handler (the heroes' unless it says `by`). */
const reactsTo = (h: EntityHandler, side: Side) => (h.by ?? "heroes") === side || h.by === "anyone";

const someoneOn = (ctx: Ctx, p: Pos) => piecesAt(ctx, p, { includeFallen: true }).some((pc) => pc.faction !== "npc");

/** Puts an entity into a state; a solid one waits while someone stands on its cell (a gate never closes on anyone). */
export function setEntityState(ctx: Ctx, id: string, state: string): GameEvent[] {
  const ev = entity(ctx, id);
  if (!ev.states?.[state]) throw new Error(`Entity "${id}" has no state "${state}"`);
  const mem = mapMemory(ctx, board(ctx).mapId);
  if (ev.states[state].pass === "solid" && someoneOn(ctx, entityPos(ctx, ev))) {
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
    .map((ev) => entityPos(ctx, ev));
}

/** Cells where a move of `side` stops: entities with a `pass` handler for it that applies right now. */
export function passCells(ctx: Ctx, side: Side = "heroes"): Pos[] {
  if (!ctx.state.board) return [];
  return eventsOf(ctx)
    .filter((ev) => !mapMemory(ctx, board(ctx).mapId).removedEvents.includes(ev.id))
    .filter((ev) => (ev.on ?? []).some((h) => h.on === "pass" && reactsTo(h, side) && check(ctx, h.when)))
    .map((ev) => entityPos(ctx, ev));
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
  // its dialogs are spoken by whoever it shows (a villager, a keeper); "here" is its cell
  const st = ev.states?.[currentState(ctx, board(ctx).mapId, ev) ?? ""];
  merge(out, runActions(ctx, h.do, st?.npc ?? st?.keeper, ev === MAP ? undefined : entityPos(ctx, ev)));
  return true;
}

// ---------- abilities used on entities (Discover, Defuse, spells…) ----------

const stateNow = (ctx: Ctx, ev: MapEventDef) => ev.states?.[currentState(ctx, board(ctx).mapId, ev) ?? ""];

/** An ability (or item) used on these cells: entities there with a handler for it react when things settle. */
export function recordAbility(ctx: Ctx, ability: string, cells: Pos[]) {
  const mem = mapMemory(ctx, board(ctx).mapId);
  for (const ev of eventsOf(ctx)) {
    const at = entityPos(ctx, ev);
    if (!cells.some((c) => c.x === at.x && c.y === at.y)) continue;
    if ((ev.on ?? []).some((h) => h.on === "ability" && h.ability === ability)) (mem.abilityHits ??= []).push({ event: ev.id, ability });
  }
}

/** Entities in a hidden state (unseen by the heroes – Discover's finds). */
export function hiddenEntities(ctx: Ctx): MapEventDef[] {
  return eventsOf(ctx).filter((ev) => !mapMemory(ctx, board(ctx).mapId).removedEvents.includes(ev.id) && stateNow(ctx, ev)?.hidden);
}

/** Cells heroes' paths go around (known dangers – whether drawn or not). */
export function avoidCells(ctx: Ctx): Pos[] {
  return eventsOf(ctx)
    .filter((ev) => stateNow(ctx, ev)?.pass === "avoid")
    .map((ev) => entityPos(ctx, ev));
}

/** Cells with a trap mark (known dangers). */
export function markCells(ctx: Ctx): Pos[] {
  return eventsOf(ctx)
    .filter((ev) => stateNow(ctx, ev)?.mark === "trap")
    .map((ev) => entityPos(ctx, ev));
}

/** An entity on `p` that Defuse can take apart: seen, with a defuse handler that applies now. */
export function defusableAt(ctx: Ctx, p: Pos): MapEventDef | undefined {
  return eventsOf(ctx).find((ev) => entityPos(ctx, ev).x === p.x && entityPos(ctx, ev).y === p.y && !stateNow(ctx, ev)?.hidden && (ev.on ?? []).some((h) => h.on === "ability" && defuses(ctx, h.ability) && check(ctx, h.when)));
}

/** An ability or item that defuses (its board use has the Defuse effect) – whatever its id. */
function defuses(ctx: Ctx, id: string | undefined): boolean {
  const def = id ? (ctx.db.abilities.get(id) ?? ctx.db.items.get(id)) : undefined;
  return !!def?.board?.effects.some((e) => e.type === "defuse");
}

/** The map's handlers and every entity's, each with who holds it. */
function holders(ctx: Ctx): { ev: MapEventDef; on: EntityHandler[] }[] {
  return [{ ev: MAP, on: ctx.db.map(board(ctx).mapId).on ?? [] }, ...eventsOf(ctx).map((ev) => ({ ev, on: ev.on ?? [] }))];
}

/** Placed enemies with handlers ("defeated"). */
function enemyHolders(ctx: Ctx) {
  return (ctx.db.map(board(ctx).mapId).enemies ?? []).filter((e) => e.on?.length).map((e) => ({ ev: { id: `enemy:${e.id}`, x: e.x, y: e.y } as MapEventDef, id: e.id, on: e.on! }));
}

/** `load` handlers – when the party arrives on the map (states that depend on flags are set up here). */
export function loadTriggers(ctx: Ctx): ScriptResult {
  const out = emptyResult();
  const mem = mapMemory(ctx, board(ctx).mapId);
  // saves from before floor plates and traps were entities: a latched plate stays down, a trap stays found / spent
  const has = (id: string) => eventsOf(ctx).some((e) => e.id === id);
  for (const id of mem.latched ?? []) if (has(id)) (mem.states ??= {})[id] ??= "down";
  for (const id of mem.revealed ?? []) if (has(id)) (mem.states ??= {})[id] ??= "revealed";
  for (const id of mem.sprung ?? []) if (has(id)) (mem.states ??= {})[id] = "sprung";
  // arriving doesn't count as stepping onto anything
  mem.occupied = eventsOf(ctx)
    .filter((ev) => heroWeightOn(ctx, entityPos(ctx, ev)) > 0)
    .map((ev) => ev.id);
  mem.enemyOn = eventsOf(ctx)
    .filter((ev) => enemyWeightOn(ctx, entityPos(ctx, ev)) > 0)
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
    // abilities used on entities since the last time
    const hits = mem.abilityHits ?? [];
    mem.abilityHits = [];
    for (const hit of hits) {
      const ev = eventsOf(ctx).find((e) => e.id === hit.event);
      (ev?.on ?? []).forEach((h, i) => {
        if (h.on === "ability" && h.ability === hit.ability && check(ctx, h.when) && run(ctx, ev!, i, h, out)) ran = true;
      });
    }
    for (const ev of eventsOf(ctx)) {
      const pending = mem.pendingStates?.[ev.id];
      if (pending && !someoneOn(ctx, entityPos(ctx, ev))) {
        delete mem.pendingStates![ev.id];
        (mem.states ??= {})[ev.id] = pending;
        out.events.push({ type: "state", event: ev.id, state: pending }, { type: "pieces" });
      }
      // heroes and enemies arriving on it or leaving it (each handler reacts to its side)
      for (const side of ["heroes", "enemies"] as const) {
        if (!eventsOf(ctx).includes(ev)) break; // a handler removed it (a sprung snare)
        const list = side === "heroes" ? (mem.occupied ??= []) : (mem.enemyOn ??= []);
        const here = (side === "heroes" ? heroWeightOn : enemyWeightOn)(ctx, entityPos(ctx, ev)) > 0;
        const was = list.includes(ev.id);
        if (here === was) continue;
        if (side === "heroes") mem.occupied = here ? [...list, ev.id] : list.filter((id) => id !== ev.id);
        else mem.enemyOn = here ? [...list, ev.id] : list.filter((id) => id !== ev.id);
        (ev.on ?? []).forEach((h, i) => {
          const fits = (here ? h.on === "enter" || h.on === "pass" : h.on === "leave") && reactsTo(h, side);
          if (fits && check(ctx, h.when) && run(ctx, ev, i, h, out)) ran = true;
        });
      }
    }
    // enemies that were defeated (their "defeated" handlers run once)
    for (const { ev, id, on } of enemyHolders(ctx)) {
      if (!mem.defeated.includes(id)) continue;
      on.forEach((h, i) => {
        if (h.on !== "defeated" || (mem.ranOnce ?? []).includes(key(ev, i))) return;
        (mem.ranOnce ??= []).push(key(ev, i));
        if (check(ctx, h.when)) {
          merge(out, runActions(ctx, h.do));
          ran = true;
        }
      });
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
