import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";

import { setSessionOptions } from "@/shared/api";
import type { AgentOptions, SessionView } from "@/shared/api";

import { agentName } from "@/entities/agent";
import { useSessionEvents } from "@/entities/session";
import type { ChatAttachments } from "./attachments";
import { ChatEntries } from "./chat-entries";
import { Composer } from "./composer";
import { AgentActivity } from "./messages";
import { SessionOptions, optionsSummary } from "./session-options";
import type { OptionChange } from "./session-options";

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

/**
 * The message written before the session started, with the model and level chosen for it;
 * `onSent` forgets it once the agent got it.
 */
interface FirstMessage {
  readonly text: string | undefined;
  readonly options: OptionChange | undefined;
  readonly onSent: () => void;
}

/** Sets the chosen model and level, then sends the text; a refused choice does not hold the text. */
async function sendFirst(
  sessionId: string,
  { text, options }: { text: string; options: OptionChange | undefined },
  prompt: (text: string) => void,
) {
  if (options !== undefined && (options.model !== undefined || options.effort !== undefined)) {
    await setSessionOptions(sessionId, options).catch(() => null);
  }
  prompt(text);
}

/** Sends the first message once, as soon as the agent waits for a message. */
function useFirstMessage(
  { text, options, onSent }: FirstMessage,
  {
    sessionId,
    waits,
    prompt,
  }: { sessionId: string; waits: boolean; prompt: (text: string) => void },
) {
  useEffect(() => {
    if (text !== undefined && waits) {
      onSent();
      void sendFirst(sessionId, { text, options }, prompt);
    }
  }, [text, options, onSent, sessionId, waits, prompt]);
}

/** Who answers: the agent's initial in a circle and its name. */
function ChatAgent({ agent, options }: { agent: string; options: AgentOptions | undefined }) {
  const summary = optionsSummary(options);
  return (
    <p className="chat-agent">
      <span className="agent-avatar" aria-hidden="true">
        {agentName(agent).slice(0, 1)}
      </span>
      <span>
        <span className="visually-hidden">Агент: </span>
        <span className="chat-agent-name">{agentName(agent)}</span>
        {summary === "" ? null : <span className="chat-agent-options"> · {summary}</span>}
      </span>
    </p>
  );
}

/** One connection to the chat; the parent mounts a new one to reconnect. */
function ChatConnection({
  sessionId,
  renderAboveInput,
  attachments,
  onReconnect,
  first,
}: {
  sessionId: string;
  renderAboveInput: RenderAboveInput | undefined;
  attachments: ChatAttachments | undefined;
  onReconnect: () => void;
  first: FirstMessage;
}) {
  const { view, notice, lost, prompt, cancel, answerPermission } = useSessionEvents(sessionId);
  useFirstMessage(first, { sessionId, waits: lost === null && view?.status === "idle", prompt });
  const connectionLost =
    lost === null ? null : <ConnectionLost text={lost} onReconnect={onReconnect} />;
  if (view === null) {
    return connectionLost ?? <p>Загружаем чат…</p>;
  }
  return (
    <section className="chat" aria-label={`Чат с агентом «${agentName(view.agent)}»`}>
      <ChatAgent agent={view.agent} options={view.options} />
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
        tools={<SessionOptions view={lost === null ? view : null} />}
      />
    </section>
  );
}

/**
 * The chat with the agent of one session: messages, agent state and the message form. A session
 * kind puts its own content above the message form with `renderAboveInput`, such as the draft of
 * changes of the Target setup, and takes files with a message through `attachments`.
 * `firstMessage` goes to the agent once, when it first waits for a message.
 */
export function Chat({
  sessionId,
  renderAboveInput,
  attachments,
  firstMessage,
  firstOptions,
}: {
  sessionId: string;
  renderAboveInput?: RenderAboveInput;
  attachments?: ChatAttachments;
  /** A message the Candidate wrote before the session started; the agent gets it once it waits. */
  firstMessage?: string | undefined;
  /** The model and level the Candidate chose with that message; set before it goes. */
  firstOptions?: OptionChange | undefined;
}) {
  const [attempt, setAttempt] = useState(0);
  // Forgotten once sent: a reconnect mounts the connection anew and must not send it again.
  const [first, setFirst] = useState(firstMessage);
  const forgetFirst = useCallback(() => {
    setFirst(undefined);
  }, []);
  return (
    <ChatConnection
      key={attempt}
      sessionId={sessionId}
      renderAboveInput={renderAboveInput}
      attachments={attachments}
      first={{ text: first, options: firstOptions, onSent: forgetFirst }}
      onReconnect={() => {
        setAttempt((current) => current + 1);
      }}
    />
  );
}
