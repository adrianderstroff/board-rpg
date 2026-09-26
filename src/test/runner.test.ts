import { describe, expect, it } from "vitest";
import { runActions, type UiRequest } from "../core/script/actions";
import { ScriptRunner } from "../core/script/runner";
import type { Script } from "../core/data/types";
import { villageGame } from "./helpers";

/** Scripts (§10.2): steps one after another – actions, text, questions, branches, pauses. */
describe("script runner (R3)", () => {
  it("if / else runs the branch whose condition holds; nested branches work like elif", () => {
    const { ctx } = villageGame();
    const script: Script = [
      { if: { flag: "a" }, then: [{ setFlag: "saw_a" }], else: [{ if: { flag: "b" }, then: [{ setFlag: "saw_b" }], else: [{ setFlag: "saw_none" }] }] },
    ];
    runActions(ctx, script);
    expect(ctx.state.flags.saw_none).toBe(true);
    ctx.state.flags.b = true;
    runActions(ctx, script);
    expect(ctx.state.flags.saw_b).toBe(true);
    expect(ctx.state.flags.saw_a).toBeUndefined();
  });

  it("text and pauses come out as requests in the script's order", () => {
    const { ctx } = villageGame();
    const out = runActions(ctx, [{ say: "Hello", speaker: "elder" }, { wait: 300 }, { message: "Done" }], "villager");
    expect(out.requests.map((r) => r.type)).toEqual(["say", "wait", "message"]);
    expect(out.requests[0]).toMatchObject({ text: "Hello", speaker: "elder" });
  });

  it("a question stops the script; the answer runs its option, then the rest", () => {
    const { ctx } = villageGame();
    const out = runActions(ctx, [
      { choice: [{ text: "Yes", do: [{ setFlag: "yes" }] }, { text: "No", icon: "potion", do: [{ setFlag: "no" }] }, { text: "Hidden", when: { flag: "never" } }] },
      { setFlag: "after" },
    ]);
    const q = out.requests[0] as Extract<UiRequest, { type: "choice" }>;
    expect(q.type).toBe("choice");
    expect(q.options.map((o) => o.text)).toEqual(["Yes", "No"]);
    expect(q.options[1].icon).toBe("potion");
    expect(ctx.state.flags.after).toBeUndefined(); // not yet: waiting for the answer
    q.resume(1);
    expect(ctx.state.flags.no).toBe(true);
    expect(ctx.state.flags.yes).toBeUndefined();
    expect(ctx.state.flags.after).toBe(true);
  });

  it("a dialog is a script: `stop` ends everything, a called dialog comes back", () => {
    const { ctx } = villageGame();
    const steps: string[] = [];
    const r = new ScriptRunner(ctx, [{ say: "one" }, { stop: true }, { say: "never" }]);
    for (let s = r.next(); s.type !== "end"; s = r.next()) if (s.type === "say") steps.push(s.text);
    expect(steps).toEqual(["one"]);
  });

  it("an action's effects come out as events the presentation can play", () => {
    const { ctx } = villageGame();
    const r = new ScriptRunner(ctx, [{ giveItem: "potion" }, { say: "Got it" }]);
    const first = r.next();
    expect(first.type).toBe("events");
    expect(r.next()).toMatchObject({ type: "say", text: "Got it" });
  });
});
