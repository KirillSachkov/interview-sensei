// Duplicate matching and conservative answer attachment for Inbox processing.
import type { Transaction } from "../../../shared/storage/index.ts";
import type {
  DuplicateFilter,
  InboxBankQuestion,
  InboxNewQuestion,
  MaterialQuestion,
} from "../domain/ports.ts";
import type { InboxContext } from "./inbox-context.ts";

export function matchingQuestion(
  filter: DuplicateFilter,
  question: MaterialQuestion,
  existing: readonly InboxBankQuestion[],
) {
  const matches = existing.filter((stored) =>
    question.existingQuestionId === undefined
      ? filter.withoutDuplicates([question], [stored.text]).duplicates.length > 0
      : stored.id === question.existingQuestionId,
  );
  if (matches.length > 1) {
    throw new Error("Ambiguous duplicate: give existingQuestionId");
  }
  const [match] = matches;
  if (match === undefined && question.existingQuestionId !== undefined) {
    throw new Error("Existing Question is not in this Target");
  }
  return match;
}

function answerStatus(match: InboxBankQuestion) {
  if (match.referenceAnswer?.origin === "candidate") {
    return "candidate_protected";
  }
  if (match.referenceAnswer?.origin === "material") {
    return "material_preserved";
  }
  return "attached";
}

export async function attachAnswer(
  { dependencies }: InboxContext,
  {
    targetId,
    question,
    match,
    answer,
  }: {
    targetId: string;
    question: MaterialQuestion;
    match: InboxBankQuestion;
    answer: InboxNewQuestion["referenceAnswer"];
  },
  transaction: Transaction,
) {
  if (answer === null) {
    return null;
  }
  if (
    match.topicId !== question.topicId ||
    match.format !== question.format ||
    (match.sectionKind !== null && match.sectionKind !== question.sectionKind)
  ) {
    throw new Error("A duplicate answer must fit the existing Topic, format and Section kind");
  }
  const status = answerStatus(match);
  if (status === "attached") {
    await dependencies.questions.editQuestions(
      targetId,
      [{ id: match.id, referenceAnswer: answer }],
      transaction,
    );
  }
  return { questionId: match.id, status };
}
