// Issue #65: the importance of a Topic. The setup agent records it in the draft of changes with
// set_topic_importance; «Применить» stores it, and the plan and the agent's brief show it.
import { describe, expect, it } from "vitest";

import { startServer, temporaryDirectory } from "./chat-test-support.ts";
import { sectionOf } from "./inbox-test-support.ts";
import type { TargetView } from "./model-test-support.ts";
import { applied, appliedTarget, callTool, draftOf, setupChat } from "./setup-test-support.ts";

/** The importance of each Topic of the Section by its name. */
function importanceIn(target: TargetView, section: string): Record<string, string> {
  return Object.fromEntries(
    sectionOf(target, section).topics.map((topic) => [topic.name, topic.importance]),
  );
}

describe("the importance of a Topic", () => {
  it("is «обычная» for a new Topic and changes through the draft of changes", async () => {
    const { server } = await startServer(await temporaryDirectory());
    const { target, events } = await appliedTarget(server);
    expect(importanceIn(target, "Go")).toStrictEqual({ Горутины: "normal", Каналы: "normal" });

    const changed = await applied({ server, events, targetId: target.id }, [
      "set_topic_importance",
      {
        topics: [
          { topic: "горутины", importance: "high" },
          { topic: "Каналы", importance: "low" },
        ],
      },
    ]);

    expect(importanceIn(changed, "Go")).toStrictEqual({ Горутины: "high", Каналы: "low" });
    expect(importanceIn(changed, "Проектирование")).toStrictEqual({ Kafka: "normal" });
    await expect(callTool(events, "get_brief")).resolves.toContain(
      '{"name":"Горутины","importance":"high"}',
    );
  });

  it("gives the onboarding's new Topics their importance at the first application", async () => {
    const { server } = await startServer(await temporaryDirectory());
    const { target, events } = await setupChat(server);
    await callTool(events, "update_target", { name: "Go-разработчик", level: "middle" });
    await callTool(events, "set_interview_plan", {
      sections: [{ name: "Go", kind: "topics", topics: ["Горутины", "gRPC"] }],
    });

    const created = await applied({ server, events, targetId: target.id }, [
      "set_topic_importance",
      { topics: [{ topic: "gRPC", importance: "high" }] },
    ]);

    expect(importanceIn(created, "Go")).toStrictEqual({ Горутины: "normal", gRPC: "high" });
  });

  it("follows a Topic renamed in the same draft", async () => {
    const { server } = await startServer(await temporaryDirectory());
    const { target, events } = await appliedTarget(server);
    await callTool(events, "set_topic_importance", {
      topics: [{ topic: "Каналы", importance: "high" }],
    });

    const renamed = await applied({ server, events, targetId: target.id }, [
      "set_interview_plan",
      {
        sections: [{ name: "Go", kind: "topics", topics: ["Горутины", "Каналы Go"] }],
        renameTopics: [{ from: "Каналы", to: "Каналы Go" }],
      },
    ]);

    expect(importanceIn(renamed, "Go")).toStrictEqual({ Горутины: "normal", "Каналы Go": "high" });
  });

  it("refuses a Topic that neither the Target nor its draft has; nothing is recorded", async () => {
    const { server } = await startServer(await temporaryDirectory());
    const { target, events } = await appliedTarget(server);

    const reply = await callTool(events, "set_topic_importance", {
      topics: [{ topic: "Rust", importance: "high" }],
    });

    expect(reply).toBe("Ошибка set_topic_importance: Темы «Rust» нет в цели.");
    await expect(draftOf(server, target.id)).resolves.toStrictEqual([]);
  });
});
