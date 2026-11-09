import { useState } from "react";
import type { SubmitEvent } from "react";

import { useSessionEvents } from "@/entities/session";
import type { ChatEntry } from "@/shared/api";

/** A line of the interviewer chat; tool calls never reach it. */
function Line({ entry }: { entry: ChatEntry }) {
  switch (entry.type) {
    case "candidate_message": {
      return (
        <p className="chat-line mine">
          <span className="muted">Вы: </span>
          {entry.text}
        </p>
      );
    }
    case "agent_message": {
      return <p className="chat-line">{entry.text}</p>;
    }
    case "turn_failed": {
      return <p role="alert">Интервьюер не смог ответить: {entry.message}</p>;
    }
    case "turn_interrupted":
    case "permission_request": {
      return null;
    }
    default: {
      return entry satisfies never;
    }
  }
}

/** The «Интервьюер» column beside the current question: a chat with the interviewer. */
export function InterviewerChat({ sessionId }: { sessionId: string }) {
  const { view, notice, lost, prompt } = useSessionEvents(sessionId);
  const [text, setText] = useState("");
  const status = lost === null ? (view?.status ?? null) : null;
  const submit = (event: SubmitEvent) => {
    event.preventDefault();
    if (text.trim() !== "" && status === "idle") {
      prompt(text);
      setText("");
    }
  };
  return (
    <aside className="interviewer" aria-label="Интервьюер">
      <h4>Интервьюер</h4>
      <ol className="interviewer-lines nowheel" aria-label="Сообщения интервьюера">
        {(view?.entries ?? []).map((entry) => (
          <li key={entry.id}>
            <Line entry={entry} />
          </li>
        ))}
      </ol>
      {status === "working" || status === "starting" ? (
        <p className="muted" aria-live="polite">
          Агент работает…
        </p>
      ) : null}
      {lost === null ? null : <p role="alert">{lost}</p>}
      {notice === null ? null : <output>{notice}</output>}
      <form className="interviewer-form" onSubmit={submit}>
        <input
          className="nodrag nopan"
          aria-label="Сообщение интервьюеру"
          placeholder="Уточнить вопрос"
          value={text}
          disabled={status !== "idle" && status !== "working"}
          onChange={(event) => {
            setText(event.target.value);
          }}
        />
        <button type="submit" disabled={status !== "idle" || text.trim() === ""}>
          Отправить
        </button>
      </form>
    </aside>
  );
}
