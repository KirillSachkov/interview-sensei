// Seam 2 of spec #70: the order in which answer search fills the Target's Questions.
import { describe, expect, it } from "vitest";

import { answerQueue, withoutAnswerCount } from "./domain/answer-search.ts";
import type { QueueQuestion } from "./domain/answer-search.ts";

type Origin = "material" | "internet" | "agent" | "candidate";

function question(
  id: string,
  {
    topicId = "steady",
    origin = null,
    hidden = false,
    createdAt = "2026-11-01T10:00:00.000Z",
  }: { topicId?: string; origin?: Origin | null; hidden?: boolean; createdAt?: string } = {},
): QueueQuestion {
  return { id, topicId, hidden, createdAt, referenceAnswer: origin === null ? null : { origin } };
}

const ids = (queue: readonly QueueQuestion[]) => queue.map((entry) => entry.id);

describe(answerQueue, () => {
  it("puts the Questions asked in a mock first, then those of shaky and not started Topics, then the rest", () => {
    const bank = [
      question("rest"),
      question("weak", { topicId: "shaky" }),
      question("asked"),
      question("fresh", { topicId: "new" }),
    ];

    const queue = answerQueue(bank, {
      asked: new Set(["asked"]),
      weakTopics: new Set(["shaky", "new"]),
    });

    expect(ids(queue)).toStrictEqual(["asked", "weak", "fresh", "rest"]);
  });

  it("orders each group by when the Question was added, the earliest first", () => {
    const bank = [
      question("late-asked", { createdAt: "2026-11-03T10:00:00.000Z" }),
      question("early-asked", { createdAt: "2026-11-01T10:00:00.000Z" }),
      question("late-rest", { createdAt: "2026-11-02T10:00:00.000Z" }),
      question("early-rest", { createdAt: "2026-11-01T09:00:00.000Z" }),
    ];

    const queue = answerQueue(bank, {
      asked: new Set(["late-asked", "early-asked"]),
      weakTopics: new Set(),
    });

    expect(ids(queue)).toStrictEqual(["early-asked", "late-asked", "early-rest", "late-rest"]);
  });

  it("takes an asked Question with an answer «из знаний агента» again, but not other answered or hidden Questions", () => {
    const bank = [
      question("asked-agent", { origin: "agent" }),
      question("asked-internet", { origin: "internet" }),
      question("weak-agent", { topicId: "shaky", origin: "agent" }),
      question("material", { origin: "material" }),
      question("checked", { origin: "candidate" }),
      question("hidden", { hidden: true }),
      question("open"),
    ];

    const queue = answerQueue(bank, {
      asked: new Set(["asked-agent", "asked-internet"]),
      weakTopics: new Set(["shaky"]),
    });

    expect(ids(queue)).toStrictEqual(["asked-agent", "open"]);
  });
});

describe(withoutAnswerCount, () => {
  it("counts the visible Questions that have no reference answer", () => {
    const bank = [
      question("open"),
      question("other"),
      question("hidden", { hidden: true }),
      question("agent", { origin: "agent" }),
    ];

    expect(withoutAnswerCount(bank)).toBe(2);
  });
});
