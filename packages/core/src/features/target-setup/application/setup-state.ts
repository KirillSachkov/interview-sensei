// The Target's state as the draft of changes starts from: its fields, Interview plan, Topics,
// active Preferences and Questions, read in the transaction when there is one.
import type { Transaction } from "../../../shared/storage/index.ts";
import type { SetupState } from "../domain/draft.ts";
import type {
  SetupQuestion,
  SetupQuestions,
  SetupTarget,
  SetupTargets,
  SetupTopics,
} from "../domain/ports.ts";

export interface StateSources {
  readonly targets: SetupTargets<Transaction>;
  readonly topics: SetupTopics<Transaction> & SetupQuestions<Transaction>;
}

function stateOf(
  target: SetupTarget,
  topics: readonly { readonly id: string; readonly name: string }[],
  questions: readonly SetupQuestion[],
): SetupState {
  const topicNames = new Map(topics.map((topic) => [topic.id, topic.name]));
  return {
    name: target.name,
    level: target.level,
    tone: target.tone,
    language: target.language,
    status: target.status,
    sections: target.sections.map(({ topics: sectionTopics, ...section }) => ({
      ...section,
      topics: sectionTopics.map((topic) => topic.name),
    })),
    topics: topics.map((topic) => topic.name),
    topicRenames: [],
    preferences: target.preferences.map(({ id, text, rejectedQuestionIds, active }) => ({
      id,
      text,
      rejectedQuestionIds,
      active,
    })),
    questions: questions.map((question) => ({
      id: question.id,
      topic: topicNames.get(question.topicId) ?? "",
      text: question.text,
      format: question.format,
      options: question.options,
      correctOptionIds: question.correctOptionIds,
      level: question.level,
      hidden: question.hidden,
      rating: question.rating,
    })),
    missing: [],
  };
}

/** The Target's current state and its Questions as stored; null for an unknown Target. */
export async function currentState(
  { targets, topics }: StateSources,
  targetId: string,
  transaction?: Transaction,
) {
  const target = await targets.get(targetId, transaction);
  if (target === undefined) {
    return null;
  }
  const [targetTopics, questions] = await Promise.all([
    topics.topics(targetId, transaction),
    topics.questions(targetId, transaction),
  ]);
  return { state: stateOf(target, targetTopics, questions), questions };
}
