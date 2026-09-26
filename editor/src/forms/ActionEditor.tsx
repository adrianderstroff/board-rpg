import { TeleportTarget } from "../entities/TeleportTarget";
import { cleanupArrival, ensureArrival } from "../entities/teleports";
import { useProjectContext } from "../projectContext";
import type { Database } from "../../../src/core/data/database";
import type { Action, ChoiceOption, Condition, Script, Step } from "../../../src/core/data/types";
import { ConditionEditor } from "./ConditionEditor";
import { ListEditor, Num, Select, Text } from "./fields";
import { EMOTES } from "../../../src/core/data/types";
import { SFX } from "../../../src/game/sfxNames";

/** A cell: x and y. */
function CellInput({ value, onChange }: { value: { x: number; y: number }; onChange: (p: { x: number; y: number }) => void }) {
  return (
    <span class="row">
      <Num value={value.x} min={0} width={44} onChange={(n) => onChange({ ...value, x: n ?? 0 })} />
      <Num value={value.y} min={0} width={44} onChange={(n) => onChange({ ...value, y: n ?? 0 })} />
    </span>
  );
}

/**
 * Script editor (editor-design §6.2, game-design §10.2): what events, dialogs and quests do – the
 * game's actions plus blocks: a line of text, a question with options (each with its own steps), a
 * branch (if / else; an if inside else reads as "else if") and a pause.
 */

const BLOCKS: [string, string][] = [
  ["say", "Say a line"],
  ["choice", "Ask a question"],
  ["if", "If … then … else"],
  ["wait", "Wait"],
];

const KINDS: [string, string][] = [
  ["setFlag", "Set flag"],
  ["clearFlag", "Clear flag"],
  ["setVar", "Set variable"],
  ["addVar", "Add to variable"],
  ["giveItem", "Give item"],
  ["takeItem", "Take item"],
  ["giveGold", "Give gold"],
  ["takeGold", "Take gold"],
  ["startQuest", "Start quest"],
  ["completeQuest", "Complete quest"],
  ["setQuestStep", "Set quest step"],
  ["dialog", "Show dialog"],
  ["shop", "Open shop"],
  ["inn", "Inn (rest for gold)"],
  ["healParty", "Heal the party"],
  ["removeEvent", "Remove an event of this map"],
  ["spawnEnemy", "Spawn an enemy of this map"],
  ["teleport", "Teleport the party"],
  ["message", "Show a message"],
  ["reveal", "Reveal a hidden event"],
  ["setState", "Set an entity's state"],
  ["damage", "Damage"],
  ["heal", "Heal"],
  ["move", "Move someone"],
  ["face", "Turn someone"],
  ["hide", "Hide an entity"],
  ["show", "Show an entity again"],
  ["emote", "Emote balloon"],
  ["camera", "Camera"],
  ["sound", "Play a sound"],
  ["music", "Change the music"],
  ["screen", "Screen effect"],
  ["addMember", "Add a party member"],
  ["removeMember", "Remove a party member"],
  ["setExit", "Open / close an exit"],
];

const DIRS: [string, string][] = [["N", "north"], ["E", "east"], ["S", "south"], ["W", "west"]];
const SCREEN: [string, string][] = [["fadeOut", "fade out"], ["fadeIn", "fade in"], ["flash", "flash"], ["shake", "shake"]];

/** A step's kind: its first key (blocks are recognised by their defining key). */
export const actionKind = (a: Step) => {
  for (const k of ["say", "choice", "if", "wait", "goto", "end", "stop", "do"]) if (k in a) return k;
  return Object.keys(a)[0];
};

function defaultFor(kind: string, db: Database, mapId?: string): Step {
  if (kind === "say") return { say: "" };
  if (kind === "wait") return { wait: 500 };
  if (kind === "if") return { if: { flag: "" }, then: [], else: [] };
  if (kind === "choice") return { choice: [{ text: "Yes", do: [] }, { text: "No", do: [] }] };
  return defaultAction(kind, db, mapId);
}

