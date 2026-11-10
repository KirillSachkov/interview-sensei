// The Mock interview and its Attempts (#9). An Attempt is never changed after it is recorded.

/**
 * `running` until the Candidate finishes it; `paused` while it waits for «Продолжить» after
 * «Пауза», a crash of its agent or a server restart (#84). `interrupted` is only for Mock interviews
 * that ended before pauses existed: a new one never gets it.
 */
export type InterviewStatus = "running" | "paused" | "finished" | "interrupted";

/** Whether the Mock interview has not ended yet: it runs or waits on a pause. */
export function isActive(status: InterviewStatus): boolean {
  return status === "running" || status === "paused";
}

/** Why a Mock interview is paused: «Пауза», a crash of its agent, or a server stop. */
export type PauseReason = "candidate" | "agent_failed" | "server_stopped";

/** How the Candidate shifts the level of the questions against the Target's level. */
export type Difficulty = "easier" | "as_is" | "harder";

/** The Grades of an Attempt, from no answer to a complete one. */
export const grades = [0, 1, 2, 3] as const;
export type Grade = (typeof grades)[number];

/** The levels of a Target and of its Questions, from the lowest. */
export const levels = ["junior", "middle", "senior"] as const;
export type Level = (typeof levels)[number];

/**
 * Who graded an Attempt: the agent, the app by the quiz rule, or the app for «Не знаю», which
 * gives 0.
 */
export type GradedBy = "agent" | "quiz" | "skip";

export interface MockInterview {
  readonly id: string;
  readonly targetId: string;
  /**
   * The current AgentSession of the kind `mock-interview` whose agent is the interviewer. Each
   * continuation after a pause starts a new one that continues the previous one.
   */
  readonly sessionId: string;
  /** The interviewer's agent; a continuation with the Target's agent changes it. */
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
  /** When the current pause began; null while it runs. */
  readonly pausedAt: string | null;
  /** The time of the earlier pauses in milliseconds: the time limit counts only the running time. */
  readonly pausedMs: number;
  /** Why it is paused; null while it runs. */
  readonly pauseReason: PauseReason | null;
  /** When the last continuation after a pause began; null for a Mock interview never paused. */
  readonly resumedAt: string | null;
  /** When the Candidate pressed «Завершить»; null before. */
  readonly finishRequestedAt: string | null;
  readonly finishedAt: string | null;
  /** The agent's summary and next step from `finish_interview`. */
  readonly summary: string | null;
  readonly nextStep: string | null;
}

/**
 * What a good answer to a Question contains: 3–5 key points and a short sample answer, with where
 * it comes from: «из материала», «из интернета», «из знаний агента» or «проверен кандидатом».
 */
export interface ReferenceAnswer {
  readonly points: readonly string[];
  readonly sample: string;
  readonly origin: "material" | "internet" | "agent" | "candidate";
}

/** How the Attempt's answer covered each key point of the reference answer. */
export interface ReferencePoint {
  readonly text: string;
  readonly covered: boolean;
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
  /**
   * The Question's reference answer as it was when shown, for the interviewer's judgment; null
   * without one. Never sent to the browser before the Debrief.
   */
  readonly referenceAnswer: ReferenceAnswer | null;
  /** The Attempt this Deeper question goes deeper from; null otherwise. */
  readonly parentAttemptId: string | null;
  readonly presentedAt: string;
  readonly answer: CandidateAnswer | null;
  readonly followUps: readonly FollowUp[];
  /**
   * A Side thread was opened on it before the Candidate's answer: its Attempt is recorded as
   * received with a hint, even after that Side thread is deleted.
   */
  readonly hinted: boolean;
  /**
   * The Candidate opened the Debrief of its Attempt: from then on the Handoff brief of a Side thread
   * on it holds the Grade, gaps, justification and strong answer.
   */
  readonly debriefOpened: boolean;
  /**
   * How many entries the interviewer chat had when the question was shown: its messages before
   * that came while an earlier question was shown. Null for questions shown before Side threads.
   */
  readonly chatPosition: number | null;
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
  readonly gradedBy: GradedBy;
  /** Whether the Candidate got a hint before answering: a Side thread opened before the answer. */
  readonly hinted: boolean;
  /**
   * The key points of the reference answer, each with whether the answer covered it: none for
   * «Не знаю». Null when the Question had no reference answer, and for a quiz.
   */
  readonly referencePoints: readonly ReferencePoint[] | null;
  /** Why the interviewer disagrees with the reference answer; null when it agrees. */
  readonly referenceDisagreement: string | null;
  readonly recordedAt: string;
}

/** A Question asked in one of the Target's Mock interviews, for the selection rules. */
export interface PastQuestion {
  readonly interviewId: string;
  readonly questionId: string;
  readonly topicId: string;
  /** ISO 8601. */
  readonly presentedAt: string;
  /** The Grade of its Attempt after the latest Dispute; null without an Attempt. */
  readonly grade: Grade | null;
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
