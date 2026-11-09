import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { fetchInboxReport, fetchInboxReports, markReportSeen, reviewQuestions } from "@/shared/api";
import type { ReviewAction } from "@/shared/api";

import { refreshAppliedViews } from "./plan-views";

/** Every query of the Target's Inbox reports: the history and each report. */
function reportsQueryKey(targetId: string) {
  return ["targets", targetId, "inbox-reports"];
}

/** The report; `onlyNew` is the filter «Только новые». */
export function useReport(targetId: string, reportId: string, onlyNew: boolean) {
  return useQuery({
    queryKey: [...reportsQueryKey(targetId), reportId, onlyNew ? "new" : "all"],
    queryFn: async () => fetchInboxReport(targetId, reportId, onlyNew),
    // The filter keeps the shown report until the filtered one arrives.
    placeholderData: keepPreviousData,
  });
}

/** The history of the Target's reports, the newest first. */
export function useReportHistory(targetId: string) {
  return useQuery({
    queryKey: reportsQueryKey(targetId),
    queryFn: async () => fetchInboxReports(targetId),
  });
}

/** Reloads the reports, the Questions and the plan's counts after a change of the Questions. */
async function refreshReviewed(queryClient: ReturnType<typeof useQueryClient>, targetId: string) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: reportsQueryKey(targetId) }),
    refreshAppliedViews(queryClient, targetId),
  ]);
}

/** The bulk review of the chosen Questions: hide, delete, ⚠ with a comment, 👍. */
export function useReview(targetId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (review: {
      action: ReviewAction;
      questionIds: readonly string[];
      comment?: string;
    }) => reviewQuestions(targetId, review),
    onSuccess: async () => refreshReviewed(queryClient, targetId),
  });
}

/** «Отметить просмотренными»: the report's Questions are no longer «новый». */
export function useMarkSeen(targetId: string, reportId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => markReportSeen(targetId, reportId),
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: reportsQueryKey(targetId) }),
  });
}

/** The chosen ids of a list with checkboxes. */
export function useSelection(initial: readonly string[] = []) {
  const [chosen, setChosen] = useState<ReadonlySet<string>>(new Set(initial));
  return {
    chosen,
    toggle: (id: string, checked: boolean) => {
      const next = new Set(chosen);
      if (checked) {
        next.add(id);
      } else {
        next.delete(id);
      }
      setChosen(next);
    },
    set: (ids: readonly string[]) => {
      setChosen(new Set(ids));
    },
  };
}
