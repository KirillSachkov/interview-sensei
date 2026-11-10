import type { Dispute } from "./dispute.ts";
import type { SideThreadRepository, ThreadMessage } from "./side-thread.ts";
import type { AttemptRecord, HistoryFilter } from "./history.ts";
import type {
  AskedQuestion,
  Attempt,
  CandidateAnswer,
  FollowUp,
  InterviewStatus,
  Level,
  MockInterview,
  PastQuestion,
  PauseReason,
} from "./interview.ts";

export type * from "./bank-ports.ts";

/** How much a Topic matters for the Target: high, normal or low. */
export type TopicImportance = "high" | "normal" | "low";

/** How well the Candidate knows a Topic, from the Attempts of ended Mock interviews. */
export type TopicStatus = "not_started" | "shaky" | "confident";

/** One Section of the Target's Interview plan, with its Topics. */
export interface PlanSection {
  readonly id: string;
  readonly position: number;
  readonly name: string;
  readonly kind: "conversation" | "topics" | "design";
  readonly gradingCriteria: string;
  readonly enabled: boolean;
  readonly topicIds: readonly string[];
  readonly topics: readonly {
    readonly id: string;
    readonly name: string;
    readonly importance: TopicImportance;
  }[];
}

/** What a Mock interview reads of its Target. */
export interface TargetPlan {
  readonly id: string;
  readonly name: string;
  readonly level: Level | null;
  readonly tone: "friendly" | "neutral" | "strict";
  readonly language: string;
  readonly sections: readonly PlanSection[];
  /** The active Preferences. */
  readonly preferences: readonly { readonly text: string }[];
}

/** The targets slice supplies the Target's plan and its agent. */
export interface InterviewTargets {
  /** Undefined for an unknown Target. */
  readonly get: (targetId: string) => Promise<TargetPlan | undefined>;
  /** The Target's agent; null when none is available; undefined for an unknown Target. */
  readonly agent: (targetId: string) => Promise<{ readonly agent: string | null } | undefined>;
}

/** The agent-runtime slice supplies whether an agent is available now and, if not, why. */
export interface InterviewAgents {
  readonly listAgents: () => Promise<
    readonly (
      | { readonly agent: string; readonly available: true }
      | { readonly agent: string; readonly available: false; readonly reason: string }
    )[]
  >;
}

/** The agent-sessions slice runs the interviewer's AgentSession and those of its Side threads. */
export interface InterviewSessions {
  /** Starts the interviewer's AgentSession, or the explaining one of a Side thread. */
  readonly start: (request: {
    kind: "mock-interview" | "side-thread";
    agent: string;
    targetId: string;
    roleAddition: string;
    /**
     * The earlier session that the new one continues, after a pause or a restart; its chat comes
     * first.
     */
    continues?: string;
  }) => Promise<{ readonly id: string }>;
  /**
   * The Candidate's and the agent's messages of the earlier sessions that this one continues, in
   * order; empty when it continues none.
   */
  readonly earlierMessages: (sessionId: string) => Promise<readonly ThreadMessage[]>;
  /**
   * Sends a template message after the agent's current turn; it stays out of the chat. With
   * `showAgentText`, the agent's hidden text goes to the chat again from this message on.
   */
  readonly queuePrompt: (
    sessionId: string,
    text: string,
    options: { readonly showAgentText: boolean },
  ) => Promise<unknown>;
  /** Keeps the agent's text out of the chat until a template message shows it again. */
  readonly hideAgentText: (sessionId: string) => Promise<void>;
  /** Puts the note before the agent's next prompt; the current turn goes on. */
  readonly addNote: (sessionId: string, text: string) => void;
  /** Stops the agent after its current turn. */
  readonly end: (sessionId: string) => Promise<void>;
  /** Stops the agent at once, even in a turn, and ends the session; false when it is not live. */
  readonly stop: (sessionId: string) => Promise<boolean>;
  /** Whether the session is live now: its agent starts, waits for a message or works. */
  readonly isLive: (sessionId: string) => boolean;
  /**
   * Stops the agent at once and deletes the session with the earlier sessions it continues and
   * their journals, for good.
   */
  readonly remove: (sessionId: string) => Promise<void>;
  /** Calls the listener after each change of a live session; returns the unsubscribe. */
  readonly subscribe: (
    sessionId: string,
    listener: (view: { readonly status: string }) => void,
  ) => () => void;
  /**
   * The session's status and chat, with the chat of the sessions it continues first; an agent
   * message of the chat has its `text`.
   */
  readonly view: (sessionId: string) => Promise<
    | {
        readonly status: string;
        readonly entries: readonly {
          readonly id: string;
          readonly type: string;
          readonly text?: string;
        }[];
      }
    | undefined
  >;
}

/**
 * The progress slice supplies the Topics «подтянуть в первую очередь» for the brief, and the Topic
 * status of every Topic of the plan for the question selection.
 */
