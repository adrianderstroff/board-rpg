import { BoardGrid } from "../board/grid";
import type { Database } from "./database";
import type { Action, BattleUse, BoardUse, Condition, DialogNode, EffectDef, GraphicsRef, PatternRef } from "./types";

/**
 * Cross-reference check of all content. Returns human readable problems (empty = OK).
 * Run at startup (dev) and in the test suite so broken data files are caught early.
 */
export function validateContent(db: Database): string[] {
  const errors: string[] = [];
  const err = (where: string, msg: string) => errors.push(`${where}: ${msg}`);
  const has = <T>(col: Map<string, T>, id: string | undefined, where: string, kind: string) => {
    if (id !== undefined && !col.has(id)) err(where, `unknown ${kind} "${id}"`);
  };

  const pattern = (ref: PatternRef | undefined, where: string) => {
    if (ref === undefined) return;
    if (typeof ref === "string") has(db.patterns, ref, where, "pattern");
    else for (const p of ref.parts) if ("include" in p) has(db.patterns, p.include, where, "pattern");
  };
  const effects = (list: EffectDef[] | undefined, where: string) => {
    for (const e of list ?? []) {
      if (e.type === "applyStatus") has(db.statuses, e.status, where, "status");
      if (e.type === "cureStatus") for (const s of e.statuses ?? []) has(db.statuses, s, where, "status");
      if (e.type === "defuse") has(db.items, e.item, where, "item");
      if (e.type === "fieldEffect" || e.type === "freezeArea") has(db.fieldEffects, e.effect, where, "field effect");
      if (e.type === "placeTrap" && e.status) has(db.statuses, e.status, where, "status");
      if (e.type === "learnAbility") has(db.abilities, e.ability, where, "ability");
    }
  };
  const battleUse = (u: BattleUse | undefined, where: string) => u && effects(u.effects, where);
  const boardUse = (u: BoardUse | undefined, where: string) => {
    if (!u) return;
    pattern(u.range, where);
    pattern(u.area, where);
    effects(u.effects, where);
  };
  const graphics = (g: GraphicsRef, where: string) => {
    if (!db.graphics.charsets[g.charset]) err(where, `unknown charset "${g.charset}"`);
    if (g.battler && !db.graphics.battlers[g.battler]) err(where, `unknown battler "${g.battler}"`);
    if (g.face && !db.graphics.faces[g.face]) err(where, `unknown face "${g.face}"`);
  };
  const itemRef = (v: string | { id: string } | undefined, where: string) => {
    if (v !== undefined) has(db.items, typeof v === "string" ? v : v.id, where, "item");
  };
  const condition = (c: Condition | undefined, where: string): void => {
    if (!c) return;
    if ("not" in c) condition(c.not, where);
    else if ("all" in c) c.all.forEach((x) => condition(x, where));
    else if ("any" in c) c.any.forEach((x) => condition(x, where));
    else if ("item" in c) itemRef(c.item, where);
    else if ("defeated" in c) has(db.enemies, c.defeated.enemy, where, "enemy");
    else if ("defeatedAllOn" in c) has(db.maps, c.defeatedAllOn, where, "map");
    else if ("onMap" in c) has(db.maps, c.onMap, where, "map");
    else if ("questActive" in c) has(db.quests, c.questActive, where, "quest");
    else if ("questDone" in c) has(db.quests, typeof c.questDone === "string" ? c.questDone : c.questDone.quest, where, "quest");
    else if ("questStepsDone" in c) has(db.quests, c.questStepsDone, where, "quest");
    else if ("questStep" in c) {
      const q = db.quests.get(c.questStep.quest);
      if (!q) err(where, `unknown quest "${c.questStep.quest}"`);
      else if (!q.steps.some((s) => s.id === c.questStep.step)) err(where, `quest ${q.id} has no step "${c.questStep.step}"`);
    } else if ("partyHas" in c) has(db.heroes, c.partyHas, where, "hero");
  };
  const actions = (list: Action[] | undefined, where: string) => {
    for (const a of list ?? []) {
      if ("giveItem" in a) itemRef(a.giveItem, where);
      else if ("takeItem" in a) itemRef(a.takeItem, where);
      else if ("startQuest" in a) has(db.quests, typeof a.startQuest === "string" ? a.startQuest : a.startQuest.id, where, "quest");
      else if ("completeQuest" in a) has(db.quests, typeof a.completeQuest === "string" ? a.completeQuest : a.completeQuest.id, where, "quest");
      else if ("dialog" in a) has(db.dialogs, a.dialog, where, "dialog");
      else if ("shop" in a) has(db.shops, a.shop, where, "shop");
      else if ("teleport" in a) has(db.maps, a.teleport.map, where, "map");
    }
  };

  // classes & heroes
  for (const c of db.classes.values()) {
    const w = `class ${c.id}`;
    has(db.patterns, c.move, w, "pattern");
    for (const a of c.abilities) has(db.abilities, a.ability, w, "ability");
  }
  for (const h of db.heroes.values()) {
    const w = `hero ${h.id}`;
    has(db.classes, h.classId, w, "class");
    graphics(h, w);
    for (const i of Object.values(h.equipment ?? {})) {
      const item = db.items.get(i!);
      if (!item) err(w, `unknown item "${i}"`);
      else if (item.equip && db.classes.get(h.classId) && !db.classes.get(h.classId)!.equip.includes(item.equip.kind)) {
        err(w, `class ${h.classId} cannot equip ${i}`);
      }
    }
  }
  // abilities & items
  for (const a of db.abilities.values()) {
    battleUse(a.battle, `ability ${a.id}`);
    for (const e of a.battle?.summon?.enemies ?? []) has(db.enemies, e, `ability ${a.id}`, "enemy");
    boardUse(a.board, `ability ${a.id}`);
  }
  for (const i of db.items.values()) {
    const w = `item ${i.id}`;
    battleUse(i.battle, w);
    boardUse(i.board, w);
    for (const g of i.equip?.grants ?? []) has(db.abilities, g, w, "ability");
    if (i.equip?.onHit) has(db.statuses, i.equip.onHit.status, w, "status");
    if (i.learn) {
      has(db.abilities, i.learn.ability, w, "ability");
      for (const c of i.learn.classes) has(db.classes, c, w, "class");
    }
  }
  for (const f of db.fieldEffects.values()) if (f.status) has(db.statuses, f.status, `field effect ${f.id}`, "status");
  // enemies & npcs
  for (const e of db.enemies.values()) {
    const w = `enemy ${e.id}`;
    has(db.patterns, e.move, w, "pattern");
    graphics(e, w);
    for (const r of e.ai) if (r.action !== "attack") has(db.abilities, r.action, w, "ability");
    for (const r of e.ai) if (r.when?.targetLacksStatus) has(db.statuses, r.when.targetLacksStatus, w, "status");
    for (const [slot, itemId] of Object.entries(e.equipment ?? {})) {
      has(db.items, itemId, w, "item");
      const item = itemId ? db.items.get(itemId) : undefined;
      if (item && item.equip?.slot !== slot) err(w, `"${itemId}" can't be worn as ${slot}`);
    }
    for (const s of e.statuses ?? []) has(db.statuses, s, w, "status");
    for (const a of e.boardAi.abilities ?? []) {
      has(db.abilities, a.ability, w, "ability");
      if (db.abilities.get(a.ability) && !db.abilities.get(a.ability)!.board) err(w, `board ability "${a.ability}" has no board use`);
    }
    for (const d of [...(e.drops ?? []), ...(e.steal ?? [])]) has(db.items, d.item, w, "item");
  }
  for (const n of db.npcs.values()) {
    graphics(n, `npc ${n.id}`);
    for (const d of n.steal ?? []) has(db.items, d.item, `npc ${n.id}`, "item");
  }
  for (const s of db.shops.values()) for (const i of s.items) has(db.items, i, `shop ${s.id}`, "item");
  // dialogs
  for (const [id, nodes] of db.dialogs) {
    const w = `dialog ${id}`;
    for (const n of nodes as DialogNode[]) {
      if ("goto" in n) has(db.dialogs, n.goto, w, "dialog");
      if ("if" in n) {
        condition(n.if, w);
        if (n.then) has(db.dialogs, n.then, w, "dialog");
        if (n.else) has(db.dialogs, n.else, w, "dialog");
      }
      if ("do" in n) actions(n.do, w);
      if ("choice" in n)
        for (const c of n.choice) {
          if (c.goto) has(db.dialogs, c.goto, w, "dialog");
          condition(c.when, w);
          actions(c.do, w);
        }
    }
  }
  // quests
  for (const q of db.quests.values()) {
    const w = `quest ${q.id}`;
    has(db.quests, q.parent, w, "quest");
    actions(q.onStart, w);
    for (const s of q.steps) {
      condition(s.done, `${w}/${s.id}`);
      actions(s.onStart, `${w}/${s.id}`);
      actions(s.onComplete, `${w}/${s.id}`);
    }
    for (const e of q.endings ?? []) {
      condition(e.when, `${w}/ending ${e.id}`);
      actions(e.onComplete, `${w}/ending ${e.id}`);
    }
  }
  // chipsets: terrain that burns must burn into a known terrain
  for (const chip of db.chipsets.values()) {
    for (const [id, t] of Object.entries(chip.terrains)) {
      if (t.flammable && !t.burnsTo) err(`chipset ${chip.id}`, `flammable terrain "${id}" needs burnsTo`);
      if (t.burnsTo && !chip.terrains[t.burnsTo]) err(`chipset ${chip.id}`, `terrain "${id}" burns to unknown terrain "${t.burnsTo}"`);
    }
  }
  // maps
  for (const m of db.maps.values()) {
    const w = `map ${m.id}`;
    const chip = db.chipsets.get(m.chipset);
    if (!chip) {
      err(w, `unknown chipset "${m.chipset}"`);
      continue;
    }
    if (!db.graphics.battlebacks[m.battleback]) err(w, `unknown battleback "${m.battleback}"`);
    for (const t of Object.values(m.legend.terrain)) if (!chip.terrains[t]) err(w, `unknown terrain "${t}"`);
    for (const d of Object.values(m.legend.decor ?? {})) if (!chip.decor[d]) err(w, `unknown decor "${d}"`);
    let grid: BoardGrid | undefined;
    try {
      grid = new BoardGrid(m, chip);
    } catch (e) {
      err(w, (e as Error).message);
    }
    const onGrid = (x: number, y: number, what: string) => {
      if (grid && !grid.has({ x, y })) err(w, `${what} at ${x},${y} is outside the map`);
    };
    for (const [id, s] of Object.entries(m.spawns)) onGrid(s.x, s.y, `spawn ${id}`);
    for (const e of m.exits ?? []) {
      onGrid(e.x, e.y, "exit");
      const target = db.maps.get(e.to);
      if (!target) err(w, `exit to unknown map "${e.to}"`);
      else if (!target.spawns[e.spawn]) err(w, `exit to ${e.to}: unknown spawn "${e.spawn}"`);
      condition(e.enabled, `${w} exit`);
    }
    for (const e of m.enemies ?? []) {
      onGrid(e.x, e.y, `enemy ${e.id}`);
      for (const id of [e.enemy, ...(e.party ?? [])]) has(db.enemies, id, w, "enemy");
      const dormant = db.enemies.get(e.enemy)?.boardAi.dormant;
      if (dormant && !chip.decor[dormant.decor]) err(w, `enemy ${e.id}: dormant decor "${dormant.decor}" not in chipset ${chip.id}`);
      condition(e.when, `${w} enemy ${e.id}`);
    }
    for (const ev of m.events ?? []) {
      onGrid(ev.x, ev.y, `event ${ev.id}`);
      for (const p of ev.pages) {
        const pw = `${w} event ${ev.id}`;
        condition(p.when, pw);
        has(db.npcs, p.npc, pw, "npc");
        has(db.npcs, p.keeper, pw, "npc");
        if (p.decor && !chip.decor[p.decor]) err(pw, `unknown decor "${p.decor}"`);
        has(db.dialogs, p.dialog, pw, "dialog");
        actions(p.actions, pw);
        for (const i of p.interactions ?? []) {
          if (i.type === "talk") has(db.dialogs, i.dialog, pw, "dialog");
          if (i.type === "shop") has(db.shops, i.shop, pw, "shop");
          if (i.type === "inn" && i.wakeAt) {
            const to = db.maps.get(i.wakeAt.map);
            if (!to) err(pw, `inn wakes up on unknown map "${i.wakeAt.map}"`);
            else if (!to.spawns[i.wakeAt.spawn]) err(pw, `inn wakes up at unknown spawn "${i.wakeAt.spawn}"`);
          }
          if (i.type === "examine") {
            has(db.dialogs, i.dialog, pw, "dialog");
            actions(i.actions, pw);
          }
        }
      }
    }
    const gateIds = new Set((m.gates ?? []).map((g) => g.id));
    for (const g of m.gates ?? []) {
      onGrid(g.x, g.y, `gate ${g.id}`);
      condition(g.openWhen, `${w} gate ${g.id}`);
    }
    for (const sw of m.switches ?? []) {
      onGrid(sw.x, sw.y, `switch ${sw.id}`);
      for (const gid of sw.opens) if (!gateIds.has(gid)) err(w, `switch ${sw.id} opens unknown gate "${gid}"`);
    }
    for (const wd of m.wallDecor ?? []) {
      onGrid(wd.x, wd.y, `wall sign ${wd.sign}`);
      if (db.graphics.wallSigns?.frames[wd.sign] === undefined) err(w, `wall decor: unknown sign "${wd.sign}"`);
    }
    for (const t of m.traps ?? []) {
      onGrid(t.x, t.y, `trap ${t.id}`);
      has(db.statuses, t.status, w, "status");
    }
    actions(m.onEnter, w);
  }
  // config
  const s = db.config.start;
  const startMap = db.maps.get(s.map);
  if (!startMap) err("config", `unknown start map "${s.map}"`);
  else if (!startMap.spawns[s.spawn]) err("config", `unknown start spawn "${s.spawn}"`);
  for (const h of s.party) has(db.heroes, h, "config", "hero");
  for (const i of Object.keys(s.items)) has(db.items, i, "config", "item");
  has(db.quests, s.quest, "config", "quest");
  return errors;
}
