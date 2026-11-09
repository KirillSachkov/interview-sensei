// The Side thread API of the server (#80). Its chat goes over the session's socket, as the
// interviewer chat does.
import { checked, isObject, path, sent } from "./http";

/**
 * Where the Side thread opened: a question card (`id` of its asked question), an interviewer
 * message (`id` of its chat entry) or a Debrief (`id` of the Attempt).
 */
export interface SideThreadOrigin {
  readonly kind: "question" | "message" | "debrief";
  readonly id: string;
}

/** A Side thread of a Mock interview. */
export interface SideThread {
  readonly id: string;
  readonly interviewId: string;
  /** The Side thread's AgentSession: its chat goes over the session's socket. */
  readonly sessionId: string;
  readonly origin: SideThreadOrigin;
  /** The asked question the Side thread discusses. */
  readonly askedQuestionId: string;
  /** The text the Candidate selected; null without a selection. */
  readonly fragment: string | null;
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

/** What «Обсудить отдельно» sends; the server trims the texts and takes an empty one as none. */
export interface SideThreadOpening {
  readonly origin: SideThreadOrigin;
  /** The text the Candidate selected; null without a selection. */
  readonly fragment: string | null;
  /** The Candidate's question; null without one. */
  readonly question: string | null;
}

/** «Обсудить отдельно» at the origin, with the selected fragment and the Candidate's question. */
export async function openSideThread(
  interviewId: string,
  { origin, fragment, question }: SideThreadOpening,
): Promise<SideThread> {
  const response = await fetch(`/api/interviews/${path(interviewId)}/side-threads`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      origin,
      ...(fragment === null ? {} : { fragment }),
      ...(question === null ? {} : { question }),
    }),
  });
  return checked(response, isSideThread);
}

/** ✕: deletes the Side thread with its chat for good; the hint mark stays. */
export async function deleteSideThread({ interviewId, id }: SideThread): Promise<void> {
  const response = await fetch(`/api/interviews/${path(interviewId)}/side-threads/${path(id)}`, {
    method: "DELETE",
  });
  await sent(response);
}

/**
 * «Продолжить» in a Side thread whose agent is gone, such as after a restart (#85): a new session
 * continues its chat; resolves with the Side thread and its new `sessionId`.
 */
export async function continueSideThread({ interviewId, id }: SideThread): Promise<SideThread> {
  const response = await fetch(
    `/api/interviews/${path(interviewId)}/side-threads/${path(id)}/continue`,
    { method: "POST" },
  );
  return checked(response, isSideThread);
}
