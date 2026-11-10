// Spec #45, seam 2: the pure rules of the draft of changes. The draft turns into the Target's new
// state; applying it activates a draft Target once it has a name, a level and an enabled Section.
import { describe, expect, it } from "vitest";

import { draftProblems, stateAfter } from "./domain/draft.ts";
import type { DraftOperation, SetupState } from "./domain/draft.ts";

const newTarget: SetupState = {
  name: "",
  level: null,
  tone: "neutral",
  language: "ru",
  status: "draft",
  sections: [],
  topics: [],
  topicRenames: [],
  importance: [],
  preferences: [],
  questions: [],
  missing: [],
};

const experience = {
  name: "Опыт и резюме",
  kind: "conversation",
  gradingCriteria: "Конкретика и роль кандидата",
  enabled: true,
  topics: [],
} as const;

const goSection = {
  name: "Go и конкурентность",
  kind: "topics",
  gradingCriteria: "",
  enabled: true,
  topics: ["Горутины", "Каналы"],
} as const;

const named: DraftOperation = { type: "update_target", name: "Go-разработчик", level: "middle" };
const plan: DraftOperation = { type: "set_interview_plan", sections: [experience, goSection] };

describe("draft of changes", () => {
  it("turns the operations into the Target's fields and Interview plan in their order", () => {
    const state = stateAfter(newTarget, [
      { type: "update_target", name: "Черновое имя", tone: "strict" },
      plan,
      named,
    ]);

    expect(state).toStrictEqual({
      ...newTarget,
      name: "Go-разработчик",
      level: "middle",
      tone: "strict",
      status: "active",
      sections: [
        { id: null, ...experience },
        { id: null, ...goSection },
      ],
    });
  });

  it("keeps the id of a Section that the new plan names again", () => {
    const current: SetupState = {
      ...newTarget,
      sections: [{ id: "section-1", ...experience, enabled: false }],
    };

    const state = stateAfter(current, [plan]);

    expect(state.sections.map((section) => section.id)).toStrictEqual(["section-1", null]);
    expect(state.sections[0]?.enabled).toBe(true);
  });

  it("keeps the id, criteria and Topics of a Section that the plan renames", () => {
    const current: SetupState = { ...newTarget, sections: [{ id: "section-1", ...goSection }] };

    const state = stateAfter(current, [
      {
        type: "set_interview_plan",
        sections: [{ name: "Go", kind: "topics" }],
        renameSections: [{ from: "go и конкурентность", to: "Go" }],
      },
    ]);

    expect(state.sections).toStrictEqual([{ ...goSection, id: "section-1", name: "Go" }]);
    expect(draftProblems(state)).toStrictEqual([]);
  });

  it("refuses to rename a Section the Target does not have", () => {
    const state = stateAfter(newTarget, [
      {
        type: "set_interview_plan",
        sections: [{ name: "Go", kind: "topics" }],
        renameSections: [{ from: "Rust", to: "Go" }],
      },
    ]);

    expect(draftProblems(state)).toContain("Секции «Rust» нет в цели.");
  });

  it("leaves a draft Target a draft until it has a name, a level and an enabled Section", () => {
    const disabledPlan: DraftOperation = {
      type: "set_interview_plan",
      sections: [{ ...goSection, enabled: false }],
    };

    expect(stateAfter(newTarget, [plan]).status).toBe("draft");
    expect(stateAfter(newTarget, [{ type: "update_target", name: "Go" }, plan]).status).toBe(
      "draft",
    );
    expect(stateAfter(newTarget, [named, disabledPlan]).status).toBe("draft");
    expect(stateAfter(newTarget, [named, plan]).status).toBe("active");
  });

  it("keeps an active Target active", () => {
    const active: SetupState = { ...newTarget, name: "Go", level: "senior", status: "active" };

    expect(stateAfter(active, [{ type: "update_target", tone: "friendly" }]).status).toBe("active");
  });

  it("finds no problems in a draft that names distinct Sections", () => {
    expect(draftProblems(stateAfter(newTarget, [named, plan]))).toStrictEqual([]);
  });

  it("refuses a plan with two Sections of the same name", () => {
    const state = stateAfter(newTarget, [
      {
        type: "set_interview_plan",
        sections: [goSection, { ...goSection, name: " go И конкурентность " }],
      },
    ]);

    expect(draftProblems(state)).toStrictEqual([
      "В плане несколько секций с названием «Go и конкурентность».",
    ]);
  });

  it("refuses to leave an active Target without a name", () => {
    const active: SetupState = { ...newTarget, name: "Go", level: "senior", status: "active" };

    expect(draftProblems(stateAfter(active, [{ type: "update_target", name: " " }]))).toStrictEqual(
      ["У активной цели должно быть название."],
    );
  });
});
