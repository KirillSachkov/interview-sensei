import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import type { PointerEvent, SubmitEvent } from "react";

import { openSideThread } from "@/shared/api";
import type { SideThreadOrigin } from "@/shared/api";

import { useRefreshSideThreads } from "./side-thread-refresh";

/**
 * The text the Candidate selected inside the place of the button, the closest element with
 * `data-discuss-scope`: the question card, the interviewer message or the Debrief. Null without a
 * selection there.
 */
function selectedFragment(button: HTMLElement): string | null {
  const selection = globalThis.getSelection();
  const text = selection?.toString().trim() ?? "";
  const scope = button.closest("[data-discuss-scope]");
  return text !== "" && scope?.contains(selection?.anchorNode ?? null) === true ? text : null;
}

/** The selected fragment of a Side thread as a quote; nothing without one. */
export function FragmentQuote({ fragment }: { fragment: string | null }) {
  return fragment === null ? null : (
    <blockquote className="discuss-fragment">
      <span className="muted">Фрагмент: </span>
      {fragment}
    </blockquote>
  );
}

/** Opens the Side thread, then refreshes the views and closes the form. */
function useOpening(interviewId: string, onClose: () => void) {
  const refresh = useRefreshSideThreads(interviewId);
  return useMutation({
    mutationFn: async (request: Parameters<typeof openSideThread>[1]) =>
      openSideThread(interviewId, request),
    onSuccess: () => {
      refresh();
      onClose();
    },
  });
}

/** The Candidate's question, which may stay empty; «Открыть ветку» opens the Side thread. */
function DiscussForm({
  interviewId,
  origin,
  fragment,
  onClose,
}: {
  interviewId: string;
  origin: SideThreadOrigin;
  fragment: string | null;
  onClose: () => void;
}) {
  const [question, setQuestion] = useState("");
  const opening = useOpening(interviewId, onClose);
  const submit = (event: SubmitEvent) => {
    event.preventDefault();
    if (!opening.isPending) {
      opening.mutate({ origin, fragment, question });
    }
  };
  return (
    <form className="discuss-form" aria-label="Обсудить отдельно" onSubmit={submit}>
      <FragmentQuote fragment={fragment} />
      <textarea
        className="nodrag nopan nowheel"
        aria-label="Ваш вопрос"
        placeholder="Что непонятно? Можно оставить пустым."
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
 * «Обсудить отдельно» (#80) at a question card, an interviewer message or a Debrief: it opens a
 * form for the Candidate's question, and the Side thread appears to the right of the question.
 * Text selected in the same place before the click goes to the Side thread as its fragment.
 */
export function DiscussSeparately({
  interviewId,
  origin,
}: {
  interviewId: string;
  origin: SideThreadOrigin;
}) {
  const [open, setOpen] = useState(false);
  // Read on pointer down: the click itself may clear the selection.
  const [fragment, setFragment] = useState<string | null>(null);
  const keepSelection = (event: PointerEvent<HTMLButtonElement>) => {
    setFragment(selectedFragment(event.currentTarget));
  };
  return open ? (
    <DiscussForm
      interviewId={interviewId}
      origin={origin}
      fragment={fragment}
      onClose={() => {
        setOpen(false);
      }}
    />
  ) : (
    <button
      type="button"
      className="ghost discuss-button"
      onPointerDown={keepSelection}
      onClick={() => {
        setOpen(true);
      }}
    >
      Обсудить отдельно
    </button>
  );
}
