// Unit tests of the Attempts that progress counts (spec #41, story 32). They sit at the slice root:
// domain-is-pure keeps even test imports such as vitest out of domain/.
import { describe, expect, it } from "vitest";

import type { AttemptRecord } from "./domain/history.ts";
import { topicAttempts } from "./domain/history.ts";
import type { Grade } from "./domain/interview.ts";

function record(id: string, interviewId: string, grade: Grade): AttemptRecord {
  return {
    attempt: {
      id,
      interviewId,
      askedQuestionId: `asked-${id}`,
      gradedBy: "agent",
      hinted: false,
      recordedAt: "2026-03-01T12:00:00.000Z",
      grade,
      gaps: "",
      justification: "",
      strongAnswer: "",
    },
    question: { topicId: "types", text: `Вопрос ${id}`, parentAttemptId: null },
  };
}

const records = [
  record("a", "finished", 1),
  record("b", "running", 3),
  record("c", "interrupted", 2),
];

describe(topicAttempts, () => {
  it("drops the Attempts of the running Mock interview and keeps the others", () => {
    const counted = topicAttempts(records, [], "running");

    expect(counted.map(({ interviewId, grade }) => ({ interviewId, grade }))).toStrictEqual([
      { interviewId: "finished", grade: 1 },
      { interviewId: "interrupted", grade: 2 },
    ]);
  });
});
