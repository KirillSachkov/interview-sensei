import type { InboxMode, InboxProposal, InboxReport, InboxRun } from "./inbox.ts";
import type { Source, SourceStatus } from "./source.ts";
import type { TextFormat } from "./source-text.ts";

/**
 * Stores the Sources of each Target in the order they were added. `Transaction` is the storage's
 * open transaction, opaque to the domain: deleting a Target erases the data of every slice in it.
 */
export interface SourceRepository<Transaction> {
  readonly add: (source: Source) => Promise<void>;
  readonly list: (targetId: string, transaction?: Transaction) => Promise<readonly Source[]>;
  /** The Source only when it belongs to the Target. */
  readonly get: (targetId: string, id: string) => Promise<Source | undefined>;
  /** Moves the Target's Sources to the status; `failure` only with `failed`; clears the percent. */
  readonly setStatus: (
    targetId: string,
    change: {
      readonly ids: readonly string[];
      readonly status: SourceStatus;
      readonly failure?: string;
      /** Only the Sources that have this status now. */
      readonly from?: SourceStatus;
    },
    transaction?: Transaction,
  ) => Promise<void>;
  /** Stores the percent of a Source «транскрибируется»; another status keeps none. */
  readonly setProgress: (targetId: string, id: string, progress: number) => Promise<void>;
  /** Stores how many parts the server cut the Source's text into. */
  readonly setParts: (targetId: string, id: string, parts: number) => Promise<void>;
  /** Gives the Target's Source the type, such as a vacancy for an attached file. */
  readonly setType: (targetId: string, id: string, type: Source["type"]) => Promise<void>;
  /** Erases the Target's Sources in the open transaction; their files stay. */
  readonly erase: (targetId: string, transaction: Transaction) => Promise<void>;
}

/** The numbered parts of each Source's text in the data directory, from 1. */
export interface SourceTexts {
  /** Replaces the Source's parts with these. */
  readonly write: (targetId: string, sourceId: string, parts: readonly string[]) => Promise<void>;
  /** Null for a part the Source does not have. */
  readonly read: (targetId: string, sourceId: string, part: number) => Promise<string | null>;
}

/** Reads the text of a Source; rejects with UnreadableSourceError and the reason. */
export interface TextExtractor {
  readonly extract: (source: {
    readonly format: TextFormat;
    /** The absolute path of the Source's file; null for a link. */
    readonly path: string | null;
    readonly url: string | null;
  }) => Promise<string>;
}

/**
 * Stores the proposals, runs and reports of Inbox processing. A Target has at most one running
 * run: `createRun` refuses a second one.
 */
export interface InboxRepository<Transaction> {
  /** Closes the Target's open proposal of the same mode as `dismissed`, then stores the new one. */
  readonly saveProposal: (proposal: InboxProposal) => Promise<void>;
  readonly openProposal: (targetId: string, mode: InboxMode) => Promise<InboxProposal | undefined>;
  /** Closes the Target's open proposal of the mode with the status; false when it has none. */
  readonly closeProposal: (
    targetId: string,
    close: { readonly status: "started" | "dismissed"; readonly mode: InboxMode },
    transaction?: Transaction,
  ) => Promise<boolean>;
  /** Stores the run; `running` when the Target already has a running one, and nothing is stored. */
  readonly createRun: (run: InboxRun, transaction: Transaction) => Promise<"created" | "running">;
  readonly runningRun: (
    targetId: string,
    transaction?: Transaction,
  ) => Promise<InboxRun | undefined>;
  /** Gives the running run its session; false when the run no longer runs. */
  readonly setRunSession: (runId: string, sessionId: string) => Promise<boolean>;
  /** Every running run of every Target. */
  readonly allRunning: () => Promise<readonly InboxRun[]>;
  /** Records that the run's agent read the part of the Source. */
  readonly recordRead: (runId: string, read: { sourceId: string; part: number }) => Promise<void>;
  /** Adds the Questions and the count of duplicates to what the run's agent added. */
  readonly recordAdded: (
    runId: string,
    added: { readonly questionIds: readonly string[]; readonly duplicates: number },
    transaction: Transaction,
  ) => Promise<void>;
  readonly finishRun: (
    runId: string,
    finishedAt: string,
    transaction: Transaction,
  ) => Promise<void>;
  readonly addReport: (report: InboxReport, transaction: Transaction) => Promise<void>;
  /** The Target's report; undefined for another Target's report and an unknown one. */
  readonly report: (targetId: string, id: string) => Promise<InboxReport | undefined>;
  readonly latestReport: (targetId: string) => Promise<InboxReport | undefined>;
  /** The Target's reports, the newest first. */
  readonly reports: (targetId: string) => Promise<readonly InboxReport[]>;
  /** Erases the Target's proposals, runs and reports in the open transaction. */
  readonly erase: (targetId: string, transaction: Transaction) => Promise<void>;
}

