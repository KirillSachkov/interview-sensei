import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import type { KeyboardEvent, ReactNode, SubmitEvent } from "react";

/** Fits the height to the text; CSS caps it and longer answers scroll inside the field. */
function grow(field: HTMLTextAreaElement): void {
  field.style.height = "auto";
  field.style.height = `${field.scrollHeight}px`;
}

/** Enter sends the form; Shift+Enter and an input method's Enter stay in the text. */
function sendOnEnter(event: KeyboardEvent<HTMLTextAreaElement>): void {
  if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
  }
}

/**
 * A free-text answer: the field grows with the text; Enter sends, Shift+Enter starts a line.
 * `actions` go beside «Ответить», such as «Не знаю».
 */
export function AnswerForm({
  label,
  send,
  actions = null,
}: {
  label: string;
  send: (text: string) => Promise<void>;
  actions?: ReactNode;
}) {
  const [text, setText] = useState("");
  const sending = useMutation({ mutationFn: send });
  const submit = (event: SubmitEvent) => {
    event.preventDefault();
    if (text.trim() !== "" && !sending.isPending) {
      sending.mutate(text);
    }
  };
  return (
    <form className="answer-form" onSubmit={submit}>
      <textarea
        className="nodrag nopan nowheel"
        aria-label={label}
        placeholder={`${label}. Enter — отправить, Shift+Enter — новая строка`}
        rows={2}
        value={text}
        disabled={sending.isPending}
        onChange={(event) => {
          setText(event.target.value);
          grow(event.target);
        }}
        onKeyDown={sendOnEnter}
      />
      <div className="answer-actions">
        <button
          type="submit"
          className="primary"
          disabled={text.trim() === "" || sending.isPending}
        >
          Ответить
        </button>
        {actions}
      </div>
      {sending.isError ? <p role="alert">Ответ не отправлен: {sending.error.message}</p> : null}
    </form>
  );
}
