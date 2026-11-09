import type { Dispute } from "./dispute.ts";
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
} from "./interview.ts";

/** One Section of the Target's Interview plan, with its Topics. */
export interface PlanSection {
  readonly id: string;
  readonly position: number;
  readonly name: string;
  readonly kind: "conversation" | "topics" | "design";
  readonly gradingCriteria: string;
  readonly enabled: boolean;
  readonly topicIds: readonly string[];
  readonly topics: readonly { readonly id: string; readonly name: string }[];
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

/** A Question of the Target's bank, as the question-bank slice gives it. */
export interface BankQuestion {
  readonly id: string;
  readonly topicId: string;
  readonly text: string;
  readonly format: "open" | "quiz";
  readonly options: readonly { readonly id: string; readonly text: string }[];
  readonly correctOptionIds: readonly string[];
  readonly level: Level;
  readonly hidden: boolean;
  readonly rating: "useful" | "irrelevant" | "wrong" | null;
}

/** A Question the agent made up when no candidate fitted: open, with no Source, unconfirmed. */
export interface NewBankQuestion {
  readonly id: string;
  readonly targetId: string;
  readonly topicId: string;
  readonly text: string;
  readonly format: "open";
  readonly options: readonly [];
  readonly correctOptionIds: readonly [];
  readonly level: BankQuestion["level"];
  readonly sourceIds: readonly [];
  readonly unconfirmed: true;
  readonly hidden: false;
  readonly rating: null;
  /** ISO 8601. */
  readonly createdAt: string;
}

/** The question-bank slice supplies the Target's Questions that are not hidden. */
export interface InterviewQuestions {
  readonly search: (
    targetId: string,
    filter: { readonly topicIds: readonly string[] },
  ) => Promise<readonly BankQuestion[]>;
  /** Adds the Question to the Target's bank. */
  readonly add: (question: NewBankQuestion) => Promise<void>;
}

/** The agent-sessions slice runs the interviewer's AgentSession. */
export interface InterviewSessions {
  readonly start: (request: {
    kind: "mock-interview";
    agent: string;
    targetId: string;
    roleAddition: string;
  }) => Promise<{ readonly id: string }>;
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
  /** Stops the agent after its current turn. */
  readonly end: (sessionId: string) => Promise<void>;
  /** Calls the listener after each change of a live session; returns the unsubscribe. */
  readonly subscribe: (
    sessionId: string,
    listener: (view: { readonly status: string }) => void,
  ) => () => void;
  readonly view: (sessionId: string) => Promise<{ readonly status: string } | undefined>;
}

/** The progress slice supplies the Topics «подтянуть в первую очередь» for the brief. */
export interface InterviewProgress {
  readonly focus: (
    targetId: string,
  ) => Promise<readonly { readonly id: string; readonly name: string; readonly status: string }[]>;
}

/** Reads the Target's past Mock interviews for its history, its progress and the brief. */
export interface HistoryRepository {
  /** Every running Mock interview of every Target. */
  readonly allRunning: () => Promise<readonly MockInterview[]>;
  /** One page of the Target's Mock interviews, the newest first, and how many match. */
  readonly historyPage: (
    targetId: string,
    filter: HistoryFilter,
    page: { readonly offset: number; readonly limit: number },
  ) => Promise<{ readonly interviews: readonly MockInterview[]; readonly total: number }>;
  /** The Attempts of the Target's Mock interviews from the earliest to the latest. */
  readonly targetAttempts: (targetId: string) => Promise<readonly AttemptRecord[]>;
  readonly dispute: (dispute: Dispute) => Promise<void>;
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

/** Stores Mock interviews, their asked questions and Attempts in the `interviews` schema. */
export interface InterviewRepository extends HistoryRepository {
  /** `running` when the Target already has a running Mock interview; nothing is stored then. */
  readonly create: (interview: MockInterview) => Promise<"created" | "running">;
  readonly get: (id: string) => Promise<MockInterview | undefined>;
  readonly bySession: (sessionId: string) => Promise<MockInterview | undefined>;
  readonly running: (targetId: string) => Promise<MockInterview | undefined>;
  /** Every Question asked in the Target's Mock interviews, in the order of showing. */
  readonly history: (targetId: string) => Promise<readonly PastQuestion[]>;
  /** The Target's newest Mock interviews first. */
  readonly latest: (targetId: string, limit: number) => Promise<readonly MockInterview[]>;
  readonly update: (
    id: string,
    changes: {
      readonly status?: InterviewStatus;
      readonly currentSectionId?: string;
      readonly finishRequestedAt?: string;
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
  /** `exists` when the asked question already has its Attempt; nothing is stored then. */
  readonly record: (attempt: Attempt) => Promise<"recorded" | "exists">;
}
