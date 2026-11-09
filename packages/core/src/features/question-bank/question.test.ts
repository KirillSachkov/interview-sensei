import { describe, expect, it } from "vitest";

import { validateQuestion } from "./domain/question.ts";

const option = { id: "one", text: "Первый" };
const options = [option, { id: "two", text: "Второй" }];
describe("question format", () => {
  it("accepts open Questions and quizzes with one or several correct options", () => {
    expect(() =>
      validateQuestion({ format: "open", options: [], correctOptionIds: [] }),
    ).not.toThrow();
    expect(() =>
      validateQuestion({ format: "quiz", options, correctOptionIds: ["one"] }),
    ).not.toThrow();
    expect(() =>
      validateQuestion({ format: "quiz", options, correctOptionIds: ["one", "two"] }),
    ).not.toThrow();
  });

  it.each([
    { options: [option], correctOptionIds: ["one"] },
    { options, correctOptionIds: [] },
    { options, correctOptionIds: ["missing"] },
    { options: [option, option], correctOptionIds: ["one"] },
    { options, correctOptionIds: ["one", "one"] },
  ])("rejects a malformed quiz %j", (quiz) => {
    expect(() => validateQuestion({ format: "quiz", ...quiz })).toThrow(
      "A quiz needs distinct options and at least one valid correct option",
    );
  });

  it("rejects quiz options on an open Question", () => {
    expect(() => validateQuestion({ format: "open", options, correctOptionIds: [] })).toThrow(
      "An open Question has no quiz options",
    );
  });
});
