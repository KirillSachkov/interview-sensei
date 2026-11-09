import { useQuery } from "@tanstack/react-query";

import { fetchProgress } from "@/shared/api";

/**
 * The Target's progress: the Topic status of each Topic of the plan and the Readiness.
 * «Готовность» and the plan's Topic chips share it; `refreshPlanViews` reloads it.
 */
export function useProgress(targetId: string) {
  return useQuery({
    queryKey: ["progress", targetId],
    queryFn: async () => fetchProgress(targetId),
  });
}
