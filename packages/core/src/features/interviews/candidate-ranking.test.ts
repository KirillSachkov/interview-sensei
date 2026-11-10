// Unit tests of the question selection rules v2 (#64): how the candidates rank and the reasons the
// agent gets with each.
import { describe, expect, it } from "vitest";

import {
  current,
  daysAgo,
  now,
  past,
  picked,
  question,
  reasons,
} from "./candidates-test-support.ts";

describe("question candidates rank Topics", () => {
  it("a Topic without Attempts above a confident one", () => {
    const questions = [question("confident", { topicId: "node" }), question("fresh")];
    const history = [
      past("old-1", { topicId: "node", grade: 3, presentedAt: daysAgo(2) }),
      past("old-2", { topicId: "node", grade: 3, presentedAt: daysAgo(1) }),
    ];
    const topics = { types: { status: "not_started" } } as const;

    expect(picked({ questions, history, topics })).toStrictEqual(["fresh", "confident"]);
  });

  it("a shaky Topic above a confident one with the same Grades", () => {
    const questions = [question("confident", { topicId: "node" }), question("shaky")];
    const topics = { types: { status: "shaky" } } as const;

    expect(picked({ questions, topics })).toStrictEqual(["shaky", "confident"]);
  });

  it("a Topic of high importance above a normal one, and a low one below it", () => {
    const questions = [
      question("low", { topicId: "css" }),
      question("normal", { topicId: "node" }),
      question("high"),
    ];
    const topics = { types: { importance: "high" }, css: { importance: "low" } } as const;

    expect(picked({ questions, topics })).toStrictEqual(["high", "normal", "low"]);
  });

  it("a Topic not covered in this Mock interview above one it already asked", () => {
    const questions = [question("covered", { topicId: "node" }), question("uncovered")];
    const history = [
      past("node-now", { interviewId: "current", topicId: "node", presentedAt: daysAgo(8) }),
      past("types-before", { topicId: "types", presentedAt: daysAgo(8) }),
    ];

    expect(picked({ questions, history })).toStrictEqual(["uncovered", "covered"]);
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
});

describe("question candidates rank Questions", () => {
  it("a Question last graded 1 two levels away above a new 👍 Question of its Topic", () => {
    const questions = [
      question("new", { level: "middle", rating: "useful" }),
      question("missed", { level: "junior" }),
    ];
    const history = [past("missed", { grade: 1, presentedAt: daysAgo(3) })];

    expect(picked({ questions, history, level: "senior" })).toStrictEqual(["missed", "new"]);
  });

  it("a Question last graded 0 above a new Question of its Topic", () => {
    const questions = [question("new"), question("missed")];
    const history = [past("missed", { grade: 0, presentedAt: daysAgo(3) })];

    expect(picked({ questions, history })).toStrictEqual(["missed", "new"]);
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

  it("five candidates at most", () => {
    const questions = ["a", "b", "c", "d", "e", "f", "g"].map((id) => question(id));

    expect(picked({ questions })).toHaveLength(5);
  });
});

describe("question candidates give reasons", () => {
  it("for a retry, a weak, important, long unasked and uncovered Topic", () => {
    const questions = [question("missed")];
    const history = [past("missed", { grade: 1, presentedAt: daysAgo(10) })];
    const topics = { types: { status: "shaky", importance: "high" } } as const;

    expect(reasons({ questions, history, topics })).toStrictEqual({
      missed: [
        "retry after a mistake",
        "weak topic",
        "important topic",
        "not asked for a long time",
        "topic not covered in this interview yet",
      ],
    });
  });

  it("for a Topic not started yet", () => {
    const topics = { types: { status: "not_started" } } as const;

    expect(reasons({ questions: [question("fresh")], topics }).fresh).toContain(
      "topic not started",
    );
  });

  it("«best of the rest» when no other reason holds", () => {
    const questions = [question("next")];
    const history = [current("asked", "types", 1)];

    expect(reasons({ questions, history })).toStrictEqual({ next: ["best of the rest"] });
  });
});
