import type {
  Question,
  QuestionRating,
  ReferenceAnswer,
  StoredQuestion,
  Topic,
  TopicSummary,
} from "./question.ts";

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
  readonly seed: (topics: readonly Topic[], questions: readonly StoredQuestion[]) => Promise<void>;
  readonly addTopics: (topics: readonly Topic[], transaction?: Transaction) => Promise<void>;
  readonly topics: (
    targetId: string,
    transaction?: Transaction,
  ) => Promise<readonly TopicSummary[]>;
  readonly search: (targetId: string, filter: QuestionFilter) => Promise<readonly Question[]>;
  /** Rates the Question and drops its comment; the rating useful also confirms it. */
  readonly rate: (id: string, rating: QuestionRating | null) => Promise<boolean>;
  /** Deletes and edits the Target's Questions of the plan in one transaction. */
  readonly review: (targetId: string, plan: ReviewPlan) => Promise<void>;
  /** The Candidate has seen these Questions of the Target: they are no longer «новый». */
  readonly markSeen: (targetId: string, ids: readonly string[]) => Promise<void>;
  readonly hide: (id: string, hidden: boolean) => Promise<boolean>;
  /** Erases the Target's Topics and Questions in the open transaction. */
  readonly erase: (targetId: string, transaction: Transaction) => Promise<void>;
  /** Every Question of the Target, hidden ones too, in the order of creation. */
  readonly questions: (targetId: string, transaction?: Transaction) => Promise<readonly Question[]>;
  readonly addQuestions: (
    questions: readonly StoredQuestion[],
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
/**
 * The new text, Topic, visibility or rating of one Question; `unconfirmed: false` confirms a
 * Question that the interviewer made up.
 */
export interface QuestionEdit {
  readonly id: string;
  readonly text?: string;
  readonly topicId?: string;
  readonly hidden?: boolean;
  readonly rating?: QuestionRating | null;
  /** The Candidate's comment to ⚠, the rating «ошибка». */
  readonly ratingComment?: string | null;
  readonly unconfirmed?: false;
  /** The Candidate has seen the new Question. */
  readonly unseen?: false;
  /** A new reference answer, such as one that answer search found. */
  readonly referenceAnswer?: ReferenceAnswer;
}
/** The Questions to delete for good and the edits of the others. */
export interface ReviewPlan {
  readonly deleted: readonly string[];
  readonly edits: readonly QuestionEdit[];
}
/** Resolves a Section only within the current Target; undefined means it does not belong to it. */
export interface SectionTopics {
  readonly topicIds: (
    targetId: string,
    sectionId: string,
  ) => Promise<readonly string[] | undefined>;
}

/**
 * The interviews slice: which of the Target's Questions have Attempts. Deleting such a Question
 * hides it instead, so its history stays.
 */
export interface QuestionAttempts {
  readonly attempted: (
    targetId: string,
    questionIds: readonly string[],
  ) => Promise<readonly string[]>;
}
