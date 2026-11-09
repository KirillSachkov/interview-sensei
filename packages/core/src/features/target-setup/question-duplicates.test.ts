// Spec #45, seam 2: the text normalization that finds duplicate Questions. A Question the Target
// already has, by text with another case, spacing or punctuation, is a duplicate.
import { describe, expect, it } from "vitest";

import { questionKey, withoutDuplicates } from "./domain/draft-questions.ts";

describe("duplicate Questions", () => {
  it("match regardless of case, spaces and punctuation", () => {
    expect(questionKey("  Что такое   горутина?")).toBe(questionKey("что такое горутина"));
    expect(questionKey("Чем канал отличается от мьютекса?!")).toBe(
      questionKey("Чем канал, отличается от мьютекса"),
    );
    expect(questionKey("Что такое горутина?")).not.toBe(questionKey("Что такое канал?"));
  });

  it("are filtered against the Target's Questions and each other, and returned", () => {
    const filtered = withoutDuplicates(
      [
        { text: "Что такое горутина?" },
        { text: "Как устроен select?" },
        { text: "как устроен SELECT" },
      ],
      ["что такое горутина"],
    );

    expect(filtered).toStrictEqual({
      kept: [{ text: "Как устроен select?" }],
      duplicates: [{ text: "Что такое горутина?" }, { text: "как устроен SELECT" }],
    });
  });
});