type SectionKind = "conversation" | "topics" | "design";

/** A Target as Inbox processing reads it: its fields and its whole Interview plan. */
export interface InboxTarget {
  readonly id: string;
  readonly name: string;
  readonly level: "junior" | "middle" | "senior" | null;
  readonly tone: "friendly" | "neutral" | "strict";
  readonly language: string;
  readonly status: "draft" | "active" | "archived";
  readonly sections: readonly {
    readonly id: string;
    readonly position: number;
    readonly name: string;
    readonly kind: SectionKind;
    readonly gradingCriteria: string;
    readonly enabled: boolean;
    readonly topicIds: readonly string[];
    readonly topics: readonly { readonly id: string; readonly name: string }[];
  }[];
  /** The active Preferences. */
  readonly preferences: readonly { readonly text: string }[];
}

/**
 * The targets slice: a Source belongs to an existing Target; Inbox processing reads its plan and
 * agent, and `create_topic` adds a Topic to a Section of the plan.
 */
export interface SourceTargets<Transaction> {
  /** Resolves undefined for an unknown Target. */
  readonly get: (id: string, transaction?: Transaction) => Promise<InboxTarget | undefined>;
  /** The Target's agent; null when none is available; undefined for an unknown Target. */
  readonly agent: (id: string) => Promise<{ readonly agent: string | null } | undefined>;
  /** Stores the Target's fields, status and whole plan; the Sections keep their ids. */
  readonly update: (
    id: string,
    change: Omit<InboxTarget, "id" | "sections" | "preferences"> & {
      readonly sections: readonly Omit<InboxTarget["sections"][number], "topics">[];
    },
    transaction?: Transaction,
  ) => Promise<unknown>;
}

/** The agent-runtime slice: whether an agent can run now and, if not, why. */
export interface InboxAgents {
  readonly listAgents: () => Promise<
    readonly (
      | { readonly agent: string; readonly available: true }
      | { readonly agent: string; readonly available: false; readonly reason: string }
    )[]
  >;
}

/**
 * The reference answer of a Question as the report shows it: key points, a short sample, where it
 * comes from (`material`, `internet`, `agent` or `candidate`) and the part of the material.
 */
interface InboxReferenceAnswer {
  readonly points: readonly string[];
  readonly sample: string;
  readonly origin: "material" | "internet" | "agent" | "candidate";
  readonly part: number | null;
}

/** A Question of the bank as Inbox processing reads it. */
export interface InboxBankQuestion {
  readonly format: "open" | "quiz";
  readonly id: string;
  readonly topicId: string;
  readonly text: string;
  readonly level: "junior" | "middle" | "senior";
  readonly sectionKind: SectionKind | null;
  readonly hidden: boolean;
  /** «не подтверждён»: an agent made it up without a Source, and the Candidate has not confirmed it. */
  readonly unconfirmed: boolean;
  /** «новый»: the Candidate has not seen it yet. */
  readonly unseen: boolean;
  readonly rating: "useful" | "irrelevant" | "wrong" | null;
  readonly ratingComment: string | null;
  /** The Sources the Question came from; the first one is its material. */
  readonly sourceIds: readonly string[];
  /** The part of the first Source the Question came from, from 1; null when unknown. */
  readonly sourcePart: number | null;
  readonly referenceAnswer: InboxReferenceAnswer | null;
}

/**
 * A Question of Inbox processing, as `add_bank_questions` writes it to the bank: «новый», and
 * unconfirmed when the agent made it up without a Source.
 */
