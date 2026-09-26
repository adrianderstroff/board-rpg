import type Phaser from "phaser";
import type { AbilityDef } from "../../core/data/types";
import type { InputRouter } from "../../engine/input";
import { pick, type MenuItem } from "../../engine/ui/widgets";
import { icon } from "../keys";

export interface AbilityMenuOptions {
  x: number;
  y: number;
  anchorBottom?: boolean;
  /** Title of the final list (e.g. "Mira  MP 22"). */
  title: string;
  usable: (a: AbilityDef) => boolean;
  /** Called with the highlighted ability in the final list, or null when leaving it. */
  onHighlight?: (a: AbilityDef | null) => void;
  /** One plain list without the type/group levels (the board), scrolling beyond `maxRows`. */
  flat?: boolean;
  maxRows?: number;
}

/**
 * Hierarchical ability picker (§13.1): type → group → ability (e.g. Magic > Support > Heal).
 * Levels with a single entry are skipped; cancel goes back one level. Shared by board and battle.
 */
export async function pickAbility(scene: Phaser.Scene, input: InputRouter, abilities: AbilityDef[], o: AbilityMenuOptions): Promise<AbilityDef | null> {
  if (o.flat) {
    const items: MenuItem[] = abilities.map((a) => ({ label: a.name, right: a.mp ? `${a.mp} MP` : "", icon: icon(a.icon), disabled: !o.usable(a) }));
    const r = await pick(scene, input, items, {
      x: o.x,
      y: o.y,
      anchorBottom: o.anchorBottom,
      maxRows: o.maxRows ?? 5,
      title: o.title,
      initial: Math.max(0, abilities.findIndex((a) => o.usable(a))),
      onHighlight: (i) => o.onHighlight?.(abilities[i]),
    });
    o.onHighlight?.(null);
    return r === null ? null : abilities[r];
  }
  const types = [...new Set(abilities.map((a) => a.type))];
  const step = 10;
  for (;;) {
    let type = types[0];
    if (types.length > 1) {
      const r = await pick(
        scene,
        input,
        types.map((t) => ({ label: t, icon: icon(`type_${t.toLowerCase().replace(/\s/g, "")}`), disabled: !abilities.some((a) => a.type === t && o.usable(a)) })),
        { x: o.x, y: o.y, anchorBottom: o.anchorBottom, title: "Ability" },
      );
      if (r === null) return null;
      type = types[r];
    }
    const ofType = abilities.filter((a) => a.type === type);
    const groups = [...new Set(ofType.map((a) => a.group ?? ""))];
    for (;;) {
      let list = ofType;
      if (groups.length > 1) {
        const g = await pick(
          scene,
          input,
          groups.map((x) => ({ label: x || "Other", disabled: !ofType.some((a) => (a.group ?? "") === x && o.usable(a)) })),
          { x: o.x + step, y: o.y + (o.anchorBottom ? 0 : step), anchorBottom: o.anchorBottom, title: type },
        );
        if (g === null) break;
        list = ofType.filter((a) => (a.group ?? "") === groups[g]);
      }
      const items: MenuItem[] = list.map((a) => ({ label: a.name, right: a.mp ? `${a.mp} MP` : "", icon: icon(a.icon), disabled: !o.usable(a) }));
      const r = await pick(scene, input, items, {
        x: o.x + step * 2,
        y: o.y + (o.anchorBottom ? 0 : step * 2),
        anchorBottom: o.anchorBottom,
        maxRows: 8,
        title: o.title,
        onHighlight: (i) => o.onHighlight?.(list[i]),
      });
      o.onHighlight?.(null);
      if (r !== null) return list[r];
      if (groups.length <= 1) break;
    }
    if (types.length <= 1) return null;
  }
}
