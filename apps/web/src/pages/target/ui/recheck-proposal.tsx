import { useMutation, useQueryClient } from "@tanstack/react-query";

import { dismissRecheckProposal } from "@/shared/api";
import type { InboxState } from "@/shared/api";

import { inboxQueryKey, useStartRecheck } from "../model/inbox";

/** «Не сейчас»: the card closes, the bank stays as it is. */
function useDismissRecheck(targetId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => dismissRecheckProposal(targetId),
    onSettled: async () => queryClient.invalidateQueries({ queryKey: inboxQueryKey(targetId) }),
  });
}

/**
 * The card «Перепроверка базы» above the setup chat's message form, after the agent's
 * `propose_recheck`: the reason, «Запустить перепроверку» and «Не сейчас». Only this button
 * starts the recheck; it changes nothing itself and proposes Questions to hide in its report.
 */
export function RecheckProposal({
  targetId,
  proposal,
}: {
  targetId: string;
  proposal: NonNullable<InboxState["recheckProposal"]>;
}) {
  const start = useStartRecheck(targetId);
  const dismiss = useDismissRecheck(targetId);
  const busy = start.isPending || dismiss.isPending;
  return (
    <section className="draft-changes inbox-proposal" aria-label="Перепроверка базы">
      <h3>Перепроверка базы</h3>
      <p>{proposal.reason}</p>
      <p className="muted">
        Агент проверит вопросы по пожеланиям и предложит, какие скрыть. Сам он ничего не меняет.
      </p>
      {start.error === null ? null : (
        <p role="alert">Перепроверка не началась: {start.error.message}</p>
      )}
      <div className="draft-actions">
        <button
          type="button"
          className="primary"
          disabled={busy}
          onClick={() => {
            start.mutate();
          }}
        >
          Запустить перепроверку
        </button>
        <button
          type="button"
          className="ghost"
          disabled={busy}
          onClick={() => {
            dismiss.mutate();
          }}
        >
          Не сейчас
        </button>
      </div>
    </section>
  );
}
