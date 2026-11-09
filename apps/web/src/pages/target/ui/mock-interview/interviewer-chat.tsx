import { useState } from "react";
import type { SubmitEvent } from "react";

import { useSessionEvents } from "@/entities/session";
import type { ChatEntry, SessionView } from "@/shared/api";
import { AgentMarkdown } from "@/shared/ui/markdown";

import { DiscussSeparately } from "./discuss-separately";

/**
 * A line of the interviewer chat; tool calls never reach it. An interviewer message has
 * «Обсудить отдельно».
 */
function Line({ entry, interviewId }: { entry: ChatEntry; interviewId: string }) {
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
      return (
        <div className="chat-message" data-discuss-scope="">
          <div className="chat-line">
            <AgentMarkdown text={entry.text} />
          </div>
          <DiscussSeparately interviewId={interviewId} origin={{ kind: "message", id: entry.id }} />
        </div>
      );
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

/** The Candidate types while the agent works, and sends once it waits for a message. */
function InterviewerForm({
  status,
  onSend,
}: {
  status: SessionView["status"] | null;
  onSend: (text: string) => void;
}) {
  const [text, setText] = useState("");
  const submit = (event: SubmitEvent) => {
    event.preventDefault();
    if (text.trim() !== "" && status === "idle") {
      onSend(text);
      setText("");
    }
  };
  return (
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
  );
}

/** The «Интервьюер» column beside the current question: a chat with the interviewer. */
export function InterviewerChat({
  interviewId,
  sessionId,
}: {
  interviewId: string;
  sessionId: string;
}) {
  const { view, notice, lost, prompt } = useSessionEvents(sessionId);
  const status = lost === null ? (view?.status ?? null) : null;
  return (
    <aside className="interviewer" aria-label="Интервьюер">
      <h4>Интервьюер</h4>
      <ol className="interviewer-lines nowheel" aria-label="Сообщения интервьюера">
        {(view?.entries ?? []).map((entry) => (
          <li key={entry.id}>
            <Line entry={entry} interviewId={interviewId} />
          </li>
        ))}
      </ol>
      {view?.agentText === "hidden" && status !== null && status !== "ended" ? (
        <p className="muted">Ответы интервьюера скрыты, пока вы не ответите на вопрос.</p>
      ) : null}
      {status === "working" || status === "starting" ? (
        <p className="muted" aria-live="polite">
          Агент работает…
        </p>
      ) : null}
      {lost === null ? null : <p role="alert">{lost}</p>}
      {notice === null ? null : <output>{notice}</output>}
      <InterviewerForm status={status} onSend={prompt} />
    </aside>
  );
}
