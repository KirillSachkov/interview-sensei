// The Candidate's bulk review of a Target's Questions (spec #47).
import type { Transaction } from "../../../shared/storage/index.ts";
import type { QuestionAttempts, QuestionRepository } from "../domain/ports.ts";
import { reviewPlan } from "../domain/question-review.ts";
import type { ReviewAction } from "../domain/question-review.ts";

/** The Candidate's bulk review of the chosen Questions of a Target. */
export interface Review {
  readonly action: ReviewAction;
  readonly questionIds: readonly string[];
  /** The comment to ⚠. */
  readonly comment?: string | null;
}

/**
 * Applies the bulk review; deleting a Question with Attempts hides it instead. Resolves which
 * Questions were deleted and which were changed, or `unknown_questions` when a chosen Question is
 * not the Target's; nothing changes then.
 */
export async function review(
  {
    repository,
    attempts,
  }: { repository: QuestionRepository<Transaction>; attempts: QuestionAttempts },
  targetId: string,
  { action, questionIds, comment = null }: Review,
) {
  const bank = await repository.questions(targetId);
  const own = new Set(bank.map((question) => question.id));
  const chosen = [...new Set(questionIds)];
  if (chosen.some((id) => !own.has(id))) {
    return "unknown_questions" as const;
  }
  const attempted =
    action === "delete" ? new Set(await attempts.attempted(targetId, chosen)) : new Set<string>();
  const plan = reviewPlan({ action, questionIds: chosen, attempted, comment });
  await repository.review(targetId, plan);
  return { deleted: plan.deleted, changed: plan.edits.map((edit) => edit.id) };
}
