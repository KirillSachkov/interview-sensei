import { describe, expect, it } from "vitest";

import { demoQuestions, demoTarget } from "./domain/demo-data.ts";
import { validateQuestion } from "./domain/question.ts";

describe("demo content", () => {
  it("offers three Section kinds and about thirty Questions including at least eight quizzes", () => {
    expect(demoTarget.sections.map((section) => section.kind)).toStrictEqual([
      "conversation",
      "topics",
      "design",
    ]);
    expect(demoQuestions.length).toBeGreaterThanOrEqual(28);
    expect(demoQuestions.length).toBeLessThanOrEqual(32);
    expect(
      demoQuestions.filter((question) => question.format === "quiz").length,
    ).toBeGreaterThanOrEqual(8);
  });

  it.each(demoTarget.sections)("gives Section $name existing Topics with Questions", (section) => {
    expect(section.topicKeys.length).toBeGreaterThan(0);
    for (const key of section.topicKeys) {
      expect(demoTarget.topics.some((topic) => topic.key === key)).toBe(true);
      expect(demoQuestions.some((question) => question.topicKey === key)).toBe(true);
    }
  });

  it.each(demoQuestions)(
    "keeps Question $text inside its Section and validates its format",
    (question) => {
      expect(
        demoTarget.sections.some((section) =>
          section.topicKeys.some((key) => key === question.topicKey),
        ),
      ).toBe(true);
      expect(demoTarget.topics.some((topic) => topic.key === question.topicKey)).toBe(true);
      expect(() => validateQuestion(question)).not.toThrow();
    },
  );
});
