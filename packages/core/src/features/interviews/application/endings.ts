// How a Mock interview ends: the agent's finish_interview after the Candidate pressed «Завершить»,
// or without the agent's summary (#54): the server finishes it itself when the agent does not call
// finish_interview in time, and at once when the Candidate finishes a paused one, which has no
// agent (#84). Its Attempts stay either way. A finished one closes its Side threads whose agent does not work (#80).
// A crash of the agent or a server restart pauses it instead: pauses.ts.
import { candidateFinished } from "../domain/agent-messages.ts";
import type { MockInterview } from "../domain/interview.ts";
import { change, inBackground, runningWith, tellAndShowAgentText } from "./context.ts";
import type { Context } from "./context.ts";
import { closeFinishedSideThreads } from "./side-threads.ts";
import { assertRunning, InterviewToolError, interviewOf } from "./tool-session.ts";

/** How long the server waits for `finish_interview` after the Candidate presses «Завершить». */
const finishWaitMs = 2 * 60 * 1000;

/**
 * Finishes the Mock interview without the agent's summary while it runs with the session; false
 * once a pause or a continuation took it from that session.
 */
async function end(context: Context, watched: MockInterview): Promise<boolean> {
  const { repository, clock } = context.dependencies;
  return change(context, watched.id, async () => {
    if ((await runningWith(context.dependencies, watched)) === undefined) {
      return false;
    }
    await repository.update(watched.id, {
      status: "finished",
      finishedAt: clock.now().toISOString(),
    });
    return true;
  });
}

/**
 * Finishes the Mock interview without the agent's summary unless the agent finishes it within
 * the wait; the summary Debrief then shows only the Topic status changes.
 */
function awaitFinish(context: Context, interview: MockInterview): void {
  const { timer, sessions, onFinished } = context.dependencies;
  timer.after(finishWaitMs, () => {
    inBackground(context, async () => {
      if (await end(context, interview)) {
        onFinished({ targetId: interview.targetId });
        await Promise.all([
          sessions.end(interview.sessionId),
          closeFinishedSideThreads(context, interview.id),
        ]);
      }
    });
  });
}

/**
 * `finish_interview`: the agent records its summary once the Candidate pressed «Завершить». The
 * agent's session ends after this turn; Side threads that wait close at once.
 */
export async function finishByAgent(
  context: Context,
  sessionId: string,
  { summary, nextStep }: { summary: string; nextStep: string },
) {
  const found = await interviewOf(context, sessionId);
  const { repository, sessions, clock, onFinished } = context.dependencies;
  return change(context, found.id, async () => {
    const interview = await interviewOf(context, sessionId);
    assertRunning(interview);
    if (interview.finishRequestedAt === null) {
      throw new InterviewToolError(
        "Only the Candidate ends the mock interview: keep asking questions until the message that the Candidate finished.",
      );
    }
    await repository.update(interview.id, {
      status: "finished",
      finishedAt: clock.now().toISOString(),
      summary,
      nextStep,
    });
    onFinished({ targetId: interview.targetId });
    inBackground(context, async () => sessions.end(sessionId));
    inBackground(context, async () => closeFinishedSideThreads(context, interview.id));
    return "The mock interview is finished. End your turn.";
  });
}

export type FinishOutcome = "accepted" | "not_found" | "not_running";

/**
 * Finishes the paused Mock interview at once: it has no agent to write the summary. Its Side
 * threads close in the same change, so a «Продолжить» right after it finds them closed.
 */
async function finishPaused(context: Context, interview: MockInterview): Promise<void> {
  const { repository, clock, onFinished } = context.dependencies;
  await repository.update(interview.id, {
    status: "finished",
    finishedAt: clock.now().toISOString(),
  });
  onFinished({ targetId: interview.targetId });
  await closeFinishedSideThreads(context, interview.id);
}

/** Asks the agent of the running Mock interview for its summary, once. */
async function askForSummary(context: Context, interview: MockInterview): Promise<void> {
  const { repository, clock } = context.dependencies;
  if (interview.finishRequestedAt === null) {
    await repository.update(interview.id, { finishRequestedAt: clock.now().toISOString() });
    tellAndShowAgentText(context, interview.sessionId, candidateFinished);
    awaitFinish(context, interview);
  }
}

/** The finish of the Mock interview as it stands; see `finish`. */
async function requestFinish(context: Context, interview: MockInterview): Promise<FinishOutcome> {
  if (interview.status === "paused") {
    await finishPaused(context, interview);
    return "accepted";
  }
  if (interview.status !== "running") {
    return "not_running";
  }
  await askForSummary(context, interview);
  return "accepted";
}

/**
 * The Candidate presses «Завершить»: the agent gets the message and calls finish_interview, or the
 * server finishes the Mock interview itself after the wait. A paused Mock interview has no agent:
 * it finishes at once without the agent's summary, and its time stays as it stood.
 */
export async function finish(context: Context, id: string) {
  return change(context, id, async (): Promise<FinishOutcome> => {
    const interview = await context.dependencies.repository.get(id);
    return interview === undefined ? "not_found" : requestFinish(context, interview);
  });
}
