// Unit tests of the interviewer's judgment against the reference answer (#64): which key points the
// answer covered, the disagreement, and the rules the agent must follow.
import { describe, expect, it } from "vitest";

import type { ReferenceAnswer } from "./domain/interview.ts";
import { referenceFields } from "./domain/reference-judgment.ts";

const reference: ReferenceAnswer = {
  points: ["Горутины дешёвые", "Планировщик M:N", "Стек растёт"],
  sample: "Горутина — лёгкий поток.",
  origin: "material",
};

describe("the judgment against a reference answer", () => {
  it("marks the covered key points by their numbers from 1", () => {
    expect(referenceFields(reference, { coveredPoints: [1, 3] })).toStrictEqual({
      fields: {
        referencePoints: [
          { text: "Горутины дешёвые", covered: true },
          { text: "Планировщик M:N", covered: false },
          { text: "Стек растёт", covered: true },
        ],
        referenceDisagreement: null,
      },
    });
  });

  it("keeps the interviewer's disagreement with the reference answer", () => {
    const judged = referenceFields(reference, {
      coveredPoints: [],
      disagreement: "Стек не растёт бесконечно",
    });

    expect(judged).toMatchObject({
      fields: { referenceDisagreement: "Стек не растёт бесконечно" },
    });
  });

  it("needs the covered points for a question with a reference answer", () => {
    expect(referenceFields(reference, {})).toMatchObject({
      problem: expect.stringContaining("give coveredPoints") as unknown,
    });
  });

  it("refuses a number outside the key points", () => {
    expect(referenceFields(reference, { coveredPoints: [4] })).toMatchObject({
      problem: expect.stringContaining("from 1 to 3") as unknown,
    });
  });

  it("refuses covered points and disagreement for a question without a reference answer", () => {
    expect(referenceFields(null, {})).toStrictEqual({
      fields: { referencePoints: null, referenceDisagreement: null },
    });
    expect(referenceFields(null, { disagreement: "Нет" })).toMatchObject({
      problem: expect.stringContaining("no reference answer") as unknown,
    });
  });
});
