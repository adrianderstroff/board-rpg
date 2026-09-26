import { TeleportTarget } from "../entities/TeleportTarget";
import { cleanupArrival, ensureArrival } from "../entities/teleports";
import { useProjectContext } from "../projectContext";
import type { Database } from "../../../src/core/data/database";
import type { Action } from "../../../src/core/data/types";
import { ListEditor, Num, Select, Text } from "./fields";

/** Builder for the game's actions (editor-design §6.2) – what events, dialogs and quests do. */

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
];

export const actionKind = (a: Action) => Object.keys(a)[0];

function defaultFor(kind: string, db: Database, mapId?: string): Action {
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

export function ActionEditor({ value, onChange, db, mapId }: { value: Action[] | undefined; onChange: (a: Action[]) => void; db: Database; mapId?: string }) {
  const project = useProjectContext();
  const map = mapId ? db.maps.get(mapId) : undefined;
  const ids = <T,>(m: Map<string, T>, name?: (t: T) => string) => [...m.entries()].map(([id, t]) => [id, name ? `${name(t)} (${id})` : id] as [string, string]);
  return (
    <ListEditor
      items={value ?? []}
      onChange={onChange}
      add={() => ({ setFlag: "" })}
      addLabel="+ Action"
      render={(a, set) => {
        const kind = actionKind(a);
        const v = (a as Record<string, unknown>)[kind];
        const body = () => {
          switch (kind) {
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
            default:
              return <span class="dim">{JSON.stringify(v)}</span>;
          }
        };
        return (
          <div class="row wrap">
            <select value={kind} onChange={(e) => set(defaultFor(e.currentTarget.value, db, mapId))}>
              {KINDS.map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>
            {body()}
          </div>
        );
      }}
    />
  );
}
