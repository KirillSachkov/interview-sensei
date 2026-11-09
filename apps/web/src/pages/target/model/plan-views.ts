import type { QueryClient } from "@tanstack/react-query";

/**
 * Reloads what the mock interview reads of the plan after the plan changes: the Sections of
 * «Начать мок» and the section strip, and «Готовность», which counts the Topics of the enabled
 * Sections. The Target's own view comes from the change's answer.
 */
export async function refreshPlanViews(queryClient: QueryClient, targetId: string) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ["targets", targetId, "plan-sections"] }),
    queryClient.invalidateQueries({ queryKey: ["progress", targetId] }),
  ]);
}

/**
 * Reloads everything a draft's application changes: the Target with its plan, the Target list
 * with its status, the plan's views and the Questions of the side panel. Only exact keys: the
 * prefix ["targets", id] would also open the setup session again.
 */
export async function refreshAppliedViews(queryClient: QueryClient, targetId: string) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ["targets", targetId], exact: true }),
    queryClient.invalidateQueries({ queryKey: ["targets"], exact: true }),
    queryClient.invalidateQueries({ queryKey: ["targets", targetId, "questions"] }),
    refreshPlanViews(queryClient, targetId),
  ]);
}
