// The Handoff brief of a Side thread for its agent's `get_brief` (#80), with the thread's earlier
// messages once a new session continues it (#85).
import { handoffBrief } from "../domain/handoff-brief.ts";
import type { AskedQuestion, Judgment } from "../domain/interview.ts";
import type { Context, InterviewsDependencies } from "./context.ts";
import { debrief } from "./records.ts";
import { InterviewToolError, planOf } from "./tool-session.ts";

/** The judgment of the question's Attempt with the Grade after the latest Dispute; null without one. */
async function judgmentOf(
  dependencies: InterviewsDependencies,
  question: AskedQuestion,
): Promise<Judgment | null> {
  const attempts = await dependencies.repository.attempts(question.interviewId);
  const attempt = attempts.find((entry) => entry.askedQuestionId === question.id);
  const judged =
    attempt === undefined
      ? undefined
      : await debrief(dependencies, question.interviewId, attempt.id);
  return judged === undefined ? null : { ...judged, grade: judged.dispute?.grade ?? judged.grade };
}

/** The Side thread of the calling session with its Mock interview and asked question. */
async function callingThread({ dependencies: { repository } }: Context, sessionId: string) {
  const thread = await repository.sideThreadBySession(sessionId);
  const interview = thread === undefined ? undefined : await repository.get(thread.interviewId);
  if (thread === undefined || interview === undefined) {
    throw new InterviewToolError("No side thread belongs to this session.");
  }
  const asked = await repository.asked(interview.id);
  const question = asked.find((entry) => entry.id === thread.askedQuestionId);
  if (question === undefined) {
    throw new InterviewToolError("The question of this side thread no longer exists.");
  }
  return { thread, interview, question };
}

/** The Handoff brief of the calling Side thread as JSON, for its `get_brief`. */
export async function sideThreadBrief(context: Context, sessionId: string): Promise<string> {
  const { thread, interview, question } = await callingThread(context, sessionId);
  const [plan, judgment, earlier] = await Promise.all([
    planOf(context, interview),
    judgmentOf(context.dependencies, question),
    context.dependencies.sessions.earlierMessages(sessionId),
  ]);
  const earlierMessages = earlier.length === 0 ? null : earlier;
  return JSON.stringify(handoffBrief(thread, { plan, question, judgment, earlierMessages }));
}
