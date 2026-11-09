import { describe, expect, it } from "vitest";

import { reviewPlan } from "./domain/question-review.ts";

const questionIds = ["answered", "fresh"];
const attempted = new Set(["answered"]);

describe("the Candidate's bulk review of Questions", () => {
  it("deletes Questions without Attempts and hides the ones with Attempts instead", () => {
    expect(reviewPlan({ action: "delete", questionIds, attempted })).toStrictEqual({
      deleted: ["fresh"],
      edits: [{ id: "answered", hidden: true }],
    });
  });

  it("hides every chosen Question, with Attempts or without", () => {
    expect(reviewPlan({ action: "hide", questionIds, attempted })).toStrictEqual({
      deleted: [],
      edits: [
        { id: "answered", hidden: true },
        { id: "fresh", hidden: true },
      ],
    });
  });

  it("⚠ rates the Questions «ошибка» with the Candidate's comment", () => {
    expect(
      reviewPlan({ action: "warn", questionIds: ["fresh"], attempted, comment: "Устарело" }),
    ).toStrictEqual({
      deleted: [],
      edits: [{ id: "fresh", rating: "wrong", ratingComment: "Устарело" }],
    });
  });

  it("⚠ without a comment keeps no comment", () => {
    expect(reviewPlan({ action: "warn", questionIds: ["fresh"], attempted })).toStrictEqual({
      deleted: [],
      edits: [{ id: "fresh", rating: "wrong", ratingComment: null }],
    });
  });

  it("👍 rates the Questions useful and removes «не подтверждён»", () => {
    expect(reviewPlan({ action: "confirm", questionIds: ["fresh"], attempted })).toStrictEqual({
      deleted: [],
      edits: [{ id: "fresh", rating: "useful", ratingComment: null, unconfirmed: false }],
    });
  });
});
