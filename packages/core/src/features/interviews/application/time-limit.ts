// The server keeps the time of a Mock interview with a limit (#41): 5 minutes before the end the
// agent gets a message, and at the end the browser learns of the overtime. Nothing ends the
// interview: only the Candidate does. A pause stops the time (#84): the tasks of a session that a
// pause ended do nothing, and the continuation schedules them anew from the time left.
import { fiveMinutesLeft } from "../domain/agent-messages.ts";
import type { MockInterview } from "../domain/interview.ts";
import { reminderBeforeEndMs, timeLeftMs } from "../domain/time-limit.ts";
import { change, inBackground, tellInterviewer } from "./context.ts";
import type { Context } from "./context.ts";

/** The Mock interview while it still runs with the agent session of the task. */
async function stillRunning(context: Context, { id, sessionId }: MockInterview) {
  const interview = await context.dependencies.repository.get(id);
  return interview?.status === "running" && interview.sessionId === sessionId
    ? interview
    : undefined;
}

/** Tells the agent that 5 minutes are left, while the Candidate has not finished. */
async function remind(context: Context, watched: MockInterview): Promise<void> {
  await change(context, watched.id, async () => {
    const interview = await stillRunning(context, watched);
    if (interview?.finishRequestedAt === null) {
      tellInterviewer(context, interview.sessionId, fiveMinutesLeft);
    }
  });
}

/**
 * Schedules the reminder and the end of the limit from the time left now; nothing without a limit.
 * A reminder whose time has passed, such as one before a pause, is not sent again.
 */
export function watchTimeLimit(context: Context, interview: MockInterview): void {
  const { timer, clock } = context.dependencies;
  const leftMs = timeLeftMs(interview, clock.now().toISOString());
  if (leftMs === null) {
    return;
  }
  if (leftMs > reminderBeforeEndMs) {
    timer.after(leftMs - reminderBeforeEndMs, () => {
      inBackground(context, async () => remind(context, interview));
    });
  }
  if (leftMs > 0) {
    // The listeners get the view again: now it shows the overtime.
    timer.after(leftMs, () => {
      inBackground(context, async () =>
        change(context, interview.id, async () => stillRunning(context, interview)),
      );
    });
  }
}
