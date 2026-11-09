// Seam 2 of spec #41: the Readiness of a Target and its Topics «подтянуть в первую очередь». The
// tests sit at the slice root: domain-is-pure keeps vitest out of domain/. A confident Topic here
// has two strong Attempts, the latest on a Deeper question; see topic-status.test.ts.
import { describe, expect, it } from "vitest";

import type { ProgressPlan, TopicAttempt } from "./domain/progress.ts";
import { interviewChanges, targetProgress } from "./domain/progress.ts";

const topic = (id: string) => ({ id, name: `Тема ${id}` });

/** Three Sections; «Проектирование» is switched off. «node» belongs to two Sections. */
const plan: ProgressPlan = {
  sections: [
    { id: "experience", enabled: true, topics: [topic("career")] },
    { id: "typescript", enabled: true, topics: [topic("types"), topic("node"), topic("data")] },
    { id: "backend", enabled: true, topics: [topic("node"), topic("queues")] },
    { id: "design", enabled: false, topics: [topic("design")] },
  ],
};

function attempt(
  topicId: string,
  recordedAt: string,
  changes: Partial<TopicAttempt> = {},
): TopicAttempt {
  return {
    topicId,
    interviewId: "mock-1",
    grade: 2,
    hinted: false,
    gradedBy: "agent",
    deeper: false,
    recordedAt: `2026-01-${recordedAt}:00.000Z`,
    ...changes,
  };
}

/** Two strong Attempts, the latter on a Deeper question: the Topic becomes confident. */
const confident = (topicId: string, day: string) => [
  attempt(topicId, `${day}T10:00`),
  attempt(topicId, `${day}T10:05`, { deeper: true }),
];

describe(targetProgress, () => {
  it("counts the confident share among the Topics of the enabled Sections, each Topic once", () => {
    const progress = targetProgress(plan, [
      ...confident("types", "02"),
      ...confident("design", "02"),
      attempt("node", "03T10:00"),
    ]);

    expect(progress.readiness).toStrictEqual({
      confident: 1,
      shaky: 1,
      notStarted: 3,
      total: 5,
    });
  });

  it("gives every Topic of the plan its status, in the plan's order, with its Sections", () => {
    const progress = targetProgress(plan, [
      ...confident("types", "02"),
      attempt("node", "03T10:00"),
    ]);

    expect(progress.topics).toStrictEqual([
      {
        id: "career",
        name: "Тема career",
        status: "not_started",
        enabled: true,
        sectionIds: ["experience"],
      },
      {
        id: "types",
        name: "Тема types",
        status: "confident",
        enabled: true,
        sectionIds: ["typescript"],
      },
      {
        id: "node",
        name: "Тема node",
        status: "shaky",
        enabled: true,
        sectionIds: ["typescript", "backend"],
      },
      {
        id: "data",
        name: "Тема data",
        status: "not_started",
        enabled: true,
        sectionIds: ["typescript"],
      },
      {
        id: "queues",
        name: "Тема queues",
        status: "not_started",
        enabled: true,
        sectionIds: ["backend"],
      },
      {
        id: "design",
        name: "Тема design",
        status: "not_started",
        enabled: false,
        sectionIds: ["design"],
      },
    ]);
  });

  it("is empty without enabled Topics", () => {
    expect(targetProgress({ sections: [] }, []).readiness).toStrictEqual({
      confident: 0,
      shaky: 0,
      notStarted: 0,
      total: 0,
    });
  });

  it("puts three Topics first to work on: shaky ones, the longest untouched first, then not started", () => {
    const progress = targetProgress(plan, [
      attempt("queues", "05T10:00"),
      attempt("node", "03T10:00", { grade: 1 }),
      attempt("node", "04T10:00", { grade: 1 }),
      attempt("data", "04T09:00"),
      ...confident("types", "02"),
    ]);

    expect(progress.focus.map((entry) => [entry.id, entry.status])).toStrictEqual([
      ["data", "shaky"],
      ["node", "shaky"],
      ["queues", "shaky"],
    ]);
  });

  it("fills the Topics to work on with not started ones in the plan's order", () => {
    const progress = targetProgress(plan, [
      attempt("node", "03T10:00"),
      ...confident("types", "02"),
    ]);

    expect(progress.focus.map((entry) => entry.id)).toStrictEqual(["node", "career", "data"]);
  });

  it("leaves the Topics of switched-off Sections out of the Topics to work on", () => {
    const progress = targetProgress(plan, [attempt("design", "03T10:00")]);

    expect(progress.focus.map((entry) => entry.id)).not.toContain("design");
  });
});

describe(interviewChanges, () => {
  it("compares the Topic status before and after one Mock interview, for the Topics it asked", () => {
    const earlier = [attempt("types", "02T10:00", { interviewId: "mock-1" })];
    const mock = [
      attempt("types", "03T10:00", { interviewId: "mock-2", deeper: true }),
      attempt("career", "03T10:05", { interviewId: "mock-2", grade: 0 }),
    ];
    const later = [attempt("types", "04T10:00", { interviewId: "mock-3", grade: 0 })];

    const changes = interviewChanges(plan, [...earlier, ...mock, ...later], "mock-2");

    expect(changes).toStrictEqual([
      { id: "types", name: "Тема types", before: "shaky", after: "confident" },
      { id: "career", name: "Тема career", before: "not_started", after: "shaky" },
    ]);
  });

  it("has no changes for a Mock interview without Attempts", () => {
    expect(interviewChanges(plan, [attempt("types", "02T10:00")], "mock-2")).toStrictEqual([]);
  });
});
