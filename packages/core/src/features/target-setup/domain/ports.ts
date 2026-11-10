import type { DraftChange } from "./draft.ts";
import type { Importance, Level, SectionKind, Tone } from "./target-values.ts";
import type { DraftPreference } from "./draft-preferences.ts";
import type { QuestionRating } from "./draft-questions.ts";
import type { TopicRename } from "./draft-topics.ts";

/**
 * Stores the draft of changes of each Target, in the order of recording. `Transaction` is the
 * storage's open transaction, opaque to the domain: applying the draft clears it in the same
 * transaction that writes the Target, and a new plan replaces the earlier one in one transaction.
 */
export interface DraftRepository<Transaction> {
  readonly add: (change: DraftChange, transaction?: Transaction) => Promise<void>;
  readonly changes: (
    targetId: string,
    transaction?: Transaction,
  ) => Promise<readonly DraftChange[]>;
  /** Removes the change from the Target's draft; resolves false when the draft has no such change. */
  readonly remove: (
    targetId: string,
    changeId: string,
    transaction?: Transaction,
  ) => Promise<boolean>;
  /** Empties the Target's draft and resolves with the number of removed changes. */
  readonly clear: (targetId: string, transaction?: Transaction) => Promise<number>;
}

/** A Target as target-setup reads it: its fields and its Interview plan with Topic names. */
export interface SetupTarget {
  readonly id: string;
  readonly name: string;
  readonly level: Level | null;
  readonly tone: Tone;
  readonly language: string;
  readonly status: "draft" | "active" | "archived";
  readonly sections: readonly {
    readonly id: string;
    readonly name: string;
    readonly kind: SectionKind;
    readonly gradingCriteria: string;
    readonly enabled: boolean;
    readonly topics: readonly {
      readonly id: string;
      readonly name: string;
      readonly importance: Importance;
    }[];
  }[];
  /** The active Preferences. */
  readonly preferences: readonly DraftPreference[];
}

/** The Target's state after the draft: Sections in order, with their Topics by id. */
export interface TargetUpdate {
  readonly name: string;
  readonly level: Level | null;
  readonly tone: Tone;
  readonly language: string;
  readonly status: SetupTarget["status"];
  readonly sections: readonly {
    readonly id: string;
    readonly position: number;
    readonly name: string;
    readonly kind: SectionKind;
    readonly gradingCriteria: string;
    readonly enabled: boolean;
    readonly topicIds: readonly string[];
  }[];
}

/** The targets slice reads the Target and writes its new state in the given transaction. */
export interface SetupTargets<Transaction> {
  readonly get: (id: string, transaction?: Transaction) => Promise<SetupTarget | undefined>;
  /** Resolves undefined when the Target does not exist. */
  readonly update: (
    id: string,
    change: TargetUpdate,
    transaction?: Transaction,
  ) => Promise<SetupTarget | undefined>;
  /** Adds the Preferences with new ids and stores the others' text, examples and activity. */
  readonly savePreferences: (
    targetId: string,
    preferences: readonly DraftPreference[],
    transaction?: Transaction,
  ) => Promise<void>;
}

/**
 * The question-bank slice gives the Target's Topic of each name, creates the missing ones and
 * stores their importance.
 */
export interface SetupTopics<Transaction> {
  /** One Topic per name, in the order of the names; the same Topic for names that match. */
  readonly ensureTopics: (
    targetId: string,
    names: readonly string[],
    transaction?: Transaction,
  ) => Promise<readonly { readonly id: string; readonly name: string }[]>;
  readonly setImportance: (
    targetId: string,
    change: { readonly topicId: string; readonly importance: Importance },
    transaction?: Transaction,
  ) => Promise<void>;
}

/**
 * A reference answer as question-bank keeps it. One that the Candidate corrected through the draft
 * has the origin «проверен кандидатом» and no Source.
 */
export interface SetupReferenceAnswer {
  readonly points: readonly string[];
  readonly sample: string;
  readonly origin: "material" | "internet" | "agent" | "candidate";
  readonly sourceId: string | null;
  readonly part: number | null;
}

/** A Question as target-setup reads and writes it: its Topic by id. */
export interface SetupQuestion {
  readonly id: string;
  readonly topicId: string;
  readonly text: string;
  readonly format: "open" | "quiz";
  readonly options: readonly { readonly id: string; readonly text: string }[];
  readonly correctOptionIds: readonly string[];
  readonly level: Level;
  readonly hidden: boolean;
  readonly rating: QuestionRating | null;
  /** The interviewer made it up, and the Candidate has not confirmed it. */
  readonly unconfirmed: boolean;
  readonly referenceAnswer: SetupReferenceAnswer | null;
}

/**
 * The new text, Topic, visibility, rating or reference answer of one Question; `unconfirmed:
 * false` confirms a made-up Question.
 */
export interface SetupQuestionEdit {
  readonly id: string;
  readonly text?: string;
  readonly topicId?: string;
  readonly hidden?: boolean;
  readonly rating?: QuestionRating | null;
  readonly referenceAnswer?: SetupReferenceAnswer;
  readonly unconfirmed?: false;
}

/** The question-bank slice reads and writes the Target's Questions and renames its Topics. */
export interface SetupQuestions<Transaction> {
  /** Every Topic of the Target, in the plan or not. */
  readonly topics: (
    targetId: string,
    transaction?: Transaction,
  ) => Promise<readonly { readonly id: string; readonly name: string }[]>;
  /** Every Question of the Target, hidden ones too. */
  readonly questions: (
    targetId: string,
    transaction?: Transaction,
  ) => Promise<readonly SetupQuestion[]>;
  /**
   * Renames the Topic, or merges it into the Topic named `to`; nothing for an unknown Topic.
   * Resolves with the ids of both Topics of a merge, and with null otherwise.
   */
  readonly renameTopic: (
    targetId: string,
    rename: TopicRename,
    transaction?: Transaction,
  ) => Promise<TopicMerge | null>;
  /** Adds the Questions as confirmed: the Candidate applied them. */
  readonly addQuestions: (
    targetId: string,
    questions: readonly (Omit<SetupQuestion, "unconfirmed"> & { readonly createdAt: string })[],
    transaction?: Transaction,
  ) => Promise<void>;
  /** Stores the given fields of each Question. */
  readonly editQuestions: (
    targetId: string,
    edits: readonly SetupQuestionEdit[],
    transaction?: Transaction,
  ) => Promise<void>;
}

/** The Topic `from` merged into the Topic `into`, by ids. */
interface TopicMerge {
  readonly from: string;
  readonly into: string;
}

/**
 * The interviews slice moves the Attempts of a merged Topic to the Topic it merged into, so the
 * Topic status counts them there; in the transaction of the draft's application.
 */
export interface SetupAttempts<Transaction> {
  readonly mergeTopic: (
    targetId: string,
    merge: TopicMerge,
    transaction: Transaction,
  ) => Promise<void>;
}

/** One message of the earlier setup conversation. */
export interface SetupMessage {
  readonly from: "candidate" | "agent";
  readonly text: string;
}

/**
 * The agent-sessions slice gives the messages of the earlier sessions that a Target setup session
 * continues (#85); empty when it continues none.
 */
export type EarlierMessages = (sessionId: string) => Promise<readonly SetupMessage[]>;
