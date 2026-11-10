// What every interviewer tool checks first: the Mock interview of the calling session, that it
// runs, its plan, and the presented question. A refusal names the rule in English.
import type { AskedQuestion, MockInterview } from "../domain/interview.ts";
import { presentedQuestion } from "../domain/interview.ts";
import { pendingFollowUp } from "../domain/follow-ups.ts";
import type { PlanSection, TargetPlan } from "../domain/ports.ts";
import type { Context } from "./context.ts";

/** A refused tool call; the agent gets the message as the tool's error. */
export class InterviewToolError extends Error {
  override name = "InterviewToolError";
}

export async function interviewOf(
  { dependencies }: Context,
  sessionId: string,
): Promise<MockInterview> {
  const interview = await dependencies.repository.bySession(sessionId);
  if (interview === undefined) {
    throw new InterviewToolError("No mock interview belongs to this session.");
  }
  return interview;
}

export function assertRunning(interview: MockInterview): void {
  if (interview.status === "paused") {
    throw new InterviewToolError("The mock interview is paused: end your turn.");
  }
  if (interview.status !== "running") {
    throw new InterviewToolError("The mock interview has ended.");
  }
}

/** Refuses to ask more once the Candidate pressed «Завершить». */
export function assertNotFinishing(interview: MockInterview): void {
  if (interview.finishRequestedAt !== null) {
    throw new InterviewToolError(
      "The Candidate finished the mock interview: call finish_interview instead.",
    );
  }
}

export async function planOf(
  { dependencies }: Context,
  interview: MockInterview,
): Promise<TargetPlan> {
  const plan = await dependencies.targets.get(interview.targetId);
  if (plan === undefined) {
    throw new InterviewToolError("The Target of this mock interview no longer exists.");
  }
  return plan;
}

/** The selected Sections of the Mock interview, in its order. */
export function selected(plan: TargetPlan, interview: MockInterview): readonly PlanSection[] {
  return interview.sectionIds.flatMap((id) => plan.sections.filter((section) => section.id === id));
}

export const recordedAlready =
  "The last question already has its Attempt; a recorded Attempt never changes.";

/**
 * The presented question with the Candidate's answer, which waits for its Attempt; the Candidate
 * has answered every Follow-up of it.
 */
export async function answeredQuestion(
  { dependencies }: Context,
  interview: MockInterview,
): Promise<AskedQuestion> {
  const { repository } = dependencies;
  const [asked, attempts] = await Promise.all([
    repository.asked(interview.id),
    repository.attempts(interview.id),
  ]);
  const presented = presentedQuestion(asked, attempts);
  if (presented === undefined) {
    throw new InterviewToolError(
      asked.length === 0
        ? "No question is presented: show one with present_question first."
        : recordedAlready,
    );
  }
  if (presented.answer === null) {
    throw new InterviewToolError(
      "The Candidate has not answered the presented question yet: wait for the answer.",
    );
  }
  if (pendingFollowUp(presented) !== undefined) {
    throw new InterviewToolError(
      "The Candidate has not answered your Follow-up yet: end your turn and wait for the answer.",
    );
  }
  return presented;
}