export interface InboxNewQuestion {
  readonly id: string;
  readonly topicId: string;
  readonly text: string;
  readonly format: "open" | "quiz";
  readonly options: readonly { readonly id: string; readonly text: string }[];
  readonly correctOptionIds: readonly string[];
  readonly level: "junior" | "middle" | "senior";
  readonly hidden: false;
  readonly rating: null;
  readonly createdAt: string;
  readonly sourceIds: readonly string[];
  readonly sourcePart: number | null;
  readonly sectionKind: SectionKind;
  readonly unconfirmed: boolean;
  readonly unseen: true;
  readonly referenceAnswer: {
    readonly points: readonly string[];
    readonly sample: string;
    readonly origin: "material";
    readonly sourceId: string;
    /** Null for a web page the server could not read. */
    readonly part: number | null;
  } | null;
}

/** The question-bank slice: the Target's Topics and Questions. */
export interface InboxQuestions<Transaction> {
  readonly topics: (
    targetId: string,
    transaction?: Transaction,
  ) => Promise<readonly { readonly id: string; readonly name: string }[]>;
  /** One Topic per name, the existing one of that name or a new one. */
  readonly ensureTopics: (
    targetId: string,
    names: readonly string[],
    transaction?: Transaction,
  ) => Promise<readonly { readonly id: string; readonly name: string }[]>;
  /** Every Question of the Target, hidden ones too. */
  readonly questions: (
    targetId: string,
    transaction?: Transaction,
  ) => Promise<readonly InboxBankQuestion[]>;
  /** «просмотрено»: the Candidate has seen these Questions of the Target. */
  readonly markSeen: (targetId: string, ids: readonly string[]) => Promise<void>;
  /** Writes only the Reference answer, preserving the Question and its review state. */
  readonly editQuestions: (
    targetId: string,
    edits: readonly {
      readonly id: string;
      readonly referenceAnswer: NonNullable<InboxNewQuestion["referenceAnswer"]>;
    }[],
    transaction: Transaction,
  ) => Promise<void>;
  /** Rejects a Question whose Topic is not the Target's. */
  readonly addQuestions: (
    targetId: string,
    questions: readonly InboxNewQuestion[],
    transaction?: Transaction,
  ) => Promise<void>;
}

/**
 * The rule of duplicates that the Target setup's `add_questions` follows (#45): the same words,
 * ignoring case, spaces and punctuation; the target-setup slice supplies it.
 */
export interface DuplicateFilter {
  readonly withoutDuplicates: <Candidate extends { readonly text: string }>(
    candidates: readonly Candidate[],
    existing: readonly string[],
  ) => { kept: Candidate[]; duplicates: Candidate[] };
}

/** The agent-sessions slice runs the Inbox processing agent. */
export interface InboxSessions {
  readonly start: (request: {
    kind: "inbox-processing";
    agent: string;
    targetId: string;
    opening: string;
  }) => Promise<{ readonly id: string }>;
  /** Stops the agent after its current turn. */
  readonly end: (sessionId: string) => Promise<void>;
  /** Stops the agent at once, even in a turn, and ends the session. */
  readonly stop: (sessionId: string) => Promise<unknown>;
  /** Calls the listener after each change of a live session; returns the unsubscribe. */
  readonly subscribe: (
    sessionId: string,
    listener: (view: { readonly status: string }) => void,
  ) => () => void;
  readonly view: (sessionId: string) => Promise<{ readonly status: string } | undefined>;
}

/** A Question of `add_bank_questions` as the agent gives it. */
export interface MaterialQuestion {
  readonly existingQuestionId?: string | undefined;
  readonly topicId: string;
  readonly text: string;
  readonly format: "open" | "quiz";
  readonly options: readonly { readonly id: string; readonly text: string }[];
  readonly correctOptionIds: readonly string[];
  readonly level: "junior" | "middle" | "senior";
  readonly sectionKind: "conversation" | "topics" | "design";
  /** The material; without it the agent made the Question up, and it is unconfirmed. */
  readonly sourceId?: string | undefined;
  readonly part?: number | undefined;
  readonly referenceAnswer?:
    { readonly points: readonly string[]; readonly sample: string } | null | undefined;
}
