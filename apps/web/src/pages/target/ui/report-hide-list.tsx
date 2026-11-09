import type { HideProposal } from "@/shared/api";

import { useReview, useSelection } from "../model/report-review";

function HideItem({
  item,
  checked,
  onToggle,
}: {
  item: HideProposal;
  checked: boolean;
  onToggle: (checked: boolean) => void;
}) {
  return (
    <li className="question report-question">
      <label className="report-question-line">
        <input
          type="checkbox"
          aria-label={`Скрыть «${item.text}»`}
          checked={checked}
          disabled={item.hidden}
          onChange={(event) => {
            onToggle(event.target.checked);
          }}
        />
        <span className={item.hidden ? "muted" : undefined}>{item.text}</span>
      </label>
      <span className="muted">
        {item.topic === "" ? "" : `${item.topic} · `}
        {item.reason}
      </span>
      {item.hidden ? <span className="tag">скрыт</span> : null}
    </li>
  );
}

/**
 * The list «Скрыть?» of a recheck: the Questions the agent proposes to hide, with the reasons.
 * Every visible one starts ticked; «Скрыть выбранные» accepts the ticked ones at once.
 */
export function HideList({
  targetId,
  toHide,
}: {
  targetId: string;
  toHide: readonly HideProposal[];
}) {
  const visible = toHide.filter((item) => !item.hidden).map((item) => item.questionId);
  const selection = useSelection(visible);
  const review = useReview(targetId);
  const chosen = visible.filter((id) => selection.chosen.has(id));
  if (toHide.length === 0) {
    return <p className="muted">Агент не предлагает ничего скрывать.</p>;
  }
  return (
    <>
      <ul className="questions" aria-label="Скрыть?">
        {toHide.map((item) => (
          <HideItem
            key={item.questionId}
            item={item}
            checked={!item.hidden && selection.chosen.has(item.questionId)}
            onToggle={(checked) => {
              selection.toggle(item.questionId, checked);
            }}
          />
        ))}
      </ul>
      <div className="draft-actions">
        <button
          type="button"
          className="primary"
          disabled={chosen.length === 0 || review.isPending}
          onClick={() => {
            review.mutate({ action: "hide", questionIds: chosen });
          }}
        >
          Скрыть выбранные ({chosen.length})
        </button>
      </div>
      {review.error === null ? null : <p role="alert">Не сохранилось: {review.error.message}</p>}
    </>
  );
}
