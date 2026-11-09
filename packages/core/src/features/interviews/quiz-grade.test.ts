// Unit tests of the quiz rule the owner chose for spec #41. They sit at the slice root:
// domain-is-pure keeps even test imports such as vitest out of domain/.
import { describe, expect, it } from "vitest";

import { quizGrade } from "./domain/app-judgment.ts";

describe("quiz grade", () => {
  const correct = ["a", "c"];

  it.each([
    ["exactly every correct option", ["a", "c"], 3],
    ["every correct option in another order", ["c", "a"], 3],
    ["only correct options but not all of them", ["a"], 1],
    ["one wrong option beside every correct one", ["a", "b", "c"], 0],
    ["only a wrong option", ["b"], 0],
  ])("gives %s the Grade %i", (_case, chosen, grade) => {
    expect(quizGrade(correct, chosen)).toBe(grade);
  });

  it("gives the only correct option of a single-answer quiz 3", () => {
    expect(quizGrade(["b"], ["b"])).toBe(3);
  });
});
