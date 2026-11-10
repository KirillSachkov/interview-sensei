// Unit tests of the question selection rules (#8, spec #41, v2 in #64): exclusions, the limit of
// questions in a row on a Topic and the level that the Target's difficulty shifts. They sit at the
// slice root: domain-is-pure keeps even test imports such as vitest out of domain/.
import { describe, expect, it } from "vitest";

import { candidateLevel } from "./domain/candidates.ts";
import { current, daysAgo, now, past, picked, question } from "./candidates-test-support.ts";

describe("question candidates leave out", () => {
  it("hidden Questions and those rated 👎 or ⚠", () => {
    const questions = [
      question("hidden", { hidden: true }),
      question("irrelevant", { rating: "irrelevant" }),
      question("wrong", { rating: "wrong" }),
      question("kept"),
    ];

    expect(picked({ questions })).toStrictEqual(["kept"]);
  });

  it("the Questions already asked in this Mock interview", () => {
    const history = [past("asked", { interviewId: "current", grade: null, presentedAt: now })];

    expect(picked({ questions: [question("asked"), question("new")], history })).toStrictEqual([
      "new",
    ]);
  });

  it("a Question whose last Grade is 3 for the next two Mock interviews", () => {
    const questions = [question("strong"), question("other")];
    const history = [past("strong", { interviewId: "first", grade: 3 })];

    expect(picked({ questions, history, recentInterviewIds: ["first"] })).toStrictEqual(["other"]);
    expect(picked({ questions, history, recentInterviewIds: ["second", "first"] })).toStrictEqual([
      "other",
    ]);
    expect(picked({ questions, history, recentInterviewIds: ["third", "second"] })).toContain(
      "strong",
    );
  });

  it("a Question whose last Grade is 2 for the next Mock interview", () => {
    const questions = [question("good"), question("other")];
    const history = [past("good", { interviewId: "first", grade: 2 })];

    expect(picked({ questions, history, recentInterviewIds: ["first"] })).toStrictEqual(["other"]);
    expect(picked({ questions, history, recentInterviewIds: ["second", "first"] })).toContain(
      "good",
    );
  });

  it("no Question whose last Grade is 0, 1 or «Не знаю» in the next Mock interview", () => {
    const questions = [question("zero"), question("one")];
    const history = [
      past("zero", { interviewId: "first", grade: 0 }),
      past("one", { interviewId: "first", grade: 1 }),
    ];

    expect(picked({ questions, history, recentInterviewIds: ["first"] }).toSorted()).toStrictEqual([
      "one",
      "zero",
    ]);
  });

  it("no Question whose last Grade is below 3, though an earlier one was 3", () => {
    const history = [
      past("again", { grade: 3, presentedAt: daysAgo(10) }),
      past("again", { grade: 1, presentedAt: daysAgo(5) }),
    ];

    expect(picked({ questions: [question("again")], history })).toStrictEqual(["again"]);
  });
});

describe("question candidates limit a Topic", () => {
  it("a Topic after three questions in a row on it, Deeper questions included", () => {
    const questions = [question("types-next"), question("node-next", { topicId: "node" })];
    const history = [
      current("t1", "types", 1),
      current("t2", "types", 2),
      current("t3", "types", 3),
    ];

    expect(picked({ questions, history })).toStrictEqual(["node-next"]);
    expect(picked({ questions, history: history.slice(0, 2) })).toContain("types-next");
  });

  it("a shaky Topic only after four questions in a row", () => {
    const questions = [question("types-next"), question("node-next", { topicId: "node" })];
    const topics = { types: { status: "shaky" } } as const;
    const three = [current("t1", "types", 1), current("t2", "types", 2), current("t3", "types", 3)];
    const four = [...three, current("t4", "types", 4)];

    expect(picked({ questions, history: three, topics })).toContain("types-next");
    expect(picked({ questions, history: four, topics })).toStrictEqual(["node-next"]);
  });

  it("no Topic whose questions in a row were broken by another Topic", () => {
    const questions = [question("types-next")];
    const history = [
      current("t1", "types", 1),
      current("t2", "types", 2),
      current("n1", "node", 3),
      current("t3", "types", 4),
    ];

    expect(picked({ questions, history })).toStrictEqual(["types-next"]);
  });
});

describe("candidate level", () => {
  it.each([
    ["middle", "as_is", "middle"],
    ["middle", "easier", "junior"],
    ["middle", "harder", "senior"],
    ["junior", "easier", "junior"],
    ["senior", "harder", "senior"],
    [null, "as_is", "middle"],
    [null, "harder", "senior"],
  ] as const)("shifts the Target level %s by %s to %s", (level, difficulty, expected) => {
    expect(candidateLevel(level, difficulty)).toBe(expected);
  });
});
