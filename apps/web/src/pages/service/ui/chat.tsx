import { useState } from "react";
import type { SubmitEvent } from "react";

import type { SessionView } from "@/shared/api";

import { useSessionEvents } from "../model/use-session-events";
import { agentName } from "./agent-names";
import { ChatEntries } from "./chat-entries";

function failureText(failure: NonNullable<SessionView["failure"]>): string {
  if (failure.reason === "agent_not_started") {
    return `Агент не запустился: ${failure.message}. Начните новый чат.`;
  }
  const how = failure.exitCode === null ? `сигнал ${failure.signal}` : `код ${failure.exitCode}`;
  return `Процесс агента завершился с ошибкой (${how}). Начните новый чат.`;
}

/** What the agent does now, or why the chat takes no messages. */
function SessionState({ view, onCancel }: { view: SessionView; onCancel: () => void }) {
  if (view.failure !== null) {
    return <p role="alert">{failureText(view.failure)}</p>;
  }
  if (view.status === "ended") {
    return <p>Чат закрыт: сервер перезапускался. Начните новый чат, чтобы продолжить.</p>;
  }
  if (view.status === "starting") {
    return <p aria-live="polite">Агент запускается…</p>;
  }
  if (view.status === "working") {
    return (
      <p aria-live="polite">
        Агент работает…{" "}
        <button type="button" onClick={onCancel}>
          Остановить
        </button>
      </p>
    );
  }
  return null;
}

/** The Candidate types while the agent works, and sends once it waits for a prompt. */
function MessageForm({
  status,
  onSend,
}: {
  /** The session status, or null when the page lost the connection. */
  status: SessionView["status"] | null;
  onSend: (text: string) => void;
}) {
  const canType = status === "idle" || status === "working";
  const [text, setText] = useState("");
  const submit = (event: SubmitEvent) => {
    event.preventDefault();
    if (text.trim() !== "") {
      onSend(text);
      setText("");
    }
  };
  return (
    <form onSubmit={submit}>
      <label>
        Сообщение{" "}
        <input
          disabled={!canType}
          value={text}
          onChange={(event) => {
            setText(event.target.value);
          }}
        />
      </label>{" "}
      <button type="submit" disabled={status !== "idle" || text.trim() === ""}>
        Отправить
      </button>
    </form>
  );
}

/** Why the page stopped following the chat, with a way to connect again. */
function ConnectionLost({ text, onReconnect }: { text: string; onReconnect: () => void }) {
  return (
    <p role="alert">
      {text}{" "}
      <button type="button" onClick={onReconnect}>
        Переподключиться
      </button>
    </p>
  );
}

/** One connection to the chat; the parent mounts a new one to reconnect. */
function ChatConnection({
  sessionId,
  onReconnect,
}: {
  sessionId: string;
  onReconnect: () => void;
}) {
  const { view, notice, lost, prompt, cancel, answerPermission } = useSessionEvents(sessionId);
  const connectionLost =
    lost === null ? null : <ConnectionLost text={lost} onReconnect={onReconnect} />;
  if (view === null) {
    return connectionLost ?? <p>Загружаем чат…</p>;
  }
  return (
    <section aria-label={`Чат с агентом «${agentName(view.agent)}»`}>
      <p>Агент: {agentName(view.agent)}</p>
      <ChatEntries
        entries={view.entries}
        canAnswer={lost === null && view.status === "working"}
        onAnswer={answerPermission}
      />
      {connectionLost ?? <SessionState view={view} onCancel={cancel} />}
      {notice === null ? null : <output>{notice}</output>}
      <MessageForm status={lost === null ? view.status : null} onSend={prompt} />
    </section>
  );
}

/** The service chat with one agent: messages, agent state and the message form. */
export function Chat({ sessionId }: { sessionId: string }) {
  const [attempt, setAttempt] = useState(0);
  return (
    <ChatConnection
      key={attempt}
      sessionId={sessionId}
      onReconnect={() => {
        setAttempt((current) => current + 1);
      }}
    />
  );
}
