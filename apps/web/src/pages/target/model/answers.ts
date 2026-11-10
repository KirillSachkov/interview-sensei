import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

import { fetchAnswerReport, fetchAnswers, startAnswerSearch, stopAnswerSearch } from "@/shared/api";

/** The query of the Target's answer search: the start window, the running search, the report. */
function answersQueryKey(targetId: string) {
  return ["targets", targetId, "answers"];
}

/** How often the page asks the server about a search that waits or runs. */
const pollingMs = 1000;

/**
 * The Target's answer search; while it waits or runs, the page asks again every second, and the
 * Questions of the side panel reload with their new reference answers.
 */
export function useAnswers(targetId: string) {
  const queryClient = useQueryClient();
  const answers = useQuery({
    queryKey: answersQueryKey(targetId),
    queryFn: async () => fetchAnswers(targetId),
    refetchInterval: (query) => ((query.state.data?.run ?? null) === null ? false : pollingMs),
  });
  const filled = answers.data?.run?.filled ?? null;
  const previous = useRef(filled);
  useEffect(() => {
    if (previous.current !== filled) {
      void queryClient.invalidateQueries({ queryKey: ["targets", targetId, "questions"] });
    }
    previous.current = filled;
  }, [queryClient, filled, targetId]);
  return answers;
}

/** «Начать поиск» of the start window: the server answers at once and starts the agent. */
export function useStartAnswerSearch(targetId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (count: number) => startAnswerSearch(targetId, count),
    onSettled: async () => queryClient.invalidateQueries({ queryKey: answersQueryKey(targetId) }),
  });
}

/** «Остановить»: the server answers once the search is closed with a partial report. */
export function useStopAnswerSearch(targetId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => stopAnswerSearch(targetId),
    onSettled: async () => queryClient.invalidateQueries({ queryKey: answersQueryKey(targetId) }),
  });
}

/** The answer report for its panel. */
export function useAnswerReport(targetId: string, reportId: string) {
  return useQuery({
    queryKey: [...answersQueryKey(targetId), "reports", reportId],
    queryFn: async () => fetchAnswerReport(targetId, reportId),
  });
}
