// Issue #88: the draft of changes tells a Topic merge from a rename, so the Candidate reads
// «объединится с» for a rename into a Topic the Target has.
import { describe, expect, it } from "vitest";

import type { DraftChange, DraftOperation, SetupState } from "./domain/draft.ts";
import { changeViews } from "./domain/draft-plan.ts";

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
  topics: ["Горутины", "Каналы", "Мьютексы"],
  topicRenames: [],
  importance: [],
  preferences: [],
  questions: [],
  missing: [],
};

function change(id: string, operation: DraftOperation): DraftChange {
  return { id, targetId: "target-1", operation, createdAt: "2026-11-10T10:00:00.000Z" };
}

describe("the Topic merges of the draft", () => {
  it("marks a rename into a Topic the Target has as a merge, and a rename to a new name as none", () => {
    const plan = change("change-1", {
      type: "set_interview_plan",
      sections: [{ name: "Go", kind: "topics", topics: ["Горутины и планировщик", "Каналы"] }],
      renameTopics: [
        { from: "Мьютексы", to: "каналы" },
        { from: "Горутины", to: "Горутины и планировщик" },
      ],
    });

    expect(changeViews(target, [plan])).toStrictEqual([{ ...plan, merges: ["Мьютексы"] }]);
  });

  it("counts a Topic that an earlier change of the draft adds as one the Target has", () => {
    const added = change("change-1", {
      type: "add_questions",
      questions: [
        {
          id: "question-1",
          topic: "Конкурентность",
          text: "Что такое data race?",
          format: "open",
          options: [],
          correctOptionIds: [],
          level: null,
        },
      ],
    });
    const plan = change("change-2", {
      type: "set_interview_plan",
      sections: [{ name: "Go", kind: "topics", topics: ["Конкурентность"] }],
      renameTopics: [{ from: "Каналы", to: "Конкурентность" }],
    });

    expect(changeViews(target, [added, plan])).toStrictEqual([
      added,
      { ...plan, merges: ["Каналы"] },
    ]);
  });
});
