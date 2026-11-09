// The Side thread API of the server (#80). Its chat goes over the session's socket, as the
// interviewer chat does.
import { checked, isObject, path } from "./http";

/** A Side thread of a Mock interview, opened at a question card. */
export interface SideThread {
  readonly id: string;
  readonly interviewId: string;
  /** The Side thread's AgentSession: its chat goes over the session's socket. */
  readonly sessionId: string;
  /** The asked question the Side thread discusses. */
  readonly askedQuestionId: string;
  /** The Candidate's question at the opening; null without one. */
  readonly question: string | null;
  /** Whether the Side thread marked the question's Attempt as received with a hint. */
  readonly hinted: boolean;
  readonly createdAt: string;
}

function isSideThread(value: unknown): value is SideThread {
  return (
    isObject(value) &&
    typeof value.id === "string" &&
    typeof value.sessionId === "string" &&
    typeof value.askedQuestionId === "string"
  );
}

/** «Обсудить отдельно» at the card, with the Candidate's question; empty text means none. */
export async function openSideThread(
  interviewId: string,
  { cardId, question }: { cardId: string; question: string },
): Promise<SideThread> {
  const response = await fetch(`/api/interviews/${path(interviewId)}/side-threads`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ origin: { kind: "question", id: cardId }, question }),
  });
  return checked(response, isSideThread);
}
