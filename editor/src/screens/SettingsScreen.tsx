import { useState } from "preact/hooks";
import { computeStats, createEnemy, createHero } from "../../../src/core/chars/character";
import type { ConfigDef } from "../../../src/core/data/types";
import { damageScale } from "../../../src/core/effects/formulas";
import { CONFIG_FILE } from "../characters/model";
import type { EntityRef } from "../entities/model";
import { optionsOf } from "../forms/EffectList";
import { Field, ListEditor, Num, Percent, Select, setAt, Text } from "../forms/fields";
import { Box } from "../forms/Section";
import type { Project } from "../project";

/**
 * Settings (editor-design §10): config.yaml as one form – the game, the start, levels, battle,
 * shops and inn, the board. The start's place is the Game start entity (moved on the map).
 */

const plain = (id: string) => id.replace(/^lib:/, "");

/** EXP needed to reach a level (the game's own formula, character.ts expForLevel). */
export const expFor = (c: Pick<ConfigDef, "expBase" | "expExponent">, level: number) => Math.floor(c.expBase * Math.pow(level - 1, c.expExponent));

export function SettingsScreen({ project, openMap }: { project: Project; openMap: (map: string, entity: EntityRef) => void }) {
  const raw = project.content.raw;
  const c = project.data<ConfigDef>(CONFIG_FILE);
  const set = (path: (string | number)[], value: unknown, label: string, group?: string) => project.edit(CONFIG_FILE, `Settings: ${label}`, (doc) => setAt(doc, path, value), group);
  if (!c) return <main class="main"><p class="placeholder">The project has no config.yaml.</p></main>;
  const music = project.music.map((m) => [m, plain(m)] as [string, string]);
  const start = c.start;
  const startMap = raw.maps[start?.map ?? ""];
  const items = Object.entries(start?.items ?? {});
  const tooMany = (start?.party?.length ?? 0) > c.maxPartySize;

  return (
    <>
      <main class="main">
        <div class="form-scroll settings">
          <div class="item-form">
            <Box title="Game">
              <Field label="Title">
                <Text value={c.title} onChange={(v) => set(["title"], v ?? "", "title", "title")} />
              </Field>
              <Field label="Music">
                <div class="music-grid">
                  {(["title", "battle", "boss"] as const).map((k) => (
                    <label key={k}>
                      <span>{{ title: "title screen", battle: "battles", boss: "boss battles" }[k]}</span>
                      <Select value={c.music?.[k]} options={music} empty="none" onChange={(v) => set(["music", k], v, `${k} music`)} />
                    </label>
                  ))}
                </div>
                <p class="hint">Each map has its own music (Maps › Info); a boss can have its own (Enemies).</p>
              </Field>
            </Box>

            <Box title="Start">
              <Field label="Where">
                <div class="row">
                  <span>
                    {startMap ? startMap.name ?? start.map : <span class="bad-text">{start?.map || "no map"} (missing!)</span>}
                    {start?.spawn && <span class="dim"> · arrival {start.spawn}</span>}
                  </span>
                  {startMap && (
                    <button class="link" title="Open the map with the Game start selected – drag it to move the start" onClick={() => openMap(start.map, { kind: "spawn", key: start.spawn })}>
                      show on the map
                    </button>
                  )}
                </div>
                <p class="hint">The Game start is an entity: place or move it on the Maps screen (Entity mode › Teleport ▾ › Game start).</p>
              </Field>
              <Field label="Party">
                <ListEditor
                  items={start?.party ?? []}
                  onChange={(v) => set(["start", "party"], v, "starting party")}
                  add={() => Object.keys(raw.heroes).find((h) => !(start?.party ?? []).includes(h)) ?? ""}
                  addLabel="+ Hero"
                  render={(h, setH) => <Select value={h} options={optionsOf(raw.heroes)} onChange={(v) => v && setH(v)} />}
                />
                {tooMany && <p class="bad-text">More heroes than the party size ({c.maxPartySize}).</p>}
              </Field>
              <Field label="Gold">
                <Num value={start?.gold} min={0} width={90} onChange={(v) => set(["start", "gold"], v ?? 0, "starting gold", "gold")} />
              </Field>
              <Field label="Items">
                <ListEditor
                  items={items}
                  onChange={(v) => set(["start", "items"], Object.fromEntries(v), "starting items", "items")}
                  add={() => [Object.keys(raw.items).find((i) => !(i in (start?.items ?? {}))) ?? "", 1] as [string, number]}
                  addLabel="+ Item"
                  render={([i, n], setI) => (
                    <div class="row">
                      <Select value={i} options={optionsOf(raw.items)} onChange={(v) => v && setI([v, n])} />
                      <span class="dim">×</span>
                      <Num value={n} min={1} width={56} onChange={(v) => setI([i, v ?? 1])} />
                    </div>
                  )}
                />
              </Field>
              <Field label="First quest">
                <Select value={start?.quest} options={Object.entries(raw.quests).map(([id, q]) => [id, `${q.title ?? id} (${id})`])} empty="none" onChange={(v) => set(["start", "quest"], v, "first quest")} />
              </Field>
            </Box>

            <Box title="Levels">
              <Field label="Max level">
                <div class="row">
                  <Num value={c.maxLevel} min={1} max={99} onChange={(v) => set(["maxLevel"], v ?? 50, "max level", "maxLevel")} />
                  <span class="dim">party size</span>
                  <Num value={c.maxPartySize} min={1} max={8} onChange={(v) => set(["maxPartySize"], v ?? 4, "party size", "maxPartySize")} />
                </div>
              </Field>
              <Field label="EXP curve">
                <div class="row">
                  <span class="dim">EXP for level L =</span>
                  <Num value={c.expBase} min={1} width={64} onChange={(v) => set(["expBase"], v ?? 1, "EXP base", "expBase")} />
                  <span class="dim">× (L − 1) ^</span>
                  <Num value={c.expExponent} min={1} step={0.1} width={64} onChange={(v) => set(["expExponent"], v ?? 2, "EXP exponent", "expExponent")} />
                </div>
                <ExpChart config={c} />
              </Field>
            </Box>

            <Box title="Battle">
              <Field label="Damage">
                <div class="row wrap">
                  <span class="dim">ATK × power ×</span>
                  <Num value={c.damageFactor} min={0} step={0.1} width={64} onChange={(v) => set(["damageFactor"], v ?? 1, "damage factor", "damageFactor")} />
                  <span class="dim">×</span>
                  <Num value={c.defenseScale} min={1} width={64} onChange={(v) => set(["defenseScale"], v ?? 24, "defense scale", "defenseScale")} />
                  <span class="dim">/ (that + DEF)</span>
                </div>
                <DamageExample project={project} config={c} />
              </Field>
              <Field label="Chances">
                <div class="chance-grid">
                  {(
                    [
                      ["hitChance", "to hit"],
                      ["critChance", "critical"],
                      ["firstStrikeChance", "first strike"],
                      ["ambushChance", "ambush"],
                    ] as const
                  ).map(([k, label]) => (
                    <label key={k}>
                      <span>{label}</span>
                      <span class="row">
                        <Percent value={c[k]} onChange={(v) => set([k], v ?? 0, label, k)} /> %
                      </span>
                    </label>
                  ))}
                </div>
              </Field>
            </Box>

            <Box title="Shops and inn">
              <Field label="Inn">
                <div class="row">
                  <Num value={c.innPricePerHero} min={0} onChange={(v) => set(["innPricePerHero"], v ?? 0, "inn price", "innPricePerHero")} />
                  <span class="dim">G per hero (an inn step can set its own price)</span>
                </div>
              </Field>
              <Field label="Selling">
                <div class="row">
                  <Percent value={c.sellRatio} onChange={(v) => set(["sellRatio"], v ?? 0.5, "sell ratio", "sellRatio")} />
                  <span class="dim">% of the price back</span>
                </div>
              </Field>
            </Box>

            <Box title="Board">
              <Field label="Burning">
                <div class="row">
                  <span class="dim">fire on the board leaves at least</span>
                  <Num value={c.boardBurnMinHp} min={0} width={56} onChange={(v) => set(["boardBurnMinHp"], v ?? 0, "burn floor", "boardBurnMinHp")} />
                  <span class="dim">HP</span>
                </div>
              </Field>
              <Field label="Exploring">
                <div class="row">
                  <span class="dim">without enemies, field effects advance a round every</span>
                  <Num value={c.exploreRoundMs} min={100} step={100} width={80} placeholder="1500" onChange={(v) => set(["exploreRoundMs"], v, "exploration round", "exploreRoundMs")} />
                  <span class="dim">ms</span>
                </div>
              </Field>
            </Box>
          </div>
        </div>
      </main>
      <aside class="inspector">
        <h3>{c.title}</h3>
        <p class="hint">The rules and the new-game setup of the whole game (config.yaml). Changes show in the next play-test.</p>
        <h4 class="card-heading">A new game starts with</h4>
        <ul class="summary">
          <li>{(start?.party ?? []).map((h) => raw.heroes[h]?.name ?? plain(h)).join(", ") || "nobody"}</li>
          <li>{start?.gold ?? 0} G</li>
          {items.map(([i, n]) => (
            <li key={i}>
              {n} × {raw.items[i]?.name ?? plain(i)}
            </li>
          ))}
          {start?.quest && <li>quest: {raw.quests[start.quest]?.title ?? start.quest}</li>}
        </ul>
      </aside>
    </>
  );
}

