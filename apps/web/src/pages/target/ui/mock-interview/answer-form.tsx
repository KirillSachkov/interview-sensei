import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import type { KeyboardEvent, SubmitEvent } from "react";

import { answerQuestion } from "@/shared/api";

/** Fits the field's height to its text. */
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

/** The free-text answer: the field grows with the text; Enter sends, Shift+Enter starts a line. */
export function AnswerForm({ interviewId }: { interviewId: string }) {
  const [text, setText] = useState("");
  const send = useMutation({
    mutationFn: async (answer: string) => answerQuestion(interviewId, answer),
  });
  const submit = (event: SubmitEvent) => {
    event.preventDefault();
    if (text.trim() !== "" && !send.isPending) {
      send.mutate(text);
    }
  };
  return (
    <form className="answer-form" onSubmit={submit}>
      <textarea
        className="nodrag nopan nowheel"
        aria-label="Ваш ответ"
        placeholder="Ваш ответ. Enter — отправить, Shift+Enter — новая строка"
        rows={2}
        value={text}
        disabled={send.isPending}
        onChange={(event) => {
          setText(event.target.value);
          grow(event.target);
        }}
        onKeyDown={sendOnEnter}
      />
      <div className="answer-actions">
        <button type="submit" className="primary" disabled={text.trim() === "" || send.isPending}>
          Ответить
        </button>
      </div>
      {send.isError ? <p role="alert">Ответ не отправлен: {send.error.message}</p> : null}
    </form>
  );
}