export interface InterviewProgress {
  readonly focus: (
    targetId: string,
  ) => Promise<readonly { readonly id: string; readonly name: string; readonly status: string }[]>;
  readonly topicStatuses: (
    targetId: string,
  ) => Promise<readonly { readonly id: string; readonly status: TopicStatus }[]>;
}

/**
 * Reads the Target's past Mock interviews for its history, its progress and the brief, and records
 * Disputes. `Transaction` is the storage's open transaction, opaque to the domain.
 */
export interface HistoryRepository<Transaction> {
  /** Every running Mock interview of every Target, not the paused ones. */
  readonly allRunning: () => Promise<readonly MockInterview[]>;
  /** One page of the Target's Mock interviews, the newest first, and how many match. */
  readonly historyPage: (
    targetId: string,
    filter: HistoryFilter,
    page: { readonly offset: number; readonly limit: number },
  ) => Promise<{ readonly interviews: readonly MockInterview[]; readonly total: number }>;
  /** The Attempts of the Target's Mock interviews from the earliest to the latest. */
  readonly targetAttempts: (targetId: string) => Promise<readonly AttemptRecord[]>;
  /** Records the Dispute in the open transaction, which also writes its reference check. */
  readonly dispute: (dispute: Dispute, transaction?: Transaction) => Promise<void>;
  /** The Disputes in the order they were made: of one Mock interview, or of a Target. */
  readonly disputes: (interviewId: string) => Promise<readonly Dispute[]>;
  readonly targetDisputes: (targetId: string) => Promise<readonly Dispute[]>;
}

/**
 * Erases the Mock interviews of a Target with their asked questions, Attempts and Disputes.
 * `Transaction` is the storage's open transaction, opaque to the domain: deleting a Target erases
 * the data of every slice in it.
 */
export interface InterviewErasure<Transaction> {
  readonly eraseTarget: (targetId: string, transaction: Transaction) => Promise<void>;
}

/**
 * Moves the questions asked in the Target's Mock interviews, and so their Attempts, from the Topic
 * `from` to the Topic `into`, when the Target setup merges `from` into `into`. `Transaction` is the
 * storage's open transaction of the draft's application.
 */
export interface InterviewTopicMerge<Transaction> {
  readonly mergeTopic: (
    targetId: string,
    topics: { readonly from: string; readonly into: string },
    transaction: Transaction,
  ) => Promise<void>;
}

/**
 * Which of the Target's Questions have Attempts: the question bank hides such a Question instead
 * of deleting it.
 */
export interface InterviewQuestionAttempts {
  readonly attempted: (
    targetId: string,
    questionIds: readonly string[],
  ) => Promise<readonly string[]>;
}

/**
 * Stores Mock interviews, their asked questions, Attempts and Side threads in the `interviews`
 * schema.
 */
export interface InterviewRepository<Transaction>
  extends HistoryRepository<Transaction>, SideThreadRepository {
  /**
   * `running` when the Target already has a running or paused Mock interview; nothing is stored
   * then.
   */
  readonly create: (interview: MockInterview) => Promise<"created" | "running">;
  readonly get: (id: string) => Promise<MockInterview | undefined>;
  readonly bySession: (sessionId: string) => Promise<MockInterview | undefined>;
  /** The Target's Mock interview that runs or is paused; a Target has at most one. */
  readonly active: (targetId: string) => Promise<MockInterview | undefined>;
  /** Every Question asked in the Target's Mock interviews, in the order of showing. */
  readonly history: (targetId: string) => Promise<readonly PastQuestion[]>;
  /** The Target's newest Mock interviews first. */
  readonly latest: (targetId: string, limit: number) => Promise<readonly MockInterview[]>;
  readonly update: (
    id: string,
    changes: {
      readonly status?: InterviewStatus;
      readonly sessionId?: string;
      readonly agent?: string;
      readonly pausedAt?: string | null;
      readonly pausedMs?: number;
      readonly pauseReason?: PauseReason | null;
      readonly resumedAt?: string;
      readonly currentSectionId?: string;
      readonly finishRequestedAt?: string | null;
      readonly finishedAt?: string;
      readonly summary?: string;
      readonly nextStep?: string;
    },
  ) => Promise<void>;
  /** The asked questions in the order of showing. */
  readonly asked: (interviewId: string) => Promise<readonly AskedQuestion[]>;
  readonly ask: (question: AskedQuestion) => Promise<void>;
  readonly answer: (askedQuestionId: string, answer: CandidateAnswer) => Promise<void>;
  /** Replaces the Follow-ups of the asked question. */
  readonly followUps: (askedQuestionId: string, followUps: readonly FollowUp[]) => Promise<void>;
  readonly attempts: (interviewId: string) => Promise<readonly Attempt[]>;
  /**
   * `exists` when the asked question already has its Attempt; nothing is stored then. In the open
   * transaction when the interviewer's disagreement with the reference answer is written too.
   */
  readonly record: (attempt: Attempt, transaction?: Transaction) => Promise<"recorded" | "exists">;
}
