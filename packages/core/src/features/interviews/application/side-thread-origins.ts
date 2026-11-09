// Where a Side thread opens (#80): the asked question it discusses and its fragment, from the
// origin that «Обсудить отдельно» names: a question card, an interviewer message or a Debrief.
import type { AskedQuestion, MockInterview } from "../domain/interview.ts";
import { questionAtMessage } from "../domain/side-thread.ts";
import type { SideThreadOrigin } from "../domain/side-thread.ts";
import type { InterviewsDependencies } from "./context.ts";

/** What the origin opens on: the asked question, the fragment, and whether it opens a Debrief. */
export interface OriginPlace {
  readonly question: AskedQuestion;
  readonly fragment: string | null;
  /** Opened from the Debrief: the Candidate has it open. */
  readonly fromDebrief: boolean;
}

/** `message_before_question`: the interviewer's message came before any question was shown. */
export interface OriginRefusal {
  readonly type:
    "question_not_found" | "message_not_found" | "attempt_not_found" | "message_before_question";
}

/** The interviewer's chat message with the id and its place in the chat; undefined when none. */
async function interviewerMessage(
  { sessions }: InterviewsDependencies,
  interview: MockInterview,
  id: string,
): Promise<{ text: string; index: number } | undefined> {
  const chat = await sessions.view(interview.sessionId);
  const entries = chat?.entries ?? [];
  const index = entries.findIndex((line) => line.id === id && line.type === "agent_message");
  const text = entries[index]?.text;
  return text === undefined ? undefined : { text, index };
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

/** The message's place: the question shown when it came; the whole message without a selection. */
async function messagePlace(
  dependencies: InterviewsDependencies,
  interview: MockInterview,
  {
    asked,
    messageId,
    fragment,
  }: { asked: readonly AskedQuestion[]; messageId: string; fragment: string | null },
): Promise<OriginPlace | OriginRefusal> {
  const message = await interviewerMessage(dependencies, interview, messageId);
  if (message === undefined) {
    return { type: "message_not_found" };
  }
  const question = questionAtMessage(asked, message.index);
  return question === undefined
    ? { type: "message_before_question" }
    : { question, fragment: fragment ?? message.text, fromDebrief: false };
}

/**
 * The place of the origin in the Mock interview. The selected fragment goes as given; a message
 * without a selection gives its whole text. A message opens on the question that was shown when it
 * came, so a message from before the next question neither discusses nor hints at it.
 */
export async function originPlace(
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
