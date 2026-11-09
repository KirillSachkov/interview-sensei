import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { dismissInboxProposal } from "@/shared/api";
import type { InboxState, ProposalItem, SessionView } from "@/shared/api";

import { sizeText, sourceTypeNames } from "../lib/source-names";
import { inboxQueryKey, useInbox, useInboxAfterTurn, useStartProcessing } from "../model/inbox";
import { RecheckProposal } from "./recheck-proposal";

/** One material of the card: its checkbox, title, type, size and the agent's assessment. */
function ProposalLine({
  item,
  checked,
  disabled,
  onToggle,
}: {
  item: ProposalItem;
  checked: boolean;
  disabled: boolean;
  onToggle: (checked: boolean) => void;
}) {
  const volume = item.size === null ? "ссылка" : sizeText(item.size);
  return (
    <li className="inbox-proposal-item">
      <input
        type="checkbox"
        aria-label={`Разобрать «${item.title}»`}
        checked={checked}
        disabled={disabled}
        onChange={(event) => {
          onToggle(event.target.checked);
        }}
      />
      <span className="inbox-proposal-text">
        <span className="source-title">{item.title}</span>
        <span className="muted">
          {sourceTypeNames[item.type]} · {volume} — {item.assessment}
        </span>
      </span>
    </li>
  );
}

/** «Не сейчас»: the card closes, the materials wait in the Inbox. */
function useDismiss(targetId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => dismissInboxProposal(targetId),
    onSettled: async () => queryClient.invalidateQueries({ queryKey: inboxQueryKey(targetId) }),
  });
}

/** The materials the Candidate unticked; the rest go to the processing. */
function useUnticked() {
  const [unticked, setUnticked] = useState<ReadonlySet<string>>(new Set());
  const toggle = (sourceId: string, checked: boolean) => {
    const next = new Set(unticked);
    if (checked) {
      next.delete(sourceId);
    } else {
      next.add(sourceId);
    }
    setUnticked(next);
  };
  return { unticked, toggle };
}

/** «Запустить разбор» for the ticked materials and «Не сейчас». */
function ProposalActions({
  disabled,
  canStart,
  onStart,
  onDismiss,
}: {
  disabled: boolean;
  canStart: boolean;
  onStart: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="draft-actions">
      <button type="button" className="primary" disabled={disabled || !canStart} onClick={onStart}>
        Запустить разбор
      </button>
      <button type="button" className="ghost" disabled={disabled} onClick={onDismiss}>
        Не сейчас
      </button>
    </div>
  );
}

function ProposalCard({
  targetId,
  proposal,
}: {
  targetId: string;
  proposal: NonNullable<InboxState["proposal"]>;
}) {
  const start = useStartProcessing(targetId);
  const dismiss = useDismiss(targetId);
  const { unticked, toggle } = useUnticked();
  const chosen = proposal.items.filter((item) => !unticked.has(item.sourceId));
  const busy = start.isPending || dismiss.isPending;
  return (
    <section className="draft-changes inbox-proposal" aria-label="Разбор материалов">
      <h3>Разбор материалов</h3>
      <ul className="draft-change-list">
        {proposal.items.map((item) => (
          <ProposalLine
            key={item.sourceId}
            item={item}
            checked={!unticked.has(item.sourceId)}
            disabled={busy}
            onToggle={(checked) => {
              toggle(item.sourceId, checked);
            }}
          />
        ))}
      </ul>
      {start.error === null ? null : <p role="alert">Разбор не начался: {start.error.message}</p>}
      <ProposalActions
        disabled={busy}
        canStart={chosen.length > 0}
        onStart={() => {
          start.mutate(chosen.map((item) => item.sourceId));
        }}
        onDismiss={() => {
          dismiss.mutate();
        }}
      />
    </section>
  );
}

/**
 * The card «Разбор материалов» above the setup chat's message form, after the agent's
 * `propose_inbox_processing`: the materials with checkboxes, «Запустить разбор» and «Не сейчас»;
 * and the card «Перепроверка базы» after `propose_recheck`. Only these buttons start the work;
 * a card goes once the Candidate answers.
 */
export function InboxProposal({
  targetId,
  status,
}: {
  targetId: string;
  status: SessionView["status"];
}) {
  const { inbox } = useInbox(targetId);
  useInboxAfterTurn(targetId, status);
  const proposal = inbox.data?.proposal ?? null;
  const recheck = inbox.data?.recheckProposal ?? null;
  return (
    <>
      {proposal === null ? null : (
        <ProposalCard key={proposal.id} targetId={targetId} proposal={proposal} />
      )}
      {recheck === null ? null : (
        <RecheckProposal key={recheck.id} targetId={targetId} proposal={recheck} />
      )}
    </>
  );
}
