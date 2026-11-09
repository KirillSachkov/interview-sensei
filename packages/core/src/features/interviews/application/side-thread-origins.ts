// Where a Side thread opens (#80): the asked question it discusses and its fragment, from the
// origin that «Обсудить отдельно» names: a question card, an interviewer message or a Debrief.
import type { AskedQuestion, MockInterview } from "../domain/interview.ts";
import type { SideThreadOrigin } from "../domain/side-thread.ts";
import type { InterviewsDependencies } from "./context.ts";

/** What the origin opens on: the asked question, the fragment, and whether it opens a Debrief. */
export interface OriginPlace {
  readonly question: AskedQuestion;
  readonly fragment: string | null;
  /** Opened from the Debrief: the Candidate has it open. */
  readonly fromDebrief: boolean;
}

export interface OriginRefusal {
  readonly type: "question_not_found" | "message_not_found" | "attempt_not_found";
}

/** The interviewer's chat message with the id; undefined when the chat has none. */
async function interviewerMessage(
  { sessions }: InterviewsDependencies,
  interview: MockInterview,
  id: string,
): Promise<string | undefined> {
  const chat = await sessions.view(interview.sessionId);
  const entry = chat?.entries.find((line) => line.id === id && line.type === "agent_message");
  return entry?.text;
}

/** The Debrief's place: the asked question of the Attempt. */
async function debriefPlace(
  { repository }: InterviewsDependencies,
  interview: MockInterview,
  {
    asked,
    attemptId,
    fragment,
  }: { asked: readonly AskedQuestion[]; attemptId: string; fragment: string | null },
): Promise<OriginPlace | OriginRefusal> {
  const attempts = await repository.attempts(interview.id);
  const attempt = attempts.find((entry) => entry.id === attemptId);
  const question = asked.find((entry) => entry.id === attempt?.askedQuestionId);
  return question === undefined
    ? { type: "attempt_not_found" }
    : { question, fragment, fromDebrief: true };
}

/** The message's place: the last asked question; the whole message without a selection. */
async function messagePlace(
  dependencies: InterviewsDependencies,
  interview: MockInterview,
  {
    asked,
    messageId,
    fragment,
  }: { asked: readonly AskedQuestion[]; messageId: string; fragment: string | null },
): Promise<OriginPlace | OriginRefusal> {
  const text = await interviewerMessage(dependencies, interview, messageId);
  const question = asked.at(-1);
  if (text === undefined) {
    return { type: "message_not_found" };
  }
  return question === undefined
    ? { type: "question_not_found" }
    : { question, fragment: fragment ?? text, fromDebrief: false };
}

/**
 * The place of the origin in the Mock interview. The selected fragment goes as given; a message
 * without a selection gives its whole text. A message opens on the last asked question, which the
 * interviewer's chat stands beside.
 */
export async function placeOf(
  dependencies: InterviewsDependencies,
  interview: MockInterview,
  { origin, fragment }: { origin: SideThreadOrigin; fragment: string | null },
): Promise<OriginPlace | OriginRefusal> {
  const asked = await dependencies.repository.asked(interview.id);
  switch (origin.kind) {
    case "question": {
      const question = asked.find((entry) => entry.id === origin.id);
      return question === undefined
        ? { type: "question_not_found" }
        : { question, fragment, fromDebrief: false };
    }
    case "debrief": {
      return debriefPlace(dependencies, interview, { asked, attemptId: origin.id, fragment });
    }
    case "message": {
      return messagePlace(dependencies, interview, { asked, messageId: origin.id, fragment });
    }
    default: {
      return origin.kind satisfies never;
    }
  }
}
