// Seam 2 of spec #41: the Topic status rule. The tests sit at the slice root: domain-is-pure keeps
// vitest out of domain/. The thresholds live here, as the spec asks: «уверенно» needs the two
// latest Attempts with a Grade of 2 or more without a hint, at least one of them not a quiz, and
// at least one of them a Deeper question.
import { describe, expect, it } from "vitest";

import type { TopicAttempt } from "./domain/progress.ts";
import { topicStatus } from "./domain/progress.ts";

let minute = 0;

/** An open answer graded by the agent, without a hint, on the Topic «types». */
function attempt(changes: Partial<TopicAttempt> = {}): TopicAttempt {
  minute += 1;
  return {
    topicId: "types",
    interviewId: "mock-1",
    grade: 2,
    hinted: false,
    gradedBy: "agent",
    deeper: false,
    recordedAt: `2026-01-02T03:${String(minute).padStart(2, "0")}:00.000Z`,
    ...changes,
  };
}

describe(topicStatus, () => {
  it("is not started without Attempts", () => {
    expect(topicStatus([])).toBe("not_started");
  });

  it("is confident after two Attempts of 2 or more, one of them a Deeper question", () => {
    expect(topicStatus([attempt({ grade: 3 }), attempt({ grade: 2, deeper: true })])).toBe(
      "confident",
    );
  });

  it("is shaky after a single strong Attempt, even on a Deeper question", () => {
    expect(topicStatus([attempt({ grade: 3, deeper: true })])).toBe("shaky");
  });

  it.each([
    ["a Grade of 1", { grade: 1 as const }],
    ["a hint", { hinted: true }],
  ])("is shaky when one of the two latest Attempts has %s", (_case, weak) => {
    expect(topicStatus([attempt({ deeper: true }), attempt(weak)])).toBe("shaky");
    expect(topicStatus([attempt(weak), attempt({ deeper: true })])).toBe("shaky");
  });

  it("is shaky without a Deeper question among the two latest Attempts", () => {
    expect(topicStatus([attempt({ deeper: true }), attempt(), attempt({ grade: 3 })])).toBe(
      "shaky",
    );
  });

  it("is shaky when both latest Attempts are quizzes", () => {
    expect(
      topicStatus([
        attempt({ gradedBy: "quiz", grade: 3 }),
        attempt({ gradedBy: "quiz", deeper: true }),
      ]),
    ).toBe("shaky");
  });

  it("counts a quiz when the other latest Attempt is not one", () => {
    expect(topicStatus([attempt({ gradedBy: "quiz", grade: 3 }), attempt({ deeper: true })])).toBe(
      "confident",
    );
  });

  it("looks only at the two latest Attempts: an old weak one no longer counts", () => {
    expect(
      topicStatus([attempt({ grade: 0, hinted: true }), attempt({ deeper: true }), attempt()]),
    ).toBe("confident");
  });

  it("becomes shaky again after a weak latest Attempt", () => {
    expect(topicStatus([attempt(), attempt({ deeper: true }), attempt({ grade: 1 })])).toBe(
      "shaky",
    );
  });

  it("orders the Attempts by the time they were recorded", () => {
    const early = attempt({ grade: 0 });
    const strong = [attempt({ deeper: true }), attempt()];

    expect(topicStatus([...strong, early])).toBe("confident");
  });
});
