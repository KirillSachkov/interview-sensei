// The pause of a Mock interview (#84): «Пауза», a crash of the agent and a server stop pause the
// running Mock interview: its agent session ends and its time stops. «Продолжить» is in resume.ts.
import type { MockInterview, PauseReason } from "../domain/interview.ts";
import { lastActivityAt } from "../domain/time-limit.ts";
import { change, inBackground, runningWith } from "./context.ts";
import type { Context } from "./context.ts";

/**
 * Pauses the Mock interview while it runs with the session, from the moment `at`; null when it no
 * longer does. The caller stops the agent. A request for the summary ends with the agent: a paused
 * Mock interview finishes at once on «Завершить», and a continued one runs as before it.
 */
async function markPaused(
  context: Context,
  watched: Pick<MockInterview, "id" | "sessionId">,
  { reason, at }: { reason: PauseReason; at: string },
): Promise<MockInterview | null> {
  const { repository } = context.dependencies;
  return change(context, watched.id, async () => {
    const interview = await runningWith(context.dependencies, watched);
    if (interview === undefined) {
      return null;
    }
    await repository.update(interview.id, {
      status: "paused",
      pausedAt: at,
      pauseReason: reason,
      finishRequestedAt: null,
    });
    return interview;
  });
}

/** Pauses the Mock interview once its agent fails: it did not start or its process exited. */
export function watchAgent(context: Context, interview: MockInterview): void {
  const { sessions, clock } = context.dependencies;
  const pauseNow = () => {
    inBackground(context, async () =>
      markPaused(context, interview, {
        reason: "agent_failed",
        at: clock.now().toISOString(),
      }),
    );
  };
  const unsubscribe = sessions.subscribe(interview.sessionId, (view) => {
    if (view.status === "failed") {
      unsubscribe();
      pauseNow();
    }
  });
  // The agent may have failed before the subscription.
  inBackground(context, async () => {
    const view = await sessions.view(interview.sessionId);
    if (view?.status === "failed") {
      pauseNow();
    }
  });
}

/**
 * - `accepted`: the Mock interview is paused and its agent stopped.
 * - `not_running`: it is paused or ended already.
 * - `finishing`: the Candidate pressed «Завершить» and the agent writes its summary.
 */
export type PauseOutcome = "accepted" | "not_found" | "not_running" | "finishing";

/** Why «Пауза» does not apply to the Mock interview now; null when it does. */
function pauseRefusal(interview: MockInterview | undefined): PauseOutcome | null {
  if (interview === undefined) {
    return "not_found";
  }
  if (interview.status !== "running") {
    return "not_running";
  }
  return interview.finishRequestedAt === null ? null : "finishing";
}

/** «Пауза»: the time stops and the agent stops at once, even in a turn. */
export async function pause(context: Context, id: string): Promise<PauseOutcome> {
  const { repository, sessions, clock } = context.dependencies;
  const interview = await repository.get(id);
  const refusal = pauseRefusal(interview);
  if (refusal !== null || interview === undefined) {
    return refusal ?? "not_found";
  }
  const paused = await markPaused(context, interview, {
    reason: "candidate",
    at: clock.now().toISOString(),
  });
  if (paused === null) {
    return "not_running";
  }
  await sessions.stop(paused.sessionId);
  return "accepted";
}

/** Pauses every running Mock interview when the server stops; call it before the agents stop. */
export async function pauseRunning(context: Context): Promise<void> {
  const { repository, clock } = context.dependencies;
  const running = await repository.allRunning();
  const at = clock.now().toISOString();
  await Promise.all(
    running.map(async (interview) =>
      markPaused(context, interview, { reason: "server_stopped", at }),
    ),
  );
}

/**
 * Pauses the Mock interviews that still ran when the server last stopped unexpectedly. Call it at
 * start. Their time stops at the last moment the server recorded for them.
 */
export async function pauseInterrupted(context: Context): Promise<void> {
  const { repository } = context.dependencies;
  const running = await repository.allRunning();
  await Promise.all(
    running.map(async (interview) => {
      const [asked, attempts] = await Promise.all([
        repository.asked(interview.id),
        repository.attempts(interview.id),
      ]);
      await markPaused(context, interview, {
        reason: "server_stopped",
        at: lastActivityAt(interview, { asked, attempts }),
      });
    }),
  );
}
