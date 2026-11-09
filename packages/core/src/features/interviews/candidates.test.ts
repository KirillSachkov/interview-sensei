// Unit tests of the question selection rules (#8, spec #41): exclusions, priority and the level
// that the Target's difficulty shifts. They sit at the slice root: domain-is-pure keeps even test
// imports such as vitest out of domain/.
import { describe, expect, it } from "vitest";

import { candidateLevel, questionCandidates } from "./domain/candidates.ts";
import type { PastQuestion } from "./domain/interview.ts";
import type { BankQuestion } from "./domain/ports.ts";

const now = "2026-03-01T12:00:00.000Z";
const daysAgo = (days: number) => new Date(Date.parse(now) - days * 86_400_000).toISOString();

function question(id: string, changes: Partial<BankQuestion> = {}): BankQuestion {
  return {
    id,
    topicId: "types",
    text: `Вопрос ${id}`,
    format: "open",
    options: [],
    correctOptionIds: [],
    level: "middle",
    hidden: false,
    rating: null,
    ...changes,
  };
}

function past(questionId: string, changes: Partial<PastQuestion> = {}): PastQuestion {
  return {
    interviewId: "earlier",
    questionId,
    topicId: "types",
    presentedAt: daysAgo(30),
    grade: 2,
    ...changes,
  };
}

/** The ids of the candidates, in the order the agent gets them. */
function picked({
  questions,
  history = [],
  recentInterviewIds = ["earlier"],
  level = "middle",
}: {
  questions: readonly BankQuestion[];
  history?: readonly PastQuestion[];
  recentInterviewIds?: readonly string[];
  level?: BankQuestion["level"];
}): string[] {
  return questionCandidates({
    questions,
    interviewId: "current",
    history,
    recentInterviewIds,
    level,
    now,
    limit: 10,
  }).map((candidate) => candidate.id);
}

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

  it("no Question whose last Grade is below 3, though an earlier one was 3", () => {
    const history = [
      past("again", { grade: 3, presentedAt: daysAgo(10) }),
      past("again", { grade: 1, presentedAt: daysAgo(5) }),
    ];

    expect(picked({ questions: [question("again")], history })).toStrictEqual(["again"]);
  });
});

describe("question candidates rank", () => {
  it("a Topic without Attempts above a confident one", () => {
    const questions = [question("confident", { topicId: "node" }), question("fresh")];
    const history = [
      past("old-1", { topicId: "node", grade: 3, presentedAt: daysAgo(2) }),
      past("old-2", { topicId: "node", grade: 3, presentedAt: daysAgo(1) }),
    ];

    expect(picked({ questions, history })).toStrictEqual(["fresh", "confident"]);
  });

  it("a weak Topic above a strong one asked as long ago", () => {
    const questions = [question("strong", { topicId: "node" }), question("weak")];
    const history = [
      past("node-old", { topicId: "node", grade: 3, presentedAt: daysAgo(3) }),
      past("types-old", { topicId: "types", grade: 0, presentedAt: daysAgo(3) }),
    ];

    expect(picked({ questions, history })).toStrictEqual(["weak", "strong"]);
  });

  it("the weakness of a Topic by its two latest Grades", () => {
    const questions = [question("recovered", { topicId: "node" }), question("slipping")];
    const history = [
      past("n1", { topicId: "node", grade: 0, presentedAt: daysAgo(10) }),
      past("n2", { topicId: "node", grade: 0, presentedAt: daysAgo(9) }),
      past("n3", { topicId: "node", grade: 3, presentedAt: daysAgo(8) }),
      past("n4", { topicId: "node", grade: 3, presentedAt: daysAgo(7) }),
      past("t1", { topicId: "types", grade: 3, presentedAt: daysAgo(10) }),
      past("t2", { topicId: "types", grade: 3, presentedAt: daysAgo(9) }),
      past("t3", { topicId: "types", grade: 2, presentedAt: daysAgo(8) }),
      past("t4", { topicId: "types", grade: 2, presentedAt: daysAgo(7) }),
    ];

    expect(picked({ questions, history })).toStrictEqual(["slipping", "recovered"]);
  });

  it("a Topic not asked for long above one asked a moment ago, at the same Grades", () => {
    const questions = [question("recent", { topicId: "node" }), question("stale")];
    const history = [
      past("node-old", { topicId: "node", grade: 2, presentedAt: now, interviewId: "current" }),
      past("types-old", { topicId: "types", grade: 2, presentedAt: daysAgo(20) }),
    ];

    expect(picked({ questions, history })).toStrictEqual(["stale", "recent"]);
  });

  it("a Question rated 👍 a little above an equal one", () => {
    const questions = [question("plain"), question("useful", { rating: "useful" })];

    expect(picked({ questions })).toStrictEqual(["useful", "plain"]);
  });

  it("the Questions of the wanted level first", () => {
    const questions = [
      question("junior", { level: "junior" }),
      question("senior", { level: "senior" }),
      question("middle"),
    ];

    expect(picked({ questions, level: "senior" })).toStrictEqual(["senior", "middle", "junior"]);
    expect(picked({ questions, level: "junior" })).toStrictEqual(["junior", "middle", "senior"]);
  });

  it("no more candidates than the limit", () => {
    const questions = ["a", "b", "c"].map((id) => question(id));

    expect(
      questionCandidates({
        questions,
        interviewId: "current",
        history: [],
        recentInterviewIds: [],
        level: "middle",
        now,
        limit: 2,
      }),
    ).toHaveLength(2);
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
