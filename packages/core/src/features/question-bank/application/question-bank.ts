import { randomUUID } from "node:crypto";

import type { Transaction } from "../../../shared/storage/index.ts";
import type {
  QuestionAttempts,
  QuestionEdit,
  QuestionFilter,
  QuestionRepository,
} from "../domain/ports.ts";
import { reviewPlan } from "../domain/question-review.ts";
import type { ReviewAction } from "../domain/question-review.ts";
import { addQuestions, editQuestions, renameTopic } from "./bank-edits.ts";
import type { NewQuestion } from "./bank-edits.ts";
import type { StoredQuestion, Topic } from "../domain/question.ts";
import { topicKey, validateQuestion } from "../domain/question.ts";

/** One Topic per distinct name: the existing one, or a new one with the name. */
function namedTopics({
  targetId,
  names,
  existing,
}: {
  targetId: string;
  names: readonly string[];
  existing: ReadonlyMap<string, Topic>;
}): ReadonlyMap<string, Topic> {
  const named = new Map<string, Topic>();
  for (const name of names) {
    const key = topicKey(name);
    if (!named.has(key)) {
      named.set(key, existing.get(key) ?? { id: randomUUID(), targetId, name: name.trim() });
    }
  }
  return named;
}

/**
 * The Target's Topic of each name, in the order of the names; creates the missing ones. A name
 * matches an existing Topic by topicKey, and names that match get the same Topic.
 */
async function ensureTopics(
  repository: QuestionRepository<Transaction>,
  { targetId, names, transaction }: EnsureTopics,
): Promise<readonly Topic[]> {
  const stored = await repository.topics(targetId, transaction);
  const existing = new Map(
    stored.map((topic) => [topicKey(topic.name), { id: topic.id, targetId, name: topic.name }]),
  );
  const named = namedTopics({ targetId, names, existing });
  const created = [...named.values()].filter((topic) => !existing.has(topicKey(topic.name)));
  if (created.length > 0) {
    await repository.addTopics(created, transaction);
  }
  return names.flatMap((name) => named.get(topicKey(name)) ?? []);
}

interface EnsureTopics {
  readonly targetId: string;
  readonly names: readonly string[];
  readonly transaction: Transaction | undefined;
}

async function seed(
  repository: QuestionRepository<Transaction>,
  topics: readonly Topic[],
  questions: readonly StoredQuestion[],
) {
  for (const question of questions) {
    validateQuestion(question);
    if (
      !topics.some((topic) => topic.id === question.topicId && topic.targetId === question.targetId)
    ) {
      throw new Error("A Question must reference a Topic of its own Target");
    }
  }
  await repository.seed(topics, questions);
}

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
async function review(
  { repository, attempts }: { repository: QuestionRepository<Transaction>; attempts: QuestionAttempts },
  targetId: string,
  { action, questionIds, comment = null }: Review,
) {
  const own = new Set((await repository.questions(targetId)).map((question) => question.id));
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

export function createQuestionBank(
  repository: QuestionRepository<Transaction>,
  attempts: QuestionAttempts,
) {
  return {
    seed: async (topics: readonly Topic[], questions: readonly StoredQuestion[]) =>
      seed(repository, topics, questions),
    /** Adds one Question, such as one the interviewer made up, to a Topic of its Target. */
    add: async (question: StoredQuestion) => {
      validateQuestion(question);
      const topics = await repository.topics(question.targetId);
      if (!topics.some((topic) => topic.id === question.topicId)) {
        throw new Error("A Question must reference a Topic of its own Target");
      }
      await repository.seed([], [question]);
    },
    topics: repository.topics,
    ensureTopics: async (targetId: string, names: readonly string[], transaction?: Transaction) =>
      ensureTopics(repository, { targetId, names, transaction }),
    search: async (targetId: string, filter: QuestionFilter = {}) =>
      repository.search(targetId, filter),
    rate: repository.rate,
    hide: repository.hide,
    review: async (targetId: string, request: Review) =>
      review({ repository, attempts }, targetId, request),
    /** «просмотрено»: the Questions of the Target are no longer «новый». */
    markSeen: async (targetId: string, ids: readonly string[]) =>
      repository.markSeen(targetId, ids),
    /** Erases the Target's Topics and Questions when the Target is deleted for good. */
    eraseTarget: async (targetId: string, transaction: Transaction) =>
      repository.erase(targetId, transaction),
    /** Every Question of the Target, hidden ones too. */
    questions: async (targetId: string, transaction?: Transaction) =>
      repository.questions(targetId, transaction),
    addQuestions: async (
      targetId: string,
      questions: readonly NewQuestion[],
      transaction?: Transaction,
    ) => addQuestions(repository, targetId, { questions, transaction }),
    editQuestions: async (
      targetId: string,
      edits: readonly QuestionEdit[],
      transaction?: Transaction,
    ) => editQuestions(repository, targetId, { edits, transaction }),
    renameTopic: async (
      targetId: string,
      rename: { readonly from: string; readonly to: string },
      transaction?: Transaction,
    ) => renameTopic(repository, targetId, { ...rename, transaction }),
  };
}
export type QuestionBank = ReturnType<typeof createQuestionBank>;
