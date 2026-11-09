import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import type { SubmitEvent } from "react";

import { openSideThread } from "@/shared/api";

/** The Candidate's question, which may stay empty; «Открыть ветку» opens the Side thread. */
function DiscussForm({
  interviewId,
  cardId,
  onClose,
}: {
  interviewId: string;
  cardId: string;
  onClose: () => void;
}) {
  const [question, setQuestion] = useState("");
  const opening = useMutation({
    mutationFn: async () => openSideThread(interviewId, { cardId, question }),
    onSuccess: onClose,
  });
  const submit = (event: SubmitEvent) => {
    event.preventDefault();
    if (!opening.isPending) {
      opening.mutate();
    }
  };
  return (
    <form className="discuss-form" aria-label="Обсудить отдельно" onSubmit={submit}>
      <textarea
        className="nodrag nopan nowheel"
        aria-label="Ваш вопрос"
        placeholder="Что непонятно в вопросе? Можно оставить пустым."
        rows={2}
        value={question}
        disabled={opening.isPending}
        onChange={(event) => {
          setQuestion(event.target.value);
        }}
      />
      <div className="answer-actions">
        <button type="submit" className="primary" disabled={opening.isPending}>
          Открыть ветку
        </button>
        <button type="button" className="ghost" onClick={onClose}>
          Отмена
        </button>
      </div>
      {opening.isError ? <p role="alert">Ветка не открылась: {opening.error.message}</p> : null}
    </form>
  );
}

/**
 * «Обсудить отдельно» at the question card (#80): it opens a form for the Candidate's question,
 * and the Side thread appears to the right of the question.
 */
export function DiscussSeparately({
  interviewId,
  cardId,
}: {
  interviewId: string;
  cardId: string;
}) {
  const [open, setOpen] = useState(false);
  return open ? (
    <DiscussForm
      interviewId={interviewId}
      cardId={cardId}
      onClose={() => {
        setOpen(false);
      }}
    />
  ) : (
    <button
      type="button"
      className="ghost"
      onClick={() => {
        setOpen(true);
      }}
    >
      Обсудить отдельно
    </button>
  );
}
