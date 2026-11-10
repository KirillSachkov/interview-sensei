// The Candidate's check of reference answers: «проверен» in the side panel, and the list
// «проверить опорный ответ» that a Dispute puts a Question on.
import type { Transaction } from "../../../shared/storage/index.ts";
import type { QuestionRepository } from "../domain/ports.ts";
import type { ReferenceCheck } from "../domain/question.ts";

type Repository = QuestionRepository<Transaction>;

/**
 * «проверен»: the reference answer gets the origin «проверен кандидатом» and keeps its Source and
 * part; the Question leaves the list «проверить опорный ответ».
 */
export async function verifyReferenceAnswer(repository: Repository, id: string) {
  const question = await repository.question(id);
  if (question === undefined) {
    return "not_found" as const;
  }
  if (question.referenceAnswer === null) {
    return "no_reference_answer" as const;
  }
  await repository.editQuestion(question.targetId, {
    id,
    referenceAnswer: { ...question.referenceAnswer, origin: "candidate" },
    referenceCheck: null,
  });
  return "verified" as const;
}

/**
 * Why the Question should go on the list: a Dispute of its Grade with the Candidate's reason, or the
 * interviewer's disagreement with its reference answer; and when.
 */
export interface CheckRequest {
  readonly questionId: string;
  readonly reason: ReferenceCheck["reason"];
  readonly comment: string;
  /** ISO 8601. */
  readonly requestedAt: string;
}

/**
 * Puts the Question on the list «проверить опорный ответ» with the reason, in the transaction of
 * the Dispute or the Attempt; a later request replaces the earlier one. A Question without a
 * reference answer has nothing to check, so nothing changes for it or for an unknown Question.
 */
export async function requestReferenceCheck(
  repository: Repository,
  { questionId, reason, comment, requestedAt }: CheckRequest,
  transaction: Transaction,
): Promise<void> {
  const question = await repository.question(questionId, transaction);
  if (question === undefined || question.referenceAnswer === null) {
    return;
  }
  await repository.editQuestion(
    question.targetId,
    { id: questionId, referenceCheck: { reason, comment, requestedAt } },
    transaction,
  );
}