/** The EXP curve: EXP per level as a line, and a few levels as numbers. */
function ExpChart({ config }: { config: ConfigDef }) {
  const max = Math.max(2, config.maxLevel);
  const top = expFor(config, max) || 1;
  const W = 480;
  const H = 120;
  const points = Array.from({ length: max }, (_, i) => `${(i / (max - 1)) * W},${H - (expFor(config, i + 1) / top) * H}`).join(" ");
  const marks = [2, 5, 10, 20, 30, max].filter((l, i, a) => l <= max && a.indexOf(l) === i);
  return (
    <div class="exp-chart">
      <svg viewBox={`-4 -4 ${W + 8} ${H + 8}`} preserveAspectRatio="none" aria-label="EXP by level">
        <polyline points={points} fill="none" stroke="var(--accent-2)" stroke-width="2" vector-effect="non-scaling-stroke" />
      </svg>
      <table class="stat-table">
        <thead>
          <tr>
            <th>Level</th>
            {marks.map((l) => (
              <th key={l}>{l}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>EXP</td>
            {marks.map((l) => (
              <td key={l}>{expFor(config, l).toLocaleString()}</td>
            ))}
          </tr>
          <tr>
            <td>to next</td>
            {marks.map((l) => (
              <td key={l}>{l < max ? (expFor(config, l + 1) - expFor(config, l)).toLocaleString() : "–"}</td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/** A worked example of the damage formula: a hero of the party against an enemy. */
function DamageExample({ project, config }: { project: Project; config: ConfigDef }) {
  const db = project.content.db;
  const raw = project.content.raw;
  const [hero, setHero] = useState<string | undefined>(config.start?.party?.[0]);
  const [enemy, setEnemy] = useState<string | undefined>(Object.keys(raw.enemies)[0]);
  if (!db || !hero || !enemy || !db.heroes.has(hero) || !db.enemies.has(enemy)) return null;
  const atk = computeStats(db, createHero(db, hero)).str;
  const def = computeStats(db, createEnemy(db, "x", enemy)).def;
  const avg = atk * damageScale(config, def);
  return (
    <div class="damage-example">
      <div class="row wrap">
        <span class="dim">e.g.</span>
        <Select value={hero} options={optionsOf(raw.heroes)} onChange={(v) => v && setHero(v)} />
        <span class="dim">attacks</span>
        <Select value={enemy} options={optionsOf(raw.enemies)} onChange={(v) => v && setEnemy(v)} />
      </div>
      <p>
        ATK {atk} × {config.damageFactor} × {config.defenseScale} / ({config.defenseScale} + DEF {def}) ≈ <b>{Math.max(1, Math.round(avg))}</b> damage{" "}
        <span class="dim">
          ({Math.max(1, Math.round(avg * 0.9))}–{Math.max(1, Math.round(avg * 1.1))}, critical {Math.round(avg * 1.5)})
        </span>
      </p>
    </div>
  );
}
