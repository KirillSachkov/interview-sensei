// The Mock interview and its Attempts (#9). An Attempt is never changed after it is recorded.

/** `running` until the agent finishes it; `interrupted` when its agent is gone first. */
export type InterviewStatus = "running" | "finished" | "interrupted";

/** How the Candidate shifts the level of the questions against the Target's level. */
export type Difficulty = "easier" | "as_is" | "harder";

export type Grade = 0 | 1 | 2 | 3;

export interface MockInterview {
  readonly id: string;
  readonly targetId: string;
  /** The AgentSession of the kind `mock-interview` whose agent is the interviewer. */
  readonly sessionId: string;
  readonly agent: string;
  readonly status: InterviewStatus;
  /** The Sections the Candidate selected, in the plan's order. */
  readonly sectionIds: readonly string[];
  readonly currentSectionId: string | null;
  /** Null without a limit. */
  readonly limitMinutes: number | null;
  readonly difficulty: Difficulty;
  /** ISO 8601. */
  readonly startedAt: string;
  /** When the Candidate pressed «Завершить»; null before. */
  readonly finishRequestedAt: string | null;
  readonly finishedAt: string | null;
  /** The agent's summary and next step from `finish_interview`. */
  readonly summary: string | null;
  readonly nextStep: string | null;
}

interface QuizOption {
  readonly id: string;
  readonly text: string;
}

/** The Candidate's answer as the server recorded it; the agent never writes it. */
export interface CandidateAnswer {
  /** The free text; null for a quiz or a skipped question. */
  readonly text: string | null;
  /** The chosen quiz options; empty for an open question. */
  readonly optionIds: readonly string[];
  /** «Не знаю»: the Candidate skipped the question. */
  readonly skipped: boolean;
  readonly answeredAt: string;
}

/** A clarification of the current answer; it belongs to the same Attempt. */
export interface FollowUp {
  readonly question: string;
  readonly answer: string | null;
  readonly askedAt: string;
}

/**
 * A Question the agent showed in this Mock interview, with a copy of its text and options as
 * shown. While it has no Attempt it is the presented question, and no other question can be shown.
 */
export interface AskedQuestion {
  readonly id: string;
  readonly interviewId: string;
  /** The order of showing, from 0. */
  readonly position: number;
  readonly questionId: string;
  readonly topicId: string;
  readonly sectionId: string;
  readonly text: string;
  readonly format: "open" | "quiz";
  readonly options: readonly QuizOption[];
  /** Kept for the quiz grade; never sent to the browser. */
  readonly correctOptionIds: readonly string[];
  /** The Attempt this Deeper question goes deeper from; null otherwise. */
  readonly parentAttemptId: string | null;
  readonly presentedAt: string;
  readonly answer: CandidateAnswer | null;
  readonly followUps: readonly FollowUp[];
}

/** The judgment of one answer: from the agent, or from the quiz rule. */
export interface Judgment {
  readonly grade: Grade;
  readonly gaps: string;
  readonly justification: string;
  /** An outline of a strong answer. */
  readonly strongAnswer: string;
}

/** The record of one answer to one asked question, with its judgment. */
export interface Attempt extends Judgment {
  readonly id: string;
  readonly interviewId: string;
  readonly askedQuestionId: string;
  readonly gradedBy: "agent" | "quiz";
  /** Whether the Candidate got a hint before answering; slice 4 sets it. */
  readonly hinted: boolean;
  readonly recordedAt: string;
}

/** The asked question that waits for its Attempt: the last one, while it has none. */
export function presentedQuestion(
  asked: readonly AskedQuestion[],
  attempts: readonly Attempt[],
): AskedQuestion | undefined {
  const last = asked.at(-1);
  return last !== undefined && !attempts.some((attempt) => attempt.askedQuestionId === last.id)
    ? last
    : undefined;
}
