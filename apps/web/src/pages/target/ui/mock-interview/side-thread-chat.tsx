import { useState } from "react";
import type { SubmitEvent } from "react";

import { PermissionRequest, useSessionEvents } from "@/entities/session";
import type { ChatEntry, SessionView, SideThread } from "@/shared/api";

/** A line of the Side thread chat; tool calls never reach it, permission requests do. */
function Line({
  entry,
  canAnswer,
  onAnswer,
}: {
  entry: ChatEntry;
  canAnswer: boolean;
  onAnswer: (requestId: string, optionId: string) => void;
}) {
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
    case "turn_interrupted": {
      return <p className="muted">Ход остановлен.</p>;
    }
    case "turn_failed": {
      return <p role="alert">Агент не смог ответить: {entry.message}</p>;
    }
    case "permission_request": {
      return <PermissionRequest entry={entry} canAnswer={canAnswer} onAnswer={onAnswer} />;
    }
    default: {
      return entry satisfies never;
    }
  }
}

/** What the agent does now, or why the Side thread takes no messages. */
function ThreadState({ view, onCancel }: { view: SessionView; onCancel: () => void }) {
  if (view.failure !== null) {
    return (
      <p role="alert">
        Агент ветки недоступен или упал. Мок идёт дальше; чтобы продолжить разговор, откройте новую
        ветку кнопкой «Обсудить отдельно».
      </p>
    );
  }
  if (view.status === "ended") {
    return <p className="muted">Ветка закрыта и доступна только для чтения.</p>;
  }
  if (view.status === "starting") {
    return (
      <p className="muted" aria-live="polite">
        Агент запускается…
      </p>
    );
  }
  return view.status === "working" ? (
    <p className="muted" aria-live="polite">
      Агент работает…{" "}
      <button type="button" className="ghost" onClick={onCancel}>
        Остановить
      </button>
    </p>
  ) : null;
}

/** The Candidate types while the agent works, and sends once it waits for a message. */
function ThreadForm({
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
        aria-label="Сообщение в ветку"
        placeholder="Спросить ещё"
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

/**
 * A Side thread to the right of its question (#80): a chat with the same agent as the mock
 * interview, which explains. The reply comes in chunks; «Остановить» ends the agent's turn.
 */
export function SideThreadChat({ thread, number }: { thread: SideThread; number: number }) {
  const { view, notice, lost, prompt, cancel, answerPermission } = useSessionEvents(
    thread.sessionId,
  );
  const status = lost === null ? (view?.status ?? null) : null;
  return (
    <aside className="side-thread" aria-label={`Ветка к вопросу ${number}`}>
      <h4>Ветка</h4>
      {thread.question === null ? null : (
        <p className="chat-line mine">
          <span className="muted">Вы: </span>
          {thread.question}
        </p>
      )}
      <ol className="interviewer-lines nowheel" aria-label="Сообщения ветки">
        {(view?.entries ?? []).map((entry) => (
          <li key={entry.id}>
            <Line entry={entry} canAnswer={status === "working"} onAnswer={answerPermission} />
          </li>
        ))}
      </ol>
      {view === null ? null : <ThreadState view={view} onCancel={cancel} />}
      {lost === null ? null : <p role="alert">{lost}</p>}
      {notice === null ? null : <output>{notice}</output>}
      <ThreadForm status={status} onSend={prompt} />
    </aside>
  );
}
