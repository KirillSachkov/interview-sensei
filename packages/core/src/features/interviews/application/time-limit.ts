// The server keeps the time of a Mock interview with a limit (#41): 5 minutes before the end the
// agent gets a message, and at the end the browser learns of the overtime. Nothing ends the
// interview: only the Candidate does.
import { fiveMinutesLeft } from "../domain/agent-messages.ts";
import type { MockInterview } from "../domain/interview.ts";
import { reminderBeforeEndMs } from "../domain/time-limit.ts";
import { change, inBackground, tellInterviewer } from "./context.ts";
import type { Context } from "./context.ts";

/** Tells the agent that 5 minutes are left, while the Candidate has not finished. */
async function remind(context: Context, id: string): Promise<void> {
  await change(context, id, async () => {
    const interview = await context.dependencies.repository.get(id);
    if (interview?.status === "running" && interview.finishRequestedAt === null) {
      tellInterviewer(context, interview.sessionId, fiveMinutesLeft);
    }
  });
}

/** Schedules the reminder and the end of the limit; nothing without a limit. */
export function watchTimeLimit(context: Context, interview: MockInterview): void {
  if (interview.limitMinutes === null) {
    return;
  }
  const { timer } = context.dependencies;
  const limitMs = interview.limitMinutes * 60_000;
  if (limitMs > reminderBeforeEndMs) {
    timer.after(limitMs - reminderBeforeEndMs, () => {
      inBackground(context, async () => remind(context, interview.id));
    });
  }
  // The listeners get the view again: now it shows the overtime.
  timer.after(limitMs, () => {
    inBackground(context, async () =>
      change(context, interview.id, async () => context.dependencies.repository.get(interview.id)),
    );
  });
}
