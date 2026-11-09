// The time limit of a Mock interview (#41): a guide for the agent, not a limit for the Candidate.
// Past it the interview goes on in overtime until the Candidate finishes it.
import type { MockInterview } from "./interview.ts";

/** The agent gets «5 minutes left» this long before the limit. */
export const reminderBeforeEndMs = 5 * 60_000;

/** When the limit ends; null without a limit. */
export function limitEndsAt({ startedAt, limitMinutes }: MockInterview): string | null {
  return limitMinutes === null
    ? null
    : new Date(Date.parse(startedAt) + limitMinutes * 60_000).toISOString();
}

/** Whether the running Mock interview has passed its limit at the moment. */
export function inOvertime(interview: MockInterview, now: string): boolean {
  const endsAt = limitEndsAt(interview);
  return interview.status === "running" && endsAt !== null && Date.parse(now) >= Date.parse(endsAt);
}
