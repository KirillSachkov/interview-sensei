import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import { fetchLatestInterviews } from "@/shared/api";
import type { InterviewView } from "@/shared/api";

const interviewsKey = (targetId: string) => ["targets", targetId, "interviews"];

/**
 * The Target's newest Mock interviews, and how the page updates them: `refresh` after one ended,
 * paused or went on, `started` with a new one.
 */
export function useLatestInterviews(targetId: string) {
  const queryClient = useQueryClient();
  const latest = useQuery({
    queryKey: interviewsKey(targetId),
    queryFn: async () => fetchLatestInterviews(targetId),
  });
  // An ended Mock interview changes the Readiness and the session history too.
  const refresh = useCallback(() => {
    for (const queryKey of [
      interviewsKey(targetId),
      ["progress", targetId],
      ["history", targetId],
    ]) {
      void queryClient.invalidateQueries({ queryKey });
    }
  }, [queryClient, targetId]);
  const started = (interview: InterviewView) => {
    queryClient.setQueryData(interviewsKey(targetId), [interview, ...(latest.data ?? [])]);
  };
  return { latest, refresh, started };
}

/** The Mock interview that runs or is paused now, if the newest one does. */
export function activeInterview(
  latest: readonly InterviewView[] | undefined,
): InterviewView | null {
  const [current] = latest ?? [];
  return current !== undefined && (current.status === "running" || current.status === "paused")
    ? current
    : null;
}
