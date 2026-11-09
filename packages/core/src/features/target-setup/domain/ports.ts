import type { DraftChange } from "./draft.ts";
import type { Level, SectionKind, Tone } from "./target-values.ts";
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
    readonly topics: readonly { readonly id: string; readonly name: string }[];
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

/** The question-bank slice gives the Target's Topic of each name and creates the missing ones. */
export interface SetupTopics<Transaction> {
  /** One Topic per name, in the order of the names; the same Topic for names that match. */
  readonly ensureTopics: (
    targetId: string,
    names: readonly string[],
    transaction?: Transaction,
  ) => Promise<readonly { readonly id: string; readonly name: string }[]>;
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
}

/** The new text, Topic, visibility or rating of one Question. */
export interface SetupQuestionEdit {
  readonly id: string;
  readonly text?: string;
  readonly topicId?: string;
  readonly hidden?: boolean;
  readonly rating?: QuestionRating | null;
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
  readonly addQuestions: (
    targetId: string,
    questions: readonly (SetupQuestion & { readonly createdAt: string })[],
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
export interface TopicMerge {
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
