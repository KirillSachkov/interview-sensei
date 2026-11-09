import { useState } from "react";
import type { ReactNode, SubmitEvent } from "react";

import type { SessionView } from "@/shared/api";

import { useSessionEvents } from "../model/use-session-events";
import { agentName } from "@/entities/agent";
import { AttachButton, AttachedFiles, useAttachedFiles } from "./attachments";
import type { ChatAttachments } from "./attachments";
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

/**
 * The Candidate types while the agent works, and sends once it waits for a prompt. With
 * `attachments`, files attached by 📎 or a drop go with the message.
 */
function MessageForm({
  status,
  onSend,
  attachments,
}: {
  /** The session status, or null when the page lost the connection. */
  status: SessionView["status"] | null;
  onSend: (text: string) => void;
  attachments: ChatAttachments | undefined;
}) {
  const canType = status === "idle" || status === "working";
  const [text, setText] = useState("");
  const attached = useAttachedFiles(attachments);
  const empty = text.trim() === "" && attached.files.length === 0;
  const submit = async (event: SubmitEvent) => {
    event.preventDefault();
    const message = empty ? null : await attached.send(text);
    if (message !== null) {
      onSend(message);
      setText("");
    }
  };
  return (
    // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- a drop is a pointer shortcut; 📎 attaches the same files from the keyboard
    <form
      onSubmit={(event) => void submit(event)}
      onDragOver={attached.handleDragOver}
      onDrop={attached.handleDrop}
    >
      <AttachedFiles attached={attached} />
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
      {attachments === undefined ? null : (
        <AttachButton disabled={!canType} onAdd={attached.handleAdd} />
      )}{" "}
      <button type="submit" disabled={status !== "idle" || empty || attached.sending}>
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
      <p>Агент: {agentName(view.agent)}</p>
      <ChatEntries
        entries={view.entries}
        canAnswer={lost === null && view.status === "working"}
        onAnswer={answerPermission}
      />
      {connectionLost ?? <SessionState view={view} onCancel={cancel} />}
      {notice === null ? null : <output>{notice}</output>}
      {renderAboveInput?.(view)}
      <MessageForm
        status={lost === null ? view.status : null}
        onSend={prompt}
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
