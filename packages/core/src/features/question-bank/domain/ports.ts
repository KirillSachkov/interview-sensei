import type { Question, QuestionRating, Topic, TopicSummary } from "./question.ts";

export interface QuestionFilter {
  readonly text?: string;
  readonly topicId?: string;
  readonly topicIds?: readonly string[];
  readonly hidden?: boolean;
  readonly limit?: number;
}
export interface QuestionRepository {
  readonly seed: (topics: readonly Topic[], questions: readonly Question[]) => Promise<void>;
  readonly topics: (targetId: string) => Promise<readonly TopicSummary[]>;
  readonly search: (targetId: string, filter: QuestionFilter) => Promise<readonly Question[]>;
  readonly rate: (id: string, rating: QuestionRating | null) => Promise<boolean>;
  readonly hide: (id: string, hidden: boolean) => Promise<boolean>;
}
/** Resolves a Section only within the current Target; undefined means it does not belong to it. */
export interface SectionTopics {
  readonly topicIds: (
    targetId: string,
    sectionId: string,
  ) => Promise<readonly string[] | undefined>;
}
