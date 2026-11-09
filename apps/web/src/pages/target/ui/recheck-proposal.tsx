import type { InboxState } from "@/shared/api";

import { useDismissProposal, useStartRecheck } from "../model/inbox";
import { ProposalActions } from "./proposal-actions";

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
  const dismiss = useDismissProposal(targetId, "recheck");
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
      <ProposalActions
        startLabel="Запустить перепроверку"
        disabled={busy}
        onStart={() => {
          start.mutate();
        }}
        onDismiss={() => {
          dismiss.mutate();
        }}
      />
    </section>
  );
}
