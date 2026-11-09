// Writes of the Target setup's draft of changes: new and edited Questions, renamed and merged
// Topics. Each runs in the transaction it gets, so the draft is applied as a whole or not at all.
import type { Transaction } from "../../../shared/storage/index.ts";
import type { QuestionEdit, QuestionRepository } from "../domain/ports.ts";
import type { Question, QuestionContent, QuizOption } from "../domain/question.ts";
import { topicKey, validateQuestion } from "../domain/question.ts";

/** A new Question of a Target: its content is checked before it is stored. */
export interface NewQuestion {
  readonly id: string;
  readonly topicId: string;
  readonly text: string;
  readonly format: QuestionContent["format"];
  readonly options: readonly QuizOption[];
  readonly correctOptionIds: readonly string[];
  readonly level: Question["level"];
  readonly hidden: boolean;
  readonly rating: Question["rating"];
  readonly createdAt: string;
}

type Repository = QuestionRepository<Transaction>;

async function checkTopics(
  repository: Repository,
  {
    targetId,
    topicIds,
    transaction,
  }: { targetId: string; topicIds: readonly string[]; transaction: Transaction | undefined },
): Promise<void> {
  const topics = await repository.topics(targetId, transaction);
  const own = new Set(topics.map((topic) => topic.id));
  if (topicIds.some((topicId) => !own.has(topicId))) {
    throw new Error("A Question must reference a Topic of its own Target");
  }
}

function stored(targetId: string, question: NewQuestion): Question {
  validateQuestion(question);
  const content: QuestionContent =
    question.format === "open"
      ? { format: "open", options: [], correctOptionIds: [] }
      : { format: "quiz", options: question.options, correctOptionIds: question.correctOptionIds };
  return { ...question, ...content, targetId, sourceIds: [], unconfirmed: false };
}

export async function addQuestions(
  repository: Repository,
  targetId: string,
  {
    questions,
    transaction,
  }: { questions: readonly NewQuestion[]; transaction: Transaction | undefined },
): Promise<void> {
  const rows = questions.map((question) => stored(targetId, question));
  await checkTopics(repository, {
    targetId,
    topicIds: rows.map((question) => question.topicId),
    transaction,
  });
  if (rows.length > 0) {
    await repository.addQuestions(rows, transaction);
  }
}

export async function editQuestions(
  repository: Repository,
  targetId: string,
  { edits, transaction }: { edits: readonly QuestionEdit[]; transaction: Transaction | undefined },
): Promise<void> {
  await checkTopics(repository, {
    targetId,
    topicIds: edits.flatMap((edit) => (edit.topicId === undefined ? [] : [edit.topicId])),
    transaction,
  });
  for (const edit of edits) {
    // One after another: the queries share the transaction.
    // oxlint-disable-next-line eslint/no-await-in-loop -- the edits share one transaction
    await repository.editQuestion(targetId, edit, transaction);
  }
}

/**
 * Gives the Topic `from` the name `to`. When another Topic already has that name, `from` merges
 * into it: its Questions move there, and `from` goes away. An unknown `from` changes nothing.
 */
export async function renameTopic(
  repository: Repository,
  targetId: string,
  { from, to, transaction }: { from: string; to: string; transaction: Transaction | undefined },
): Promise<void> {
  const existing = await repository.topics(targetId, transaction);
  const source = existing.find((topic) => topicKey(topic.name) === topicKey(from));
  const target = existing.find((topic) => topicKey(topic.name) === topicKey(to));
  if (source === undefined) {
    return;
  }
  await (target === undefined || target.id === source.id
    ? repository.renameTopic(source.id, to.trim(), transaction)
    : repository.mergeTopic(source.id, target.id, transaction));
}
