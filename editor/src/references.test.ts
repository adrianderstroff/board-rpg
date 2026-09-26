import { describe, expect, it } from "vitest";
import { NodeTree } from "../node-tree";
import { ProjectStore } from "./storage/ops";
import { Project, type FileApi } from "./project";
import { findUsages, usagePlaces } from "./references";

function memoryApi(): FileApi {
  const loaded = new ProjectStore(new NodeTree(".")).loadProject("demo");
  return { load: async () => ({ ...(await loaded), music: [] }), save: async () => {} };
}

describe("where content is used (editor-design §3)", () => {
  it("finds a quest in conditions, actions and as a parent – with where to go", async () => {
    const p = new Project(memoryApi(), null);
    await p.load();
    const places = usagePlaces(findUsages(p, "quests", "road_to_oasis")).map((u) => u.label);
    expect(places).toContain("quest Into the Desert"); // startQuest in its last step
    expect(places).toContain("quest Clear the Dunes"); // parent
    expect(places.some((l) => l.startsWith("map Elder's House, entity"))).toBe(true);
    const onMap = findUsages(p, "quests", "road_to_oasis").find((u) => u.file.includes("elder_house"))!;
    expect(onMap.target).toMatchObject({ screen: "maps", map: "elder_house", entity: { kind: "event" } });
  });

  it("finds dialogs opened by entities and continued in other dialogs; items as keys and values", async () => {
    const p = new Project(memoryApi(), null);
    await p.load();
    expect(findUsages(p, "dialogs", "elder_after").some((u) => u.target.screen === "maps")).toBe(true);
    const potion = findUsages(p, "items", "lib:potion");
    expect(potion.some((u) => u.label === "Settings")).toBe(true); // start items: a key
    expect(potion.some((u) => u.lib && u.label.startsWith("enemy"))).toBe(true); // the library's drops
  });
});

describe("scripts in words", () => {
  it("says conditions and steps with the content's names", async () => {
    const { conditionText, stepText } = await import("./script/words");
    const p = new Project(memoryApi(), null);
    await p.load();
    const raw = p.content.raw;
    expect(conditionText({ all: [{ questStepsDone: "clear_dunes" }, { defeatedAllOn: "scorpion_dunes" }] }, raw)).toBe("every step of Clear the Dunes done and every enemy on Scorpion Dunes defeated");
    expect(conditionText({ talkedTo: "elder" }, raw)).toBe("talked to Elder Hamid");
    expect(stepText({ startQuest: { id: "road_to_oasis", activate: true } }, raw)).toBe("start quest Road to the Oasis");
    expect(stepText({ say: "Hello there", speaker: "lib:kit" }, raw)).toBe("Kit: “Hello there”");
  });
});
