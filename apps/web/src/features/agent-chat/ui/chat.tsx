import { useState } from "react";
import type { ReactNode } from "react";

import type { SessionView } from "@/shared/api";

import { agentName } from "@/entities/agent";
import { useSessionEvents } from "@/entities/session";
import type { ChatAttachments } from "./attachments";
import { ChatEntries } from "./chat-entries";
import { Composer } from "./composer";
import { AgentActivity } from "./messages";

function failureText(failure: NonNullable<SessionView["failure"]>): string {
  if (failure.reason === "agent_not_started") {
    return `Агент не запустился: ${failure.message}. Начните новый чат.`;
  }
  const how = failure.exitCode === null ? `сигнал ${failure.signal}` : `код ${failure.exitCode}`;
  return `Процесс агента завершился с ошибкой (${how}). Начните новый чат.`;
}

/** What the agent does now, or why the chat takes no messages. */
function SessionState({ view }: { view: SessionView }) {
  if (view.failure !== null) {
    return <p role="alert">{failureText(view.failure)}</p>;
  }
  if (view.status === "ended") {
    return <p>Чат закрыт: сервер перезапускался. Начните новый чат, чтобы продолжить.</p>;
  }
  if (view.status === "starting") {
    return <AgentActivity text="Агент запускается…" />;
  }
  return view.status === "working" ? <AgentActivity text="Агент работает…" /> : null;
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

/** What a chat of a session kind shows between the messages and the message form. */
type RenderAboveInput = (view: SessionView) => ReactNode;

/** One connection to the chat; the parent mounts a new one to reconnect. */
function ChatConnection({
  sessionId,
  renderAboveInput,
  attachments,
  onReconnect,
}: {
  sessionId: string;
  renderAboveInput: RenderAboveInput | undefined;
  attachments: ChatAttachments | undefined;
  onReconnect: () => void;
}) {
  const { view, notice, lost, prompt, cancel, answerPermission } = useSessionEvents(sessionId);
  const connectionLost =
    lost === null ? null : <ConnectionLost text={lost} onReconnect={onReconnect} />;
  if (view === null) {
    return connectionLost ?? <p>Загружаем чат…</p>;
  }
  return (
    <section className="chat" aria-label={`Чат с агентом «${agentName(view.agent)}»`}>
      <p className="chat-agent">
        <span className="agent-avatar" aria-hidden="true">
          {agentName(view.agent).slice(0, 1)}
        </span>
        <span>
          <span className="visually-hidden">Агент: </span>
          <span className="chat-agent-name">{agentName(view.agent)}</span>
        </span>
      </p>
      <ChatEntries
        entries={view.entries}
        canAnswer={lost === null && view.status === "working"}
        onAnswer={answerPermission}
      />
      {connectionLost ?? <SessionState view={view} />}
      {notice === null ? null : <output>{notice}</output>}
      {renderAboveInput?.(view)}
      <Composer
        status={lost === null ? view.status : null}
        onSend={prompt}
        onStop={cancel}
        label="Сообщение"
        placeholder="Напишите агенту"
        attachments={attachments}
      />
    </section>
  );
}

/**
 * The chat with the agent of one session: messages, agent state and the message form. A session
 * kind puts its own content above the message form with `renderAboveInput`, such as the draft of
 * changes of the Target setup, and takes files with a message through `attachments`.
 */
export function Chat({
  sessionId,
  renderAboveInput,
  attachments,
}: {
  sessionId: string;
  renderAboveInput?: RenderAboveInput;
  attachments?: ChatAttachments;
}) {
  const [attempt, setAttempt] = useState(0);
  return (
    <ChatConnection
      key={attempt}
      sessionId={sessionId}
      renderAboveInput={renderAboveInput}
      attachments={attachments}
      onReconnect={() => {
        setAttempt((current) => current + 1);
      }}
    />
  );
}
