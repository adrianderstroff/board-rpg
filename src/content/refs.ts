import { isMap, isPair, isScalar, isSeq, type Document, type Node } from "yaml";

/**
 * Where content refers to other content, by field name (projects.md §2): which collections a
 * field's value can come from. Used to repoint references without touching look-alikes – the same
 * name can be a charset, a battler and a face (lib:hero_knight), or a battle background and a song
 * (lib:village).
 */
export type RefCollection =
  | "items"
  | "heroes"
  | "enemies"
  | "abilities"
  | "statuses"
  | "fieldEffects"
  | "classes"
  | "patterns"
  | "chipsets"
  | "charsets"
  | "battlers"
  | "faces"
  | "battlebacks"
  | "music";

const FIELDS: Record<string, RefCollection[]> = {
  giveItem: ["items"], takeItem: ["items"], item: ["items"], items: ["items"],
  party: ["heroes", "enemies"], partyHas: ["heroes"], addMember: ["heroes"], removeMember: ["heroes"], who: ["heroes"], speaker: ["heroes"], hero: ["heroes"],
  enemy: ["enemies"], enemies: ["enemies"],
  ability: ["abilities", "items"], action: ["abilities"], grants: ["abilities"],
  status: ["statuses"], statuses: ["statuses"], targetLacksStatus: ["statuses"],
  effect: ["fieldEffects"], surface: ["fieldEffects"], melts: ["fieldEffects"],
  classId: ["classes"], classes: ["classes"],
  move: ["patterns"], range: ["patterns"], area: ["patterns"], include: ["patterns"],
  chipset: ["chipsets"], battleback: ["battlebacks"], charset: ["charsets"], battler: ["battlers"], face: ["faces"], music: ["music"],
};

/** The collections a value at `path` (the mapping keys down to it) can refer to. */
export function refTarget(path: string[]): RefCollection[] {
  const field = path[path.length - 1];
  const parent = path[path.length - 2];
  if (field === "id" && ["giveItem", "takeItem", "item"].includes(parent)) return ["items"];
  if (parent === "equipment") return ["items"]; // equipment: { weapon: … }
  if (parent === "music") return ["music"]; // config: music: { title: … }
  if (path[path.length - 3] === "abilities" && parent !== undefined && path.includes("quickPlay")) return ["abilities"]; // quickPlay abilities: { hero: [ … ] }
  return FIELDS[field] ?? [];
}

/** Mapping keys that are ids: the start items (config), a Quick Play's items and abilities per hero. */
function keyTarget(path: string[]): RefCollection | null {
  const at = path.join(".");
  if (at === "start.items" || (path[path.length - 1] === "items" && path.includes("quickPlay"))) return "items";
  if (path[path.length - 1] === "abilities" && path.includes("quickPlay")) return "heroes";
  return null;
}

/**
 * Repoints every reference to `from` in `collection` at `to` in one YAML document (values and id
 * keys). Returns how many it changed.
 */
export function rewriteRefs(doc: Document, collection: RefCollection, from: string, to: string): number {
  let n = 0;
  const walk = (node: Node | null | undefined, path: string[]) => {
    if (!node) return;
    if (isMap(node)) {
      for (const pair of node.items) {
        if (!isPair(pair) || !isScalar(pair.key)) continue;
        const k = String(pair.key.value);
        if (k === from && keyTarget(path) === collection) {
          pair.key.value = to;
          n++;
        }
        walk(pair.value as Node, [...path, k === from ? to : k]);
      }
    } else if (isSeq(node)) for (const item of node.items) walk(item as Node, path);
    else if (isScalar(node) && node.value === from && refTarget(path).includes(collection)) {
      node.value = to;
      n++;
    }
  };
  walk(doc.contents as Node, []);
  return n;
}
