// One-off migration (rework R6, game-design §10.3): the maps' `gates` and `switches` become
// entities – events with states and handlers. Run once: `node tools/migrate-gates.mjs`.
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { parseDocument, isSeq } from "yaml";

const dir = "projects/demo/data/maps";
for (const file of readdirSync(dir).filter((f) => f.endsWith(".yaml"))) {
  const path = `${dir}/${file}`;
  const text = readFileSync(path, "utf8");
  const doc = parseDocument(text);
  const map = doc.toJS();
  const gates = map.gates ?? [];
  const switches = map.switches ?? [];
  if (!gates.length && !switches.length) continue;
  const taken = new Set((map.events ?? []).map((e) => e.id));
  for (const id of [...gates, ...switches].map((x) => x.id)) if (taken.has(id)) throw new Error(`${file}: "${id}" is already an event id`);

  const entities = [];
  for (const g of gates) {
    const plates = switches.filter((s) => s.opens.includes(g.id)).map((s) => ({ state: { event: s.id, is: "down" } }));
    const parts = [...(g.openWhen ? [g.openWhen] : []), ...plates];
    const open = parts.length === 1 ? parts[0] : { any: parts };
    const shut = { not: structuredClone(open) };
    const on = [
      { on: "becomes", when: structuredClone(open), do: [{ setState: { event: g.id, state: "open" } }] },
      // closes only from open (not when the map loads), and says so the first time with its flag
      {
        on: "becomes",
        when: { all: [shut, { state: { event: g.id, is: "open" } }] },
        do: [{ setState: { event: g.id, state: "closed" } }, ...(g.closeFlag ? [{ setFlag: g.closeFlag }] : [])],
      },
    ];
    entities.push({ id: g.id, x: g.x, y: g.y, states: { closed: { decor: "gate_bars", pass: "solid" }, open: { pass: "walk" } }, on });
  }
  for (const s of switches) {
    const held = { heroesOn: { event: s.id, ...(s.weight > 1 ? { weight: s.weight } : {}) } };
    const on = [{ on: "becomes", when: structuredClone(held), do: [{ setState: { event: s.id, state: "down" } }] }];
    // a latching plate stays down for good
    if (!s.latch) on.push({ on: "becomes", when: { not: structuredClone(held) }, do: [{ setState: { event: s.id, state: "up" } }] });
    entities.push({ id: s.id, x: s.x, y: s.y, states: { up: { decor: "switch_up", pass: "walk" }, down: { decor: "switch_down", pass: "walk" } }, on });
  }

  if (!isSeq(doc.get("events", true))) doc.set("events", doc.createNode([]));
  const events = doc.get("events", true);
  for (const e of entities) {
    const node = doc.createNode(e);
    // the states and each handler on one line, like the rest of the map files
    for (const pair of node.items) if (pair.key.value === "states") for (const st of pair.value.items) st.value.flow = true;
    for (const pair of node.items) if (pair.key.value === "on") for (const h of pair.value.items) h.flow = true;
    events.add(node);
  }
  doc.delete("gates");
  doc.delete("switches");
  // the map files write lists of maps as [{ … }] – the new lines too (the old ones stay as they are)
  if (/\[ \{|\} \]/.test(text)) throw new Error(`${file} already has "[ {" – check the tidy-up below`);
  writeFileSync(path, doc.toString({ lineWidth: 0 }).replace(/\[ \{/g, "[{").replace(/\} \]/g, "}]"));
  console.log(`${file}: ${gates.length} gates, ${switches.length} switches → entities`);
}
