import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { fetchReferenceChecks, verifyReferenceAnswer } from "@/shared/api";

/** The Questions of the Target, the side panel's and the list «проверить опорный ответ». */
const questionsKey = (targetId: string) => ["targets", targetId, "questions"] as const;

/** The list «проверить опорный ответ» of the zone «Цель». */
export function useReferenceChecks(targetId: string) {
  return useQuery({
    queryKey: [...questionsKey(targetId), "reference-checks"],
    queryFn: async () => fetchReferenceChecks(targetId),
  });
}

/** «Проверен», then the side panel and the list read the Questions again. */
export function useVerifyReference(targetId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: verifyReferenceAnswer,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: questionsKey(targetId) });
    },
  });
}
