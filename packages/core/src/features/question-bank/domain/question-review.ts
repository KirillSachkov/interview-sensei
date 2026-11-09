// The Candidate's bulk review of Questions (spec #47): hide, delete, ⚠ with a comment, 👍.
import type { ReviewPlan } from "./ports.ts";

/** What the Candidate does with the chosen Questions. */
export type ReviewAction = "hide" | "delete" | "warn" | "confirm";

function edit(action: Exclude<ReviewAction, "delete">, id: string, comment: string | null) {
  switch (action) {
    case "hide": {
      return { id, hidden: true };
    }
    case "warn": {
      return { id, rating: "wrong", ratingComment: comment } as const;
    }
    case "confirm": {
      return { id, rating: "useful", ratingComment: null, unconfirmed: false } as const;
    }
    default: {
      return action satisfies never;
    }
  }
}

/**
 * The changes of a bulk review. Deleting a Question with Attempts hides it instead, so its history
 * stays; ⚠ rates the Question «ошибка» with the comment; 👍 rates it useful and confirms it.
 */
export function reviewPlan({
  action,
  questionIds,
  attempted,
  comment = null,
}: {
  action: ReviewAction;
  questionIds: readonly string[];
  /** The chosen Questions that have Attempts. */
  attempted: ReadonlySet<string>;
  comment?: string | null;
}): ReviewPlan {
  if (action !== "delete") {
    return { deleted: [], edits: questionIds.map((id) => edit(action, id, comment)) };
  }
  return {
    deleted: questionIds.filter((id) => !attempted.has(id)),
    edits: questionIds.filter((id) => attempted.has(id)).map((id) => edit("hide", id, null)),
  };
}
