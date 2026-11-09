// Spec #45, seam 1, ticket #49: the agent adds, changes and turns off the Candidate's Preferences
// through the draft of changes, and its brief shows the active ones with the draft.
import { describe, expect, it } from "vitest";

import { startServer, temporaryDirectory } from "./chat-test-support.ts";
import { applied, appliedTarget, callTool, setupChat } from "./setup-test-support.ts";

/** The line of the brief with the draft of changes, and the changes it lists. */
function draftInBrief(brief: string) {
  const line = brief.split("\n").find((entry) => entry.startsWith("The draft of changes")) ?? "";
  const changes: unknown = JSON.parse(line.slice(line.indexOf("[")));
  return { line, changes };
}

describe("the Preferences through the draft", () => {
  it("save_preference adds Preferences and changes their text", async () => {
    const { server } = await startServer(await temporaryDirectory());
    const { target, events } = await appliedTarget(server);
    const first = await applied({ server, events, targetId: target.id }, [
      "save_preference",
      { text: "Меньше определений" },
    ]);
    await callTool(events, "save_preference", { text: "Больше практики" });

    const after = await applied({ server, events, targetId: target.id }, [
      "save_preference",
      { id: first.preferences[0]?.id, text: "Без определений" },
    ]);

    // The fixed clock gives both the same time: their order is unknown.
    expect(after.preferences.map((preference) => preference.text).toSorted()).toStrictEqual([
      "Без определений",
      "Больше практики",
    ]);
  });

  it("save_preference turns a Preference off", async () => {
    const { server } = await startServer(await temporaryDirectory());
    const { target, events } = await appliedTarget(server);
    const first = await applied({ server, events, targetId: target.id }, [
      "save_preference",
      { text: "Меньше определений" },
    ]);

    const after = await applied({ server, events, targetId: target.id }, [
      "save_preference",
      { id: first.preferences[0]?.id, active: false },
    ]);

    expect(after.preferences).toStrictEqual([]);
  });

  it("get_brief gives the agent the active Preferences and the draft", async () => {
    const { server } = await startServer(await temporaryDirectory());
    const { target, events } = await appliedTarget(server);
    await applied({ server, events, targetId: target.id }, [
      "save_preference",
      { text: "Меньше определений" },
    ]);
    await callTool(events, "update_target", { tone: "strict" });

    const brief = await callTool(events, "get_brief");

    expect(brief).toMatch(
      /Active Preferences: \[\{"id":"[0-9a-f-]{36}","text":"Меньше определений"\}\]/u,
    );
    const draft = draftInBrief(brief);
    expect(draft.line).toMatch(/^The draft of changes, 1 not applied: /u);
    expect(draft.changes).toMatchObject([{ operation: { type: "update_target", tone: "strict" } }]);
  });

  it("save_preference refuses to change a Preference the Target does not have", async () => {
    const { server } = await startServer(await temporaryDirectory());
    const { events } = await setupChat(server);
    const unknown = crypto.randomUUID();

    const reply = await callTool(events, "save_preference", { id: unknown, active: false });

    expect(reply).toBe(`Ошибка save_preference: Preference ${unknown} нет в цели.`);
  });
});
