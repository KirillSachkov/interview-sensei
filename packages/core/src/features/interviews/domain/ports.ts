import type {
  AskedQuestion,
  Attempt,
  CandidateAnswer,
  InterviewStatus,
  MockInterview,
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
  readonly level: "junior" | "middle" | "senior" | null;
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
  readonly level: "junior" | "middle" | "senior";
  readonly hidden: boolean;
  readonly rating: "useful" | "irrelevant" | "wrong" | null;
}

/** The question-bank slice supplies the Target's Questions that are not hidden. */
export interface InterviewQuestions {
  readonly search: (
    targetId: string,
    filter: { readonly topicIds: readonly string[] },
  ) => Promise<readonly BankQuestion[]>;
}

/** The agent-sessions slice runs the interviewer's AgentSession. */
export interface InterviewSessions {
  readonly start: (request: {
    kind: "mock-interview";
    agent: string;
    targetId: string;
    roleAddition: string;
  }) => Promise<{ readonly id: string }>;
  /** Sends a template message after the agent's current turn; it stays out of the chat. */
  readonly queuePrompt: (sessionId: string, text: string) => Promise<unknown>;
  /** Keeps the rest of the agent's current turn out of the chat. */
  readonly hideAgentText: (sessionId: string) => Promise<void>;
  /** Stops the agent after its current turn. */
  readonly end: (sessionId: string) => Promise<void>;
}

/** Stores Mock interviews, their asked questions and Attempts in the `interviews` schema. */
export interface InterviewRepository {
  /** `running` when the Target already has a running Mock interview; nothing is stored then. */
  readonly create: (interview: MockInterview) => Promise<"created" | "running">;
  readonly get: (id: string) => Promise<MockInterview | undefined>;
  readonly bySession: (sessionId: string) => Promise<MockInterview | undefined>;
  readonly running: (targetId: string) => Promise<MockInterview | undefined>;
  /** The Target's newest Mock interviews first. */
  readonly latest: (targetId: string, limit: number) => Promise<readonly MockInterview[]>;
  readonly update: (
    id: string,
    changes: {
      readonly status?: InterviewStatus;
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
  readonly attempts: (interviewId: string) => Promise<readonly Attempt[]>;
  /** `exists` when the asked question already has its Attempt; nothing is stored then. */
  readonly record: (attempt: Attempt) => Promise<"recorded" | "exists">;
}
