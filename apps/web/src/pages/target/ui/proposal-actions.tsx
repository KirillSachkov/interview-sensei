/** The buttons of a proposal card in the setup chat: the start and «Не сейчас». */
export function ProposalActions({
  startLabel,
  disabled,
  canStart = true,
  onStart,
  onDismiss,
}: {
  startLabel: string;
  disabled: boolean;
  canStart?: boolean;
  onStart: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="draft-actions">
      <button type="button" className="primary" disabled={disabled || !canStart} onClick={onStart}>
        {startLabel}
      </button>
      <button type="button" className="ghost" disabled={disabled} onClick={onDismiss}>
        Не сейчас
      </button>
    </div>
  );
}