function defaultAction(kind: string, db: Database, mapId?: string): Action {
  if (kind === "damage") return { damage: { amount: 10 } };
  if (kind === "heal") return { heal: { amount: 20 } };
  const heroFirst = [...db.heroes.keys()][0] ?? "";
  switch (kind) {
    case "move":
      return { move: { who: "party", to: { x: 0, y: 0 } } };
    case "face":
      return { face: { who: "party", dir: "S" } };
    case "emote":
      return { emote: { who: "party", icon: "exclaim" } };
    case "camera":
      return { camera: {} };
    case "sound":
      return { sound: "confirm" };
    case "screen":
      return { screen: "shake" };
    case "addMember":
    case "removeMember":
      return { [kind]: heroFirst } as Action;
    case "setExit": {
      const ex = (mapId ? db.maps.get(mapId)?.exits : undefined)?.[0];
      return { setExit: { x: ex?.x ?? 0, y: ex?.y ?? 0, open: true } };
    }
  }
  if (kind === "setState") {
    const ev = (mapId ? db.maps.get(mapId)?.events : undefined)?.find((e) => e.states);
    return { setState: { event: ev?.id ?? "", state: Object.keys(ev?.states ?? {})[0] ?? "" } };
  }
  const first = <T,>(m: Map<string, T>) => [...m.keys()][0] ?? "";
  switch (kind) {
    case "setVar":
    case "addVar":
      return { [kind]: { name: "", value: 1 } } as Action;
    case "giveItem":
    case "takeItem":
      return { [kind]: first(db.items) } as Action;
    case "giveGold":
    case "takeGold":
      return { [kind]: 100 } as Action;
    case "startQuest":
    case "completeQuest":
      return { [kind]: first(db.quests) } as Action;
    case "setQuestStep": {
      const q = [...db.quests.values()][0];
      return { setQuestStep: { quest: q.id, step: q.steps[0]?.id ?? "" } };
    }
    case "dialog":
      return { dialog: first(db.dialogs) };
    case "shop":
      return { shop: first(db.shops) };
    case "inn":
      return { inn: 40 };
    case "healParty":
      return { healParty: true };
    case "teleport": {
      // the target is picked right after (the destination window); until then it is a problem
      return { teleport: { map: mapId ?? "", spawn: "" } };
    }
    default:
      return { [kind]: "" } as Action;
  }
}

