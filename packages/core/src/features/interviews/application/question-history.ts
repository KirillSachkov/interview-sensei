// Shared history scope for candidate selection and enforcement at presentation.
import { restingQuestions } from "../domain/candidates.ts";
import type { MockInterview } from "../domain/interview.ts";
import { InterviewToolError } from "./tool-session.ts";
import type { Context } from "./context.ts";

/** The Mock interviews of the Target before this one, the newest first. */
export async function earlierInterviews(context: Context, targetId: string, interviewId: string) {
  const latest = await context.dependencies.repository.latest(targetId, 3);
  return latest.filter((entry) => entry.id !== interviewId).map((entry) => entry.id);
}

/** Refuses a bank Question that still rests, even when the agent got its id from search. */
export async function assertQuestionRested(
  context: Context,
  interview: MockInterview,
  questionId: string,
): Promise<void> {
  const rest = restingQuestions(
    await context.dependencies.repository.history(interview.targetId),
    await earlierInterviews(context, interview.targetId, interview.id),
  );
  if (rest.has(questionId)) {
    throw new InterviewToolError(
      "This question is still resting after its last Grade: pick one from next_question_candidates.",
    );
  }
}
