// Follow-ups (#41): the agent clarifies the Candidate's answer before it judges it, at most twice
// per question. They belong to the same Attempt.
import { followUpAnswered } from "../domain/agent-messages.ts";
import { maxFollowUps, pendingFollowUp } from "../domain/follow-ups.ts";
import type { AskedQuestion } from "../domain/interview.ts";
import { presentedQuestion } from "../domain/interview.ts";
import { change, tellInterviewer } from "./context.ts";
import type { Context } from "./context.ts";
import {
  answeredQuestion,
  assertNotFinishing,
  assertRunning,
  InterviewToolError,
  interviewOf,
} from "./tool-session.ts";

/** `ask_follow_up`: shows the Follow-up under the presented question's answer. */
export async function askFollowUp(
  context: Context,
  sessionId: string,
  { question }: { question: string },
): Promise<string> {
  const found = await interviewOf(context, sessionId);
  const { repository, sessions, clock } = context.dependencies;
  return change(context, found.id, async () => {
    const interview = await interviewOf(context, sessionId);
    assertRunning(interview);
    assertNotFinishing(interview);
    const presented = await answeredQuestion(context, interview);
    if (presented.followUps.length >= maxFollowUps) {
      throw new InterviewToolError(
        "The presented question already has two Follow-ups, the most allowed: judge the answer with record_attempt.",
      );
    }
    await repository.followUps(presented.id, [
      ...presented.followUps,
      { question, answer: null, askedAt: clock.now().toISOString() },
    ]);
    // The rest of this turn could hint at the answer, so the chat leaves it out.
    await sessions.hideAgentText(sessionId);
    return "The Follow-up is shown to the Candidate. End your turn now and wait for the answer.";
  });
}

/**
 * - `no_follow_up`: no Follow-up waits for the Candidate's answer.
 */
export type FollowUpOutcome = "accepted" | "not_found" | "not_running" | "no_follow_up";

/** The presented question whose last Follow-up waits for the answer, if there is one. */
async function waitingFollowUp(context: Context, interviewId: string) {
  const { repository } = context.dependencies;
  const [asked, attempts] = await Promise.all([
    repository.asked(interviewId),
    repository.attempts(interviewId),
  ]);
  const presented: AskedQuestion | undefined = presentedQuestion(asked, attempts);
  return presented !== undefined && pendingFollowUp(presented) !== undefined
    ? presented
    : undefined;
}

/** The running Mock interview whose last Follow-up waits for an answer, or why there is none. */
async function followUpToAnswer(context: Context, id: string) {
  const interview = await context.dependencies.repository.get(id);
  if (interview === undefined) {
    return "not_found";
  }
  if (interview.status !== "running" || interview.finishRequestedAt !== null) {
    return "not_running";
  }
  const presented = await waitingFollowUp(context, id);
  return presented === undefined ? "no_follow_up" : { interview, presented };
}

/** Records the Candidate's answer to the agent's last Follow-up and tells the agent. */
export async function answerFollowUp(
  context: Context,
  id: string,
  { text }: { text: string },
): Promise<FollowUpOutcome> {
  return change(context, id, async (): Promise<FollowUpOutcome> => {
    const found = await followUpToAnswer(context, id);
    if (typeof found === "string") {
      return found;
    }
    const { interview, presented } = found;
    const last = presented.followUps.at(-1);
    if (last !== undefined) {
      await context.dependencies.repository.followUps(
        presented.id,
        presented.followUps.with(presented.followUps.length - 1, { ...last, answer: text }),
      );
    }
    tellInterviewer(context, interview.sessionId, followUpAnswered(text));
    return "accepted";
  });
}