export function ActionEditor({ value, onChange, db, mapId }: { value: Script | undefined; onChange: (a: Script) => void; db: Database; mapId?: string }) {
  const project = useProjectContext();
  const map = mapId ? db.maps.get(mapId) : undefined;
  const ids = <T,>(m: Map<string, T>, name?: (t: T) => string) => [...m.entries()].map(([id, t]) => [id, name ? `${name(t)} (${id})` : id] as [string, string]);
  // who a script moves / turns / points at: the party, a hero, or an entity of this map
  const whoOptions: [string, string][] = [["party", "the party"], ...ids(db.heroes, (h) => h.name), ...(map?.events ?? []).map((e) => [e.id, `entity ${e.id}`] as [string, string])];
  return (
    <ListEditor
      items={value ?? []}
      onChange={onChange}
      add={() => ({ setFlag: "" })}
      addLabel="+ Step"
      render={(a, set) => {
        const kind = actionKind(a);
        const v = (a as Record<string, unknown>)[kind];
        const nested = (steps: Script | string | undefined, write: (s: Script) => void) =>
          typeof steps === "string" ? (
            <span class="dim">continues in dialog {steps}</span>
          ) : (
            <ActionEditor value={steps} onChange={write} db={db} mapId={mapId} />
          );
        const body = () => {
          switch (kind) {
            case "say": {
              const o = a as Extract<Step, { say: string }>;
              const speakers: [string, string][] = [...[...db.npcs.entries()].map(([id, n]) => [id, n.name] as [string, string]), ...[...db.heroes.entries()].map(([id, h]) => [id, h.name] as [string, string])];
              return (
                <div class="block">
                  <Select value={o.speaker} options={speakers} empty="(the event's own / narrator)" onChange={(x) => set({ ...o, speaker: x })} />
                  <textarea rows={2} value={o.say} placeholder="What is said (markup: *bold*, {hero}…)" onInput={(e) => set({ ...o, say: e.currentTarget.value })} />
                </div>
              );
            }
            case "wait":
              return (
                <div class="row">
                  <Num value={v as number} min={0} width={70} onChange={(n) => set({ wait: n ?? 0 })} /> ms
                </div>
              );
            case "if": {
              const o = a as Extract<Step, { if: Condition }>;
              return (
                <div class="block">
                  <ConditionEditor value={o.if} onChange={(c) => set({ ...o, if: c ?? { always: true } })} db={db} flags={[]} />
                  <div class="branch">
                    <span class="branch-label">then</span>
                    {nested(o.then, (s) => set({ ...o, then: s }))}
                  </div>
                  <div class="branch">
                    <span class="branch-label">else</span>
                    {nested(o.else, (s) => set({ ...o, else: s }))}
                  </div>
                </div>
              );
            }
            case "choice": {
              const o = a as Extract<Step, { choice: ChoiceOption[] }>;
              return (
                <div class="block">
                  <ListEditor
                    items={o.choice}
                    onChange={(l) => set({ choice: l })}
                    add={() => ({ text: "", do: [] })}
                    addLabel="+ Option"
                    render={(c, setC) => (
                      <div class="block">
                        <div class="row">
                          <Text value={c.text} placeholder="option text" onChange={(x) => setC({ ...c, text: x ?? "" })} />
                          <Text value={c.icon} placeholder="icon" onChange={(x) => setC({ ...c, icon: x || undefined })} />
                        </div>
                        <div class="branch">
                          <span class="branch-label">shown when</span>
                          <ConditionEditor value={c.when} onChange={(w) => setC({ ...c, when: w })} db={db} flags={[]} />
                        </div>
                        <div class="branch">
                          <span class="branch-label">then</span>
                          {nested(c.do, (s) => setC({ ...c, do: s }))}
                        </div>
                      </div>
                    )}
                  />
                </div>
              );
            }
            case "setFlag":
            case "clearFlag":
              return <Text value={v as string} list="known-flags" placeholder="flag name" onChange={(x) => set({ [kind]: x ?? "" } as Action)} />;
            case "setVar":
            case "addVar": {
              const o = v as { name: string; value: number };
              return (
                <div class="row">
                  <Text value={o.name} placeholder="variable" onChange={(x) => set({ [kind]: { ...o, name: x ?? "" } } as Action)} />
                  <Num value={o.value} width={56} onChange={(x) => set({ [kind]: { ...o, value: x ?? 0 } } as Action)} />
                </div>
              );
            }
            case "giveItem":
            case "takeItem": {
              const id = typeof v === "string" ? v : (v as { id: string }).id;
              const count = typeof v === "string" ? undefined : (v as { count?: number }).count;
              return (
                <div class="row">
                  <Select value={id} options={ids(db.items, (i) => i.name)} onChange={(x) => set({ [kind]: count ? { id: x ?? "", count } : (x ?? "") } as Action)} />×
                  <Num value={count} placeholder="1" min={1} width={50} onChange={(n) => set({ [kind]: n && n > 1 ? { id, count: n } : id } as Action)} />
                </div>
              );
            }
            case "giveGold":
            case "takeGold":
            case "inn":
              return <Num value={v as number} onChange={(n) => set({ [kind]: n ?? 0 } as Action)} />;
            case "startQuest":
            case "completeQuest": {
              const id = typeof v === "string" ? v : ((v as { id: string }).id ?? "");
              const extra = typeof v === "string" ? {} : (v as object);
              return (
                <div class="row">
                  <Select value={id} options={ids(db.quests, (q) => q.title)} onChange={(x) => set({ [kind]: Object.keys(extra).length > 1 ? { ...extra, id: x } : (x ?? "") } as Action)} />
                  {kind === "startQuest" && (
                    <label class="check">
                      <input type="checkbox" checked={!!(extra as { activate?: boolean }).activate} onChange={(e) => set({ startQuest: e.currentTarget.checked ? { id, activate: true } : id })} />
                      make active
                    </label>
                  )}
                </div>
              );
            }
            case "setQuestStep": {
              const o = v as { quest: string; step: string };
              return (
                <div class="row">
                  <Select value={o.quest} options={ids(db.quests, (q) => q.title)} onChange={(x) => set({ setQuestStep: { quest: x ?? "", step: db.quests.get(x ?? "")?.steps[0]?.id ?? "" } })} />
                  <Select value={o.step} options={(db.quests.get(o.quest)?.steps ?? []).map((s) => s.id)} onChange={(x) => set({ setQuestStep: { ...o, step: x ?? "" } })} />
                </div>
              );
            }
            case "dialog":
              return <Select value={v as string} options={[...db.dialogs.keys()].sort()} onChange={(x) => set({ dialog: x ?? "" })} />;
            case "shop":
              return <Select value={v as string} options={ids(db.shops, (s) => s.name)} onChange={(x) => set({ shop: x ?? "" })} />;
            case "healParty":
              return <span class="dim">HP and MP to full</span>;
            case "removeEvent":
            case "reveal":
              return <Select value={v as string} options={(map?.events ?? []).map((e) => e.id)} onChange={(x) => set({ [kind]: x ?? "" } as Action)} />;
            case "spawnEnemy":
              return <Select value={v as string} options={(map?.enemies ?? []).map((e) => e.id)} onChange={(x) => set({ spawnEnemy: x ?? "" })} />;
            case "teleport": {
              const o = v as { map: string; spawn: string };
              return (
                <TeleportTarget
                  project={project}
                  value={o}
                  fromMap={mapId ?? ""}
                  onPick={(d) =>
                    project.transaction("Teleport target", () => {
                      const spawn = ensureArrival(project, d, mapId ?? "script");
                      set({ teleport: { map: d.map, spawn } });
                      cleanupArrival(project, o.map, o.spawn);
                    })
                  }
                />
              );
            }
            case "message":
              return <Text value={v as string} placeholder="text" onChange={(x) => set({ message: x ?? "" })} />;
            case "damage":
            case "heal": {
              const o = v as { amount: number; status?: string; target?: "here" | "party"; cue?: "trap" };
              const put = (next: typeof o) => set({ [kind]: next } as Action);
              return (
                <div class="row wrap">
                  <Num value={o.amount} min={0} width={56} onChange={(n) => put({ ...o, amount: n ?? 0 })} />
                  <Select value={o.target} options={[["party", "the whole party"]]} empty="whoever stands here" onChange={(t) => put({ ...o, target: t as "party" | undefined })} />
                  {kind === "damage" && <Select value={o.status} options={[...db.statuses.values()].map((st) => [st.id, st.name] as [string, string])} empty="(no status)" onChange={(x) => put({ ...o, status: x })} />}
                  {kind === "damage" && (
                    <label class="check" title="Show a trap snapping on the cell">
                      <input type="checkbox" checked={o.cue === "trap"} onChange={(e) => put({ ...o, cue: e.currentTarget.checked ? "trap" : undefined })} /> trap
                    </label>
                  )}
                </div>
              );
            }
            case "move":
            case "face":
            case "emote":
            case "camera": {
              const o = v as { who?: string; to?: { x: number; y: number }; dir?: string; icon?: string };
              const put = (next: typeof o) => set({ [kind]: next } as Action);
              // the camera: a cell, someone, or (neither) back to the party
              const aim = kind === "camera" ? (o.who ? "who" : o.to ? "cell" : "party") : "who";
              return (
                <div class="row wrap">
                  {kind === "camera" && (
                    <Select
                      value={aim}
                      options={[["party", "back to the party"], ["who", "on someone"], ["cell", "on a cell"]]}
                      onChange={(x) => put(x === "who" ? { who: "party" } : x === "cell" ? { to: { x: 0, y: 0 } } : {})}
                    />
                  )}
                  {aim === "who" && <Select value={o.who} options={whoOptions} onChange={(x) => put({ ...o, who: x ?? "party" })} />}
                  {kind === "move" && "to"}
                  {(kind === "move" || aim === "cell") && <CellInput value={o.to ?? { x: 0, y: 0 }} onChange={(to) => put({ ...o, to })} />}
                  {kind === "face" && <Select value={o.dir} options={DIRS} onChange={(x) => put({ ...o, dir: x ?? "S" })} />}
                  {kind === "emote" && <Select value={o.icon} options={EMOTES.map((e) => [e, e] as [string, string])} onChange={(x) => put({ ...o, icon: x ?? "exclaim" })} />}
                </div>
              );
            }
            case "hide":
            case "show":
              return <Select value={v as string} options={(map?.events ?? []).map((e) => e.id)} onChange={(x) => set({ [kind]: x ?? "" } as Action)} />;
            case "sound":
              return <Select value={v as string} options={[...SFX]} onChange={(x) => set({ sound: x ?? "confirm" })} />;
            case "music":
              return <Select value={v as string} options={project.music} onChange={(x) => set({ music: x ?? "" })} />;
            case "screen":
              return <Select value={v as string} options={SCREEN} onChange={(x) => set({ screen: (x ?? "shake") as "shake" })} />;
            case "addMember":
            case "removeMember":
              return <Select value={v as string} options={ids(db.heroes, (h) => h.name)} onChange={(x) => set({ [kind]: x ?? "" } as Action)} />;
            case "setExit": {
              const o = v as { x: number; y: number; open: boolean };
              return (
                <div class="row">
                  <Select value={o.open ? "open" : "close"} options={[["open", "open"], ["close", "close"]]} onChange={(x) => set({ setExit: { ...o, open: x !== "close" } })} />
                  the exit at
                  <Select
                    value={`${o.x},${o.y}`}
                    options={(map?.exits ?? []).map((e) => [`${e.x},${e.y}`, `${e.x},${e.y} → ${db.maps.get(e.to)?.name ?? e.to}`] as [string, string])}
                    onChange={(x) => {
                      const [ex, ey] = (x ?? "0,0").split(",").map(Number);
                      set({ setExit: { ...o, x: ex, y: ey } });
                    }}
                  />
                </div>
              );
            }
            case "setState": {
              const o = v as { event: string; state: string };
              const withStates = (map?.events ?? []).filter((e) => e.states);
              return (
                <div class="row">
                  <Select value={o.event} options={withStates.map((e) => e.id)} onChange={(x) => set({ setState: { event: x ?? "", state: Object.keys(withStates.find((e) => e.id === x)?.states ?? {})[0] ?? "" } })} />
                  to
                  <Select value={o.state} options={Object.keys(withStates.find((e) => e.id === o.event)?.states ?? {})} onChange={(x) => set({ setState: { ...o, state: x ?? "" } })} />
                </div>
              );
            }
            default:
              return <span class="dim">{JSON.stringify(v)}</span>;
          }
        };
        return (
          <div class="row wrap step">
            <select value={kind} onChange={(e) => set(defaultFor(e.currentTarget.value, db, mapId))}>
              <optgroup label="Blocks">
                {BLOCKS.map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Actions">
                {KINDS.map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </optgroup>
            </select>
            {body()}
          </div>
        );
      }}
    />
  );
}
