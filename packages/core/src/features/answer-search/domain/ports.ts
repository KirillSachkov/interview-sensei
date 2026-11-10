import type { AnswerReport, AnswerRun, SavedAnswer } from "./answer-run.ts";
import type { ReferenceOrigin } from "./answer-search.ts";

/**
 * Stores the runs and reports of answer search. A Target has at most one run that waits or runs:
 * `createRun` refuses a second one. `Transaction` is the storage's open transaction, opaque to the
 * domain.
 */
export interface AnswerRepository<Transaction> {
  /** Stores the run; `active` when the Target already has one that waits or runs. */
  readonly createRun: (run: AnswerRun, transaction: Transaction) => Promise<"created" | "active">;
  /** The Target's run that waits or runs. */
  readonly activeRun: (
    targetId: string,
    transaction?: Transaction,
  ) => Promise<AnswerRun | undefined>;
  /** Every run that waits or runs, of every Target. */
  readonly allActive: () => Promise<readonly AnswerRun[]>;
  /** Moves a waiting run to `running` with its queue; false when it no longer waits. */
  readonly begin: (runId: string, queueIds: readonly string[]) => Promise<boolean>;
  /** Gives the running run its session; false when the run no longer runs. */
  readonly setSession: (runId: string, sessionId: string) => Promise<boolean>;
  readonly setHanded: (runId: string, handedIds: readonly string[]) => Promise<void>;
  readonly setSaved: (
    runId: string,
    saved: readonly SavedAnswer[],
    transaction: Transaction,
  ) => Promise<void>;
  readonly finishRun: (
    runId: string,
    finishedAt: string,
    transaction: Transaction,
  ) => Promise<void>;
  readonly addReport: (report: AnswerReport, transaction: Transaction) => Promise<void>;
  /** The Target's report; undefined for another Target's report and an unknown one. */
  readonly report: (targetId: string, id: string) => Promise<AnswerReport | undefined>;
  readonly latestReport: (targetId: string) => Promise<AnswerReport | undefined>;
  /** Erases the Target's runs and reports in the open transaction. */
  readonly erase: (targetId: string, transaction: Transaction) => Promise<void>;
}

type SectionKind = "conversation" | "topics" | "design";

/** A Target as answer search reads it: its name, language and the Topics of its Sections. */
interface AnswerTarget {
  readonly id: string;
  readonly name: string;
  readonly language: string;
  readonly status: "draft" | "active" | "archived";
  readonly sections: readonly {
    readonly kind: SectionKind;
    readonly topicIds: readonly string[];
  }[];
}

/** The targets slice: the Target and its agent. */
export interface AnswerTargets {
  /** Resolves undefined for an unknown Target. */
  readonly get: (id: string) => Promise<AnswerTarget | undefined>;
  /** The Target's agent; null when none is available; undefined for an unknown Target. */
  readonly agent: (id: string) => Promise<{ readonly agent: string | null } | undefined>;
}

/** The agent-runtime slice: whether an agent can run now and, if not, why. */
export interface AnswerAgents {
  readonly listAgents: () => Promise<
    readonly (
      | { readonly agent: string; readonly available: true }
      | { readonly agent: string; readonly available: false; readonly reason: string }
    )[]
  >;
}

/** The reference answer of a Question as the question bank stores it. */
interface StoredReferenceAnswer {
  readonly points: readonly string[];
  readonly sample: string;
  readonly origin: ReferenceOrigin;
  readonly sourceId: string | null;
  readonly part: number | null;
  readonly links?: readonly string[];
}

/** A Question of the bank as answer search reads it. */
export interface AnswerBankQuestion {
  readonly id: string;
  readonly topicId: string;
  readonly text: string;
  readonly level: "junior" | "middle" | "senior";
  readonly sectionKind: SectionKind | null;
  readonly hidden: boolean;
  readonly createdAt: string;
  readonly referenceAnswer: StoredReferenceAnswer | null;
}

/** The question-bank slice: the Target's Topics and Questions, and their reference answers. */
export interface AnswerQuestions<Transaction> {
  readonly topics: (
    targetId: string,
  ) => Promise<readonly { readonly id: string; readonly name: string }[]>;
  /** Every Question of the Target, hidden ones too, in the order of creation. */
  readonly questions: (
    targetId: string,
    transaction?: Transaction,
  ) => Promise<readonly AnswerBankQuestion[]>;
  readonly editQuestions: (
    targetId: string,
    edits: readonly { readonly id: string; readonly referenceAnswer: StoredReferenceAnswer }[],
    transaction?: Transaction,
  ) => Promise<void>;
}

/** The interviews slice: which of the Target's Questions were asked in a Mock interview. */
export interface AnswerAttempts {
  readonly attempted: (
    targetId: string,
    questionIds: readonly string[],
  ) => Promise<readonly string[]>;
}

/** The progress slice: the Topic status of each Topic of the Target's plan. */
export interface AnswerProgress {
  readonly target: (targetId: string) => Promise<
    | {
        readonly topics: readonly {
          readonly id: string;
          readonly status: "not_started" | "shaky" | "confident";
        }[];
      }
    | undefined
  >;
}

/** The sources slice: whether the Target's Inbox processing, a Recheck included, runs now. */
export interface AnswerInbox {
  readonly running: (targetId: string) => Promise<boolean>;
}

/** The agent-sessions slice runs the answer search agent. */
export interface AnswerSessions {
  readonly start: (request: {
    kind: "answer-search";
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
  /** The tokens and cost of the agent's latest ACP usage_update; null without one. */
  readonly usage: (sessionId: string) => Promise<{
    readonly tokens: number;
    readonly cost: { readonly amount: number; readonly currency: string } | null;
  } | null>;
}
