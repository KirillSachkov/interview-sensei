// The Side thread (#7, #80): a separate AgentSession with the Mock interview's agent that explains.
// It starts from a Handoff brief (handoff-brief.ts) and never changes Attempts or Grades.
import type { AskedQuestion, Attempt, MockInterview } from "./interview.ts";
import { isActive, presentedQuestion } from "./interview.ts";

/**
 * Where the Candidate opened the Side thread (#80):
 * - `question`: the card; `id` is its asked question.
 * - `message`: an interviewer message; `id` is its entry of the chat, such as `agent-12`. The
 *   thread discusses the question that was shown when the message came (`questionAtMessage`).
 * - `debrief`: the Debrief of an Attempt; `id` is the Attempt.
 */
export interface SideThreadOrigin {
  readonly kind: "question" | "message" | "debrief";
  readonly id: string;
}

/** One message of the Side thread's chat before its continuation. */
export interface ThreadMessage {
  readonly from: "candidate" | "agent";
  readonly text: string;
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
  /**
   * When the server closed the Side thread for good (#80): its agent waited for a message when the
   * Mock interview finished, or its Target went to the archive. A closed Side thread stays readable
   * and takes no more messages, so it does not go on; null for one that may.
   */
  readonly closedAt: string | null;
}

/**
 * Whether a Side thread opened now on the asked question gives a hint: the question is the
 * presented one of a running or paused Mock interview and waits for the Candidate's answer: after a
 * pause the Candidate answers it. After the answer,
 * during Follow-ups, once the Candidate finishes and for an earlier question there is no hint.
 */
export function givesHint(
  interview: MockInterview,
  { asked, attempts }: { asked: readonly AskedQuestion[]; attempts: readonly Attempt[] },
  askedQuestionId: string,
): boolean {
  const presented = presentedQuestion(asked, attempts);
  return (
    isActive(interview.status) &&
    interview.finishRequestedAt === null &&
    presented?.id === askedQuestionId &&
    presented.answer === null
  );
}

/**
 * The question shown when the interviewer's chat message at the index came: the last one shown
 * before it; undefined for a message from before the first question. A question from before Side
 * threads has no chat position and counts as shown at the chat's start.
 */
export function questionAtMessage<Question extends Pick<AskedQuestion, "chatPosition">>(
  asked: readonly Question[],
  index: number,
): Question | undefined {
  return asked.findLast((question) => (question.chatPosition ?? 0) <= index);
}

/** Stores the Side threads of Mock interviews. */
export interface SideThreadRepository {
  readonly createSideThread: (thread: SideThread) => Promise<void>;
  /** The Mock interview's Side threads in the order they were opened. */
  readonly sideThreads: (interviewId: string) => Promise<readonly SideThread[]>;
  readonly sideThreadBySession: (sessionId: string) => Promise<SideThread | undefined>;
  /** Moves the Side thread to the new AgentSession that continues its earlier one. */
  readonly continueSideThread: (id: string, sessionId: string) => Promise<void>;
  /** Closes the Side threads for good at the moment; a closed one keeps its first moment. */
  readonly closeSideThreads: (ids: readonly string[], at: string) => Promise<void>;
  /** Closes every Side thread of the Target's Mock interviews, as closeSideThreads. */
  readonly closeTargetSideThreads: (targetId: string, at: string) => Promise<void>;
  /** Marks the asked question: its Attempt is recorded as received with a hint. */
  readonly markHinted: (askedQuestionId: string) => Promise<void>;
  /** Marks the asked question: the Candidate opened the Debrief of its Attempt. */
  readonly markDebriefOpened: (askedQuestionId: string) => Promise<void>;
  /** Deletes the Side thread's row; the hint mark of its asked question stays. */
  readonly deleteSideThread: (id: string) => Promise<void>;
}
