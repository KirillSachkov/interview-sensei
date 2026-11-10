// Shared history scope for candidate selection and enforcement at presentation.
import type { Context } from "./context.ts";

/** The Mock interviews of the Target before this one, the newest first. */
export async function earlierInterviews(context: Context, targetId: string, interviewId: string) {
  const latest = await context.dependencies.repository.latest(targetId, 3);
  return latest.filter((entry) => entry.id !== interviewId).map((entry) => entry.id);
}
