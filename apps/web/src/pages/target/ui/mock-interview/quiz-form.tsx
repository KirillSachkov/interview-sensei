import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import type { ReactNode, SubmitEvent } from "react";

import { answerQuestion } from "@/shared/api";
import type { QuestionCard } from "@/shared/api";

function OptionChoices({
  card,
  chosen,
  disabled,
  onToggle,
}: {
  card: QuestionCard;
  chosen: ReadonlySet<string>;
  disabled: boolean;
  onToggle: (id: string) => void;
}) {
  return (
    <fieldset className="quiz-options" aria-label="Варианты ответа">
      {card.options.map((option) => (
        <label key={option.id} className="quiz-option">
          <input
            type="checkbox"
            className="nodrag"
            checked={chosen.has(option.id)}
            disabled={disabled}
            onChange={() => {
              onToggle(option.id);
            }}
          />
          {option.text}
        </label>
      ))}
    </fieldset>
  );
}

/** A quiz answer: one or more options, then «Ответить». The app grades it, not the agent. */
export function QuizForm({
  interviewId,
  card,
  actions,
}: {
  interviewId: string;
  card: QuestionCard;
  actions: ReactNode;
}) {
  const [chosen, setChosen] = useState<ReadonlySet<string>>(new Set());
  const send = useMutation({
    mutationFn: async () =>
      answerQuestion(interviewId, {
        optionIds: card.options
          .filter((option) => chosen.has(option.id))
          .map((option) => option.id),
      }),
  });
  const toggle = (id: string) => {
    setChosen((current) => {
      const next = new Set(current);
      if (!next.delete(id)) {
        next.add(id);
      }
      return next;
    });
  };
  const submit = (event: SubmitEvent) => {
    event.preventDefault();
    if (chosen.size > 0 && !send.isPending) {
      send.mutate();
    }
  };
  return (
    <form className="quiz-form" onSubmit={submit}>
      <OptionChoices card={card} chosen={chosen} disabled={send.isPending} onToggle={toggle} />
      <p className="hint">Верных вариантов может быть несколько.</p>
      <div className="answer-actions">
        <button type="submit" className="primary" disabled={chosen.size === 0 || send.isPending}>
          Ответить
        </button>
        {actions}
      </div>
      {send.isError ? <p role="alert">Ответ не отправлен: {send.error.message}</p> : null}
    </form>
  );
}
