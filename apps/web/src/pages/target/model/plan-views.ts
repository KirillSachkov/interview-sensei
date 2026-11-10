import type { QueryClient } from "@tanstack/react-query";

/**
 * Reloads what the mock interview reads of the plan after the plan changes: the Sections of
 * «Начать мок» and the section strip, and the progress: «Готовность», which counts the Topics of
 * the enabled Sections, and the Topic status dots on the plan's chips. The Target's own view comes
 * from the change's answer.
 */
export async function refreshPlanViews(queryClient: QueryClient, targetId: string) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ["targets", targetId, "plan-sections"] }),
    queryClient.invalidateQueries({ queryKey: ["progress", targetId] }),
  ]);
}

/**
 * Reloads everything a draft's application changes: the Target with its plan, the Target list
 * with its status, the plan's views, the Questions of the side panel with the count of «Опорные
 * ответы», and the session history, whose Attempts a Topic merge moves. Only exact keys: the prefix ["targets", id] would also open
 * the setup session again.
 */
export async function refreshAppliedViews(queryClient: QueryClient, targetId: string) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ["targets", targetId], exact: true }),
    queryClient.invalidateQueries({ queryKey: ["targets"], exact: true }),
    queryClient.invalidateQueries({ queryKey: ["targets", targetId, "questions"] }),
    queryClient.invalidateQueries({ queryKey: ["targets", targetId, "answers"] }),
    queryClient.invalidateQueries({ queryKey: ["history", targetId] }),
    refreshPlanViews(queryClient, targetId),
  ]);
}
