import { computeStats, createHero, expForLevel, gainExp } from "../chars/character";
import type { Database } from "../data/database";
import type { QuickPlayDef } from "../data/types";
import { Game, type EnterResult } from "../game";
import { addItem } from "../items/inventory";
import { getGrid } from "../board/grid";
import { newGameState } from "./newGame";

/** Spawn id the quick play start is entered through (added to the map for this run only). */
export const QUICK_PLAY_SPAWN = "__quickplay";

/**
 * A new game that starts right on `mapId` for play-testing from the editor (editor-design §4):
 * the map's Quick Play start (map.editor.quickPlay, on one of its arrivals) sets position, party and levels, extra items,
 * abilities, flags and gold; without one the start party stands on the walkable cell nearest to the
 * map's centre. No title, no start quest. The database is modified (a spawn is added): use a
 * database built for this run only.
 */
export function quickPlay(db: Database, mapId: string, seed?: number): { game: Game; result: EnterResult } {
  const map = db.map(mapId);
  const qp: QuickPlayDef = map.editor?.quickPlay ?? {};
  const state = newGameState(db, seed);
  const party: { hero: string; level?: number }[] = qp.party?.length ? qp.party : db.config.start.party.map((hero) => ({ hero }));
  state.heroes = {};
  state.roster = [];
  for (const { hero, level } of party) {
    const h = createHero(db, hero);
    if (level && level > h.level) gainExp(db, h, expForLevel(db, level) - h.exp);
    for (const a of qp.abilities?.[hero] ?? []) if (!h.learned.includes(a)) h.learned.push(a);
    const s = computeStats(db, h);
    h.hp = s.maxHp;
    h.mp = s.maxMp;
    state.heroes[hero] = h;
    state.roster.push(hero);
  }
  if (qp.gold !== undefined) state.gold = qp.gold;
  for (const f of qp.flags ?? []) state.flags[f] = true;
  const arrival = qp.spawn ? map.spawns[qp.spawn] : undefined;
  const at = arrival ?? (qp.x !== undefined && qp.y !== undefined ? { x: qp.x, y: qp.y } : centreCell(db, mapId));
  map.spawns[QUICK_PLAY_SPAWN] = { x: at.x, y: at.y, dir: arrival?.dir ?? "S" };
  const game = new Game(db, state);
  for (const [item, count] of Object.entries(qp.items ?? {})) addItem(game.ctx, item, count);
  const result = game.enter(mapId, QUICK_PLAY_SPAWN);
  return { game, result };
}

/** The walkable cell nearest to the map's centre. */
export function centreCell(db: Database, mapId: string): { x: number; y: number } {
  const g = getGrid(db, mapId);
  const cx = (g.width - 1) / 2;
  const cy = (g.height - 1) / 2;
  let best = { x: Math.round(cx), y: Math.round(cy), d: Infinity };
  for (const c of g.allCells()) {
    if (!c.walkable) continue;
    const d = Math.hypot(c.x - cx, c.y - cy);
    if (d < best.d) best = { x: c.x, y: c.y, d };
  }
  return { x: best.x, y: best.y };
}
