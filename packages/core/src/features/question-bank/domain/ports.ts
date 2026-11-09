import type { Question, QuestionRating, Topic, TopicSummary } from "./question.ts";

export interface QuestionFilter {
  readonly text?: string;
  readonly topicId?: string;
  readonly topicIds?: readonly string[];
  readonly hidden?: boolean;
  readonly limit?: number;
}
/**
 * `Transaction` is the storage's open transaction, opaque to the domain: a write joins it when the
 * server applies the changes of several slices at once.
 */
export interface QuestionRepository<Transaction> {
  readonly seed: (topics: readonly Topic[], questions: readonly Question[]) => Promise<void>;
  readonly addTopics: (topics: readonly Topic[], transaction?: Transaction) => Promise<void>;
  readonly topics: (
    targetId: string,
    transaction?: Transaction,
  ) => Promise<readonly TopicSummary[]>;
  readonly search: (targetId: string, filter: QuestionFilter) => Promise<readonly Question[]>;
  readonly rate: (id: string, rating: QuestionRating | null) => Promise<boolean>;
  readonly hide: (id: string, hidden: boolean) => Promise<boolean>;
  /** Every Question of the Target, hidden ones too, in the order of creation. */
  readonly questions: (targetId: string, transaction?: Transaction) => Promise<readonly Question[]>;
  readonly addQuestions: (
    questions: readonly Question[],
    transaction?: Transaction,
  ) => Promise<void>;
  /** Stores the given fields of the Target's Question. */
  readonly editQuestion: (
    targetId: string,
    edit: QuestionEdit,
    transaction?: Transaction,
  ) => Promise<void>;
  readonly renameTopic: (topicId: string, name: string, transaction?: Transaction) => Promise<void>;
  /** Moves the Questions of the Topic `from` to the Topic `into`, then deletes `from`. */
  readonly mergeTopic: (from: string, into: string, transaction?: Transaction) => Promise<void>;
}
/** The new text, Topic, visibility or rating of one Question. */
export interface QuestionEdit {
  readonly id: string;
  readonly text?: string;
  readonly topicId?: string;
  readonly hidden?: boolean;
  readonly rating?: QuestionRating | null;
}
/** Resolves a Section only within the current Target; undefined means it does not belong to it. */
export interface SectionTopics {
  readonly topicIds: (
    targetId: string,
    sectionId: string,
  ) => Promise<readonly string[] | undefined>;
}
