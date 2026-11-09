import type { QuestionFilter, QuestionRepository } from "../domain/ports.ts";
import type { Question, Topic } from "../domain/question.ts";
import { validateQuestion } from "../domain/question.ts";

export function createQuestionBank(repository: QuestionRepository) {
  return {
    seed: async (topics: readonly Topic[], questions: readonly Question[]) => {
      for (const question of questions) {
        validateQuestion(question);
        if (
          !topics.some(
            (topic) => topic.id === question.topicId && topic.targetId === question.targetId,
          )
        ) {
          throw new Error("A Question must reference a Topic of its own Target");
        }
      }
      await repository.seed(topics, questions);
    },
    /** Adds one Question, such as one the interviewer made up, to a Topic of its Target. */
    add: async (question: Question) => {
      validateQuestion(question);
      const topics = await repository.topics(question.targetId);
      if (!topics.some((topic) => topic.id === question.topicId)) {
        throw new Error("A Question must reference a Topic of its own Target");
      }
      await repository.seed([], [question]);
    },
    topics: repository.topics,
    search: async (targetId: string, filter: QuestionFilter = {}) =>
      repository.search(targetId, filter),
    rate: repository.rate,
    hide: repository.hide,
  };
}
export type QuestionBank = ReturnType<typeof createQuestionBank>;
