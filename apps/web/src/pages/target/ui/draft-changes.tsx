import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { applyDraft, DraftProblemsError, fetchDraft } from "@/shared/api";
import type { SessionView } from "@/shared/api";

import { changeText } from "../lib/change-text";

function failureText(error: Error): string {
  return error instanceof DraftProblemsError
    ? `Черновик не применён: ${error.problems.join(" ")}`
    : `Черновик не применён: ${error.message}`;
}

/**
 * The draft of changes above the message form: what the agent recorded and «Применить (N)». The
 * list reloads whenever the agent ends a turn, since its tools change the draft during the turn.
 */
export function DraftChanges({
  targetId,
  status,
}: {
  targetId: string;
  status: SessionView["status"];
}) {
  const queryClient = useQueryClient();
  const queryKey = ["targets", targetId, "draft"];
  const draft = useQuery({ queryKey, queryFn: async () => fetchDraft(targetId) });
  useEffect(() => {
    if (status === "idle") {
      void queryClient.invalidateQueries({ queryKey: ["targets", targetId, "draft"] });
    }
  }, [queryClient, targetId, status]);
  const apply = useMutation({
    mutationFn: async () => applyDraft(targetId),
    onSuccess: async (target) => {
      queryClient.setQueryData(["targets", targetId], target);
      queryClient.setQueryData(queryKey, []);
      await queryClient.invalidateQueries({ queryKey: ["targets"], exact: true });
    },
  });
  const changes = draft.data ?? [];
  if (changes.length === 0) {
    return apply.isError ? <p role="alert">{failureText(apply.error)}</p> : null;
  }
  return (
    <section className="draft-changes" aria-labelledby="draft-changes-title">
      <h3 id="draft-changes-title">Черновик изменений</h3>
      <ol aria-label="Изменения черновика">
        {changes.map((change) => (
          <li key={change.id}>{changeText(change.operation)}</li>
        ))}
      </ol>
      {apply.isError ? <p role="alert">{failureText(apply.error)}</p> : null}
      <button
        type="button"
        className="primary"
        disabled={apply.isPending}
        onClick={() => {
          apply.mutate();
        }}
      >
        Применить ({changes.length})
      </button>
    </section>
  );
}
