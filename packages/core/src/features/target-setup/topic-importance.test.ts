// Issue #65: the importance of Topics in the draft of changes. The latest change of a Topic wins,
// a rename carries the importance to the new name, and an unknown Topic is a problem.
import { describe, expect, it } from "vitest";

import { draftProblems, stateAfter } from "./domain/draft.ts";
import type { SetupState } from "./domain/draft.ts";
import { latestImportance } from "./domain/draft-topics.ts";

const target: SetupState = {
  name: "Go-разработчик",
  level: "middle",
  tone: "neutral",
  language: "ru",
  status: "active",
  sections: [
    {
      id: "section-1",
      name: "Go",
      kind: "topics",
      gradingCriteria: "",
      enabled: true,
      topics: ["Горутины", "Каналы"],
    },
  ],
  topics: ["Горутины", "Каналы", "Kafka"],
  topicRenames: [],
  importance: [],
  preferences: [],
  questions: [],
  missing: [],
};

describe("the importance of Topics in the draft", () => {
  it("gives Topics of the Target and of the plan their importance, the latest change winning", () => {
    const state = stateAfter(target, [
      {
        type: "set_interview_plan",
        sections: [{ name: "Go", kind: "topics", topics: ["Горутины", "Kafka", "gRPC"] }],
      },
      {
        type: "set_topic_importance",
        topics: [
          { topic: "Kafka", importance: "high" },
          { topic: "gRPC", importance: "low" },
        ],
      },
      { type: "set_topic_importance", topics: [{ topic: "kafka", importance: "normal" }] },
    ]);

    expect(latestImportance(state.importance)).toStrictEqual([
      { topic: "kafka", importance: "normal" },
      { topic: "gRPC", importance: "low" },
    ]);
    expect(draftProblems(state)).toStrictEqual([]);
  });

  it("keeps the importance of a renamed Topic under its new name", () => {
    const state = stateAfter(target, [
      { type: "set_topic_importance", topics: [{ topic: "Каналы", importance: "high" }] },
      {
        type: "set_interview_plan",
        sections: [{ name: "Go", kind: "topics", topics: ["Горутины", "Каналы Go"] }],
        renameTopics: [{ from: "Каналы", to: "Каналы Go" }],
      },
    ]);

    expect(state.importance).toStrictEqual([{ topic: "Каналы Go", importance: "high" }]);
  });

  it("refuses the importance of a Topic that neither the Target nor the draft has", () => {
    const state = stateAfter(target, [
      { type: "set_topic_importance", topics: [{ topic: "Rust", importance: "high" }] },
    ]);

    expect(draftProblems(state)).toStrictEqual(["Темы «Rust» нет в цели."]);
  });
});
