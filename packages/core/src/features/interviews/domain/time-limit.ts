// The time limit of a Mock interview (#41): a guide for the agent, not a limit for the Candidate.
// Past it the interview goes on in overtime until the Candidate finishes it. Only the time it runs
// counts: a pause stops the time (#84).
import type { AskedQuestion, Attempt, MockInterview } from "./interview.ts";

/** The agent gets «5 minutes left» this long before the limit. */
export const reminderBeforeEndMs = 5 * 60_000;

type Timing = Pick<
  MockInterview,
  "status" | "startedAt" | "limitMinutes" | "pausedAt" | "pausedMs"
>;

/** How long the Mock interview has run by `now`, without its pauses. */
export function runningMs({ startedAt, pausedAt, pausedMs }: Timing, now: string): number {
  return Date.parse(pausedAt ?? now) - Date.parse(startedAt) - pausedMs;
}

/** The time left before the limit, below 0 in overtime; null without a limit. */
export function timeLeftMs(interview: Timing, now: string): number | null {
  return interview.limitMinutes === null
    ? null
    : interview.limitMinutes * 60_000 - runningMs(interview, now);
}

/** When the limit ends while it runs; null without a limit or on a pause. */
export function limitEndsAt(interview: Timing): string | null {
  const { startedAt, limitMinutes, pausedAt, pausedMs } = interview;
  return limitMinutes === null || pausedAt !== null
    ? null
    : new Date(Date.parse(startedAt) + pausedMs + limitMinutes * 60_000).toISOString();
}

/** Whether the time left is used up; false without a limit. */
export function limitPassed(leftMs: number | null): boolean {
  return leftMs !== null && leftMs <= 0;
}

/** Whether the running Mock interview has passed its limit at the moment. */
export function inOvertime(interview: Timing, now: string): boolean {
  return interview.status === "running" && limitPassed(timeLeftMs(interview, now));
}

/** The time fields once the paused Mock interview goes on at `now`: the pause joins the earlier ones. */
export function resumedTime(
  { pausedAt, pausedMs }: Pick<MockInterview, "pausedAt" | "pausedMs">,
  now: string,
): { readonly pausedAt: null; readonly pausedMs: number } {
  const pause = pausedAt === null ? 0 : Math.max(0, Date.parse(now) - Date.parse(pausedAt));
  return { pausedAt: null, pausedMs: pausedMs + pause };
}

/**
 * The last moment the server recorded for the Mock interview: its start or last continuation, a
 * question shown, an answer, a Follow-up or an Attempt. A Mock interview that still ran when the
 * server stopped unexpectedly is paused from then on: the time after it may be the server's
 * downtime, which never counts.
 */
export function lastActivityAt(
  { startedAt, resumedAt }: Pick<MockInterview, "startedAt" | "resumedAt">,
  {
    asked,
    attempts,
  }: {
    asked: readonly (Pick<AskedQuestion, "presentedAt"> & {
      readonly answer: Pick<NonNullable<AskedQuestion["answer"]>, "answeredAt"> | null;
      readonly followUps: readonly Pick<AskedQuestion["followUps"][number], "askedAt">[];
    })[];
    attempts: readonly Pick<Attempt, "recordedAt">[];
  },
): string {
  const moments = [
    startedAt,
    ...(resumedAt === null ? [] : [resumedAt]),
    ...asked.flatMap((question) => [
      question.presentedAt,
      ...(question.answer === null ? [] : [question.answer.answeredAt]),
      ...question.followUps.map((followUp) => followUp.askedAt),
    ]),
    ...attempts.map((attempt) => attempt.recordedAt),
  ];
  return moments.reduce((latest, moment) =>
    Date.parse(moment) > Date.parse(latest) ? moment : latest,
  );
}
