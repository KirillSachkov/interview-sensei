// How a Mock interview ends without the agent's summary (#54): the server finishes it itself when
// the agent does not call finish_interview in time, and marks it «прерван» when its agent fails or
// the server stopped while it ran. Its Attempts stay either way.
import { candidateFinished } from "../domain/agent-messages.ts";
import type { MockInterview } from "../domain/interview.ts";
import { change, inBackground, tellInterviewer } from "./context.ts";
import type { Context } from "./context.ts";

/** How long the server waits for `finish_interview` after the Candidate presses «Завершить». */
const finishWaitMs = 2 * 60 * 1000;

/** Moves a running Mock interview to the status; false when it no longer runs. */
async function end(
  context: Context,
  id: string,
  status: "finished" | "interrupted",
): Promise<boolean> {
  const { repository, clock } = context.dependencies;
  return change(context, id, async () => {
    const interview = await repository.get(id);
    if (interview?.status !== "running") {
      return false;
    }
    await repository.update(id, { status, finishedAt: clock.now().toISOString() });
    return true;
  });
}

/**
 * Finishes the Mock interview without the agent's summary unless the agent finishes it within
 * the wait; the summary Debrief then shows only the Topic status changes.
 */
function awaitFinish(context: Context, { id, sessionId }: MockInterview): void {
  const { timer, sessions } = context.dependencies;
  timer.after(finishWaitMs, () => {
    inBackground(context, async () => {
      if (await end(context, id, "finished")) {
        await sessions.end(sessionId);
      }
    });
  });
}

export type FinishOutcome = "accepted" | "not_found" | "not_running";

/**
 * The Candidate presses «Завершить»: the agent gets the message and calls finish_interview, or the
 * server finishes the Mock interview itself after the wait.
 */
export async function finish(context: Context, id: string) {
  const { repository, clock } = context.dependencies;
  return change(context, id, async (): Promise<FinishOutcome> => {
    const interview = await repository.get(id);
    if (interview === undefined) {
      return "not_found";
    }
    if (interview.status !== "running") {
      return "not_running";
    }
    if (interview.finishRequestedAt === null) {
      await repository.update(id, { finishRequestedAt: clock.now().toISOString() });
      tellInterviewer(context, interview.sessionId, candidateFinished);
      awaitFinish(context, interview);
    }
    return "accepted";
  });
}

/** Marks the Mock interview «прерван» once its agent fails: it did not start or its process exited. */
export function watchAgent(context: Context, { id, sessionId }: MockInterview): void {
  const { sessions } = context.dependencies;
  const interrupt = () => {
    inBackground(context, async () => end(context, id, "interrupted"));
  };
  const unsubscribe = sessions.subscribe(sessionId, (view) => {
    if (view.status === "failed") {
      unsubscribe();
      interrupt();
    }
  });
  // The agent may have failed before the subscription.
  inBackground(context, async () => {
    const view = await sessions.view(sessionId);
    if (view?.status === "failed") {
      interrupt();
    }
  });
}

/** Marks the Mock interviews that ran when the server last stopped as «прерван». Call it at start. */
export async function endInterrupted(context: Context): Promise<void> {
  const running = await context.dependencies.repository.allRunning();
  await Promise.all(running.map(async ({ id }) => end(context, id, "interrupted")));
}
