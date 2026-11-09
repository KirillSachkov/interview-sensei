import { useQueryClient } from "@tanstack/react-query";

/**
 * Refreshes the views of the Mock interview after a Side thread opened or was deleted. A running
 * Mock interview gets its view over the socket too; an ended one shown on the canvas only this way.
 */
export function useRefreshSideThreads(interviewId: string) {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ["interviews", interviewId, "view"] });
    void queryClient.invalidateQueries({
      predicate: ({ queryKey }) => queryKey[0] === "targets" && queryKey[2] === "interviews",
    });
  };
}
