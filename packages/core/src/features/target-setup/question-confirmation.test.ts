// Spec #45 with the rule «не подтверждён» of spec #47 rev. 2, seam 2: which edits of the draft of
// changes confirm a Question that the interviewer made up.
import { describe, expect, it } from "vitest";

import { confirms } from "./domain/question-confirmation.ts";

describe("an edit of a made-up Question through the draft", () => {
  it.each([
    ["new text", { text: "Расскажите о проекте." }],
    ["another Topic", { topicId: "topic-2" }],
    ["the rating «полезный»", { rating: "useful" }],
  ] as const)("confirms it with %s", (_name, edit) => {
    expect(confirms(edit)).toBe(true);
  });

  it.each([
    ["hiding", { hidden: true }],
    ["the rating «не по теме»", { rating: "irrelevant" }],
    ["the rating «ошибка»", { rating: "wrong" }],
  ] as const)("leaves the mark with %s alone", (_name, edit) => {
    expect(confirms(edit)).toBe(false);
  });
});
