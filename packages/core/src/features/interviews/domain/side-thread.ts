// The Side thread (#7, #80): a separate AgentSession with the Mock interview's agent that explains.
// It starts from a Handoff brief (handoff-brief.ts) and never changes Attempts or Grades.
import type { AskedQuestion, Attempt, MockInterview } from "./interview.ts";
import { presentedQuestion } from "./interview.ts";

/**
 * Where the Candidate opened the Side thread. Only the question card opens one so far; an agent
 * message and a Debrief are the other points of spec #80.
 */
export interface SideThreadOrigin {
  readonly kind: "question";
  /** The asked question of the card. */
  readonly id: string;
}

export interface SideThread {
  readonly id: string;
  readonly interviewId: string;
  /** The AgentSession of the kind `side-thread`. */
  readonly sessionId: string;
  readonly origin: SideThreadOrigin;
  /** The asked question the Side thread discusses. */
  readonly askedQuestionId: string;
  /** The text the Candidate selected; null without a selection. */
  readonly fragment: string | null;
  /** The Candidate's question at the opening; null without one. */
  readonly question: string | null;
  /** Whether this Side thread marked the question's Attempt as received with a hint. */
  readonly hinted: boolean;
  /** ISO 8601. */
  readonly createdAt: string;
}

/**
 * Whether a Side thread opened now on the asked question gives a hint: the question is the
 * presented one of a running Mock interview and waits for the Candidate's answer. After the answer,
 * during Follow-ups, once the Candidate finishes and for an earlier question there is no hint.
 */
export function givesHint(
  interview: MockInterview,
  { asked, attempts }: { asked: readonly AskedQuestion[]; attempts: readonly Attempt[] },
  askedQuestionId: string,
): boolean {
  const presented = presentedQuestion(asked, attempts);
  return (
    interview.status === "running" &&
    interview.finishRequestedAt === null &&
    presented?.id === askedQuestionId &&
    presented.answer === null
  );
}
