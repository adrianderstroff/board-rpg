import type { RawContent } from "../../../src/core/data/database";
import type { Condition, Script, Step } from "../../../src/core/data/types";

/**
 * Conditions and script steps in plain words (editor-design §9: the quest flow view, dialog lists).
 * Names come from the content where it has them.
 */

type Named = Record<string, { name?: string; title?: string } | undefined>;
const plain = (id: string) => id.replace(/^lib:/, "");

export function namer(raw: RawContent) {
  const of = (c: unknown, id: string) => (c as Named)[id]?.name ?? (c as Named)[id]?.title ?? plain(id);
  return {
    item: (id: string) => of(raw.items, id),
    hero: (id: string) => of(raw.heroes, id),
    enemy: (id: string) => of(raw.enemies, id),
    quest: (id: string) => of(raw.quests, id),
    map: (id: string) => of(raw.maps, id),
    npc: (id: string) => of(raw.npcs, id) ?? of(raw.heroes, id),
    who: (id: string) => ((raw.npcs as Named)[id] ? of(raw.npcs, id) : (raw.heroes as Named)[id] ? of(raw.heroes, id) : id === "party" ? "the party" : plain(id)),
  };
}

const idOf = (v: string | { id: string }) => (typeof v === "string" ? v : v.id);

export function conditionText(c: Condition | undefined, raw: RawContent): string {
  if (!c) return "always";
  const n = namer(raw);
  const k = Object.keys(c)[0];
  const v = (c as Record<string, unknown>)[k] as never;
  switch (k) {
    case "flag":
      return `flag ${v}`;
    case "not":
      return `not (${conditionText(v, raw)})`;
    case "all":
      return (v as Condition[]).map((x) => conditionText(x, raw)).join(" and ") || "always";
    case "any":
      return (v as Condition[]).map((x) => conditionText(x, raw)).join(" or ") || "never";
    case "item": {
      const it = v as string | { id: string; count?: number };
      return typeof it === "string" ? `has ${n.item(it)}` : `has ${it.count ?? 1} × ${n.item(it.id)}`;
    }
    case "gold":
      return `has ${v} gold`;
    case "var": {
      const x = v as { name: string; op?: string; value: number };
      return `${x.name} ${x.op ?? "=="} ${x.value}`;
    }
    case "talkedTo":
      return `talked to ${n.npc(v)}`;
    case "defeated": {
      const x = v as { enemy?: string; piece?: string; count?: number };
      return `defeated ${x.count ? `${x.count} × ` : ""}${x.enemy ? n.enemy(x.enemy) : x.piece ? `piece ${x.piece}` : "an enemy"}`;
    }
    case "defeatedAllOn":
      return `every enemy on ${n.map(v)} defeated`;
    case "onMap":
      return `on ${n.map(v)}`;
    case "questActive":
      return `quest ${n.quest(v)} active`;
    case "questDone": {
      const x = v as string | { quest: string; ending?: string };
      return typeof x === "string" ? `quest ${n.quest(x)} done` : `quest ${n.quest(x.quest)} ended ${x.ending ?? ""}`.trim();
    }
    case "questStep": {
      const x = v as { quest: string; step: string };
      return `quest ${n.quest(x.quest)} at step ${x.step}`;
    }
    case "questStepsDone":
      return `every step of ${n.quest(v)} done`;
    case "partyHas":
      return `${n.hero(v)} in the party`;
    case "level":
      return `party level ${v}+`;
    case "always":
      return v ? "always" : "never";
    case "state": {
      const x = v as { event: string; is: string };
      return `${x.event} is ${x.is}`;
    }
    case "heroesOn": {
      const x = v as { event: string; weight?: number };
      return `${x.weight && x.weight > 1 ? `${x.weight} heroes` : "a hero"} on ${x.event}`;
    }
    default:
      return k;
  }
}

/** One step of a script in a few words. */
export function stepText(s: Step, raw: RawContent): string {
  const n = namer(raw);
  const k = Object.keys(s).find((x) => ["say", "choice", "if", "wait", "goto", "end", "stop", "do"].includes(x)) ?? Object.keys(s)[0];
  const v = (s as Record<string, unknown>)[k] as never;
  const cut = (t: string) => (t.length > 48 ? `${t.slice(0, 46)}…` : t);
  switch (k) {
    case "say": {
      const sp = (s as { speaker?: string }).speaker;
      return `${sp ? `${n.who(sp)}: ` : ""}“${cut(String(v).replace(/\s+/g, " "))}”`;
    }
    case "choice":
      return `question: ${(v as { text: string }[]).map((o) => o.text).join(" / ")}`;
    case "if":
      return `if ${conditionText(v, raw)} …`;
    case "wait":
      return `wait ${v} ms`;
    case "goto":
      return `continue in ${v}`;
    case "end":
      return "end";
    case "stop":
      return "stop";
    case "do":
      return scriptText(v, raw);
    case "setFlag":
      return `set flag ${v}`;
    case "clearFlag":
      return `clear flag ${v}`;
    case "giveItem":
    case "takeItem": {
      const it = v as string | { id: string; count?: number };
      return `${k === "giveItem" ? "give" : "take"} ${typeof it === "string" ? n.item(it) : `${it.count ?? 1} × ${n.item(it.id)}`}`;
    }
    case "giveGold":
      return `give ${v} gold`;
    case "takeGold":
      return `take ${v} gold`;
    case "startQuest":
      return `start quest ${n.quest(idOf(v))}`;
    case "completeQuest":
      return `complete quest ${n.quest(idOf(v))}`;
    case "setQuestStep": {
      const x = v as { quest: string; step: string };
      return `quest ${n.quest(x.quest)} → step ${x.step}`;
    }
    case "dialog":
      return `dialog ${v}`;
    case "shop":
      return `shop ${v}`;
    case "teleport": {
      const x = v as { map: string };
      return `teleport to ${n.map(x.map)}`;
    }
    case "addMember":
      return `${n.hero(v)} joins`;
    case "removeMember":
      return `${n.hero(v)} leaves`;
    default:
      return k;
  }
}

export const scriptText = (s: Script | undefined, raw: RawContent) => (s ?? []).map((x) => stepText(x, raw)).join("; ");
