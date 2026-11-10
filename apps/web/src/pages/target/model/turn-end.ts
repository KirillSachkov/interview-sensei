import type { SessionView } from "@/shared/api";

/**
 * Marks the end of the agent's turn for a reload after it: the chat's length once the agent waits,
 * null while it works. Two quick turns may reach the page as one change from idle to idle; their
 * new chat entries still change the mark.
 */
export function turnEnd({ status, entries }: SessionView): number | null {
  return status === "idle" ? entries.length : null;
}
