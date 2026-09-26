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

describe("rename and delete protection (E9)", () => {
  async function tracked() {
    const loaded = new ProjectStore(new NodeTree(".")).loadProject("demo");
    const written: Record<string, string> = {};
    const removed: string[] = [];
    const api: FileApi = { load: async () => ({ ...(await loaded), music: [] }), save: async (path, text) => void (written[path] = text), remove: async (path) => void removed.push(path) };
    const p = new Project(api, null);
    await p.load();
    return { p, written, removed };
  }

  it("renames a quest and every reference to it; undo puts it all back", async () => {
    const { renameEntry, renameProblem } = await import("./references");
    const { p } = await tracked();
    expect(renameProblem(p, "quests", "road_to_oasis", "clear_dunes")).toMatch(/already/);
    expect(renameProblem(p, "quests", "road_to_oasis", "Bad Id")).toMatch(/a–z/);
    const moved = renameEntry(p, "quests", "road_to_oasis", "oasis_road");
    expect(moved).toBeGreaterThan(3);
    expect(p.content.problems).toEqual([]);
    expect(Object.keys(p.content.raw.quests)).toContain("oasis_road");
    // the key kept its place in the file
    expect(Object.keys(p.data<Record<string, unknown>>("data/quests.yaml")).indexOf("oasis_road")).toBe(1);
    expect(findUsages(p, "quests", "road_to_oasis")).toEqual([]);
    p.undo();
    expect(Object.keys(p.content.raw.quests)).toContain("road_to_oasis");
    expect(p.dirtyPaths()).toEqual([]);
  });

  it("renames a map: its file moves (deleted on save) and exits, teleports and conditions follow", async () => {
    const { renameEntry } = await import("./references");
    const { p, written, removed } = await tracked();
    renameEntry(p, "maps", "sandhollow", "sand_hollow");
    expect(p.paths("data/maps/sandhollow.yaml")).toEqual([]);
    expect(p.content.raw.maps.sand_hollow).toBeDefined();
    expect(p.content.problems).toEqual([]);
    await p.save();
    expect(removed).toEqual(["data/maps/sandhollow.yaml"]);
    expect(written["data/maps/sand_hollow.yaml"]).toBeDefined();
  });

  it("an entry's references to itself don't keep it from being deleted", async () => {
    const { outsideUsages } = await import("./references");
    const { p } = await tracked();
    // clear_dunes' ending checks its own steps; road_to_oasis is its parent and starts it
    expect(outsideUsages(p, "quests", "clear_dunes").every((u) => !(u.file === "data/quests.yaml" && u.path[0] === "clear_dunes"))).toBe(true);
    expect(outsideUsages(p, "quests", "clear_dunes").length).toBeGreaterThan(0);
    expect(outsideUsages(p, "items", "lib:potion").length).toBeGreaterThan(0);
  });

  it("renames a dialog in its file and where entities open it", async () => {
    const { renameEntry } = await import("./references");
    const { p } = await tracked();
    renameEntry(p, "dialogs", "elder_after", "elder_thanks");
    expect(p.content.problems).toEqual([]);
    expect(findUsages(p, "dialogs", "elder_thanks").some((u) => u.target.screen === "maps")).toBe(true);
  });
});
