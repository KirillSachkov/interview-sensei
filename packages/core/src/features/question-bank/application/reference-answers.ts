// The Candidate's check of reference answers: «проверен» in the side panel, and the list
// «проверить опорный ответ» that a Dispute puts a Question on.
import type { Transaction } from "../../../shared/storage/index.ts";
import type { QuestionRepository } from "../domain/ports.ts";

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
 * Puts the Question on the list «проверить опорный ответ» with the Candidate's reason; a later
 * request replaces the earlier one. A Question without a reference answer has nothing to check:
 * resolves false then, and for an unknown Question.
 */
export async function requestReferenceCheck(
  repository: Repository,
  {
    questionId,
    comment,
    requestedAt,
  }: { questionId: string; comment: string; requestedAt: string },
): Promise<boolean> {
  const question = await repository.question(questionId);
  if (question?.referenceAnswer === null || question === undefined) {
    return false;
  }
  await repository.editQuestion(question.targetId, {
    id: questionId,
    referenceCheck: { reason: "dispute", comment, requestedAt },
  });
  return true;
}
