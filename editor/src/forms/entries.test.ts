import { describe, expect, it } from "vitest";
import { parseDocument } from "yaml";
import { formatYaml } from "../yamlFormat";
import { patchIn } from "./entries";

const SRC = `talk:
  - speaker: captain
    say: "Land ho!| From here on it's your own feet."
  - speaker: lib:mira
    say: "Which way?"
  - { giveItem: lib:potion }
`;

describe("patching entries (editor-design §1.4)", () => {
  it("changes only what changed: other lines stay, a text keeps its quotes", () => {
    const doc = parseDocument(SRC);
    const before = doc.toJS().talk;
    const after = structuredClone(before);
    after[1].say = "Which way, captain?";
    patchIn(doc, ["talk"], before, after);
    const out = formatYaml(doc, SRC).split("\n");
    const src = SRC.split("\n");
    expect(out[4]).toBe('    say: "Which way, captain?"');
    expect(out.filter((l, i) => l !== src[i])).toEqual(['    say: "Which way, captain?"']);
  });

  it("splices steps in and out without rewriting the others", () => {
    const doc = parseDocument(SRC);
    const before = doc.toJS().talk;
    patchIn(doc, ["talk"], before, [before[0], { setFlag: "met_captain" }, ...before.slice(1)]);
    let out = formatYaml(doc, SRC);
    expect(out).toContain("  - { setFlag: met_captain }\n  - speaker: lib:mira");
    expect(out).toContain("say: \"Land ho!| From here on it's your own feet.\"");
    const mid = doc.toJS().talk;
    patchIn(doc, ["talk"], mid, [mid[0], mid[1], mid[3]]);
    out = formatYaml(doc, out);
    expect(out).not.toContain("Which way?");
    expect(out).toContain("  - { giveItem: lib:potion }");
  });
});
